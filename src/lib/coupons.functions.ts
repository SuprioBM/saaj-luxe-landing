import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { optionalSupabaseAuth } from "@/lib/mw/optionalAuth";

const previewSchema = z.object({
  code: z.string().trim().min(1).max(40),
  guestItems: z
    .array(z.object({ variantId: z.string().uuid(), qty: z.number().int().min(1).max(20) }))
    .optional(),
});

export type CouponPreview = { valid: boolean; discount: number; message: string };

export const previewCoupon = createServerFn({ method: "POST" })
  .middleware([optionalSupabaseAuth])
  .validator(previewSchema)
  .handler(async ({ data, context }): Promise<CouponPreview> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let items: { variantId: string; qty: number }[];
    if (context.userId) {
      const { data: cart } = await supabaseAdmin
        .from("carts")
        .select("id, cart_items(variant_id, qty)")
        .eq("user_id", context.userId)
        .maybeSingle();
      items = (cart?.cart_items ?? []).map((i: { variant_id: string; qty: number }) => ({
        variantId: i.variant_id,
        qty: i.qty,
      }));
    } else {
      items = data.guestItems ?? [];
    }

    if (items.length === 0) return { valid: false, discount: 0, message: "Your bag is empty." };

    const { data: variants, error: vErr } = await supabaseAdmin
      .from("product_variants")
      .select("id, products(price, discount_price)")
      .in(
        "id",
        items.map((i) => i.variantId),
      );
    if (vErr) throw vErr;

    let subtotal = 0;
    for (const item of items) {
      const row = (variants as { id: string; products: { price: number; discount_price: number | null } | null }[]).find(
        (v) => v.id === item.variantId,
      );
      const price = row?.products ? Number(row.products.discount_price ?? row.products.price) : 0;
      subtotal += price * item.qty;
    }

    const { data: coupon, error: cErr } = await supabaseAdmin
      .from("coupons")
      .select("id,kind,value,min_subtotal,starts_at,expires_at,usage_limit,used_count,active")
      .ilike("code", data.code.trim())
      .maybeSingle();
    if (cErr) throw cErr;

    if (!coupon || !coupon.active) {
      return { valid: false, discount: 0, message: "That coupon code isn't valid." };
    }
    const now = Date.now();
    if (
      new Date(coupon.starts_at).getTime() > now ||
      (coupon.expires_at && new Date(coupon.expires_at).getTime() < now)
    ) {
      return { valid: false, discount: 0, message: "That coupon has expired." };
    }
    if (subtotal < Number(coupon.min_subtotal)) {
      return {
        valid: false,
        discount: 0,
        message: `Add more to your bag to use this coupon (min ৳${Number(coupon.min_subtotal).toLocaleString("en-BD")}).`,
      };
    }
    if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
      return { valid: false, discount: 0, message: "That coupon has reached its usage limit." };
    }
    if (context.userId) {
      const { data: redeemed } = await supabaseAdmin
        .from("coupon_redemptions")
        .select("id")
        .eq("coupon_id", coupon.id)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (redeemed) return { valid: false, discount: 0, message: "You've already used that coupon." };
    }

    const rawDiscount =
      coupon.kind === "fixed" ? Number(coupon.value) : (subtotal * Number(coupon.value)) / 100;
    const discount = Math.min(subtotal, Math.round(rawDiscount * 100) / 100);

    return {
      valid: true,
      discount,
      message: `Coupon applied — you save ৳${discount.toLocaleString("en-BD")}.`,
    };
  });
