import { beforeEach, describe, expect, it, vi } from "vitest";

import { agentConfig } from "./config";
import {
  classifyGroqError,
  GroqUnavailableError,
  __resetGroqKeysForTest,
  runWithGroqRotation,
  type GroqKeyManager,
} from "./groq-keys";

/** silence the safe warn-logging during tests */
vi.spyOn(console, "warn").mockImplementation(() => {});

const err = (over: Record<string, unknown>) =>
  Object.assign(new Error(String(over.message ?? "err")), over);
const httpErr = (status: number, over: Record<string, unknown> = {}) => err({ status, ...over });

let mgr: GroqKeyManager;
beforeEach(() => {
  mgr = __resetGroqKeysForTest(["k1", "k2", "k3", "k4"]);
});

/* --------------------------------------------------- error classifier -- */

describe("classifyGroqError", () => {
  it("429 → cooldown, with Retry-After honoured", () => {
    const c = classifyGroqError(httpErr(429, { headers: new Headers({ "retry-after": "7" }) }));
    expect(c).toMatchObject({ kind: "cooldown", retryAfterMs: 7000 });
  });
  it("401 → disable", () => {
    expect(classifyGroqError(httpErr(401)).kind).toBe("disable");
  });
  it("403 → disable", () => {
    expect(classifyGroqError(httpErr(403)).kind).toBe("disable");
  });
  it("500/502/503/504 → provider", () => {
    for (const s of [500, 502, 503, 504])
      expect(classifyGroqError(httpErr(s)).kind).toBe("provider");
  });
  it("400 with an ordinary bad-request body → request (do NOT rotate)", () => {
    expect(classifyGroqError(httpErr(400, { error: { message: "invalid model xyz" } })).kind).toBe(
      "request",
    );
  });
  it("400 that is really an auth problem → disable", () => {
    expect(classifyGroqError(httpErr(400, { error: { code: "invalid_api_key" } })).kind).toBe(
      "disable",
    );
  });
  it("network / timeout errors → cooldown", () => {
    expect(classifyGroqError(err({ code: "ECONNRESET" })).kind).toBe("cooldown");
    expect(classifyGroqError(err({ name: "AbortError" })).kind).toBe("cooldown");
    expect(classifyGroqError(err({ message: "fetch failed" })).kind).toBe("cooldown");
  });
  it("parses a status out of the message when there is no status field", () => {
    expect(classifyGroqError(err({ message: "429 Too Many Requests" }))).toMatchObject({
      kind: "cooldown",
    });
  });
});

/* ------------------------------------------------------ key manager ---- */

describe("GroqKeyManager", () => {
  it("rotates fairly (least-recently-used) across healthy keys", () => {
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const lease = mgr.acquire(1000 + i)!;
      seen.push(lease.id);
      mgr.release(lease.id);
      mgr.reportSuccess(lease.id);
    }
    // 4 keys, 8 acquisitions → each key used exactly twice
    const counts = seen.reduce<Record<string, number>>(
      (m, id) => ((m[id] = (m[id] ?? 0) + 1), m),
      {},
    );
    expect(Object.values(counts)).toEqual([2, 2, 2, 2]);
  });

  it("a 429 puts the key in COOLDOWN and skips it until the cooldown expires", () => {
    const t0 = 10_000;
    const a = mgr.acquire(t0)!;
    mgr.reportFailure(a.id, { kind: "cooldown", reason: "rate_limited", retryAfterMs: 5000 }, t0);
    expect(mgr.snapshot(t0).keys.find((k) => k.id === a.id)?.state).toBe("COOLDOWN");
    // not selectable during the window
    const picks = new Set<string>();
    for (let i = 0; i < 6; i++) picks.add(mgr.acquire(t0 + 1000)!.id);
    expect(picks.has(a.id)).toBe(false);
    // available again after it expires
    expect(mgr.acquire(t0 + 5001) && mgr.healthyCount(t0 + 5001)).toBe(4);
  });

  it("a 401 DISABLES the key permanently (not a cooldown)", () => {
    const a = mgr.acquire()!;
    mgr.reportFailure(a.id, { kind: "disable", reason: "unauthorized" });
    const snap = mgr.snapshot();
    expect(snap.keys.find((k) => k.id === a.id)?.state).toBe("DISABLED");
    expect(mgr.healthyCount()).toBe(3);
    // still disabled far in the future
    expect(mgr.snapshot(Date.now() + 3_600_000).keys.find((k) => k.id === a.id)?.state).toBe(
      "DISABLED",
    );
  });

  it("a 'request' classification leaves the key untouched", () => {
    const a = mgr.acquire()!;
    mgr.reportFailure(a.id, { kind: "request", reason: "bad_request" });
    expect(mgr.snapshot().keys.find((k) => k.id === a.id)?.state).toBe("AVAILABLE");
  });

  it("exponential backoff, capped at the configured max", () => {
    const t0 = 0;
    const a = mgr.acquire(t0)!;
    const remaining = () => mgr.snapshot(t0).keys.find((k) => k.id === a.id)!.cooldownMsRemaining;
    mgr.reportFailure(a.id, { kind: "cooldown", reason: "x" }, t0);
    const first = remaining();
    mgr.reportFailure(a.id, { kind: "cooldown", reason: "x" }, t0);
    const second = remaining();
    expect(second).toBeGreaterThan(first);
    for (let i = 0; i < 6; i++) mgr.reportFailure(a.id, { kind: "cooldown", reason: "x" }, t0);
    expect(remaining()).toBeLessThanOrEqual(agentConfig.maxCooldownMs);
  });

  it("a success clears the failure count (half-open → healthy)", () => {
    const a = mgr.acquire(0)!;
    mgr.reportFailure(a.id, { kind: "cooldown", reason: "x" }, 0);
    mgr.reportFailure(a.id, { kind: "cooldown", reason: "x" }, 0);
    mgr.reportSuccess(a.id);
    expect(mgr.snapshot().keys.find((k) => k.id === a.id)).toMatchObject({
      state: "AVAILABLE",
      failureCount: 0,
    });
  });
});

