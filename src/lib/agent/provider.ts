import { ChatOpenAI } from "@langchain/openai";

import { agentConfig, pickApiKey } from "@/lib/agent/config";

/**
 * LangChain LLM initialization — the one place a model is constructed.
 * OpenAI-compatible; `baseURL` points it at Groq (or any compatible
 * gateway). Streaming is enabled; the graph decides when to bind tools.
 * A key is chosen per model instance from the configured rotation list.
 */
export function makeChatModel(options?: { temperature?: number }): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: pickApiKey(),
    model: agentConfig.model,
    temperature: options?.temperature ?? agentConfig.temperature,
    streaming: true,
    maxRetries: 2,
    timeout: 45_000,
    configuration: { baseURL: agentConfig.baseURL },
  });
}
