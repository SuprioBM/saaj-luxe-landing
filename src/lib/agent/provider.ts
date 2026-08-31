import { AIMessage, type AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";

import { agentConfig, pickApiKey } from "@/lib/agent/config";
import { groqKeys, runWithGroqRotation } from "@/lib/agent/groq-keys";

/**
 * The Groq service — the single seam between the agent/graph and Groq.
 *
 * The graph calls `invokeWithRotation(messages, tools, config)` and gets back
 * one `AIMessage`. Underneath, a healthy key is selected, the call is
 * streamed (so LangGraph's token streaming still works and so a pre-token
 * failure can rotate cleanly), and on failure the request fails over to the
 * next healthy key — all invisible to the caller. Prompts, LangGraph state,
 * thread ids, checkpoints and RAG context are never touched by any of this;
 * every retry uses the exact same `messages` input.
 */

function buildModel(key: string, tools: StructuredToolInterface[]) {
  const model = new ChatOpenAI({
    apiKey: key,
    model: agentConfig.model,
    temperature: agentConfig.temperature,
    streaming: true,
    // rotation handles retries — don't let the SDK silently retry the same key
    maxRetries: 0,
    timeout: agentConfig.requestTimeoutMs,
    configuration: { baseURL: agentConfig.baseURL },
  });
  return tools.length ? model.bindTools(tools) : model;
}

/** Kept for compatibility / non-rotation callers. */
export function makeChatModel(options?: { temperature?: number }): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: pickApiKey(),
    model: agentConfig.model,
    temperature: options?.temperature ?? agentConfig.temperature,
    streaming: true,
    maxRetries: 2,
    timeout: agentConfig.requestTimeoutMs,
    configuration: { baseURL: agentConfig.baseURL },
  });
}

function chunkHasVisibleText(chunk: AIMessageChunk): boolean {
  const c = chunk.content as unknown;
  if (typeof c === "string") return c.length > 0;
  if (Array.isArray(c)) {
    return c.some((p) => {
      if (typeof p === "string") return p.length > 0;
      const part = p as { type?: string; text?: string };
      return part.type === "text" && Boolean(part.text);
    });
  }
  return false;
}

function chunkToAIMessage(acc: AIMessageChunk): AIMessage {
  return new AIMessage({
    content: acc.content,
    tool_calls: acc.tool_calls ?? [],
    invalid_tool_calls: acc.invalid_tool_calls ?? [],
    additional_kwargs: acc.additional_kwargs,
    response_metadata: acc.response_metadata,
    id: acc.id,
  });
}

/**
 * One reasoning-model call for the graph's `agent` node, with transparent
 * Groq key rotation / failover.
 */
export async function invokeWithRotation(
  messages: BaseMessage[],
  tools: StructuredToolInterface[],
  config?: RunnableConfig,
): Promise<AIMessage> {
  // Rotation off, or only one key ⇒ a single call (still surfaces a clean error).
  if (!agentConfig.rotationEnabled || groqKeys().size() <= 1) {
    const model = buildModel(pickApiKey(), tools);
    return (await model.invoke(messages, config)) as AIMessage;
  }

  return runWithGroqRotation(async (lease, markCommitted) => {
    const model = buildModel(lease.value, tools);
    // Streaming, not invoke: LangGraph's streamMode:"messages" still surfaces
    // these tokens (config carries the run's callbacks), and consuming the
    // iterator lets us tell a pre-token failure (safe to rotate) from a
    // mid-stream one (terminal — no restart/concat).
    const stream = await model.stream(messages, config);
    let acc: AIMessageChunk | undefined;
    for await (const chunk of stream) {
      if (chunkHasVisibleText(chunk)) markCommitted();
      acc = acc ? (acc.concat(chunk) as AIMessageChunk) : chunk;
    }
    if (!acc) throw new Error("empty_completion");
    return chunkToAIMessage(acc);
  });
}
