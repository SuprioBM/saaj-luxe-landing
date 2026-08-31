import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";
import { requireStaff } from "@/lib/mw/authz";
import {
  adminProductInputSchema,
  adminProductUpdateSchema,
  adminStockUpdateSchema,
} from "@/lib/schemas";

export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  discountPrice: number | null;
  image: string;
  gallery: string[];
  sku: string;
  detail: string;
  materials: string[];
  tags: string[];
  isNew: boolean;
  status: "draft" | "active" | "archived";
  variants: { id: string; size: string; stock: number; reserved: number }[];
  membersOnly: boolean;
  memberDiscountEligible: boolean;
  memberDiscountPercent: number | null;
  availableFrom: string | null;
  memberAvailableFrom: string | null;
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  discount_price: number | null;
  sku: string;
  materials: string[];
  tags: string[];
  is_new: boolean;
  status: "draft" | "active" | "archived";
  members_only: boolean;
  member_discount_eligible: boolean;
  member_discount_bps: number | null;
  available_from: string | null;
  member_available_from: string | null;
  categories: { slug: string } | null;
  product_images: { url: string; position: number; is_primary: boolean }[];
  product_variants: { id: string; size: string; stock: number; reserved: number }[];
};

const SELECT =
  "id,slug,name,description,price,discount_price,sku,materials,tags,is_new,status,members_only,member_discount_eligible,member_discount_bps,available_from,member_available_from,categories:category_id(slug),product_images(url,position,is_primary),product_variants(id,size,stock,reserved)";

function toAdminProduct(row: ProductRow): AdminProduct {
  const images = [...row.product_images].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position,
  );
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.categories?.slug ?? "",
    price: Number(row.price),
    discountPrice: row.discount_price === null ? null : Number(row.discount_price),
    image: images[0]?.url ?? "",
    gallery: images.map((i) => i.url),
    sku: row.sku,
    detail: row.description,
    materials: row.materials,
    tags: row.tags,
    isNew: row.is_new,
    status: row.status,
    variants: row.product_variants,
    membersOnly: row.members_only,
    memberDiscountEligible: row.member_discount_eligible,
    memberDiscountPercent:
      row.member_discount_bps === null ? null : row.member_discount_bps / 100,
    availableFrom: row.available_from,
    memberAvailableFrom: row.member_available_from,
  };
}

const bpsFromPercent = (pct: number | null | undefined): number | null =>
  pct === null || pct === undefined ? null : Math.round(pct * 100);

export const adminListProducts = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .handler(async ({ context }): Promise<AdminProduct[]> => {
    const { data, error } = await context.supabase
      .from("products")
      .select(SELECT)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as unknown as ProductRow[]).map(toAdminProduct);
  });

async function resolveCategoryId(
  supabase: SupabaseClient<Database>,
  slug: string,
): Promise<string | null> {
  const { data } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}

