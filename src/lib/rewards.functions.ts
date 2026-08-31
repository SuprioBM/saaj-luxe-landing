import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * SAAJ Club reward points — read-only for the customer. The balance is
 * always `sum(points)` over the append-only `reward_ledger`; points are
 * awarded / reversed only by database triggers and admin RPCs, never here.
 */

export type RewardEntry = {
  id: string;
  kind: "EARNED" | "REDEEMED" | "ADJUSTED" | "EXPIRED" | "REVERSED" | "BONUS";
  points: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
};

export type RewardSummary = {
  balance: number;
  entries: RewardEntry[];
};

export const getMyRewards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RewardSummary> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Idempotent birthday reward (birthday-month + once-per-year in the DB).
    await supabaseAdmin.rpc("award_birthday_reward", { p_user_id: context.userId }).then(
      () => undefined,
      () => undefined,
    );

    const [balanceRes, entriesRes] = await Promise.all([
      context.supabase.from("reward_ledger").select("points").eq("user_id", context.userId),
      context.supabase
        .from("reward_ledger")
        .select("id,kind,points,balance_after,reason,created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (balanceRes.error) throw balanceRes.error;
    if (entriesRes.error) throw entriesRes.error;

    const balance = ((balanceRes.data as { points: number }[] | null) ?? []).reduce(
      (s, r) => s + r.points,
      0,
    );

    return {
      balance,
      entries: (
        (entriesRes.data as {
          id: string;
          kind: RewardEntry["kind"];
          points: number;
          balance_after: number;
          reason: string | null;
          created_at: string;
        }[]) ?? []
      ).map((e) => ({
        id: e.id,
        kind: e.kind,
        points: e.points,
        balanceAfter: e.balance_after,
        reason: e.reason,
        createdAt: e.created_at,
      })),
    };
  });
