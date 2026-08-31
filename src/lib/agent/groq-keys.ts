import { agentConfig } from "@/lib/agent/config";

/**
 * Groq API key pool + health manager.
 *
 * The agent never sees this — it asks the Groq service (provider.ts) for a
 * completion and the service transparently selects a healthy key, rotates
 * on failure, applies cooldowns, and classifies errors so a bad *request*
 * (400) is never confused with a bad *key* (401).
 *
 * Deployment note: SAAJ runs on Cloudflare Workers with no Redis and no
 * long-lived process. The pool is in-memory per isolate — which is the
 * right fit: the critical path (retry-within-a-request on a 429) is fully
 * local, and a warm isolate serving many requests quickly learns which
 * keys are unhealthy. A freshly-spun isolate starts optimistic and may
 * spend one wasted attempt on a cooling key before rotating; acceptable.
 * The class is the seam if cross-isolate coordination is ever needed
 * (swap the arrays for a Supabase-backed store).
 *
 * Concurrency: Node/Workers is a single-threaded event loop and no method
 * here `await`s mid-mutation, so concurrent `acquire()` calls never
 * interleave — no locks, and requests are NOT serialized. `inFlight`
 * counters spread concurrent load fairly across keys.
 *
 * Keys are never logged, returned in errors, or included in any snapshot —
 * only the internal id (`groq-key-01`).
 */

export type KeyState = "AVAILABLE" | "COOLDOWN" | "DISABLED";

export type GroqErrorClass =
  | { kind: "cooldown"; reason: string; retryAfterMs?: number }
  | { kind: "provider"; reason: string }
  | { kind: "disable"; reason: string }
  | { kind: "request"; reason: string };

type KeyRecord = {
  id: string;
  value: string;
  state: KeyState;
  failureCount: number;
  cooldownUntil: number;
  lastUsedAt: number;
  lastFailureAt: number;
  inFlight: number;
  successTotal: number;
  failureTotal: number;
};

export type KeySnapshot = {
  id: string;
  state: KeyState;
  failureCount: number;
  cooldownMsRemaining: number;
  inFlight: number;
  successTotal: number;
  failureTotal: number;
};

export type PoolMetrics = {
  totalRequests: number;
  successfulRequests: number;
  rotations: number;
  count429: number;
  count5xx: number;
  invalidKeyCount: number;
  providerUnavailable: number;
  averageAttempts: number;
};

export class GroqUnavailableError extends Error {
  constructor(
    readonly variant: "exhausted" | "provider" | "no_keys",
    cause?: unknown,
  ) {
    super("The SAAJ assistant is unavailable right now. Please try again shortly.");
    this.name = "GroqUnavailableError";
    if (cause instanceof Error) this.cause = cause;
  }
}

/* ----------------------------------------------------- error classifier */

function statusOf(err: unknown): number | undefined {
  const e = err as Record<string, unknown> | null;
  if (!e) return undefined;
  for (const v of [
    e.status,
    (e.response as Record<string, unknown>)?.status,
    (e.error as Record<string, unknown>)?.status,
  ]) {
    if (typeof v === "number" && v >= 100 && v < 600) return v;
  }
  const m = typeof e.message === "string" ? e.message.match(/\b(\d{3})\b/) : null;
  if (m) {
    const n = Number(m[1]);
    if (n >= 400 && n < 600) return n;
  }
  return undefined;
}

function retryAfterMs(err: unknown): number | undefined {
  const headers = (err as { headers?: unknown }).headers;
  const get = (name: string): string | null => {
    if (!headers) return null;
    if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name);
    const rec = headers as Record<string, string>;
    return rec[name] ?? rec[name.toLowerCase()] ?? null;
  };
  const ms = get("retry-after-ms");
  if (ms && Number.isFinite(Number(ms))) return Math.max(0, Number(ms));
  const secs = get("retry-after");
  if (secs && Number.isFinite(Number(secs))) return Math.max(0, Number(secs) * 1000);
  return undefined;
}

function looksLikeAuthBody(err: unknown): boolean {
  const e = err as Record<string, unknown>;
  const body = (e.error ?? e.body ?? {}) as Record<string, unknown>;
  const code = String(body.code ?? e.code ?? "").toLowerCase();
  const type = String(body.type ?? "").toLowerCase();
  const msg = String((body.message as string) ?? (e.message as string) ?? "").toLowerCase();
  return (
    code.includes("api_key") ||
    code.includes("authentication") ||
    type.includes("authentication") ||
    /\bapi key\b/.test(msg) ||
    msg.includes("invalid_api_key") ||
    msg.includes("unauthorized")
  );
}

function isNetworkError(err: unknown): boolean {
  const e = err as Record<string, unknown>;
  const code = String(e.code ?? "").toUpperCase();
  const name = String(e.name ?? "");
  const msg = String(e.message ?? "").toLowerCase();
  return (
    ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE"].includes(code) ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "APIConnectionError" ||
    name === "APIConnectionTimeoutError" ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("socket hang up") ||
    msg.includes("terminated") ||
    (msg.includes("timeout") && !msg.includes("429"))
  );
}

