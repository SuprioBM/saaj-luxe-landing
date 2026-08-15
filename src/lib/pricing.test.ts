import { describe, expect, it } from "vitest";

import { estimateDiscount, estimateShipping, estimateTotal, SHIPPING_FEE_BDT, SHIPPING_THRESHOLD_BDT } from "./pricing";

describe("estimateShipping", () => {
  it("is free at or above the threshold", () => {
    expect(estimateShipping(SHIPPING_THRESHOLD_BDT)).toBe(0);
    expect(estimateShipping(SHIPPING_THRESHOLD_BDT + 1)).toBe(0);
  });

  it("charges the flat fee below the threshold", () => {
    expect(estimateShipping(SHIPPING_THRESHOLD_BDT - 1)).toBe(SHIPPING_FEE_BDT);
    expect(estimateShipping(1)).toBe(SHIPPING_FEE_BDT);
  });

  it("is free for an empty/zero cart", () => {
    expect(estimateShipping(0)).toBe(0);
  });
});

describe("estimateDiscount", () => {
  it("is zero with no coupon", () => {
    expect(estimateDiscount(1000, null)).toBe(0);
  });

  it("applies a fixed discount", () => {
    expect(estimateDiscount(1000, { kind: "fixed", value: 200 })) .toBe(200);
  });

  it("applies a percent discount", () => {
    expect(estimateDiscount(1000, { kind: "percent", value: 10 })).toBe(100);
  });

  it("never discounts more than the subtotal", () => {
    expect(estimateDiscount(100, { kind: "fixed", value: 500 })).toBe(100);
    expect(estimateDiscount(100, { kind: "percent", value: 200 })).toBe(100);
  });

  it("never goes negative", () => {
    expect(estimateDiscount(1000, { kind: "fixed", value: -50 })).toBe(0);
  });
});

describe("estimateTotal", () => {
  it("computes subtotal, discount, shipping and total together", () => {
    const result = estimateTotal(6000, { kind: "percent", value: 10 });
    // 6000 - 600 = 5400, which clears the free-shipping threshold.
    expect(result).toEqual({ subtotal: 6000, discount: 600, shipping: 0, total: 5400 });
  });

  it("charges shipping when the discount drops the order below the threshold", () => {
    const result = estimateTotal(5100, { kind: "fixed", value: 200 });
    // 5100 - 200 = 4900, below the 5000 threshold.
    expect(result).toEqual({ subtotal: 5100, discount: 200, shipping: SHIPPING_FEE_BDT, total: 4900 + SHIPPING_FEE_BDT });
  });

  it("handles no coupon", () => {
    const result = estimateTotal(2699, null);
    expect(result).toEqual({ subtotal: 2699, discount: 0, shipping: SHIPPING_FEE_BDT, total: 2699 + SHIPPING_FEE_BDT });
  });
});
