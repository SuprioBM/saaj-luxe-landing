import { createServerFn } from "@tanstack/react-start";

import { initBkashPayment } from "@/lib/payments/bkash";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { optionalSupabaseAuth } from "@/lib/mw/optionalAuth";
import { assertRateLimit } from "@/lib/mw/rateLimit";
import { membershipCancelSchema, membershipJoinSchema } from "@/lib/schemas";

/**
 * SAAJ Club — customer-facing membership server functions.
 *
 * Everything here is authoritative: membership status is read from the
 * `memberships` table via the `active_membership` RPC (never a client flag),
 * the ৳50 price comes from `membership_config`, and activation only ever
 * happens in the database once a membership order is independently marked
 * paid (see the `membership_order_paid` trigger). These functions never
 * mint or extend a membership directly.
 */

export type MembershipBenefit = { key: string; label: string; description: string };

export const MEMBERSHIP_BENEFITS: MembershipBenefit[] = [
  { key: "pricing", label: "10% Member Pricing", description: "On eligible pieces, every order." },
  { key: "exclusive", label: "Exclusive Drops", description: "Pieces only members can buy." },
  { key: "early", label: "Early Access", description: "See new drops before everyone else." },
  { key: "sales", label: "Member-Only Sales", description: "Private offers, members first." },
  { key: "rewards", label: "Reward Points", description: "Earn while you shop." },
  { key: "birthday", label: "Birthday Reward", description: "A little something from SAAJ." },
];

export type MembershipConfig = {
  monthlyPrice: number;
  currency: string;
  billingInterval: string;
  memberDiscountPercent: number;
  pointsPer100Bdt: number;
  rewardPointsEnabled: boolean;
  birthdayRewardPoints: number;
  gracePeriodDays: number;
  /** bKash has no recurring billing — the UI must never promise auto-renewal. */
  autoRenewSupported: false;
};

export type MembershipView = {
  isMember: boolean;
  tier: "NONE" | "CLUB";
  status: "ACTIVE" | "EXPIRED" | "CANCELLED" | "PAYMENT_FAILED" | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  autoRenew: boolean;
  cancelledAt: string | null;
  price: number | null;
  startedAt: string | null;
  /** Convenience for the dashboard so it needs one fewer round trip. */
  rewardBalance: number;
  config: MembershipConfig;
  benefits: MembershipBenefit[];
};

type ConfigRow = {
  monthly_price: number | string;
  currency: string;
  billing_interval: string;
  member_discount_bps: number;
  points_per_100_bdt: number | string;
  reward_points_enabled: boolean;
  birthday_reward_points: number;
  grace_period_days: number;
};

function toConfig(row: ConfigRow): MembershipConfig {
  return {
    monthlyPrice: Number(row.monthly_price),
    currency: row.currency,
    billingInterval: row.billing_interval,
    memberDiscountPercent: row.member_discount_bps / 100,
    pointsPer100Bdt: Number(row.points_per_100_bdt),
    rewardPointsEnabled: row.reward_points_enabled,
    birthdayRewardPoints: row.birthday_reward_points,
    gracePeriodDays: row.grace_period_days,
    autoRenewSupported: false,
  };
}

const CONFIG_SELECT =
  "monthly_price,currency,billing_interval,member_discount_bps,points_per_100_bdt,reward_points_enabled,birthday_reward_points,grace_period_days";

export const getMembershipConfig = createServerFn({ method: "POST" })
  .middleware([optionalSupabaseAuth])
  .handler(async ({ context }): Promise<MembershipConfig> => {
    const { data, error } = await context.supabase
      .from("membership_config")
      .select(CONFIG_SELECT)
      .maybeSingle();
    if (error) throw error;
    // Fall back to the documented defaults if the row is somehow missing so
    // the storefront never hard-fails on a config read.
    return toConfig(
      (data as ConfigRow | null) ?? {
        monthly_price: 50,
        currency: "BDT",
        billing_interval: "MONTHLY",
        member_discount_bps: 1000,
        points_per_100_bdt: 1,
        reward_points_enabled: true,
        birthday_reward_points: 100,
        grace_period_days: 0,
      },
    );
  });

