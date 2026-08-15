/**
 * Pure client-side pricing helpers used only for the checkout *estimate*
 * shown before payment. These mirror the authoritative math inside the
 * `place_order` Postgres function (supabase/migrations/20260815130000_*)
 * — if the numbers ever diverge, the database wins; this is display-only.
 */

export const SHIPPING_THRESHOLD_BDT = 5000;
export const SHIPPING_FEE_BDT = 120;

export function estimateShipping(amountAfterDiscount: number): number {
  if (amountAfterDiscount <= 0) return 0;
  return amountAfterDiscount >= SHIPPING_THRESHOLD_BDT ? 0 : SHIPPING_FEE_BDT;
}

export type CouponKind = "fixed" | "percent";

export function estimateDiscount(
  subtotal: number,
  coupon: { kind: CouponKind; value: number } | null,
): number {
  if (!coupon || subtotal <= 0) return 0;
  const raw = coupon.kind === "fixed" ? coupon.value : (subtotal * coupon.value) / 100;
  return Math.min(subtotal, Math.max(0, Math.round(raw * 100) / 100));
}

export function estimateTotal(
  subtotal: number,
  coupon: { kind: CouponKind; value: number } | null,
): { subtotal: number; discount: number; shipping: number; total: number } {
  const discount = estimateDiscount(subtotal, coupon);
  const afterDiscount = Math.max(0, subtotal - discount);
  const shipping = estimateShipping(afterDiscount);
  return { subtotal, discount, shipping, total: afterDiscount + shipping };
}
