import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { optionalSupabaseAuth } from "@/lib/mw/optionalAuth";
import { reviewInputSchema } from "@/lib/schemas";
import { assertRateLimit } from "@/lib/mw/rateLimit";

export type ProductReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  verified: boolean;
  createdAt: string;
  authorName: string;
};

type ReviewRow = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  verified: boolean;
  created_at: string;
  profiles: { name: string } | null;
};

export const listProductReviews = createServerFn({ method: "POST" })
  .middleware([optionalSupabaseAuth])
  .validator(z.object({ productId: z.string().uuid() }))
  .handler(async ({ data, context }): Promise<ProductReview[]> => {
    const { data: rows, error } = await context.supabase
      .from("reviews")
      .select("id,rating,title,body,verified,created_at,profiles(name)")
      .eq("product_id", data.productId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (rows as unknown as ReviewRow[]).map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      verified: r.verified,
      createdAt: r.created_at,
      authorName: r.profiles?.name || "SAAJ customer",
    }));
  });

export const myReviewEligibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ productId: z.string().uuid() }))
  .handler(async ({ data, context }): Promise<{ alreadyReviewed: boolean; isVerifiedBuyer: boolean }> => {
    const { data: existing } = await context.supabase
      .from("reviews")
      .select("id")
      .eq("product_id", data.productId)
      .eq("user_id", context.userId)
      .maybeSingle();

    const { data: purchase } = await context.supabase
      .from("order_items")
      .select("id, orders!inner(user_id, status)")
      .eq("product_id", data.productId)
      .eq("orders.user_id", context.userId)
      .in("orders.status", ["paid", "shipped", "delivered"])
      .limit(1);

    return {
      alreadyReviewed: Boolean(existing),
      isVerifiedBuyer: Boolean(purchase && purchase.length > 0),
    };
  });

export const createReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(reviewInputSchema)
  .handler(async ({ data, context }): Promise<ProductReview> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertRateLimit(supabaseAdmin, "review", context.userId, 10, 60);

    const { data: row, error } = await context.supabase
      .from("reviews")
      .insert({
        product_id: data.productId,
        user_id: context.userId,
        rating: data.rating,
        title: data.title || null,
        body: data.body,
        verified: true,
      })
      .select("id,rating,title,body,verified,created_at,profiles(name)")
      .single();

    if (error) {
      if (error.code === "23505") throw new Error("You've already reviewed this piece.");
      if (error.code === "42501" || error.message.toLowerCase().includes("row-level security")) {
        throw new Error("Only verified buyers can review this piece.");
      }
      throw error;
    }

    const r = row as unknown as ReviewRow;
    return {
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      verified: r.verified,
      createdAt: r.created_at,
      authorName: r.profiles?.name || "SAAJ customer",
    };
  });