export const adminCreateProduct = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator(adminProductInputSchema)
  .handler(async ({ data, context }): Promise<AdminProduct> => {
    const categoryId = await resolveCategoryId(context.supabase, data.categorySlug);

    const { data: product, error } = await context.supabase
      .from("products")
      .insert({
        slug: data.slug,
        name: data.name,
        description: data.description,
        price: data.price,
        discount_price: data.discountPrice ?? null,
        sku: data.sku,
        category_id: categoryId,
        materials: data.materials,
        tags: data.tags,
        is_new: data.isNew,
        status: data.status,
        members_only: data.membersOnly,
        member_discount_eligible: data.memberDiscountEligible,
        member_discount_bps: bpsFromPercent(data.memberDiscountPercent),
        available_from: data.availableFrom ?? null,
        member_available_from: data.memberAvailableFrom ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;

    if (data.images.length) {
      await context.supabase.from("product_images").insert(
        data.images.map((img, i) => ({
          product_id: product.id,
          url: img.url,
          alt: img.alt ?? null,
          position: i,
          is_primary: img.isPrimary || i === 0,
        })),
      );
    }
    if (data.variants.length) {
      await context.supabase.from("product_variants").insert(
        data.variants.map((v) => ({ product_id: product.id, size: v.size, stock: v.stock })),
      );
    }

    const { data: row, error: reErr } = await context.supabase
      .from("products")
      .select(SELECT)
      .eq("id", product.id)
      .single();
    if (reErr) throw reErr;
    return toAdminProduct(row as unknown as ProductRow);
  });

export const adminUpdateProduct = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator(adminProductUpdateSchema)
  .handler(async ({ data, context }): Promise<AdminProduct> => {
    const {
      id,
      images,
      variants,
      categorySlug,
      discountPrice,
      membersOnly,
      memberDiscountEligible,
      memberDiscountPercent,
      availableFrom,
      memberAvailableFrom,
      ...rest
    } = data;

    const patch: Database["public"]["Tables"]["products"]["Update"] = {};
    if (rest.name !== undefined) patch.name = rest.name;
    if (rest.slug !== undefined) patch.slug = rest.slug;
    if (rest.price !== undefined) patch.price = rest.price;
    if (discountPrice !== undefined) patch.discount_price = discountPrice;
    if (rest.sku !== undefined) patch.sku = rest.sku;
    if (rest.description !== undefined) patch.description = rest.description;
    if (rest.materials !== undefined) patch.materials = rest.materials;
    if (rest.tags !== undefined) patch.tags = rest.tags;
    if (rest.isNew !== undefined) patch.is_new = rest.isNew;
    if (rest.status !== undefined) patch.status = rest.status;
    if (membersOnly !== undefined) patch.members_only = membersOnly;
    if (memberDiscountEligible !== undefined) patch.member_discount_eligible = memberDiscountEligible;
    if (memberDiscountPercent !== undefined)
      patch.member_discount_bps = bpsFromPercent(memberDiscountPercent);
    if (availableFrom !== undefined) patch.available_from = availableFrom;
    if (memberAvailableFrom !== undefined) patch.member_available_from = memberAvailableFrom;
    if (categorySlug !== undefined) patch.category_id = await resolveCategoryId(context.supabase, categorySlug);

    if (Object.keys(patch).length) {
      const { error } = await context.supabase.from("products").update(patch).eq("id", id);
      if (error) throw error;
    }

    if (images !== undefined) {
      await context.supabase.from("product_images").delete().eq("product_id", id);
      if (images.length) {
        await context.supabase.from("product_images").insert(
          images.map((img, i) => ({
            product_id: id,
            url: img.url,
            alt: img.alt ?? null,
            position: i,
            is_primary: img.isPrimary || i === 0,
          })),
        );
      }
    }

    if (variants !== undefined) {
      // Preserve existing stock/reserved for sizes that still exist by
      // upserting on the (product_id, size) unique constraint instead of a
      // blind delete+reinsert, so an in-flight reservation is never lost.
      const { data: existingVariants } = await context.supabase
        .from("product_variants")
        .select("id,size")
        .eq("product_id", id);
      const keepSizes = new Set(variants.map((v) => v.size));
      const toRemove = (existingVariants ?? []).filter((v) => !keepSizes.has(v.size));
      if (toRemove.length) {
        await context.supabase
          .from("product_variants")
          .delete()
          .in(
            "id",
            toRemove.map((v) => v.id),
          );
      }
      for (const v of variants) {
        await context.supabase
          .from("product_variants")
          .upsert({ product_id: id, size: v.size, stock: v.stock }, { onConflict: "product_id,size" });
      }
    }

    const { data: row, error: reErr } = await context.supabase
      .from("products")
      .select(SELECT)
      .eq("id", id)
      .single();
    if (reErr) throw reErr;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "product.update",
      entity_type: "product",
      entity_id: id,
    });

    return toAdminProduct(row as unknown as ProductRow);
  });

export const adminUpdateStock = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator(adminStockUpdateSchema)
  .handler(async ({ data, context }): Promise<AdminProduct> => {
    for (const v of data.variants) {
      await context.supabase
        .from("product_variants")
        .upsert(
          { product_id: data.productId, size: v.size, stock: v.stock },
          { onConflict: "product_id,size" },
        );
    }
    const { data: row, error } = await context.supabase
      .from("products")
      .select(SELECT)
      .eq("id", data.productId)
      .single();
    if (error) throw error;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "product.stock_update",
      entity_type: "product",
      entity_id: data.productId,
      metadata: { variants: data.variants },
    });

    return toAdminProduct(row as unknown as ProductRow);
  });

export const adminSetProductStatus = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator(z.object({ id: z.string().uuid(), status: z.enum(["draft", "active", "archived"]) }))
  .handler(async ({ data, context }): Promise<{ id: string; status: string }> => {
    const { error } = await context.supabase
      .from("products")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { id: data.id, status: data.status };
  });

export const adminDeleteProduct = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { error } = await context.supabase.from("products").delete().eq("id", data.id);
    if (error) throw error;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "product.delete",
      entity_type: "product",
      entity_id: data.id,
    });

    return { id: data.id };
  });