/** Decide what a Groq failure means for the *key* (never for the request). */
export function classifyGroqError(err: unknown): GroqErrorClass {
  const status = statusOf(err);

  if (status === 429) {
    return { kind: "cooldown", reason: "rate_limited", retryAfterMs: retryAfterMs(err) };
  }
  if (status === 401) return { kind: "disable", reason: "unauthorized" };
  if (status === 403) return { kind: "disable", reason: "forbidden" };
  if (status === 408) return { kind: "cooldown", reason: "request_timeout" };
  if (status !== undefined && status >= 500) {
    return { kind: "provider", reason: `provider_${status}` };
  }
  if (status === 400) {
    // A 400 is the request's fault unless the body says the key/account is.
    return looksLikeAuthBody(err)
      ? { kind: "disable", reason: "bad_request_auth" }
      : { kind: "request", reason: "bad_request" };
  }
  if (isNetworkError(err)) return { kind: "cooldown", reason: "network" };

  // Unknown — be conservative: cool the key briefly and let another try.
  return { kind: "cooldown", reason: "unknown" };
}

/* ----------------------------------------------------------- the pool -- */

const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  rotations: 0,
  count429: 0,
  count5xx: 0,
  invalidKeyCount: 0,
  providerUnavailable: 0,
  attemptsSum: 0,
  attemptsCount: 0,
};

export class GroqKeyManager {
  private keys: KeyRecord[];

  constructor(values: string[]) {
    this.keys = values.map((value, i) => ({
      id: `groq-key-${String(i + 1).padStart(2, "0")}`,
      value,
      state: "AVAILABLE" as KeyState,
      failureCount: 0,
      cooldownUntil: 0,
      // spread fresh isolates' first pick so they don't all hit key-01
      lastUsedAt: Math.floor(Math.random() * 1000),
      lastFailureAt: 0,
      inFlight: 0,
      successTotal: 0,
      failureTotal: 0,
    }));
  }

  size(): number {
    return this.keys.length;
  }

  private refresh(now: number) {
    for (const k of this.keys) {
      if (k.state === "COOLDOWN" && k.cooldownUntil <= now) {
        k.state = "AVAILABLE"; // half-open: eligible again, failureCount kept until a success clears it
      }
    }
  }

  healthyCount(now = Date.now()): number {
    this.refresh(now);
    return this.keys.filter((k) => k.state === "AVAILABLE").length;
  }

  /** Lease a healthy key — least in-flight, then least-recently-used. */
  acquire(now = Date.now()): { id: string; value: string } | null {
    this.refresh(now);
    const avail = this.keys.filter((k) => k.state === "AVAILABLE");
    if (avail.length === 0) return null;
    avail.sort((a, b) => a.inFlight - b.inFlight || a.lastUsedAt - b.lastUsedAt);
    const k = avail[0];
    k.lastUsedAt = now;
    k.inFlight += 1;
    return { id: k.id, value: k.value };
  }

  release(id: string) {
    const k = this.byId(id);
    if (k) k.inFlight = Math.max(0, k.inFlight - 1);
  }

  reportSuccess(id: string) {
    const k = this.byId(id);
    if (!k) return;
    k.failureCount = 0;
    k.cooldownUntil = 0;
    k.state = "AVAILABLE";
    k.successTotal += 1;
    metrics.successfulRequests += 1;
  }

  reportFailure(id: string, cls: GroqErrorClass, now = Date.now()) {
    const k = this.byId(id);
    if (!k) return;
    k.failureTotal += 1;
    k.lastFailureAt = now;

    if (cls.kind === "request") return; // the request's fault — key untouched
    if (cls.kind === "disable") {
      k.state = "DISABLED";
      metrics.invalidKeyCount += 1;
      return;
    }

    k.failureCount += 1;
    if (cls.kind === "provider") metrics.count5xx += 1;
    else metrics.count429 += 1;

    const retryAfter = cls.kind === "cooldown" ? cls.retryAfterMs : undefined;
    const backoff = agentConfig.defaultCooldownMs * Math.pow(2, k.failureCount - 1);
    let cooldown = Math.min(retryAfter ?? backoff, agentConfig.maxCooldownMs);
    // circuit-breaker step: too many consecutive failures ⇒ full cooldown
    if (k.failureCount >= agentConfig.failureThreshold) cooldown = agentConfig.maxCooldownMs;

    k.cooldownUntil = now + cooldown;
    k.state = "COOLDOWN";
  }

  /** Re-enable a key an operator manually disabled / cooled. */
  reset(id?: string) {
    for (const k of this.keys) {
      if (id && k.id !== id) continue;
      k.state = "AVAILABLE";
      k.failureCount = 0;
      k.cooldownUntil = 0;
    }
  }

  markRotation() {
    metrics.rotations += 1;
  }
  markRequest() {
    metrics.totalRequests += 1;
  }
  recordAttempts(n: number) {
    metrics.attemptsSum += n;
    metrics.attemptsCount += 1;
  }
  markProviderUnavailable() {
    metrics.providerUnavailable += 1;
  }

