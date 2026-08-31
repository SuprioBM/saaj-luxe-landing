import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { cartAddSchema, cartMergeSchema, cartRemoveSchema, cartSetQtySchema } from "@/lib/schemas";
import { memberUnitPrice, resolveMemberDiscountBps } from "@/lib/membership-pricing";

export type CartLine = {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  size: string;
  image: string | null;
  qty: number;
  /** What the customer actually pays per unit — the member price when the
   * caller is an active SAAJ Club member and the piece is eligible, else the
   * list price. The DB (`place_order`) recomputes this authoritatively. */
  unitPrice: number;
  /** Pre-member-discount list price, for the struck-through display. */
  listPrice: number;
  available: number;
  membersOnly: boolean;
  availableFrom: string | null;
  memberAvailableFrom: string | null;
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
      members_only: boolean;
      member_discount_eligible: boolean;
      member_discount_bps: number | null;
      available_from: string | null;
      member_available_from: string | null;
      product_images: { url: string; position: number; is_primary: boolean }[];
    } | null;
  } | null;
};

const CART_ITEM_SELECT =
  "qty,variant_id,product_variants(id,size,stock,reserved,product_id,products(id,slug,name,price,discount_price,status,members_only,member_discount_eligible,member_discount_bps,available_from,member_available_from,product_images(url,position,is_primary)))";

type MemberCtx = { isMember: boolean; globalBps: number };

async function memberContext(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<MemberCtx> {
  const [{ data: isMember }, { data: cfg }] = await Promise.all([
    supabase.rpc("is_active_member", { _user_id: userId }),
    supabase.from("membership_config").select("member_discount_bps").maybeSingle(),
  ]);
  return {
    isMember: Boolean(isMember),
    globalBps: (cfg as { member_discount_bps: number } | null)?.member_discount_bps ?? 1000,
  };
}

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

function rowsToLines(rows: CartItemRow[], ctx: MemberCtx): CartLine[] {
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
      const listPrice = Number(p.discount_price ?? p.price);
      const bps = ctx.isMember
        ? resolveMemberDiscountBps(
            {
              memberDiscountEligible: p.member_discount_eligible,
              memberDiscountBps: p.member_discount_bps,
            },
            ctx.globalBps,
          )
        : 0;
      return {
        variantId: v.id,
        productId: p.id,
        slug: p.slug,
        name: p.name,
        size: v.size,
        image: images[0]?.url ?? null,
        qty: r.qty,
        unitPrice: memberUnitPrice(listPrice, bps),
        listPrice,
        available: Math.max(0, v.stock - v.reserved),
        membersOnly: p.members_only,
        availableFrom: p.available_from,
        memberAvailableFrom: p.member_available_from,
      };
    });
}

export const getCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CartLine[]> => {
    const cartId = await getOrCreateCartId(context.supabase, context.userId);
    const ctx = await memberContext(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("cart_items")
      .select(CART_ITEM_SELECT)
      .eq("cart_id", cartId);
    if (error) throw error;
    return rowsToLines(data as unknown as CartItemRow[], ctx);
  });

export const addToCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(cartAddSchema)
  .handler(async ({ data, context }): Promise<CartLine[]> => {
    const cartId = await getOrCreateCartId(context.supabase, context.userId);

    const { data: variant, error: vErr } = await context.supabase
      .from("product_variants")
      .select("id,stock,reserved,products(status,members_only,available_from,member_available_from)")
      .eq("id", data.variantId)
      .single();
    if (vErr || !variant) throw new Error("This piece is no longer available.");
    const product = variant.products as {
      status: string;
      members_only: boolean;
      available_from: string | null;
      member_available_from: string | null;
    } | null;
    if (product?.status !== "active") {
      throw new Error("This piece is no longer available.");
    }

    // SAAJ Club gates — the real enforcement is in place_order, this is a
    // friendlier early stop so members-only / unreleased pieces don't sit
    // in a bag that will only fail at checkout.
    const ctx = await memberContext(context.supabase, context.userId);
    if (product.members_only && !ctx.isMember) {
      throw new Error("This piece is a SAAJ Club exclusive.");
    }
    const from = ctx.isMember
      ? (product.member_available_from ?? product.available_from)
      : product.available_from;
    if (from && new Date(from).getTime() > Date.now()) {
      throw new Error("This piece hasn't been released yet.");
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
    return rowsToLines(rows as unknown as CartItemRow[], ctx);
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

    const ctx = await memberContext(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("cart_items")
      .select(CART_ITEM_SELECT)
      .eq("cart_id", cartId);
    if (error) throw error;
    return rowsToLines(rows as unknown as CartItemRow[], ctx);
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

    const ctx = await memberContext(context.supabase, context.userId);
    const { data: rows, error: selErr } = await context.supabase
      .from("cart_items")
      .select(CART_ITEM_SELECT)
      .eq("cart_id", cartId);
    if (selErr) throw selErr;
    return rowsToLines(rows as unknown as CartItemRow[], ctx);
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

    const ctx = await memberContext(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("cart_items")
      .select(CART_ITEM_SELECT)
      .eq("cart_id", cartId);
    if (error) throw error;
    return rowsToLines(rows as unknown as CartItemRow[], ctx);
  });
