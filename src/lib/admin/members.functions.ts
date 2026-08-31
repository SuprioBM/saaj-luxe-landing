import { createServerFn } from "@tanstack/react-start";

import type { Database } from "@/integrations/supabase/types";
import { requireStaff } from "@/lib/mw/authz";
import {
  adminMemberDetailSchema,
  adminMembershipSetSchema,
  adminRewardAdjustSchema,
  membershipConfigUpdateSchema,
} from "@/lib/schemas";

/**
 * SAAJ Club admin — view members, view/adjust reward balances, manually
 * activate/deactivate a membership, and edit the club config. Every write
 * goes through an audited RPC (`admin_set_membership` / `admin_adjust_reward_points`)
 * and requires a reason. `requireStaff` re-checks the role server-side.
 */

export type AdminMember = {
  userId: string;
  name: string;
  email: string;
  tier: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  autoRenew: boolean;
  cancelledAt: string | null;
  startedAt: string | null;
  price: number | null;
  rewardBalance: number;
};

export const adminListMembers = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .handler(async ({ context }): Promise<AdminMember[]> => {
    const [
      { data: memberships, error: mErr },
      { data: profiles, error: pErr },
      { data: ledger, error: lErr },
    ] = await Promise.all([
      context.supabase
        .from("memberships")
        .select(
          "user_id,tier,status,current_period_start,current_period_end,auto_renew,cancelled_at,started_at,price",
        )
        .order("current_period_end", { ascending: false }),
      context.supabase.from("profiles").select("id,name,email"),
      context.supabase.from("reward_ledger").select("user_id,points"),
    ]);
    if (mErr) throw mErr;
    if (pErr) throw pErr;
    if (lErr) throw lErr;

    const profileById = new Map(
      ((profiles as { id: string; name: string; email: string }[]) ?? []).map((p) => [p.id, p]),
    );
    const balanceByUser = new Map<string, number>();
    for (const row of (ledger as { user_id: string; points: number }[] | null) ?? []) {
      balanceByUser.set(row.user_id, (balanceByUser.get(row.user_id) ?? 0) + row.points);
    }

    // One row per user (the most recent membership — the query is already
    // ordered by period end desc).
    const seen = new Set<string>();
    const out: AdminMember[] = [];
    for (const m of (memberships as {
      user_id: string;
      tier: string;
      status: string;
      current_period_start: string | null;
      current_period_end: string | null;
      auto_renew: boolean;
      cancelled_at: string | null;
      started_at: string | null;
      price: number | string | null;
    }[]) ?? []) {
      if (seen.has(m.user_id)) continue;
      seen.add(m.user_id);
      const profile = profileById.get(m.user_id);
      out.push({
        userId: m.user_id,
        name: profile?.name || profile?.email?.split("@")[0] || "Member",
        email: profile?.email ?? "",
        tier: m.tier,
        status: m.status,
        currentPeriodStart: m.current_period_start,
        currentPeriodEnd: m.current_period_end,
        autoRenew: m.auto_renew,
        cancelledAt: m.cancelled_at,
        startedAt: m.started_at,
        price: m.price != null ? Number(m.price) : null,
        rewardBalance: balanceByUser.get(m.user_id) ?? 0,
      });
    }
    return out;
  });

export type AdminMemberDetail = {
  member: AdminMember | null;
  memberships: {
    id: string;
    tier: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    startedAt: string;
    autoRenew: boolean;
    cancelledAt: string | null;
    price: number;
  }[];
  ledger: {
    id: string;
    kind: string;
    points: number;
    balanceAfter: number;
    reason: string | null;
    orderId: string | null;
    createdAt: string;
  }[];
  rewardBalance: number;
  membershipOrders: {
    reference: string;
    status: string;
    total: number;
    placedAt: string;
    paymentStatus: string | null;
  }[];
};

