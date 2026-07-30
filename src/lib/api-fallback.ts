/**
 * Local fallbacks used until the Prisma backend is wired up.
 * Every hook tries the real endpoint first and only falls back on failure,
 * so no UI work has to change once the API is live.
 */
import { PRODUCTS, findProduct } from "@/data/catalog";
import type {
  AdminStats,
  ApiOrder,
  ApiProduct,
  ApiUser,
  OrderStatus,
  ProductInput,
} from "@/lib/api";
import { ordersStore } from "@/lib/orders";

const STATUS_CYCLE: OrderStatus[] = ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"];

const statusOverrides = new Map<string, OrderStatus>();

export const localOrders = (): ApiOrder[] =>
  ordersStore.get().map((o, idx) => ({
    id: o.id,
    reference: o.id,
    status: statusOverrides.get(o.id) ?? STATUS_CYCLE[Math.min(idx, STATUS_CYCLE.length - 1)],
    placedAt: o.placedAt,
    subtotal: o.subtotal,
    shipping: o.shipping,
    total: o.total,
    paymentMethod: o.customer.method,
    customerName: o.customer.name,
    customerEmail: o.customer.email,
    items: o.lines.map((l, i) => {
      const p = findProduct(l.slug);
      return {
        id: `${o.id}-${i}`,
        productSlug: l.slug,
        name: p?.name ?? l.slug,
        size: l.size,
        qty: l.qty,
        unitPrice: p?.price ?? 0,
        image: p?.img,
      };
    }),
  }));

export const setLocalOrderStatus = (id: string, status: OrderStatus) => {
  statusOverrides.set(id, status);
};

/* ---- local product registry (used until the backend is live) ---- */

const seedProducts = (): ApiProduct[] =>
  PRODUCTS.map((p) => ({
    id: p.slug,
    slug: p.slug,
    name: p.name,
    category: p.category,
    price: p.price,
    image: p.img,
    gallery: p.gallery,
    sku: p.sku,
    detail: p.detail,
    materials: p.materials,
    tags: p.tags,
    isNew: p.isNew,
    active: true,
    variants: p.sizes.map((s) => ({ size: s.size, stock: s.stock })),
  }));

let productStore: ApiProduct[] | null = null;
const products = () => (productStore ??= seedProducts());

export const localProducts = (): ApiProduct[] => products().map((p) => ({ ...p }));

export const localCreateProduct = (input: ProductInput): ApiProduct => {
  const product: ApiProduct = { ...input, id: input.slug || `p-${Date.now()}` };
  products().unshift(product);
  return product;
};

export const localUpdateProduct = (id: string, patch: Partial<ProductInput>): ApiProduct | null => {
  const list = products();
  const i = list.findIndex((p) => p.id === id);
  if (i === -1) return null;
  list[i] = { ...list[i], ...patch };
  return list[i];
};

export const localDeleteProduct = (id: string) => {
  productStore = products().filter((p) => p.id !== id);
};

export const localUpdateStock = (id: string, variants: { size: string; stock: number }[]) =>
  localUpdateProduct(id, { variants });


export const localStats = (): AdminStats => {
  const orders = localOrders();
  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const products = localProducts();
  const lowStock = products.filter((p) =>
    p.variants.some((v) => v.stock > 0 && v.stock <= 2),
  ).length;

  const byMonth = new Map<string, number>();
  orders.forEach((o) => {
    const label = new Date(o.placedAt).toLocaleDateString("en-IN", { month: "short" });
    byMonth.set(label, (byMonth.get(label) ?? 0) + o.total);
  });

  return {
    revenue,
    orders: orders.length,
    customers: new Set(orders.map((o) => o.customerEmail)).size,
    lowStock,
    revenueSeries: [...byMonth].map(([label, value]) => ({ label, value })),
    topProducts: [...PRODUCTS]
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 5)
      .map((p) => ({ slug: p.slug, name: p.name, sold: p.sold, revenue: p.sold * p.price })),
  };
};

export const localCustomers = (): (ApiUser & { orders: number; spend: number })[] => {
  const map = new Map<string, ApiUser & { orders: number; spend: number }>();
  localOrders().forEach((o) => {
    const existing = map.get(o.customerEmail);
    if (existing) {
      existing.orders += 1;
      existing.spend += o.total;
      return;
    }
    map.set(o.customerEmail, {
      id: o.customerEmail,
      name: o.customerName,
      email: o.customerEmail,
      role: "CUSTOMER",
      createdAt: o.placedAt,
      orders: 1,
      spend: o.total,
    });
  });
  return [...map.values()];
};
