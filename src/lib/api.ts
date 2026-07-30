/**
 * SAAJ frontend API client.
 *
 * Every call targets the future Prisma/Express (or server-route) backend.
 * Base URL comes from VITE_API_URL, defaulting to same-origin `/api`.
 * When the backend is not reachable yet, callers fall back to local demo
 * stores (see src/lib/api-fallback.ts) so the UI is fully usable today.
 */

export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

const TOKEN_KEY = "saaj.token.v1";

export const tokenStore = {
  get() {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    if (typeof window === "undefined") return;
    try {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const token = tokenStore.get();

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : null),
      ...(token ? { Authorization: `Bearer ${token}` } : null),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = (await res.json()) as { message?: string; error?: string };
      message = data.message ?? data.error ?? message;
    } catch {
      /* non-json error */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ */
/* Shared DTOs — mirror the Prisma schema the backend will expose.      */
/* ------------------------------------------------------------------ */

export type Role = "CUSTOMER" | "ADMIN";

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  createdAt: string;
};

export type AuthResponse = { token: string; user: ApiUser };

export type ApiAddress = {
  id: string;
  label: string;
  name: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PACKED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

export type ApiOrderItem = {
  id: string;
  productSlug: string;
  name: string;
  size: string;
  qty: number;
  unitPrice: number;
  image?: string;
};

export type ApiOrder = {
  id: string;
  reference: string;
  status: OrderStatus;
  placedAt: string;
  subtotal: number;
  shipping: number;
  total: number;
  paymentMethod: "card" | "upi" | "cod";
  customerName: string;
  customerEmail: string;
  items: ApiOrderItem[];
};

export type ApiProduct = {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  image: string;
  gallery?: string[];
  sku: string;
  detail?: string;
  materials?: string[];
  tags?: string[];
  isNew?: boolean;
  active: boolean;
  variants: { size: string; stock: number }[];
};

export type ProductInput = {
  name: string;
  slug: string;
  category: string;
  price: number;
  sku: string;
  image: string;
  gallery: string[];
  detail: string;
  materials: string[];
  tags: string[];
  isNew: boolean;
  active: boolean;
  variants: { size: string; stock: number }[];
};


export type AdminStats = {
  revenue: number;
  orders: number;
  customers: number;
  lowStock: number;
  revenueSeries: { label: string; value: number }[];
  topProducts: { slug: string; name: string; sold: number; revenue: number }[];
};

/* ------------------------------------------------------------------ */
/* Endpoints                                                            */
/* ------------------------------------------------------------------ */

export const api = {
  auth: {
    register: (body: { name: string; email: string; password: string }) =>
      apiFetch<AuthResponse>("/auth/register", { method: "POST", json: body }),
    login: (body: { email: string; password: string }) =>
      apiFetch<AuthResponse>("/auth/login", { method: "POST", json: body }),
    me: () => apiFetch<ApiUser>("/auth/me"),
    logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
    updateProfile: (body: { name?: string; phone?: string }) =>
      apiFetch<ApiUser>("/auth/me", { method: "PATCH", json: body }),
  },
  addresses: {
    list: () => apiFetch<ApiAddress[]>("/addresses"),
    create: (body: Omit<ApiAddress, "id">) =>
      apiFetch<ApiAddress>("/addresses", { method: "POST", json: body }),
    update: (id: string, body: Partial<ApiAddress>) =>
      apiFetch<ApiAddress>(`/addresses/${id}`, { method: "PATCH", json: body }),
    remove: (id: string) => apiFetch<void>(`/addresses/${id}`, { method: "DELETE" }),
  },
  orders: {
    mine: () => apiFetch<ApiOrder[]>("/orders/me"),
    get: (reference: string) => apiFetch<ApiOrder>(`/orders/${reference}`),
    create: (body: {
      items: { productSlug: string; size: string; qty: number }[];
      customer: Record<string, string>;
    }) => apiFetch<ApiOrder>("/orders", { method: "POST", json: body }),
    cancel: (reference: string) =>
      apiFetch<ApiOrder>(`/orders/${reference}/cancel`, { method: "POST" }),
  },
  wishlist: {
    list: () => apiFetch<string[]>("/wishlist"),
    toggle: (slug: string) =>
      apiFetch<string[]>("/wishlist/toggle", { method: "POST", json: { slug } }),
  },
  admin: {
    stats: () => apiFetch<AdminStats>("/admin/stats"),
    products: () => apiFetch<ApiProduct[]>("/admin/products"),
    createProduct: (body: Partial<ApiProduct>) =>
      apiFetch<ApiProduct>("/admin/products", { method: "POST", json: body }),
    updateProduct: (id: string, body: Partial<ApiProduct>) =>
      apiFetch<ApiProduct>(`/admin/products/${id}`, { method: "PATCH", json: body }),
    deleteProduct: (id: string) =>
      apiFetch<void>(`/admin/products/${id}`, { method: "DELETE" }),
    updateStock: (id: string, variants: { size: string; stock: number }[]) =>
      apiFetch<ApiProduct>(`/admin/products/${id}/stock`, {
        method: "PATCH",
        json: { variants },
      }),
    orders: () => apiFetch<ApiOrder[]>("/admin/orders"),
    updateOrderStatus: (id: string, status: OrderStatus) =>
      apiFetch<ApiOrder>(`/admin/orders/${id}/status`, { method: "PATCH", json: { status } }),
    customers: () => apiFetch<(ApiUser & { orders: number; spend: number })[]>("/admin/customers"),
  },
};
