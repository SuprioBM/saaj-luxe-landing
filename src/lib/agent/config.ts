/**
 * SAAJ AI Agent — provider configuration.
 *
 * The LLM provider is replaceable: any OpenAI-compatible `/chat/completions`
 * endpoint works via the env vars below. The default targets Groq with the
 * key(s) the project ships with (`GROQ_API_KEY`).
 *
 *   AGENT_API_KEY / GROQ_API_KEY   one key, OR a comma-separated list of
 *                                  keys (one is picked at random per request
 *                                  to spread rate limits).
 *   AGENT_BASE_URL                 default https://api.groq.com/openai/v1
 *   AGENT_MODEL                    default openai/gpt-oss-120b
 *   AGENT_TEMPERATURE             default 0.3
 *
 * Business logic never depends on the model — the graph, tools and backend
 * services are identical whichever provider/model is configured.
 */

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
}

function keyList(): string[] {
  const raw = env("AGENT_API_KEY") ?? env("GROQ_API_KEY") ?? env("OPENAI_API_KEY") ?? "";
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export const agentConfig = {
  apiKeys: keyList(),
  baseURL: env("AGENT_BASE_URL") ?? "https://api.groq.com/openai/v1",
  model: env("AGENT_MODEL") ?? "openai/gpt-oss-120b",
  temperature: Number(env("AGENT_TEMPERATURE") ?? "0.3"),
  /** hard cap on tool-call → LLM round trips in a single turn */
  maxSteps: Number(env("AGENT_MAX_STEPS") ?? "5"),
  /** how many prior messages to replay into the graph as context */
  historyWindow: Number(env("AGENT_HISTORY_WINDOW") ?? "16"),
};

/** A key for this request. Random pick spreads load across a rotation list. */
export function pickApiKey(): string {
  const keys = agentConfig.apiKeys;
  return keys[Math.floor(Math.random() * keys.length)] ?? "";
}

export function assertAgentConfigured(): void {
  if (agentConfig.apiKeys.length === 0) {
    throw new Error(
      "The SAAJ assistant is not configured yet (missing AGENT_API_KEY / GROQ_API_KEY).",
    );
  }
}
