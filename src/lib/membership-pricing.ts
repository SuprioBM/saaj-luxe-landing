/**
 * Pure SAAJ Club pricing / eligibility helpers — display + estimate only.
 *
 * These MIRROR the authoritative math inside the `place_order` Postgres
 * function (supabase/migrations/20260831140100_*). If they ever diverge, the
 * database wins — the frontend never gets to dictate a member price, a
 * discount, or whether an exclusive/early-access piece can be bought.
 */

export type MemberPricingProduct = {
  membersOnly?: boolean;
  memberDiscountEligible?: boolean;
  memberDiscountBps?: number | null;
  availableFrom?: string | null;
  memberAvailableFrom?: string | null;
};

/** Resolved member-discount rate in basis points (0 = no member discount). */
export function resolveMemberDiscountBps(product: MemberPricingProduct, globalBps: number): number {
  if (product.memberDiscountEligible === false) return 0;
  const bps = product.memberDiscountBps ?? globalBps;
  return Math.max(0, Math.min(10000, Math.round(bps)));
}

/** Member unit price for a BDT list price, rounded to the whole taka (matches the DB's `round(...,2)` for integer prices). */
export function memberUnitPrice(listPrice: number, bps: number): number {
  if (bps <= 0) return listPrice;
  return Math.round((listPrice * (10000 - bps)) / 10000);
}

/** Projected reward points: floor of eligible merchandise spend. */
export function projectedPoints(eligibleSpend: number, pointsPer100Bdt: number): number {
  if (eligibleSpend <= 0 || pointsPer100Bdt <= 0) return 0;
  return Math.floor((eligibleSpend / 100) * pointsPer100Bdt);
}

/**
 * Is this piece purchasable *right now* for this shopper?
 *   - members buy from `memberAvailableFrom` (falling back to `availableFrom`)
 *   - the public buys from `availableFrom`
 *   - `membersOnly` pieces are never purchasable by non-members
 */
export function canPurchase(
  product: MemberPricingProduct,
  isMember: boolean,
  now: number = Date.now(),
): boolean {
  if (product.membersOnly && !isMember) return false;
  const from = isMember
    ? (product.memberAvailableFrom ?? product.availableFrom)
    : product.availableFrom;
  if (from && new Date(from).getTime() > now) return false;
  return true;
}

export type ReleaseState =
  | { state: "available" }
  | { state: "members-only" }
  | {
      state: "coming-soon";
      publicDate: string | null;
      memberDate: string | null;
      memberEligibleNow: boolean;
    };

/** UI-facing release status for a product card / PDP. */
export function releaseState(
  product: MemberPricingProduct,
  isMember: boolean,
  now: number = Date.now(),
): ReleaseState {
  const publicDate = product.availableFrom ?? null;
  const memberDate = product.memberAvailableFrom ?? product.availableFrom ?? null;
  const publicLive = !publicDate || new Date(publicDate).getTime() <= now;
  const memberLive = !memberDate || new Date(memberDate).getTime() <= now;

  if (!publicLive) {
    // still before public release — members may or may not have early access
    return {
      state: "coming-soon",
      publicDate,
      memberDate,
      memberEligibleNow: memberLive && (!product.membersOnly || isMember),
    };
  }
  if (product.membersOnly && !isMember) return { state: "members-only" };
  return { state: "available" };
}
