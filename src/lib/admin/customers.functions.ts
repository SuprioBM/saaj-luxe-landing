import { createServerFn } from "@tanstack/react-start";

import { requireStaff } from "@/lib/mw/authz";

export type AdminCustomer = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  orders: number;
  spend: number;
};

export const adminListCustomers = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .handler(async ({ context }): Promise<AdminCustomer[]> => {
    const [{ data: profiles, error: pErr }, { data: orders, error: oErr }] = await Promise.all([
      context.supabase.from("profiles").select("id,name,email,created_at").order("created_at", { ascending: false }),
      context.supabase.from("orders").select("user_id,total,status").not("user_id", "is", null),
    ]);
    if (pErr) throw pErr;
    if (oErr) throw oErr;

    const byUser = new Map<string, { orders: number; spend: number }>();
    for (const o of orders ?? []) {
      if (!o.user_id) continue;
      const entry = byUser.get(o.user_id) ?? { orders: 0, spend: 0 };
      entry.orders += 1;
      if (["paid", "shipped", "delivered"].includes(o.status)) entry.spend += Number(o.total);
      byUser.set(o.user_id, entry);
    }

    return (profiles ?? []).map((p) => ({
      id: p.id,
      name: p.name || p.email.split("@")[0],
      email: p.email,
      createdAt: p.created_at,
      orders: byUser.get(p.id)?.orders ?? 0,
      spend: byUser.get(p.id)?.spend ?? 0,
    }));
  });
