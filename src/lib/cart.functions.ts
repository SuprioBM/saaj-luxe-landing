import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { cartAddSchema, cartMergeSchema, cartRemoveSchema, cartSetQtySchema } from "@/lib/schemas";

export type CartLine = {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  size: string;
  image: string | null;
  qty: number;
  unitPrice: number;
  available: number;
};

type CartItemRow = {
  qty: number;
  variant_id: string;
  product_variants: {
    id: string;
    size: string;
    stock: number;
    reserved: number;
    product_id: string;
    products: {
      id: string;
      slug: string;
      name: string;
      price: number | string;
      discount_price: number | string | null;
      status: string;
      product_images: { url: string; position: number; is_primary: boolean }[];
    } | null;
  } | null;
};

const CART_ITEM_SELECT =
  "qty,variant_id,product_variants(id,size,stock,reserved,product_id,products(id,slug,name,price,discount_price,status,product_images(url,position,is_primary)))";

async function getOrCreateCartId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data: existing, error: selErr } = await supabase
    .from("carts")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;

  const { data: created, error: insErr } = await supabase
    .from("carts")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return created.id;
}

function rowsToLines(rows: CartItemRow[]): CartLine[] {
  return rows
    .filter((r): r is CartItemRow & { product_variants: NonNullable<CartItemRow["product_variants"]> } =>
      Boolean(r.product_variants?.products),
    )
    .map((r) => {
      const v = r.product_variants;
      const p = v.products!;
      const images = [...p.product_images].sort(
        (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position,
      );
      return {
        variantId: v.id,
        productId: p.id,
        slug: p.slug,
        name: p.name,
        size: v.size,
        image: images[0]?.url ?? null,
        qty: r.qty,
        unitPrice: Number(p.discount_price ?? p.price),
        available: Math.max(0, v.stock - v.reserved),
      };
    });
}

export const getCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CartLine[]> => {
    const cartId = await getOrCreateCartId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("cart_items")
      .select(CART_ITEM_SELECT)
      .eq("cart_id", cartId);
    if (error) throw error;
    return rowsToLines(data as unknown as CartItemRow[]);
  });

export const addToCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(cartAddSchema)
  .handler(async ({ data, context }): Promise<CartLine[]> => {
    const cartId = await getOrCreateCartId(context.supabase, context.userId);

    const { data: variant, error: vErr } = await context.supabase
      .from("product_variants")
      .select("id,stock,reserved,products(status)")
      .eq("id", data.variantId)
      .single();
    if (vErr || !variant) throw new Error("This piece is no longer available.");
    if ((variant.products as { status: string } | null)?.status !== "active") {
      throw new Error("This piece is no longer available.");
    }
    const available = Math.max(0, variant.stock - variant.reserved);
    if (available <= 0) throw new Error("Out of stock.");

    const { data: existing } = await context.supabase
      .from("cart_items")
      .select("id,qty")
      .eq("cart_id", cartId)
      .eq("variant_id", data.variantId)
      .maybeSingle();

    const nextQty = Math.min(available, (existing?.qty ?? 0) + data.qty);
    if (existing) {
      const { error } = await context.supabase
        .from("cart_items")
        .update({ qty: nextQty })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase
        .from("cart_items")
        .insert({ cart_id: cartId, variant_id: data.variantId, qty: nextQty });
      if (error) throw error;
    }

    const { data: rows, error } = await context.supabase
      .from("cart_items")
      .select(CART_ITEM_SELECT)
      .eq("cart_id", cartId);
    if (error) throw error;
    return rowsToLines(rows as unknown as CartItemRow[]);
  });

export const setCartItemQty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(cartSetQtySchema)
  .handler(async ({ data, context }): Promise<CartLine[]> => {
    const cartId = await getOrCreateCartId(context.supabase, context.userId);

    if (data.qty <= 0) {
      const { error } = await context.supabase
        .from("cart_items")
        .delete()
        .eq("cart_id", cartId)
        .eq("variant_id", data.variantId);
      if (error) throw error;
    } else {
      const { data: variant } = await context.supabase
        .from("product_variants")
        .select("stock,reserved")
        .eq("id", data.variantId)
        .single();
      const available = Math.max(0, (variant?.stock ?? 0) - (variant?.reserved ?? 0));
      const { error } = await context.supabase
        .from("cart_items")
        .update({ qty: Math.min(data.qty, Math.max(1, available)) })
        .eq("cart_id", cartId)
        .eq("variant_id", data.variantId);
      if (error) throw error;
    }

    const { data: rows, error } = await context.supabase
      .from("cart_items")
      .select(CART_ITEM_SELECT)
      .eq("cart_id", cartId);
    if (error) throw error;
    return rowsToLines(rows as unknown as CartItemRow[]);
  });

export const removeCartItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(cartRemoveSchema)
  .handler(async ({ data, context }): Promise<CartLine[]> => {
    const cartId = await getOrCreateCartId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("cart_items")
      .delete()
      .eq("cart_id", cartId)
      .eq("variant_id", data.variantId);
    if (error) throw error;

    const { data: rows, error: selErr } = await context.supabase
      .from("cart_items")
      .select(CART_ITEM_SELECT)
      .eq("cart_id", cartId);
    if (selErr) throw selErr;
    return rowsToLines(rows as unknown as CartItemRow[]);
  });

export const clearCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<void> => {
    const cartId = await getOrCreateCartId(context.supabase, context.userId);
    const { error } = await context.supabase.from("cart_items").delete().eq("cart_id", cartId);
    if (error) throw error;
  });

/** Called once right after SIGNED_IN with the guest (localStorage) cart lines. */
export const mergeGuestCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(cartMergeSchema)
  .handler(async ({ data, context }): Promise<CartLine[]> => {
    const cartId = await getOrCreateCartId(context.supabase, context.userId);

    for (const line of data.lines) {
      const { data: variant } = await context.supabase
        .from("product_variants")
        .select("stock,reserved")
        .eq("id", line.variantId)
        .maybeSingle();
      if (!variant) continue;
      const available = Math.max(0, variant.stock - variant.reserved);
      if (available <= 0) continue;

      const { data: existing } = await context.supabase
        .from("cart_items")
        .select("id,qty")
        .eq("cart_id", cartId)
        .eq("variant_id", line.variantId)
        .maybeSingle();

      const nextQty = Math.min(available, (existing?.qty ?? 0) + line.qty);
      if (existing) {
        await context.supabase.from("cart_items").update({ qty: nextQty }).eq("id", existing.id);
      } else {
        await context.supabase
          .from("cart_items")
          .insert({ cart_id: cartId, variant_id: line.variantId, qty: nextQty });
      }
    }

    const { data: rows, error } = await context.supabase
      .from("cart_items")
      .select(CART_ITEM_SELECT)
      .eq("cart_id", cartId);
    if (error) throw error;
    return rowsToLines(rows as unknown as CartItemRow[]);
  });
