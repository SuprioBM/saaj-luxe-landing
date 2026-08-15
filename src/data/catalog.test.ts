import { describe, expect, it } from "vitest";

import { avgRating, formatBDT, stockForSize, stockState, totalStock, type Product } from "./catalog";

describe("formatBDT", () => {
  it("formats small amounts with the Taka symbol", () => {
    expect(formatBDT(0)).toBe("৳0");
    expect(formatBDT(120)).toBe("৳120");
    expect(formatBDT(999)).toBe("৳999");
  });

  it("groups thousands South-Asian style (lakh/crore, ##,##,###)", () => {
    expect(formatBDT(1000)).toBe("৳1,000");
    expect(formatBDT(12345)).toBe("৳12,345");
    expect(formatBDT(123456)).toBe("৳1,23,456");
    expect(formatBDT(1234567)).toBe("৳12,34,567");
  });

  it("rounds to the nearest whole taka", () => {
    expect(formatBDT(2699.4)).toBe("৳2,699");
    expect(formatBDT(2699.6)).toBe("৳2,700");
  });

  it("never returns a negative amount", () => {
    expect(formatBDT(-500)).toBe("৳0");
  });
});

describe("stockState", () => {
  it("reports out of stock at zero or below", () => {
    expect(stockState(0).tone).toBe("out");
    expect(stockState(-1).tone).toBe("out");
  });

  it("reports low stock in the 1-4 range with an exact count under 3", () => {
    expect(stockState(1).tone).toBe("low");
    expect(stockState(1).label).toBe("Only 1 left");
    expect(stockState(2).label).toBe("Only 2 left");
    expect(stockState(4).label).toBe("Low Stock");
  });

  it("reports in stock above the low-stock threshold", () => {
    expect(stockState(5).tone).toBe("in");
    expect(stockState(50).label).toBe("In Stock");
  });
});

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    slug: "test-product",
    name: "Test Product",
    price: 1000,
    category: "shirts",
    img: "",
    gallery: [],
    sku: "TEST-001",
    sold: 0,
    addedAt: "2026-01-01",
    tags: [],
    detail: "",
    materials: [],
    specs: [],
    sizes: [
      { id: "v1", size: "S", stock: 3 },
      { id: "v2", size: "M", stock: 0 },
      { id: "v3", size: "L", stock: 7 },
    ],
    reviews: [],
    pairsWith: [],
    ...overrides,
  };
}

describe("totalStock", () => {
  it("sums stock across every size", () => {
    expect(totalStock(makeProduct())).toBe(10);
  });

  it("is zero when every size is sold out", () => {
    expect(
      totalStock(makeProduct({ sizes: [{ id: "v1", size: "S", stock: 0 }] })),
    ).toBe(0);
  });
});

describe("stockForSize", () => {
  const product = makeProduct();

  it("returns the stock for the selected size", () => {
    expect(stockForSize(product, "S")).toBe(3);
    expect(stockForSize(product, "L")).toBe(7);
  });

  it("returns 0 for a sold-out size", () => {
    expect(stockForSize(product, "M")).toBe(0);
  });

  it("returns 0 when no size is selected", () => {
    expect(stockForSize(product, null)).toBe(0);
  });

  it("returns 0 for a size that doesn't exist on the product", () => {
    expect(stockForSize(product, "XXL")).toBe(0);
  });
});

describe("avgRating", () => {
  it("is 0 with no reviews", () => {
    expect(avgRating(makeProduct())).toBe(0);
  });

  it("averages review ratings", () => {
    const product = makeProduct({
      reviews: [
        { id: "r1", name: "A", rating: 5, date: "2026-01-01", verified: true, title: "", body: "" },
        { id: "r2", name: "B", rating: 3, date: "2026-01-01", verified: true, title: "", body: "" },
      ],
    });
    expect(avgRating(product)).toBe(4);
  });
});