export const getMyMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MembershipView> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Best-effort birthday reward — idempotent in the DB (one BONUS per
    // member per year), only lands in the member's birthday month.
    await supabaseAdmin.rpc("award_birthday_reward", { p_user_id: context.userId }).then(
      () => undefined,
      () => undefined,
    );

    const [configRes, activeRes, latestRes, ledgerRes] = await Promise.all([
      context.supabase.from("membership_config").select(CONFIG_SELECT).maybeSingle(),
      context.supabase.rpc("active_membership", { _user_id: context.userId }),
      context.supabase
        .from("memberships")
        .select(
          "tier,status,current_period_start,current_period_end,auto_renew,cancelled_at,price,started_at",
        )
        .eq("user_id", context.userId)
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle(),
      context.supabase.from("reward_ledger").select("points").eq("user_id", context.userId),
    ]);
    if (configRes.error) throw configRes.error;

    const config = toConfig(
      (configRes.data as ConfigRow | null) ?? {
        monthly_price: 50,
        currency: "BDT",
        billing_interval: "MONTHLY",
        member_discount_bps: 1000,
        points_per_100_bdt: 1,
        reward_points_enabled: true,
        birthday_reward_points: 100,
        grace_period_days: 0,
      },
    );

    const active = (
      activeRes.data as
        | {
            tier: "NONE" | "CLUB";
            status: MembershipView["status"];
            current_period_start: string;
            current_period_end: string;
            auto_renew: boolean;
            cancelled_at: string | null;
          }[]
        | null
    )?.[0];

    const latest = latestRes.data as {
      tier: "NONE" | "CLUB";
      status: MembershipView["status"];
      current_period_start: string | null;
      current_period_end: string | null;
      auto_renew: boolean;
      cancelled_at: string | null;
      price: number | string | null;
      started_at: string | null;
    } | null;

    const rewardBalance = ((ledgerRes.data as { points: number }[] | null) ?? []).reduce(
      (s, r) => s + r.points,
      0,
    );

    const row = active ?? latest;
    return {
      isMember: Boolean(active),
      tier: row?.tier ?? "NONE",
      status: row?.status ?? null,
      currentPeriodStart: row?.current_period_start ?? null,
      currentPeriodEnd: row?.current_period_end ?? null,
      autoRenew: Boolean(row?.auto_renew),
      cancelledAt: latest?.cancelled_at ?? null,
      price: latest?.price != null ? Number(latest.price) : null,
      startedAt: latest?.started_at ?? null,
      rewardBalance,
      config,
      benefits: MEMBERSHIP_BENEFITS,
    };
  });

function friendlyJoinError(message: string): string {
  if (message.includes("ALREADY_MEMBER"))
    return "You're already a SAAJ Club member with plenty of time left — no need to renew yet.";
  if (message.includes("MEMBERSHIP_ORDER_PENDING"))
    return "You already have a SAAJ Club payment in progress. Finish or cancel that first.";
  if (message.includes("AUTH_REQUIRED")) return "Please sign in to join SAAJ Club.";
  if (message.includes("not configured")) return message;
  return "We couldn't start your SAAJ Club membership. Please try again.";
}

/**
 * Join (or renew) SAAJ Club. Creates a membership *order* + payment row via
 * `place_membership_order`, then starts a bKash session for it. Membership
 * only becomes ACTIVE once that order is verified-paid by the existing bKash
 * callback (which fires the DB activation trigger) — never here.
 */
export const joinMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(membershipJoinSchema)
  .handler(
    async ({
      data,
      context,
    }): Promise<{ reference: string; gatewayUrl: string; total: number }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      await assertRateLimit(supabaseAdmin, "membership_join", context.userId, 6, 15);

      const { data: result, error } = await supabaseAdmin.rpc("place_membership_order", {
        p_user_id: context.userId,
        p_customer: {
          name: data.customer.name,
          email: data.customer.email,
          phone: data.customer.phone,
        },
        p_tier: data.tier,
      });
      if (error || !result) {
        throw new Error(friendlyJoinError(error?.message ?? ""));
      }

      const order = result as { order_id: string; reference: string; total: number };

      try {
        const session = await initBkashPayment({
          reference: order.reference,
          amount: order.total,
          customer: data.customer,
        });
        await supabaseAdmin
          .from("payments")
          .update({ gateway_session_id: session.paymentID })
          .eq("order_id", order.order_id);

        return { reference: order.reference, gatewayUrl: session.gatewayUrl, total: order.total };
      } catch (gatewayError) {
        // Roll the marker order back so it doesn't sit unpaid forever and
        // block the next attempt with MEMBERSHIP_ORDER_PENDING.
        await supabaseAdmin.rpc("cancel_order", {
          p_order_id: order.order_id,
          p_reason: "gateway_init_failed",
        });
        throw gatewayError instanceof Error
          ? gatewayError
          : new Error("Could not reach the payment gateway. Please try again.");
      }
    },
  );

export const cancelMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(membershipCancelSchema)
  .handler(
    async ({ data, context }): Promise<{ status: string; currentPeriodEnd: string | null }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: result, error } = await supabaseAdmin.rpc("cancel_membership", {
        p_user_id: context.userId,
        p_immediate: data.immediate,
      });
      if (error) {
        if (error.message.includes("NO_ACTIVE_MEMBERSHIP"))
          throw new Error("You don't have an active SAAJ Club membership to cancel.");
        throw new Error("Could not update your membership. Please try again.");
      }
      const r = result as { status: string; current_period_end: string | null };
      return { status: r.status, currentPeriodEnd: r.current_period_end };
    },
  );
