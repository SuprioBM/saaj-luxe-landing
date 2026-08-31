import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { MEMBERSHIP_BENEFITS } from "@/lib/membership.functions";
import { memberUnitPrice, resolveMemberDiscountBps } from "@/lib/membership-pricing";
import { searchKnowledge } from "@/lib/agent/knowledge";
import type { AgentCollector, AgentContext } from "@/lib/agent/context";

/**
 * The agent's controlled capabilities. Every customer-specific tool is
 * scoped to `ctx.userId` (the verified session) — no tool accepts a user
 * id, order owner, or membership flag as an argument. The LLM is an
 * untrusted reasoning layer; authorization is here, server-side.
 *
 * Live/transactional data (price, stock, orders, membership, rewards)
 * comes from these DB-backed tools. Static policy/FAQ knowledge comes from
 * `get_store_policies` (RAG). Nothing is invented by the model.
 */

const AUTH_REQUIRED = JSON.stringify({
  error: "auth_required",
  message: "This needs the customer to be signed in. Ask them to sign in, then try again.",
});

const PRODUCT_SELECT =
  "slug,name,price,discount_price,status,members_only,member_discount_eligible,member_discount_bps,available_from,member_available_from,categories:category_id(slug),product_images(url,position,is_primary),product_variants(size,stock,reserved)";

type ProductRow = {
  slug: string;
  name: string;
  price: number | string;
  discount_price: number | string | null;
  status: string;
  members_only: boolean;
  member_discount_eligible: boolean;
  member_discount_bps: number | null;
  available_from: string | null;
  member_available_from: string | null;
  categories: { slug: string } | null;
  product_images: { url: string; position: number; is_primary: boolean }[];
  product_variants: { size: string; stock: number; reserved: number }[];
};

function primaryImage(row: ProductRow): string | null {
  const imgs = [...row.product_images].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position,
  );
  return imgs[0]?.url ?? null;
}

function totalStock(row: ProductRow): number {
  return row.product_variants.reduce((s, v) => s + Math.max(0, v.stock - v.reserved), 0);
}

async function globalDiscountBps(ctx: AgentContext): Promise<number> {
  const { data } = await ctx.admin
    .from("membership_config")
    .select("member_discount_bps")
    .maybeSingle();
  return (data as { member_discount_bps: number } | null)?.member_discount_bps ?? 1000;
}

function shapeProduct(row: ProductRow, isMember: boolean, globalBps: number) {
  const list = Number(row.discount_price ?? row.price);
  const bps = resolveMemberDiscountBps(
    {
      memberDiscountEligible: row.member_discount_eligible,
      memberDiscountBps: row.member_discount_bps,
    },
    globalBps,
  );
  const memberPrice = memberUnitPrice(list, bps);
  const now = Date.now();
  const publicLive = !row.available_from || new Date(row.available_from).getTime() <= now;
  const memberFrom = row.member_available_from ?? row.available_from;
  const memberLive = !memberFrom || new Date(memberFrom).getTime() <= now;
  return {
    slug: row.slug,
    name: row.name,
    category: row.categories?.slug ?? "",
    price: list,
    member_price: memberPrice,
    member_saves: list - memberPrice,
    in_stock: totalStock(row) > 0,
    members_only: row.members_only,
    club_exclusive: row.members_only,
    public_release: row.available_from,
    member_release: row.member_available_from,
    purchasable_by_public_now: publicLive && !row.members_only,
    purchasable_by_member_now: memberLive,
    /** what THIS caller can do right now */
    you_can_purchase: row.members_only
      ? isMember && memberLive
      : isMember
        ? memberLive
        : publicLive,
  };
}

