import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addressInputSchema, addressUpdateSchema } from "@/lib/schemas";

export type Address = {
  id: string;
  label: string;
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
};

type AddressRow = {
  id: string;
  label: string;
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  is_default: boolean;
};

function toAddress(row: AddressRow): Address {
  return {
    id: row.id,
    label: row.label,
    name: row.name,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    country: row.country,
    isDefault: row.is_default,
  };
}

export const listAddresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Address[]> => {
    const { data, error } = await context.supabase
      .from("addresses")
      .select("id,label,name,phone,line1,line2,city,state,pincode,country,is_default")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as AddressRow[]).map(toAddress);
  });

export const createAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(addressInputSchema)
  .handler(async ({ data, context }): Promise<Address> => {
    if (data.isDefault) {
      await context.supabase
        .from("addresses")
        .update({ is_default: false })
        .eq("user_id", context.userId);
    }
    const { data: row, error } = await context.supabase
      .from("addresses")
      .insert({
        user_id: context.userId,
        label: data.label,
        name: data.name,
        phone: data.phone,
        line1: data.line1,
        line2: data.line2 ?? null,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        country: data.country,
        is_default: data.isDefault,
      })
      .select("id,label,name,phone,line1,line2,city,state,pincode,country,is_default")
      .single();
    if (error) throw error;
    return toAddress(row as AddressRow);
  });

export const updateAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(addressUpdateSchema)
  .handler(async ({ data, context }): Promise<Address> => {
    const { id, ...patch } = data;
    if (patch.isDefault) {
      await context.supabase
        .from("addresses")
        .update({ is_default: false })
        .eq("user_id", context.userId);
    }
    const { data: row, error } = await context.supabase
      .from("addresses")
      .update({
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.line1 !== undefined ? { line1: patch.line1 } : {}),
        ...(patch.line2 !== undefined ? { line2: patch.line2 } : {}),
        ...(patch.city !== undefined ? { city: patch.city } : {}),
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.pincode !== undefined ? { pincode: patch.pincode } : {}),
        ...(patch.country !== undefined ? { country: patch.country } : {}),
        ...(patch.isDefault !== undefined ? { is_default: patch.isDefault } : {}),
      })
      .eq("id", id)
      .select("id,label,name,phone,line1,line2,city,state,pincode,country,is_default")
      .single();
    if (error) throw error;
    return toAddress(row as AddressRow);
  });

export const deleteAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { error } = await context.supabase.from("addresses").delete().eq("id", data.id);
    if (error) throw error;
    return { id: data.id };
  });
