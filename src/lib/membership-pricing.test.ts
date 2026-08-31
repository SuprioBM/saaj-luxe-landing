import { describe, expect, it } from "vitest";

import {
  canPurchase,
  memberUnitPrice,
  projectedPoints,
  releaseState,
  resolveMemberDiscountBps,
} from "./membership-pricing";

const DAY = 24 * 60 * 60 * 1000;

describe("resolveMemberDiscountBps", () => {
  it("uses the global rate by default", () => {
    expect(resolveMemberDiscountBps({}, 1000)).toBe(1000);
  });
  it("honours a per-product override", () => {
    expect(resolveMemberDiscountBps({ memberDiscountBps: 1500 }, 1000)).toBe(1500);
  });
  it("returns 0 when the product opts out", () => {
    expect(
      resolveMemberDiscountBps({ memberDiscountEligible: false, memberDiscountBps: 1500 }, 1000),
    ).toBe(0);
  });
  it("clamps to a sane range", () => {
    expect(resolveMemberDiscountBps({ memberDiscountBps: 99999 }, 1000)).toBe(10000);
    expect(resolveMemberDiscountBps({ memberDiscountBps: -5 }, 1000)).toBe(0);
  });
});

describe("memberUnitPrice", () => {
  it("applies 10% to the spec example (৳550 -> ৳495)", () => {
    expect(memberUnitPrice(550, 1000)).toBe(495);
  });
  it("applies a custom 15% (৳550 -> ৳468 rounded)", () => {
    expect(memberUnitPrice(550, 1500)).toBe(468);
  });
  it("returns the list price when there is no discount", () => {
    expect(memberUnitPrice(550, 0)).toBe(550);
  });
  it("rounds to the whole taka", () => {
    expect(Number.isInteger(memberUnitPrice(1999, 1000))).toBe(true);
  });
});

describe("projectedPoints", () => {
  it("floors the spec example (৳550 -> 5 points at 1/৳100)", () => {
    expect(projectedPoints(550, 1)).toBe(5);
  });
  it("never awards fractional points", () => {
    expect(projectedPoints(199, 1)).toBe(1);
    expect(projectedPoints(99, 1)).toBe(0);
  });
  it("is zero for a zero/negative spend or a disabled rule", () => {
    expect(projectedPoints(0, 1)).toBe(0);
    expect(projectedPoints(-50, 1)).toBe(0);
    expect(projectedPoints(1000, 0)).toBe(0);
  });
});

describe("canPurchase", () => {
  const now = Date.parse("2026-09-09T00:00:00Z");

  it("lets anyone buy a normal, released piece", () => {
    expect(canPurchase({}, false, now)).toBe(true);
    expect(canPurchase({}, true, now)).toBe(true);
  });

  it("blocks a non-member from a members-only piece, allows a member", () => {
    expect(canPurchase({ membersOnly: true }, false, now)).toBe(false);
    expect(canPurchase({ membersOnly: true }, true, now)).toBe(true);
  });

  it("blocks the public before public release but lets a member in during early access", () => {
    const p = {
      availableFrom: "2026-09-10T00:00:00Z",
      memberAvailableFrom: "2026-09-08T00:00:00Z",
    };
    expect(canPurchase(p, false, now)).toBe(false);
    expect(canPurchase(p, true, now)).toBe(true);
  });

  it("blocks a member too before their early-access window opens", () => {
    const p = {
      availableFrom: "2026-09-20T00:00:00Z",
      memberAvailableFrom: "2026-09-18T00:00:00Z",
    };
    expect(canPurchase(p, true, now)).toBe(false);
  });
});

describe("releaseState", () => {
  const now = Date.parse("2026-09-09T00:00:00Z");

  it("is 'available' for a released normal piece", () => {
    expect(releaseState({}, false, now)).toEqual({ state: "available" });
  });

  it("is 'members-only' for a non-member on an exclusive", () => {
    expect(releaseState({ membersOnly: true }, false, now)).toEqual({ state: "members-only" });
  });

  it("is 'coming-soon' before public release, with member eligibility flagged", () => {
    const p = {
      availableFrom: "2026-09-10T00:00:00Z",
      memberAvailableFrom: "2026-09-08T00:00:00Z",
    };
    const state = releaseState(p, false, now);
    expect(state.state).toBe("coming-soon");
    if (state.state === "coming-soon") {
      expect(state.memberEligibleNow).toBe(true);
      expect(state.publicDate).toBe("2026-09-10T00:00:00Z");
    }
  });

  it("keeps a future-dated piece hidden from a member with no early window", () => {
    const p = { availableFrom: new Date(now + 5 * DAY).toISOString() };
    const state = releaseState(p, true, now);
    expect(state.state).toBe("coming-soon");
    if (state.state === "coming-soon") expect(state.memberEligibleNow).toBe(false);
  });
});
