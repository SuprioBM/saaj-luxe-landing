import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { agentConfig, assertAgentConfigured } from "@/lib/agent/config";
import { AgentCollector, type AgentContext } from "@/lib/agent/context";
import { buildAgentGraph } from "@/lib/agent/graph";
import { systemPrompt } from "@/lib/agent/prompt";
import { buildTools } from "@/lib/agent/tools";

export type AgentEvent =
  | { type: "thread"; threadId: string }
  | { type: "token"; value: string }
  | { type: "tool"; name: string; phase: "start" | "end" }
  | { type: "products"; products: ReturnType<AgentCollector["drain"]>["products"] }
  | { type: "actions"; actions: ReturnType<AgentCollector["drain"]>["actions"] }
  | { type: "done"; content: string }
  | { type: "error"; message: string };

const MAX_MESSAGE_LEN = 2000;

async function resolveThread(
  admin: SupabaseClient<Database>,
  threadId: string | undefined,
  userId: string | null,
): Promise<string> {
  if (threadId) {
    const { data } = await admin
      .from("chat_threads")
      .select("id,user_id")
      .eq("id", threadId)
      .maybeSingle();
    if (data) {
      // A signed-in customer may only use their own thread. A guest thread
      // (user_id null) is reachable by whoever holds the id; if that guest
      // later signs in, claim the thread for them.
      if (data.user_id && userId && data.user_id !== userId) {
        // fall through and make them a fresh thread
      } else {
        if (!data.user_id && userId) {
          await admin.from("chat_threads").update({ user_id: userId }).eq("id", data.id);
        }
        return data.id;
      }
    }
  }
  const { data: created, error } = await admin
    .from("chat_threads")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function loadHistory(
  admin: SupabaseClient<Database>,
  threadId: string,
): Promise<BaseMessage[]> {
  const { data } = await admin
    .from("chat_messages")
    .select("role,content,metadata")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(agentConfig.historyWindow);
  const rows = ((data as { role: string; content: string }[]) ?? []).reverse();
  // Only replay user/assistant turns — tool traffic is regenerated fresh.
  return rows
    .filter((r) => (r.role === "user" || r.role === "assistant") && r.content.trim())
    .map((r) => (r.role === "user" ? new HumanMessage(r.content) : new AIMessage(r.content)));
}

/**
 * Run one turn of the SAAJ agent. Yields streaming events; persists the
 * user message and the final assistant message (with surfaced products /
 * actions) to `chat_messages`.
 */
export async function* runAgent(input: {
  admin: SupabaseClient<Database>;
  threadId?: string;
  message: string;
  userId: string | null;
}): AsyncGenerator<AgentEvent> {
  assertAgentConfigured();

  const message = input.message.trim().slice(0, MAX_MESSAGE_LEN);
  if (!message) {
    yield { type: "error", message: "Empty message." };
    return;
  }

  const threadId = await resolveThread(input.admin, input.threadId, input.userId);
  yield { type: "thread", threadId };

  const { data: memberFlag } = input.userId
    ? await input.admin.rpc("is_active_member", { _user_id: input.userId })
    : { data: false };
  const isMember = Boolean(memberFlag);

  const ctx: AgentContext = { userId: input.userId, isMember, admin: input.admin };
  const collector = new AgentCollector();
  const tools = buildTools(ctx, collector);
  const graph = buildAgentGraph(
    tools,
    systemPrompt({
      isAuthenticated: Boolean(input.userId),
      isMember,
      now: new Date().toISOString().slice(0, 10),
    }),
  );

  const history = await loadHistory(input.admin, threadId);

  // Persist the user turn up front so a mid-stream failure still records it.
  await input.admin
    .from("chat_messages")
    .insert({ thread_id: threadId, role: "user", content: message });

  let finalText = "";
  let sawToolSinceText = false;

  try {
    const stream = await graph.stream(
      { messages: [...history, new HumanMessage(message)] },
      { streamMode: ["messages", "updates"] as const, recursionLimit: 25 },
    );

    for await (const [mode, payload] of stream as AsyncIterable<[string, unknown]>) {
      if (mode === "messages") {
        const [chunk] = payload as [BaseMessage, unknown];
        if (chunk?.getType?.() === "ai") {
          const text =
            typeof chunk.content === "string"
              ? chunk.content
              : Array.isArray(chunk.content)
                ? chunk.content
                    .map((c) => (typeof c === "string" ? c : "text" in c ? c.text : ""))
                    .join("")
                : "";
          if (text) {
            if (sawToolSinceText) {
              finalText = "";
              sawToolSinceText = false;
            }
            finalText += text;
            yield { type: "token", value: text };
          }
        }
      } else if (mode === "updates") {
        const update = payload as Record<string, { messages?: BaseMessage[] }>;
        if (update.agent) {
          const last = update.agent.messages?.at(-1) as AIMessage | undefined;
          for (const call of last?.tool_calls ?? []) {
            yield { type: "tool", name: call.name, phase: "start" };
          }
        }
        if (update.tools) {
          sawToolSinceText = true;
          for (const m of update.tools.messages ?? []) {
            if (m instanceof ToolMessage) {
              yield { type: "tool", name: m.name ?? "tool", phase: "end" };
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("[agent] run failed", err);
    yield { type: "error", message: "Something went wrong. Please try again." };
    return;
  }

  const { products, actions } = collector.drain();
  if (products.length) yield { type: "products", products };
  if (actions.length) yield { type: "actions", actions };

  finalText = finalText.trim();
  if (!finalText) {
    finalText = "Sorry — I couldn't put together an answer just now. Please try again.";
    yield { type: "token", value: finalText };
  }

  await input.admin.from("chat_messages").insert({
    thread_id: threadId,
    role: "assistant",
    content: finalText,
    metadata: {
      products,
      actions,
      tools: collector.toolCalls,
    } as unknown as Database["public"]["Tables"]["chat_messages"]["Insert"]["metadata"],
  });
  await input.admin
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId);

  yield { type: "done", content: finalText };
}
