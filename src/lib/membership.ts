import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import {
  getMembershipConfig,
  getMyMembership,
  type MembershipConfig,
  type MembershipView,
} from "@/lib/membership.functions";
import { getMyRewards, type RewardSummary } from "@/lib/rewards.functions";
import {
  memberUnitPrice,
  resolveMemberDiscountBps,
  type MemberPricingProduct,
} from "@/lib/membership-pricing";

/**
 * Client-side SAAJ Club state. `useMembership()` is the display-layer
 * mirror of the authoritative backend read — the DB still recomputes every
 * price / eligibility check at checkout.
 */

const CLUB_CONFIG_FALLBACK: MembershipConfig = {
  monthlyPrice: 50,
  currency: "BDT",
  billingInterval: "MONTHLY",
  memberDiscountPercent: 10,
  pointsPer100Bdt: 1,
  rewardPointsEnabled: true,
  birthdayRewardPoints: 100,
  gracePeriodDays: 0,
  autoRenewSupported: false,
};

export function useMembershipConfig(): MembershipConfig {
  const { data } = useQuery({
    queryKey: ["membership", "config"],
    queryFn: () => getMembershipConfig(),
    staleTime: 5 * 60_000,
  });
  return data ?? CLUB_CONFIG_FALLBACK;
}

export type MembershipState = MembershipView & { isLoading: boolean };

const GUEST_STATE: MembershipView = {
  isMember: false,
  tier: "NONE",
  status: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  autoRenew: false,
  cancelledAt: null,
  price: null,
  startedAt: null,
  rewardBalance: 0,
  config: CLUB_CONFIG_FALLBACK,
  benefits: [],
};

export function useMembership(): MembershipState {
  const user = useAuth();
  const query = useQuery({
    queryKey: ["membership", "mine", user?.id],
    queryFn: () => getMyMembership(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  if (!user) return { ...GUEST_STATE, isLoading: false };
  return { ...(query.data ?? GUEST_STATE), isLoading: query.isLoading };
}

export function useRewards(): RewardSummary & { isLoading: boolean } {
  const user = useAuth();
  const query = useQuery({
    queryKey: ["rewards", "mine", user?.id],
    queryFn: () => getMyRewards(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  return {
    balance: query.data?.balance ?? 0,
    entries: query.data?.entries ?? [],
    isLoading: query.isLoading,
  };
}

/** Member unit price for a product given the current shopper + club config. */
export function useMemberPrice(product: MemberPricingProduct & { price: number }): {
  listPrice: number;
  memberPrice: number;
  saves: number;
  isMemberPrice: boolean;
} {
  const config = useMembershipConfig();
  const { isMember } = useMembership();
  const bps = isMember
    ? resolveMemberDiscountBps(product, Math.round(config.memberDiscountPercent * 100))
    : 0;
  const memberPrice = memberUnitPrice(product.price, bps);
  return {
    listPrice: product.price,
    memberPrice,
    saves: product.price - memberPrice,
    isMemberPrice: isMember && memberPrice < product.price,
  };
}

/** The member price a NON-member would get if they joined (for "৳X for SAAJ Club" copy). */
export function usePotentialMemberPrice(product: MemberPricingProduct & { price: number }): {
  memberPrice: number;
  saves: number;
  eligible: boolean;
} {
  const config = useMembershipConfig();
  const bps = resolveMemberDiscountBps(product, Math.round(config.memberDiscountPercent * 100));
  const memberPrice = memberUnitPrice(product.price, bps);
  return { memberPrice, saves: product.price - memberPrice, eligible: bps > 0 };
}