export function buildTools(ctx: AgentContext, collector: AgentCollector) {
  const track = <T>(name: string, fn: () => Promise<T>) =>
    fn().then(
      (r) => {
        collector.toolCalls.push({ name, ok: true });
        return r;
      },
      (e) => {
        collector.toolCalls.push({ name, ok: false });
        console.error(`[agent tool ${name}]`, e);
        return "Something went wrong reading that. Tell the customer you couldn't retrieve it right now." as unknown as T;
      },
    );

  const pushCards = (rows: ProductRow[], isMember: boolean, globalBps: number) => {
    for (const row of rows) {
      collector.addProduct({
        slug: row.slug,
        name: row.name,
        category: row.categories?.slug ?? "",
        price: Number(row.discount_price ?? row.price),
        memberPrice: memberUnitPrice(
          Number(row.discount_price ?? row.price),
          resolveMemberDiscountBps(
            {
              memberDiscountEligible: row.member_discount_eligible,
              memberDiscountBps: row.member_discount_bps,
            },
            globalBps,
          ),
        ),
        image: primaryImage(row),
        membersOnly: row.members_only,
        inStock: totalStock(row) > 0,
      });
    }
  };

  /* ------------------------------------------------------- catalog ---- */

  const search_products = tool(
    async (input) =>
      track("search_products", async () => {
        const globalBps = await globalDiscountBps(ctx);
        let q = ctx.admin.from("products").select(PRODUCT_SELECT).eq("status", "active");
        if (input.category) q = q.eq("categories.slug", input.category);
        if (input.max_price) q = q.lte("price", input.max_price);
        if (input.min_price) q = q.gte("price", input.min_price);
        if (input.club_exclusive_only) q = q.eq("members_only", true);
        if (input.query) q = q.or(`name.ilike.%${input.query}%,description.ilike.%${input.query}%`);
        const { data, error } = await q.limit(Math.min(input.limit ?? 8, 20));
        if (error) throw error;
        let rows = (data as unknown as ProductRow[]).filter(
          (r) => r.categories !== null || !input.category,
        );
        if (input.in_stock_only) rows = rows.filter((r) => totalStock(r) > 0);
        pushCards(rows, ctx.isMember, globalBps);
        return JSON.stringify({
          count: rows.length,
          is_member: ctx.isMember,
          products: rows.map((r) => shapeProduct(r, ctx.isMember, globalBps)),
        });
      }),
    {
      name: "search_products",
      description:
        "Search the SAAJ catalog. Use for 'show me…', 'what do you have…', price filters, category browsing, and to ground product recommendations. Returns authoritative names, prices, member prices and stock — never invent these.",
      schema: z.object({
        query: z.string().optional().describe("free-text, e.g. 'black rope chain', 'minimal ring'"),
        category: z.enum(["shirts", "neckchains", "rings", "bracelets"]).optional(),
        min_price: z.number().optional(),
        max_price: z.number().optional(),
        in_stock_only: z.boolean().optional(),
        club_exclusive_only: z.boolean().optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
    },
  );

  const get_product_details = tool(
    async (input) =>
      track("get_product_details", async () => {
        const globalBps = await globalDiscountBps(ctx);
        const { data, error } = await ctx.admin
          .from("products")
          .select(`${PRODUCT_SELECT},description,materials`)
          .eq("slug", input.slug)
          .eq("status", "active")
          .maybeSingle();
        if (error) throw error;
        if (!data) return JSON.stringify({ error: "not_found", message: "No such SAAJ piece." });
        const row = data as unknown as ProductRow & { description: string; materials: string[] };
        pushCards([row], ctx.isMember, globalBps);
        return JSON.stringify({
          ...shapeProduct(row, ctx.isMember, globalBps),
          description: row.description,
          materials: row.materials,
          sizes: row.product_variants.map((v) => ({
            size: v.size,
            available: Math.max(0, v.stock - v.reserved),
          })),
        });
      }),
    {
      name: "get_product_details",
      description:
        "Full detail for one product by slug: price, member price, description, materials, per-size availability, club-exclusive and early-access status.",
      schema: z.object({ slug: z.string() }),
    },
  );

  const get_product_availability = tool(
    async (input) =>
      track("get_product_availability", async () => {
        const { data, error } = await ctx.admin
          .from("products")
          .select("name,status,product_variants(size,stock,reserved)")
          .eq("slug", input.slug)
          .maybeSingle();
        if (error) throw error;
        if (!data) return JSON.stringify({ error: "not_found" });
        const row = data as {
          name: string;
          status: string;
          product_variants: { size: string; stock: number; reserved: number }[];
        };
        return JSON.stringify({
          name: row.name,
          active: row.status === "active",
          sizes: row.product_variants.map((v) => ({
            size: v.size,
            available: Math.max(0, v.stock - v.reserved),
            in_stock: Math.max(0, v.stock - v.reserved) > 0,
          })),
        });
      }),
    {
      name: "get_product_availability",
      description: "Live per-size stock for one product by slug.",
      schema: z.object({ slug: z.string() }),
    },
  );

  const get_exclusive_products = tool(
    async () =>
      track("get_exclusive_products", async () => {
        const globalBps = await globalDiscountBps(ctx);
        const { data, error } = await ctx.admin
          .from("products")
          .select(PRODUCT_SELECT)
          .eq("status", "active")
          .eq("members_only", true)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = data as unknown as ProductRow[];
        pushCards(rows, ctx.isMember, globalBps);
        if (!ctx.isMember && rows.length) {
          collector.addAction({ label: "Join SAAJ Club", href: "/club" });
        }
        return JSON.stringify({
          is_member: ctx.isMember,
          note: ctx.isMember
            ? "The customer is a member and can buy these."
            : "The customer is NOT a member — they can see these but cannot purchase them. They can join SAAJ Club to unlock them.",
          products: rows.map((r) => shapeProduct(r, ctx.isMember, globalBps)),
        });
      }),
    {
      name: "get_exclusive_products",
      description: "SAAJ Club exclusive (members-only) products that are currently active.",
      schema: z.object({}),
    },
  );

  const get_early_access_products = tool(
    async () =>
      track("get_early_access_products", async () => {
        const globalBps = await globalDiscountBps(ctx);
        const nowIso = new Date().toISOString();
        const { data, error } = await ctx.admin
          .from("products")
          .select(PRODUCT_SELECT)
          .eq("status", "active")
          .gt("available_from", nowIso)
          .order("available_from", { ascending: true });
        if (error) throw error;
        const rows = data as unknown as ProductRow[];
        pushCards(rows, ctx.isMember, globalBps);
        return JSON.stringify({
          is_member: ctx.isMember,
          products: rows.map((r) => {
            const s = shapeProduct(r, ctx.isMember, globalBps);
            return {
              ...s,
              public_release: r.available_from,
              member_early_access: r.member_available_from ?? r.available_from,
            };
          }),
          note: "Only quote the release dates returned here. Members can buy from member_early_access; the public from public_release.",
        });
      }),
    {
      name: "get_early_access_products",
      description:
        "Products not yet publicly released. Includes public_release and member_early_access dates from authoritative data.",
      schema: z.object({}),
    },
  );

  /* --------------------------------------------------- SAAJ Club ------ */

  const get_membership_benefits = tool(
    async () =>
      track("get_membership_benefits", async () => {
        const { data } = await ctx.admin
          .from("membership_config")
          .select(
            "monthly_price,currency,billing_interval,member_discount_bps,points_per_100_bdt,birthday_reward_points",
          )
          .maybeSingle();
        const cfg =
          (data as {
            monthly_price: number | string;
            currency: string;
            billing_interval: string;
            member_discount_bps: number;
            points_per_100_bdt: number | string;
            birthday_reward_points: number;
          } | null) ?? null;
        return JSON.stringify({
          price: Number(cfg?.monthly_price ?? 50),
          currency: cfg?.currency ?? "BDT",
          billing_interval: cfg?.billing_interval ?? "MONTHLY",
          member_discount_percent: (cfg?.member_discount_bps ?? 1000) / 100,
          points_per_100_bdt: Number(cfg?.points_per_100_bdt ?? 1),
          birthday_reward_points: cfg?.birthday_reward_points ?? 100,
          auto_renew_supported: false,
          benefits: MEMBERSHIP_BENEFITS.map((b) => ({
            label: b.label,
            description: b.description,
          })),
          how_to_join:
            "Sign in, open the SAAJ Club page, pay the monthly fee with bKash. Membership activates once payment is verified.",
          how_to_cancel:
            "Account → SAAJ Club → Manage membership. Cancelling turns off renewal; benefits stay active until the current period ends.",
        });
      }),
    {
      name: "get_membership_benefits",
      description:
        "SAAJ Club price, discount %, points rule, birthday reward and the benefit list — from backend config, not hardcoded.",
      schema: z.object({}),
    },
  );

  const get_customer_membership = tool(
    async () =>
      track("get_customer_membership", async () => {
        if (!ctx.userId) return AUTH_REQUIRED;
        const { data, error } = await ctx.admin.rpc("active_membership", { _user_id: ctx.userId });
        if (error) throw error;
        const row = (
          data as
            | {
                tier: string;
                status: string;
                current_period_start: string;
                current_period_end: string;
                auto_renew: boolean;
                cancelled_at: string | null;
              }[]
            | null
        )?.[0];
        if (!row) {
          collector.addAction({ label: "Join SAAJ Club", href: "/club" });
          return JSON.stringify({ is_member: false, tier: "NONE" });
        }
        return JSON.stringify({
          is_member: true,
          tier: "CLUB",
          status: "ACTIVE",
          current_period_end: row.current_period_end,
          auto_renew: row.auto_renew,
          auto_renew_supported: false,
          cancelled: Boolean(row.cancelled_at),
        });
      }),
    {
      name: "get_customer_membership",
      description:
        "The signed-in customer's authoritative SAAJ Club status. NEVER infer membership from the fact that someone is logged in — call this.",
      schema: z.object({}),
    },
  );

  const get_customer_rewards = tool(
    async () =>
      track("get_customer_rewards", async () => {
        if (!ctx.userId) return AUTH_REQUIRED;
        const [balanceRes, recentRes] = await Promise.all([
          ctx.admin.from("reward_ledger").select("points").eq("user_id", ctx.userId),
          ctx.admin
            .from("reward_ledger")
            .select("kind,points,reason,created_at")
            .eq("user_id", ctx.userId)
            .order("created_at", { ascending: false })
            .limit(8),
        ]);
        if (balanceRes.error) throw balanceRes.error;
        return JSON.stringify({
          balance: ((balanceRes.data as { points: number }[] | null) ?? []).reduce(
            (s, r) => s + r.points,
            0,
          ),
          currency: "points",
          recent: (
            (recentRes.data as {
              kind: string;
              points: number;
              reason: string | null;
              created_at: string;
            }[]) ?? []
          ).map((r) => ({ kind: r.kind, points: r.points, reason: r.reason, at: r.created_at })),
        });
      }),
    {
      name: "get_customer_rewards",
      description:
        "The signed-in customer's authoritative reward-point balance and recent history.",
      schema: z.object({}),
    },
  );

  /* ------------------------------------------------------- orders ---- */

  const ORDER_STATUSES_CANCELLABLE = ["pending", "processing", "paid"];

  const get_customer_orders = tool(
    async (input) =>
      track("get_customer_orders", async () => {
        if (!ctx.userId) return AUTH_REQUIRED;
        const { data, error } = await ctx.admin
          .from("orders")
          .select("reference,status,placed_at,total,order_items(id)")
          .eq("user_id", ctx.userId)
          .eq("order_kind", "product")
          .order("placed_at", { ascending: false })
          .limit(Math.min(input.limit ?? 10, 25));
        if (error) throw error;
        const rows =
          (data as {
            reference: string;
            status: string;
            placed_at: string;
            total: number;
            order_items: { id: string }[];
          }[]) ?? [];
        if (rows.length) collector.addAction({ label: "View orders", href: "/account/orders" });
        return JSON.stringify({
          count: rows.length,
          orders: rows.map((o) => ({
            reference: o.reference,
            status: o.status,
            placed_at: o.placed_at,
            total: Number(o.total),
            items: o.order_items?.length ?? 0,
          })),
        });
      }),
    {
      name: "get_customer_orders",
      description:
        "The signed-in customer's own orders. Always scoped to them — cannot fetch anyone else's.",
      schema: z.object({ limit: z.number().int().min(1).max(25).optional() }),
    },
  );

  async function loadOwnOrder(reference: string) {
    if (!ctx.userId) return { auth: true as const };
    const { data, error } = await ctx.admin
      .from("orders")
      .select(
        "reference,status,placed_at,total,subtotal,discount,membership_discount,shipping,payment_method,courier,shipment_tracking_number,order_kind,payments(status),order_items(product_name,size,qty,unit_price)",
      )
      .eq("user_id", ctx.userId)
      .eq("reference", reference)
      .maybeSingle();
    if (error) throw error;
    return { order: data };
  }

  const get_order_status = tool(
    async (input) =>
      track("get_order_status", async () => {
        const r = await loadOwnOrder(input.reference);
        if ("auth" in r) return AUTH_REQUIRED;
        if (!r.order)
          return JSON.stringify({
            error: "not_found",
            message: "No order with that reference on this account.",
          });
        const o = r.order as {
          reference: string;
          status: string;
          placed_at: string;
          payment_method: string;
          payments: { status: string }[];
          courier: string | null;
          shipment_tracking_number: string | null;
        };
        return JSON.stringify({
          reference: o.reference,
          status: o.status,
          placed_at: o.placed_at,
          payment_method: o.payment_method,
          payment_status: o.payments?.[0]?.status ?? null,
          courier: o.courier,
          tracking_number: o.shipment_tracking_number,
        });
      }),
    {
      name: "get_order_status",
      description: "Current status of one of the signed-in customer's orders, by reference.",
      schema: z.object({ reference: z.string() }),
    },
  );

  const get_order_details = tool(
    async (input) =>
      track("get_order_details", async () => {
        const r = await loadOwnOrder(input.reference);
        if ("auth" in r) return AUTH_REQUIRED;
        if (!r.order) return JSON.stringify({ error: "not_found" });
        const o = r.order as {
          reference: string;
          status: string;
          placed_at: string;
          total: number;
          subtotal: number;
          discount: number;
          membership_discount: number;
          shipping: number;
          payment_method: string;
          payments: { status: string }[];
          order_items: { product_name: string; size: string; qty: number; unit_price: number }[];
        };
        collector.addAction({ label: `View order ${o.reference}`, href: `/order/${o.reference}` });
        return JSON.stringify({
          reference: o.reference,
          status: o.status,
          placed_at: o.placed_at,
          payment_method: o.payment_method,
          payment_status: o.payments?.[0]?.status ?? null,
          totals: {
            subtotal: Number(o.subtotal),
            club_discount: Number(o.membership_discount),
            coupon_discount: Number(o.discount),
            shipping: Number(o.shipping),
            total: Number(o.total),
          },
          items: o.order_items?.map((i) => ({
            name: i.product_name,
            size: i.size,
            qty: i.qty,
            unit_price: Number(i.unit_price),
          })),
        });
      }),
    {
      name: "get_order_details",
      description:
        "Line items and totals for one of the signed-in customer's orders, by reference.",
      schema: z.object({ reference: z.string() }),
    },
  );

  const get_cancellation_eligibility = tool(
    async (input) =>
      track("get_cancellation_eligibility", async () => {
        const r = await loadOwnOrder(input.reference);
        if ("auth" in r) return AUTH_REQUIRED;
        if (!r.order) return JSON.stringify({ error: "not_found" });
        const o = r.order as { reference: string; status: string };
        const eligible = ORDER_STATUSES_CANCELLABLE.includes(o.status);
        return JSON.stringify({
          reference: o.reference,
          status: o.status,
          can_cancel: eligible,
          reason: eligible
            ? "This order can still be cancelled from the order page."
            : "This order can no longer be cancelled — it has already been shipped, delivered, or is otherwise past the cancellation window.",
          cancellable_statuses: ORDER_STATUSES_CANCELLABLE,
        });
      }),
    {
      name: "get_cancellation_eligibility",
      description:
        "Whether one of the signed-in customer's orders can still be cancelled, per SAAJ's actual order lifecycle.",
      schema: z.object({ reference: z.string() }),
    },
  );

  /* --------------------------------------------------------- RAG ----- */

  const get_store_policies = tool(
    async (input) =>
      track("get_store_policies", async () => {
        const hits = await searchKnowledge(ctx.admin, input.query, {
          limit: 5,
          sources: input.sources && input.sources.length ? input.sources : undefined,
        });
        if (!hits.length) {
          return JSON.stringify({
            found: false,
            message:
              "Nothing in SAAJ's knowledge base matched. Tell the customer you don't have that information rather than guessing, and point them to care@saaj.studio.",
          });
        }
        return JSON.stringify({
          found: true,
          passages: hits.map((h) => ({
            source: h.source,
            page_title: h.pageTitle,
            page_url: h.pageUrl,
            section: h.section,
            content: h.content,
            last_updated: h.lastUpdated,
          })),
          instruction:
            "Answer using ONLY these passages. Do not add return periods, fees, timelines or conditions that aren't stated here. Cite the page naturally (e.g. 'per our returns policy').",
        });
      }),
    {
      name: "get_store_policies",
      description:
        "Retrieve SAAJ's static business knowledge — shipping, returns, exchanges, refunds, privacy, terms, FAQ, product care, brand, and how SAAJ Club works. Use for any 'what is your…/how does…/can I…' policy question. NOT for a specific customer's order, price or membership.",
      schema: z.object({
        query: z.string().describe("the customer's question, e.g. 'how long do refunds take'"),
        sources: z
          .array(z.string())
          .optional()
          .describe("optional source slugs to restrict to, e.g. ['return-policy']"),
      }),
    },
  );

  return [
    search_products,
    get_product_details,
    get_product_availability,
    get_exclusive_products,
    get_early_access_products,
    get_membership_benefits,
    get_customer_membership,
    get_customer_rewards,
    get_customer_orders,
    get_order_status,
    get_order_details,
    get_cancellation_eligibility,
    get_store_policies,
  ];
}