  snapshot(now = Date.now()): { keys: KeySnapshot[] } & PoolMetrics {
    this.refresh(now);
    return {
      keys: this.keys.map((k) => ({
        id: k.id,
        state: k.state,
        failureCount: k.failureCount,
        cooldownMsRemaining: Math.max(0, k.cooldownUntil - now),
        inFlight: k.inFlight,
        successTotal: k.successTotal,
        failureTotal: k.failureTotal,
      })),
      totalRequests: metrics.totalRequests,
      successfulRequests: metrics.successfulRequests,
      rotations: metrics.rotations,
      count429: metrics.count429,
      count5xx: metrics.count5xx,
      invalidKeyCount: metrics.invalidKeyCount,
      providerUnavailable: metrics.providerUnavailable,
      averageAttempts: metrics.attemptsCount
        ? Number((metrics.attemptsSum / metrics.attemptsCount).toFixed(2))
        : 0,
    };
  }

  private byId(id: string): KeyRecord | undefined {
    return this.keys.find((k) => k.id === id);
  }
}

let _manager: GroqKeyManager | null = null;

export function groqKeys(): GroqKeyManager {
  if (!_manager) _manager = new GroqKeyManager(agentConfig.apiKeys);
  return _manager;
}

export type KeyLease = { id: string; value: string };

function logKeyEvent(
  keyId: string,
  cls: GroqErrorClass,
  meta: { committed: boolean; switching: boolean },
) {
  // Safe: internal id only, never the key value.
  console.warn(
    JSON.stringify({
      evt: "groq_key_event",
      key_id: keyId,
      class: cls.kind,
      reason: cls.reason,
      retry_after_ms: "retryAfterMs" in cls ? cls.retryAfterMs : undefined,
      committed: meta.committed,
      switching_key: meta.switching,
    }),
  );
}

/**
 * Run one logical Groq call with bounded key rotation.
 *
 *   - `attempt(lease, markCommitted)` performs the actual call. It MUST call
 *     `markCommitted()` the moment any usable output has been emitted
 *     downstream (e.g. the first visible token of a stream).
 *   - On failure: classify → update key health → decide.
 *       · committed already        → rethrow (no silent restart / concat)
 *       · 400 bad request          → rethrow (rotating won't fix the request)
 *       · 2+ different keys give 5xx → GroqUnavailableError (provider-wide)
 *       · otherwise                → try the next healthy key
 *   - Bounded: at most `min(GROQ_MAX_RETRIES, poolSize)` attempts, then a
 *     controlled GroqUnavailableError. Never an unbounded loop.
 *
 * This is the ONLY place rotation/cooldown logic lives.
 */
export async function runWithGroqRotation<T>(
  attempt: (lease: KeyLease, markCommitted: () => void) => Promise<T>,
  mgr: GroqKeyManager = groqKeys(),
): Promise<T> {
  mgr.markRequest();
  if (mgr.size() === 0) throw new GroqUnavailableError("no_keys");

  const maxAttempts = Math.min(agentConfig.maxRetries, mgr.size());
  let providerErrors = 0;
  let attempts = 0;
  let lastErr: unknown;

  for (let i = 0; i < maxAttempts; i++) {
    const lease = mgr.acquire();
    if (!lease) break; // nothing healthy right now
    attempts += 1;
    let committed = false;
    try {
      const out = await attempt(lease, () => {
        committed = true;
      });
      mgr.reportSuccess(lease.id);
      mgr.release(lease.id);
      mgr.recordAttempts(attempts);
      return out;
    } catch (err) {
      lastErr = err;
      mgr.release(lease.id);
      const cls = classifyGroqError(err);
      mgr.reportFailure(lease.id, cls);
      const switching = !committed && cls.kind !== "request" && i + 1 < maxAttempts;
      logKeyEvent(lease.id, cls, { committed, switching });

      if (committed) throw err;
      if (cls.kind === "request") throw err;
      if (cls.kind === "provider") {
        providerErrors += 1;
        if (providerErrors >= 2) {
          mgr.recordAttempts(attempts);
          mgr.markProviderUnavailable();
          throw new GroqUnavailableError("provider", err);
        }
      }
      mgr.markRotation();
    }
  }

  mgr.recordAttempts(attempts);
  mgr.markProviderUnavailable();
  throw new GroqUnavailableError("exhausted", lastErr);
}

/** test-only: rebuild the singleton from an explicit key list */
export function __resetGroqKeysForTest(values: string[]): GroqKeyManager {
  _manager = new GroqKeyManager(values);
  metrics.totalRequests = 0;
  metrics.successfulRequests = 0;
  metrics.rotations = 0;
  metrics.count429 = 0;
  metrics.count5xx = 0;
  metrics.invalidKeyCount = 0;
  metrics.providerUnavailable = 0;
  metrics.attemptsSum = 0;
  metrics.attemptsCount = 0;
  return _manager;
}
