import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { optionalSupabaseAuth } from "@/lib/mw/optionalAuth";
import { MEMBERSHIP_BENEFITS } from "@/lib/membership.functions";

/**
 * READ-ONLY membership/reward context for the SAAJ AI commerce agent.
 *
 * SAAJ has no AI agent wired up yet — these are the authoritative backend
 * tools it will call when it exists. They are deliberately read-only: the
 * agent must NEVER change membership status, expiry, discounts, reward
 * balances, product exclusivity or payment state. All of that stays in
 * validated backend operations (the `*.functions.ts` + RPC layer).
 *
 * The agent must not infer membership from "the user is logged in" or from
 * conversation history — it must call `getCustomerMembership()` and trust
 * only what the backend returns.
 */

export type AgentMembership =
  | { is_member: false; tier: "NONE" }
  | {
      is_member: true;
      tier: "CLUB";
      status: "ACTIVE";
      current_period_start: string;
      current_period_end: string;
      auto_renew: boolean;
      auto_renew_supported: false;
      cancelled: boolean;
    };

export const getCustomerMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AgentMembership> => {
    const { data, error } = await context.supabase.rpc("active_membership", {
      _user_id: context.userId,
    });
    if (error) throw error;
    const row = (
      data as
        | {
            tier: "CLUB";
            status: "ACTIVE";
            current_period_start: string;
            current_period_end: string;
            auto_renew: boolean;
            cancelled_at: string | null;
          }[]
        | null
    )?.[0];

    if (!row) return { is_member: false, tier: "NONE" };
    return {
      is_member: true,
      tier: "CLUB",
      status: "ACTIVE",
      current_period_start: row.current_period_start,
      current_period_end: row.current_period_end,
      auto_renew: row.auto_renew,
      auto_renew_supported: false,
      cancelled: Boolean(row.cancelled_at),
    };
  });

export const getCustomerRewards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      balance: number;
      recent: { kind: string; points: number; reason: string | null; at: string }[];
    }> => {
      const [balanceRes, recentRes] = await Promise.all([
        context.supabase.from("reward_ledger").select("points").eq("user_id", context.userId),
        context.supabase
          .from("reward_ledger")
          .select("kind,points,reason,created_at")
          .eq("user_id", context.userId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (balanceRes.error) throw balanceRes.error;
      if (recentRes.error) throw recentRes.error;
      return {
        balance: ((balanceRes.data as { points: number }[] | null) ?? []).reduce(
          (s, r) => s + r.points,
          0,
        ),
        recent: (
          (recentRes.data as {
            kind: string;
            points: number;
            reason: string | null;
            created_at: string;
          }[]) ?? []
        ).map((r) => ({ kind: r.kind, points: r.points, reason: r.reason, at: r.created_at })),
      };
    },
  );

export const getMembershipBenefits = createServerFn({ method: "POST" })
  .middleware([optionalSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      price: number;
      currency: string;
      billing_interval: string;
      member_discount_percent: number;
      points_per_100_bdt: number;
      birthday_reward_points: number;
      auto_renew_supported: false;
      benefits: { label: string; description: string }[];
      how_to_join: string;
      how_to_cancel: string;
    }> => {
      const { data } = await context.supabase
        .from("membership_config")
        .select(
          "monthly_price,currency,billing_interval,member_discount_bps,points_per_100_bdt,birthday_reward_points",
        )
        .maybeSingle();
      const cfg = (data as {
        monthly_price: number | string;
        currency: string;
        billing_interval: string;
        member_discount_bps: number;
        points_per_100_bdt: number | string;
        birthday_reward_points: number;
      } | null) ?? {
        monthly_price: 50,
        currency: "BDT",
        billing_interval: "MONTHLY",
        member_discount_bps: 1000,
        points_per_100_bdt: 1,
        birthday_reward_points: 100,
      };
      return {
        price: Number(cfg.monthly_price),
        currency: cfg.currency,
        billing_interval: cfg.billing_interval,
        member_discount_percent: cfg.member_discount_bps / 100,
        points_per_100_bdt: Number(cfg.points_per_100_bdt),
        birthday_reward_points: cfg.birthday_reward_points,
        auto_renew_supported: false,
        benefits: MEMBERSHIP_BENEFITS.map((b) => ({ label: b.label, description: b.description })),
        how_to_join:
          "Open the SAAJ Club page, sign in, and pay the monthly fee with bKash. Membership activates once the payment is verified.",
        how_to_cancel:
          "Go to Account → SAAJ Club → Manage membership. Cancelling turns off renewal; benefits stay active until the current period ends.",
      };
    },
  );

export const getExclusiveProducts = createServerFn({ method: "POST" })
  .middleware([optionalSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      is_member: boolean;
      products: {
        slug: string;
        name: string;
        price: number;
        member_price: number;
        can_purchase: boolean;
      }[];
    }> => {
      const isMember = context.userId
        ? Boolean(
            (await context.supabase.rpc("is_active_member", { _user_id: context.userId })).data,
          )
        : false;

      const [{ data: rows, error }, { data: cfg }] = await Promise.all([
        context.supabase
          .from("products")
          .select(
            "slug,name,price,discount_price,member_discount_eligible,member_discount_bps,available_from,member_available_from",
          )
          .eq("status", "active")
          .eq("members_only", true)
          .order("created_at", { ascending: false }),
        context.supabase.from("membership_config").select("member_discount_bps").maybeSingle(),
      ]);
      if (error) throw error;
      const globalBps =
        (cfg as { member_discount_bps: number } | null)?.member_discount_bps ?? 1000;
      const now = Date.now();

      return {
        is_member: isMember,
        products: (
          (rows as {
            slug: string;
            name: string;
            price: number | string;
            discount_price: number | string | null;
            member_discount_eligible: boolean;
            member_discount_bps: number | null;
            available_from: string | null;
            member_available_from: string | null;
          }[]) ?? []
        ).map((p) => {
          const base = Number(p.discount_price ?? p.price);
          const bps = p.member_discount_eligible ? (p.member_discount_bps ?? globalBps) : 0;
          const memberPrice = Math.round((base * (10000 - bps)) / 10000);
          const memFrom = p.member_available_from ?? p.available_from;
          const released = isMember
            ? !memFrom || new Date(memFrom).getTime() <= now
            : !p.available_from || new Date(p.available_from).getTime() <= now;
          return {
            slug: p.slug,
            name: p.name,
            price: base,
            member_price: memberPrice,
            can_purchase: isMember && released,
          };
        }),
      };
    },
  );
