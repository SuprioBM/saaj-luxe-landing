import { createServerFn } from "@tanstack/react-start";

import { requireStaff } from "@/lib/mw/authz";

export type AdminStats = {
  revenue: number;
  orders: number;
  customers: number;
  lowStock: number;
  revenueSeries: { label: string; value: number }[];
  topProducts: { slug: string; name: string; sold: number; revenue: number }[];
};

const PAID_STATUSES = ["paid", "shipped", "delivered"] as const;
const LOW_STOCK_THRESHOLD = 5;

export const adminDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .handler(async ({ context }): Promise<AdminStats> => {
    const [{ data: orders, error: oErr }, { data: variants, error: vErr }, { count: customerCount, error: cErr }, { data: items, error: iErr }] =
      await Promise.all([
        context.supabase.from("orders").select("total,status,placed_at,user_id"),
        context.supabase.from("product_variants").select("stock,reserved"),
        context.supabase.from("profiles").select("id", { count: "exact", head: true }),
        context.supabase
          .from("order_items")
          .select("product_name,product_slug,qty,unit_price,orders!inner(status)")
          .in("orders.status", PAID_STATUSES),
      ]);
    if (oErr) throw oErr;
    if (vErr) throw vErr;
    if (cErr) throw cErr;
    if (iErr) throw iErr;

    const paidOrders = (orders ?? []).filter((o) =>
      (PAID_STATUSES as readonly string[]).includes(o.status),
    );
    const revenue = paidOrders.reduce((s, o) => s + Number(o.total), 0);
    const lowStock = (variants ?? []).filter((v) => Math.max(0, v.stock - v.reserved) <= LOW_STOCK_THRESHOLD).length;

    const days: { label: string; key: string; value: number }[] = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return { label: d.toLocaleDateString("en-GB", { weekday: "short" }), key: d.toISOString().slice(0, 10), value: 0 };
    });
    for (const o of paidOrders) {
      const key = o.placed_at?.slice(0, 10);
      const bucket = days.find((d) => d.key === key);
      if (bucket) bucket.value += Number(o.total);
    }

    const bySlug = new Map<string, { name: string; sold: number; revenue: number }>();
    for (const it of items ?? []) {
      const entry = bySlug.get(it.product_slug) ?? { name: it.product_name, sold: 0, revenue: 0 };
      entry.sold += it.qty;
      entry.revenue += it.qty * Number(it.unit_price);
      bySlug.set(it.product_slug, entry);
    }
    const topProducts = [...bySlug.entries()]
      .sort((a, b) => b[1].sold - a[1].sold)
      .slice(0, 5)
      .map(([slug, v]) => ({ slug, ...v }));

    return {
      revenue,
      orders: (orders ?? []).length,
      customers: customerCount ?? 0,
      lowStock,
      revenueSeries: days.map((d) => ({ label: d.label, value: d.value })),
      topProducts,
    };
  });
