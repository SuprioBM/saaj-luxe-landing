import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export class RateLimitError extends Error {
  constructor(message = "Too many attempts. Please wait a moment and try again.") {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Fixed-window rate limit backed by the `rate_limits` table (service-role
 * only per RLS — always pass the admin client). Best-effort, not perfectly
 * race-free under heavy concurrency, which is an acceptable trade-off for a
 * defense-in-depth throttle rather than the primary security boundary.
 */
export async function assertRateLimit(
  admin: SupabaseClient<Database>,
  bucket: string,
  identifier: string,
  limit: number,
  windowMinutes = 1,
): Promise<void> {
  const windowStart = new Date();
  windowStart.setSeconds(0, 0);
  windowStart.setMinutes(Math.floor(windowStart.getMinutes() / windowMinutes) * windowMinutes);
  const windowIso = windowStart.toISOString();

  const { data: existing, error: selErr } = await admin
    .from("rate_limits")
    .select("id, count")
    .eq("bucket", bucket)
    .eq("identifier", identifier)
    .eq("window_start", windowIso)
    .maybeSingle();
  if (selErr) throw selErr;

  if (!existing) {
    const { error } = await admin
      .from("rate_limits")
      .insert({ bucket, identifier, window_start: windowIso, count: 1 });
    // A concurrent insert racing us to the same window is fine — ignore the
    // unique-constraint conflict rather than fail the caller's request.
    if (error && error.code !== "23505") throw error;
    return;
  }

  if (existing.count >= limit) {
    throw new RateLimitError();
  }

  const { error } = await admin
    .from("rate_limits")
    .update({ count: existing.count + 1 })
    .eq("id", existing.id);
  if (error) throw error;
}
