/**
 * Guest order access tokens.
 *
 * A guest checkout gets a cryptographically random token; only its SHA-256
 * hash is ever persisted (`orders.guest_access_token_hash`). The raw token
 * lives only in the confirmation email URL and the post-payment redirect —
 * never logged, never stored. Comparison is constant-time to avoid a timing
 * side-channel on the hash check.
 *
 * All Node `crypto` usage is dynamically imported so this module is safe to
 * import from anywhere (including `*.functions.ts`, which ship their
 * top-level imports to the client bundle) without pulling `node:crypto`
 * into client code.
 */

export async function generateGuestToken(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(32).toString("hex");
}

export async function hashGuestToken(rawToken: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export async function verifyGuestToken(rawToken: string, storedHash: string | null): Promise<boolean> {
  if (!rawToken || !storedHash) return false;
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const candidate = createHash("sha256").update(rawToken, "utf8").digest();
  const stored = Buffer.from(storedHash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
