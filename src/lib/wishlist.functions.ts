import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { wishlistToggleSchema } from "@/lib/schemas";

export type WishlistItem = { productId: string; slug: string };

type WishlistRow = { product_id: string; products: { slug: string } | null };

export const getWishlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WishlistItem[]> => {
    const { data, error } = await context.supabase
      .from("wishlists")
      .select("product_id,products(slug)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as unknown as WishlistRow[])
      .filter((r) => r.products)
      .map((r) => ({ productId: r.product_id, slug: r.products!.slug }));
  });

/** Adds if absent, removes if present. Returns the resulting membership. */
export const toggleWishlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(wishlistToggleSchema)
  .handler(async ({ data, context }): Promise<{ productId: string; saved: boolean }> => {
    const { data: existing, error: selErr } = await context.supabase
      .from("wishlists")
      .select("id")
      .eq("product_id", data.productId)
      .maybeSingle();
    if (selErr) throw selErr;

    if (existing) {
      const { error } = await context.supabase.from("wishlists").delete().eq("id", existing.id);
      if (error) throw error;
      return { productId: data.productId, saved: false };
    }

    const { error } = await context.supabase
      .from("wishlists")
      .insert({ user_id: context.userId, product_id: data.productId });
    if (error) throw error;
    return { productId: data.productId, saved: true };
  });

/** Adds any of these product ids that aren't already saved — used for the
 * guest → account wishlist merge right after sign-in (never removes). */
export const mergeGuestWishlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ productIds: z.array(z.string().uuid()).max(200) }))
  .handler(async ({ data, context }): Promise<void> => {
    if (!data.productIds.length) return;
    const rows = data.productIds.map((productId) => ({ user_id: context.userId, product_id: productId }));
    const { error } = await context.supabase
      .from("wishlists")
      .upsert(rows, { onConflict: "user_id,product_id", ignoreDuplicates: true });
    if (error) throw error;
  });

export const removeFromWishlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(wishlistToggleSchema)
  .handler(async ({ data, context }): Promise<void> => {
    const { error } = await context.supabase
      .from("wishlists")
      .delete()
      .eq("product_id", data.productId);
    if (error) throw error;
  });
