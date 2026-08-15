import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { adminOrderStatusSchema, adminSetShipmentSchema } from "@/lib/schemas";
import { requireStaff } from "@/lib/mw/authz";

export type AdminOrder = {
  id: string;
  reference: string;
  status: string;
  placedAt: string;
  total: number;
  customerName: string;
  customerEmail: string;
  paymentStatus: string | null;
  isGuest: boolean;
  courier: string | null;
  shipmentTrackingNumber: string | null;
  items: { name: string; size: string; qty: number }[];
};

const SELECT =
  "id,reference,status,placed_at,total,customer_name,customer_email,user_id,courier,shipment_tracking_number,order_items(product_name,size,qty),payments(status)";

type OrderRow = {
  id: string;
  reference: string;
  status: string;
  placed_at: string;
  total: number;
  customer_name: string;
  customer_email: string;
  user_id: string | null;
  courier: string | null;
  shipment_tracking_number: string | null;
  order_items: { product_name: string; size: string; qty: number }[];
  payments: { status: string }[];
};

function toAdminOrder(row: OrderRow): AdminOrder {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    placedAt: row.placed_at,
    total: Number(row.total),
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    paymentStatus: row.payments?.[0]?.status ?? null,
    isGuest: !row.user_id,
    courier: row.courier,
    shipmentTrackingNumber: row.shipment_tracking_number,
    items: row.order_items.map((i) => ({ name: i.product_name, size: i.size, qty: i.qty })),
  };
}

export const adminListOrders = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .handler(async ({ context }): Promise<AdminOrder[]> => {
    const { data, error } = await context.supabase
      .from("orders")
      .select(SELECT)
      .order("placed_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data as unknown as OrderRow[]).map(toAdminOrder);
  });

export const adminUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator(adminOrderStatusSchema)
  .handler(async ({ data, context }): Promise<{ id: string; status: string }> => {
    const { data: current, error: curErr } = await context.supabase
      .from("orders")
      .select("id,status,reference,customer_name,customer_email,total,user_id,guest_access_token_hash")
      .eq("id", data.orderId)
      .single();
    if (curErr) throw curErr;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.status === "cancelled" && current.status !== "cancelled") {
      // Route through the same atomic function every cancellation path
      // uses (webhook, customer self-cancel) so inventory correctness
      // (release vs. restock) never has a second implementation to drift.
      const wasPaid = current.status === "paid" || current.status === "processing";
      const { error } = await supabaseAdmin.rpc("cancel_order", {
        p_order_id: data.orderId,
        p_reason: "Cancelled by admin",
      });
      if (error) throw error;

      try {
        const { sendOrderCancelledEmail } = await import("@/lib/email/send");
        const siteUrl = (process.env.VITE_SITE_URL || process.env.SITE_URL || "http://localhost:8080").replace(
          /\/$/,
          "",
        );
        await sendOrderCancelledEmail({
          to: current.customer_email,
          customerName: current.customer_name,
          reference: current.reference,
          total: Number(current.total),
          paymentCaptured: wasPaid,
          trackingUrl: `${siteUrl}/order/${current.reference}`,
        });
      } catch (emailErr) {
        console.error("[adminUpdateOrderStatus] cancellation email failed", emailErr);
      }
    } else {
      const { error } = await context.supabase
        .from("orders")
        .update({ status: data.status })
        .eq("id", data.orderId);
      if (error) throw error;

      if (current.user_id) {
        await supabaseAdmin.from("notifications").insert({
          audience: "user",
          user_id: current.user_id,
          kind: "order_status",
          title: "Order status updated",
          body: `${current.reference} is now ${data.status}.`,
          link: `/order/${current.reference}`,
        });
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "order.status_update",
      entity_type: "order",
      entity_id: data.orderId,
      metadata: { from: current.status, to: data.status },
    });

    return { id: data.orderId, status: data.status };
  });

export const adminSetShipment = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator(adminSetShipmentSchema)
  .handler(async ({ data, context }): Promise<{ courier: string | null; trackingNumber: string | null }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("set_order_shipment", {
      p_order_id: data.orderId,
      p_courier: data.courier || null,
      p_tracking_number: data.trackingNumber || null,
      p_actor_id: context.userId,
    });
    if (error) throw error;
    return { courier: data.courier ?? null, trackingNumber: data.trackingNumber ?? null };
  });

export const adminGetOrder = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }): Promise<AdminOrder> => {
    const { data: row, error } = await context.supabase
      .from("orders")
      .select(SELECT)
      .eq("id", data.id)
      .single();
    if (error) throw error;
    return toAdminOrder(row as unknown as OrderRow);
  });
