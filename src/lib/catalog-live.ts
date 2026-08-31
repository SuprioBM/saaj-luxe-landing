import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  CATEGORIES,
  PRODUCTS,
  SIZE_SETS,
  type Category,
  type Product,
  type Review,
} from "@/data/catalog";

/**
 * Live catalog reads.
 *
 * Products, imagery and per-size stock come from the database (public read via RLS).
 * Editorial extras that have no column yet (specs, reviews, pairsWith) are merged in
 * from the static catalog by slug so the product page keeps its full editorial depth.
 */

const staticBySlug = new Map(PRODUCTS.map((p) => [p.slug, p]));
const staticCategory = new Map(CATEGORIES.map((c) => [c.slug, c]));

type Row = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number | string;
  discount_price: number | string | null;
  sku: string;
  materials: string[];
  tags: string[];
  is_new: boolean;
  created_at: string;
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
  "id,slug,name,description,price,discount_price,sku,materials,tags,is_new,created_at,members_only,member_discount_eligible,member_discount_bps,available_from,member_available_from,categories:category_id(slug),product_images(url,position,is_primary),product_variants(id,size,stock,reserved)";

function sizeOrder(categorySlug: string) {
  return SIZE_SETS[categorySlug] ?? [];
}

function toProduct(row: Row): Product {
  const categorySlug = row.categories?.slug ?? "shirts";
  const base = staticBySlug.get(row.slug);

  const images = [...row.product_images].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position,
  );
  const gallery = images.map((i) => i.url);

  const order = sizeOrder(categorySlug);
  const sizes = [...row.product_variants]
    .sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size))
    .map((v) => ({ id: v.id, size: v.size, stock: Math.max(0, v.stock - v.reserved) }));

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    price: Number(row.discount_price ?? row.price),
    category: categorySlug,
    img: gallery[0] ?? base?.img ?? "",
    gallery: gallery.length ? gallery : (base?.gallery ?? []),
    sku: row.sku,
    isNew: row.is_new,
    sold: base?.sold ?? 0,
    addedAt: row.created_at.slice(0, 10),
    tags: row.tags,
    detail: row.description || (base?.detail ?? ""),
    materials: row.materials.length ? row.materials : (base?.materials ?? []),
    specs: base?.specs ?? [],
    // Sizes are DB-authoritative once the product exists there — never fall
    // back to the static demo stock numbers, or "in stock" would lie.
    sizes,
    reviews: (base?.reviews ?? []) as Review[],
    pairsWith: base?.pairsWith ?? [],
    membersOnly: row.members_only,
    memberDiscountEligible: row.member_discount_eligible,
    memberDiscountBps: row.member_discount_bps,
    availableFrom: row.available_from,
    memberAvailableFrom: row.member_available_from,
  };
}

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select(SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as unknown as Row[]).map(toProduct);
}

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("slug,name,blurb,image_url,position")
    .order("position", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((c, i) => {
    const base = staticCategory.get(c.slug);
    return {
      n: String(i + 1).padStart(2, "0"),
      slug: c.slug,
      title: c.name,
      copy: base?.copy ?? ["", ""],
      cta: base?.cta ?? `Shop ${c.name}`,
      img: c.image_url ?? base?.img ?? "",
      blurb: c.blurb ?? base?.blurb ?? "",
    } satisfies Category;
  });
}

export const catalogKeys = {
  products: ["catalog", "products"] as const,
  categories: ["catalog", "categories"] as const,
};

/** Live products with the bundled catalog as an offline-safe placeholder. */
export function useProducts() {
  return useQuery({
    queryKey: catalogKeys.products,
    queryFn: fetchProducts,
    placeholderData: PRODUCTS,
    staleTime: 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: catalogKeys.categories,
    queryFn: fetchCategories,
    placeholderData: CATEGORIES,
    staleTime: 5 * 60_000,
  });
}

export function useProduct(slug: string) {
  const { data, isLoading, error } = useProducts();
  return {
    product: data?.find((p) => p.slug === slug) ?? staticBySlug.get(slug),
    isLoading,
    error,
  };
}
