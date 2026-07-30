import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  type AdminStats,
  type ApiOrder,
  type ApiProduct,
  type ApiUser,
  type OrderStatus,
  type ProductInput,
} from "@/lib/api";
import {
  localCreateProduct,
  localCustomers,
  localDeleteProduct,
  localOrders,
  localProducts,
  localStats,
  localUpdateProduct,
  localUpdateStock,
  setLocalOrderStatus,
} from "@/lib/api-fallback";


/** Try the real endpoint, fall back to local demo data while the backend is pending. */
async function withFallback<T>(call: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await call();
  } catch {
    return fallback();
  }
}

export const useMyOrders = (email?: string | null) =>
  useQuery({
    queryKey: ["orders", "me", email ?? "guest"],
    queryFn: () => withFallback<ApiOrder[]>(api.orders.mine, localOrders),
  });

export const useAdminStats = () =>
  useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => withFallback<AdminStats>(api.admin.stats, localStats),
  });

export const useAdminProducts = () =>
  useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => withFallback<ApiProduct[]>(api.admin.products, localProducts),
  });

export const useAdminOrders = () =>
  useQuery({
    queryKey: ["admin", "orders"],
    queryFn: () => withFallback<ApiOrder[]>(api.admin.orders, localOrders),
  });

export const useAdminCustomers = () =>
  useQuery({
    queryKey: ["admin", "customers"],
    queryFn: () =>
      withFallback<(ApiUser & { orders: number; spend: number })[]>(
        api.admin.customers,
        localCustomers,
      ),
  });

export const useUpdateOrderStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      try {
        return await api.admin.updateOrderStatus(id, status);
      } catch {
        setLocalOrderStatus(id, status);
        return null;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      void qc.invalidateQueries({ queryKey: ["orders", "me"] });
    },
  });
};

export const useUpdateStock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      variants,
    }: {
      id: string;
      variants: { size: string; stock: number }[];
    }) => {
      try {
        return await api.admin.updateStock(id, variants);
      } catch {
        return localUpdateStock(id, variants);
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "products"] }),
  });
};

export const useToggleProductActive = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      try {
        return await api.admin.updateProduct(id, { active });
      } catch {
        return localUpdateProduct(id, { active });
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "products"] }),
  });
};

export const useCreateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProductInput) => {
      try {
        return await api.admin.createProduct(input);
      } catch {
        return localCreateProduct(input);
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "products"] }),
  });
};

export const useUpdateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ProductInput> }) => {
      try {
        return await api.admin.updateProduct(id, patch);
      } catch {
        return localUpdateProduct(id, patch);
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "products"] }),
  });
};

export const useDeleteProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await api.admin.deleteProduct(id);
      } catch {
        localDeleteProduct(id);
      }
      return id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "products"] }),
  });
};

/** Uploads to the backend; falls back to an inline data URL so previews work offline. */
export const useUploadImage = () =>
  useMutation({
    mutationFn: async (file: File) => {
      try {
        const { url } = await api.admin.uploadImage(file);
        return url;
      } catch {
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read file"));
          reader.readAsDataURL(file);
        });
      }
    },
  });

