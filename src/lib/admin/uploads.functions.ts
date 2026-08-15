import { createServerFn } from "@tanstack/react-start";

import { adminImageUploadSchema } from "@/lib/schemas";
import { requireStaff } from "@/lib/mw/authz";

const BUCKET = "product-images";
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function sanitize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Real Supabase Storage upload for admin product imagery. Staff-verified
 * server-side (requireStaff), then uses the service-role client so the
 * upload always succeeds regardless of the caller's own storage grants —
 * the authorization check already happened.
 */
export const adminUploadImage = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator(adminImageUploadSchema)
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const ext = EXT_BY_TYPE[data.contentType] ?? "jpg";
    const key = `products/${crypto.randomUUID()}-${sanitize(data.fileName)}.${ext}`;

    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(key, bytes, {
      contentType: data.contentType,
      upsert: false,
    });
    if (error) throw new Error(`Upload failed: ${error.message}`);

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key);
    return { url: pub.publicUrl };
  });