/* -------------------------------------------------- rotation loop ----- */

/** an `attempt` that plays a script keyed by attempt index */
function scripted(script: (Error | "ok" | { commitThenFail: Error })[]) {
  let i = 0;
  return async (_lease: { id: string; value: string }, markCommitted: () => void) => {
    const step = script[i++];
    if (step === "ok") return "RESPONSE";
    if (step instanceof Error) throw step;
    markCommitted();
    throw step.commitThenFail;
  };
}

describe("runWithGroqRotation", () => {
  it("normal: first key succeeds", async () => {
    await expect(runWithGroqRotation(scripted(["ok"]), mgr)).resolves.toBe("RESPONSE");
    expect(mgr.snapshot().successfulRequests).toBe(1);
    expect(mgr.snapshot().rotations).toBe(0);
  });

  it("429 then success: first key cools down, second serves", async () => {
    const leases: string[] = [];
    const attempt = async (lease: { id: string }, mark: () => void) => {
      leases.push(lease.id);
      if (leases.length === 1)
        throw httpErr(429, { headers: new Headers({ "retry-after": "30" }) });
      mark();
      return "OK";
    };
    await expect(runWithGroqRotation(attempt, mgr)).resolves.toBe("OK");
    const snap = mgr.snapshot();
    expect(snap.keys.find((k) => k.id === leases[0])?.state).toBe("COOLDOWN");
    expect(snap.rotations).toBe(1);
    expect(leases[0]).not.toBe(leases[1]);
  });

  it("multiple failures (429, 500) then success returns the good response", async () => {
    await expect(
      runWithGroqRotation(scripted([httpErr(429), httpErr(500), "ok"]), mgr),
    ).resolves.toBe("RESPONSE");
    expect(mgr.snapshot().successfulRequests).toBe(1);
  });

  it("all keys 429 → controlled GroqUnavailableError, never an infinite loop", async () => {
    const attempt = async () => {
      throw httpErr(429);
    };
    await expect(runWithGroqRotation(attempt, mgr)).rejects.toBeInstanceOf(GroqUnavailableError);
    expect(mgr.snapshot().providerUnavailable).toBe(1);
  });

  it("bounded by min(GROQ_MAX_RETRIES, poolSize)", async () => {
    let calls = 0;
    const attempt = async () => {
      calls++;
      throw httpErr(429);
    };
    await expect(runWithGroqRotation(attempt, mgr)).rejects.toBeInstanceOf(GroqUnavailableError);
    expect(calls).toBe(Math.min(agentConfig.maxRetries, 4));
  });

  it("400 bad request does NOT rotate — it fails fast on the first key", async () => {
    let calls = 0;
    const attempt = async () => {
      calls++;
      throw httpErr(400, { error: { message: "bad messages" } });
    };
    await expect(runWithGroqRotation(attempt, mgr)).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(1);
    expect(mgr.snapshot().rotations).toBe(0);
  });

  it("provider-wide 5xx (2 different keys) stops early with GroqUnavailableError", async () => {
    let calls = 0;
    const attempt = async () => {
      calls++;
      throw httpErr(503);
    };
    await expect(runWithGroqRotation(attempt, mgr)).rejects.toBeInstanceOf(GroqUnavailableError);
    expect(calls).toBe(2); // did not burn all four keys
  });

  it("401 disables the key and the next key serves", async () => {
    const ids: string[] = [];
    const attempt = async (lease: { id: string }, mark: () => void) => {
      ids.push(lease.id);
      if (ids.length === 1) throw httpErr(401);
      mark();
      return "OK";
    };
    await expect(runWithGroqRotation(attempt, mgr)).resolves.toBe("OK");
    expect(mgr.snapshot().keys.find((k) => k.id === ids[0])?.state).toBe("DISABLED");
  });

  it("a mid-stream failure (already committed) is terminal — no restart/concat", async () => {
    let calls = 0;
    const attempt = async (_l: unknown, mark: () => void) => {
      calls++;
      mark(); // a token already reached the client
      throw httpErr(500);
    };
    await expect(runWithGroqRotation(attempt, mgr)).rejects.toMatchObject({ status: 500 });
    expect(calls).toBe(1);
  });

  it("recovery: a cooled key is picked again once its window passes", async () => {
    const t0 = 100_000;
    const a = mgr.acquire(t0)!;
    mgr.reportFailure(a.id, { kind: "cooldown", reason: "x", retryAfterMs: 1000 }, t0);
    mgr.release(a.id);
    expect(mgr.healthyCount(t0 + 500)).toBe(3);
    expect(mgr.healthyCount(t0 + 1500)).toBe(4);
  });

  it("concurrent requests distribute across keys without a double-allocation bug", async () => {
    const used: string[] = [];
    const attempt = async (lease: { id: string }, mark: () => void) => {
      used.push(lease.id);
      await new Promise((r) => setTimeout(r, 1));
      mark();
      return "OK";
    };
    await Promise.all(Array.from({ length: 12 }, () => runWithGroqRotation(attempt, mgr)));
    // every key came back to the pool
    for (const k of mgr.snapshot().keys) expect(k.inFlight).toBe(0);
    // load spread — no single key took everything
    const counts = used.reduce<Record<string, number>>(
      (m, id) => ((m[id] = (m[id] ?? 0) + 1), m),
      {},
    );
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(6);
  });
});