export const adminGetMemberDetail = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator(adminMemberDetailSchema)
  .handler(async ({ data, context }): Promise<AdminMemberDetail> => {
    const [profileRes, membershipsRes, ledgerRes, ordersRes] = await Promise.all([
      context.supabase.from("profiles").select("id,name,email").eq("id", data.userId).maybeSingle(),
      context.supabase
        .from("memberships")
        .select(
          "id,tier,status,current_period_start,current_period_end,started_at,auto_renew,cancelled_at,price",
        )
        .eq("user_id", data.userId)
        .order("current_period_end", { ascending: false }),
      context.supabase
        .from("reward_ledger")
        .select("id,kind,points,balance_after,reason,order_id,created_at")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(200),
      context.supabase
        .from("orders")
        .select("reference,status,total,placed_at,payments(status)")
        .eq("user_id", data.userId)
        .eq("order_kind", "membership")
        .order("placed_at", { ascending: false }),
    ]);
    if (membershipsRes.error) throw membershipsRes.error;
    if (ledgerRes.error) throw ledgerRes.error;

    const profile = profileRes.data as { id: string; name: string; email: string } | null;
    const memberships = (
      (membershipsRes.data as {
        id: string;
        tier: string;
        status: string;
        current_period_start: string;
        current_period_end: string;
        started_at: string;
        auto_renew: boolean;
        cancelled_at: string | null;
        price: number | string;
      }[]) ?? []
    ).map((m) => ({
      id: m.id,
      tier: m.tier,
      status: m.status,
      currentPeriodStart: m.current_period_start,
      currentPeriodEnd: m.current_period_end,
      startedAt: m.started_at,
      autoRenew: m.auto_renew,
      cancelledAt: m.cancelled_at,
      price: Number(m.price),
    }));

    const ledger = (
      (ledgerRes.data as {
        id: string;
        kind: string;
        points: number;
        balance_after: number;
        reason: string | null;
        order_id: string | null;
        created_at: string;
      }[]) ?? []
    ).map((e) => ({
      id: e.id,
      kind: e.kind,
      points: e.points,
      balanceAfter: e.balance_after,
      reason: e.reason,
      orderId: e.order_id,
      createdAt: e.created_at,
    }));

    const rewardBalance = ledger.reduce((s, e) => s + e.points, 0);
    const latest = memberships[0];

    return {
      member: latest
        ? {
            userId: data.userId,
            name: profile?.name || profile?.email?.split("@")[0] || "Member",
            email: profile?.email ?? "",
            tier: latest.tier,
            status: latest.status,
            currentPeriodStart: latest.currentPeriodStart,
            currentPeriodEnd: latest.currentPeriodEnd,
            autoRenew: latest.autoRenew,
            cancelledAt: latest.cancelledAt,
            startedAt: latest.startedAt,
            price: latest.price,
            rewardBalance,
          }
        : profile
          ? {
              userId: data.userId,
              name: profile.name || profile.email.split("@")[0],
              email: profile.email,
              tier: "NONE",
              status: "—",
              currentPeriodStart: null,
              currentPeriodEnd: null,
              autoRenew: false,
              cancelledAt: null,
              startedAt: null,
              price: null,
              rewardBalance,
            }
          : null,
      memberships,
      ledger,
      rewardBalance,
      membershipOrders: (
        (ordersRes.data as {
          reference: string;
          status: string;
          total: number | string;
          placed_at: string;
          payments: { status: string }[];
        }[]) ?? []
      ).map((o) => ({
        reference: o.reference,
        status: o.status,
        total: Number(o.total),
        placedAt: o.placed_at,
        paymentStatus: o.payments?.[0]?.status ?? null,
      })),
    };
  });

export const adminSetMembership = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator(adminMembershipSetSchema)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("admin_set_membership", {
      p_user_id: data.userId,
      p_status: data.status,
      p_period_end: data.periodEnd ?? null,
      p_actor_id: context.userId,
      p_reason: data.reason,
    });
    if (error) {
      if (error.message.includes("PERIOD_END_REQUIRED"))
        throw new Error("Set a future renewal date when activating a membership.");
      if (error.message.includes("NO_MEMBERSHIP"))
        throw new Error("This customer has no membership to change.");
      throw new Error("Could not update this membership.");
    }
    return { ok: true };
  });

export const adminAdjustRewardPoints = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator(adminRewardAdjustSchema)
  .handler(async ({ data, context }): Promise<{ balance: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("admin_adjust_reward_points", {
      p_user_id: data.userId,
      p_points: data.points,
      p_reason: data.reason,
      p_actor_id: context.userId,
    });
    if (error) {
      if (error.message.includes("INSUFFICIENT_BALANCE"))
        throw new Error("That deduction would take the balance below zero.");
      throw new Error("Could not adjust reward points.");
    }
    return { balance: (result as { balance: number }).balance };
  });

/* ------------------------------------------------------- club config --- */

export type ClubConfig = {
  monthlyPrice: number;
  currency: string;
  memberDiscountPercent: number;
  pointsPer100Bdt: number;
  rewardPointsEnabled: boolean;
  birthdayRewardPoints: number;
  gracePeriodDays: number;
};

export const adminGetClubConfig = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .handler(async ({ context }): Promise<ClubConfig> => {
    const { data, error } = await context.supabase
      .from("membership_config")
      .select(
        "monthly_price,currency,member_discount_bps,points_per_100_bdt,reward_points_enabled,birthday_reward_points,grace_period_days",
      )
      .maybeSingle();
    if (error) throw error;
    const row = data as {
      monthly_price: number | string;
      currency: string;
      member_discount_bps: number;
      points_per_100_bdt: number | string;
      reward_points_enabled: boolean;
      birthday_reward_points: number;
      grace_period_days: number;
    } | null;
    return {
      monthlyPrice: Number(row?.monthly_price ?? 50),
      currency: row?.currency ?? "BDT",
      memberDiscountPercent: (row?.member_discount_bps ?? 1000) / 100,
      pointsPer100Bdt: Number(row?.points_per_100_bdt ?? 1),
      rewardPointsEnabled: row?.reward_points_enabled ?? true,
      birthdayRewardPoints: row?.birthday_reward_points ?? 100,
      gracePeriodDays: row?.grace_period_days ?? 0,
    };
  });

export const adminUpdateClubConfig = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator(membershipConfigUpdateSchema)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Database["public"]["Tables"]["membership_config"]["Update"] = {};
    if (data.monthlyPrice !== undefined) patch.monthly_price = data.monthlyPrice;
    if (data.memberDiscountPercent !== undefined)
      patch.member_discount_bps = Math.round(data.memberDiscountPercent * 100);
    if (data.pointsPer100Bdt !== undefined) patch.points_per_100_bdt = data.pointsPer100Bdt;
    if (data.rewardPointsEnabled !== undefined)
      patch.reward_points_enabled = data.rewardPointsEnabled;
    if (data.birthdayRewardPoints !== undefined)
      patch.birthday_reward_points = data.birthdayRewardPoints;
    if (data.gracePeriodDays !== undefined) patch.grace_period_days = data.gracePeriodDays;

    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabaseAdmin.from("membership_config").update(patch).eq("id", true);
    if (error) throw error;

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "membership.config_update",
      entity_type: "membership_config",
      entity_id: "singleton",
      metadata: { ...patch },
    });
    return { ok: true };
  });
