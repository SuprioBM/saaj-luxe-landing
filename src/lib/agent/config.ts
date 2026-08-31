/**
 * SAAJ AI Agent — provider configuration.
 *
 * The LLM provider is replaceable: any OpenAI-compatible `/chat/completions`
 * endpoint works via the env vars below. The default targets Groq.
 *
 *   GROQ_API_KEYS / AGENT_API_KEY / GROQ_API_KEY / OPENAI_API_KEY
 *       one key, OR a comma-separated pool of keys. With a pool, the Groq
 *       key manager (src/lib/agent/groq-keys.ts) rotates across healthy keys
 *       and fails one over to the next on 429 / 5xx / auth / network errors.
 *   AGENT_BASE_URL              default https://api.groq.com/openai/v1
 *   AGENT_MODEL                 default openai/gpt-oss-120b
 *   AGENT_TEMPERATURE          default 0.3
 *
 *   GROQ_ENABLE_KEY_ROTATION   default true ("false" ⇒ single random key)
 *   GROQ_MAX_RETRIES           default 4  (capped at pool size at runtime)
 *   GROQ_DEFAULT_COOLDOWN_MS   default 20000
 *   GROQ_MAX_COOLDOWN_MS       default 120000
 *   GROQ_KEY_FAILURE_THRESHOLD default 4  (consecutive failures ⇒ max cooldown)
 *
 * Business logic never depends on the model or on how keys are managed —
 * the graph, tools and services see a single Groq service.
 */

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
}

function keyList(): string[] {
  const raw =
    env("GROQ_API_KEYS") ??
    env("AGENT_API_KEY") ??
    env("GROQ_API_KEY") ??
    env("OPENAI_API_KEY") ??
    "";
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

const num = (key: string, fallback: number): number => {
  const v = Number(env(key) ?? fallback);
  return Number.isFinite(v) ? v : fallback;
};

export const agentConfig = {
  apiKeys: keyList(),
  baseURL: env("AGENT_BASE_URL") ?? "https://api.groq.com/openai/v1",
  model: env("AGENT_MODEL") ?? "openai/gpt-oss-120b",
  temperature: num("AGENT_TEMPERATURE", 0.3),
  /** hard cap on tool-call → LLM round trips in a single turn */
  maxSteps: num("AGENT_MAX_STEPS", 5),
  /** how many prior messages to replay into the graph as context */
  historyWindow: num("AGENT_HISTORY_WINDOW", 16),

  /* --- Groq key rotation / failover --- */
  rotationEnabled: (env("GROQ_ENABLE_KEY_ROTATION") ?? "true") !== "false",
  maxRetries: Math.max(1, num("GROQ_MAX_RETRIES", 4)),
  defaultCooldownMs: Math.max(1000, num("GROQ_DEFAULT_COOLDOWN_MS", 20_000)),
  maxCooldownMs: Math.max(1000, num("GROQ_MAX_COOLDOWN_MS", 120_000)),
  failureThreshold: Math.max(1, num("GROQ_KEY_FAILURE_THRESHOLD", 4)),
  /** per-request timeout for a single Groq call */
  requestTimeoutMs: num("GROQ_REQUEST_TIMEOUT_MS", 45_000),
};

/** A key for the single-key / rotation-disabled path. */
export function pickApiKey(): string {
  const keys = agentConfig.apiKeys;
  return keys[Math.floor(Math.random() * keys.length)] ?? "";
}

export function assertAgentConfigured(): void {
  if (agentConfig.apiKeys.length === 0) {
    throw new Error(
      "The SAAJ assistant is not configured yet (missing GROQ_API_KEYS / GROQ_API_KEY).",
    );
  }
}
