import { supabase } from "@/integrations/supabase/client";

/**
 * Browser-side transport for the SAAJ agent. POSTs to the SSE endpoint and
 * parses `data: {json}` frames. (EventSource can't POST, so we read the
 * stream by hand.) The thread id is kept in localStorage so a conversation
 * survives a page reload within the session.
 */

const THREAD_KEY = "saaj.agent.thread";

export function getThreadId(): string | null {
  try {
    return window.localStorage.getItem(THREAD_KEY);
  } catch {
    return null;
  }
}
export function setThreadId(id: string) {
  try {
    window.localStorage.setItem(THREAD_KEY, id);
  } catch {
    /* ignore */
  }
}
export function clearThread() {
  try {
    window.localStorage.removeItem(THREAD_KEY);
  } catch {
    /* ignore */
  }
}

export type AgentProduct = {
  slug: string;
  name: string;
  category: string;
  price: number;
  memberPrice: number;
  image: string | null;
  membersOnly: boolean;
  inStock: boolean;
};
export type AgentAction = { label: string; href: string };

export type AgentStreamEvent =
  | { type: "thread"; threadId: string }
  | { type: "token"; value: string }
  | { type: "tool"; name: string; phase: "start" | "end" }
  | { type: "products"; products: AgentProduct[] }
  | { type: "actions"; actions: AgentAction[] }
  | { type: "done"; content: string }
  | { type: "error"; message: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: AgentProduct[];
  actions?: AgentAction[];
  pending?: boolean;
  error?: boolean;
};

async function authHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** Send a message; yields stream events until `done` or `error`. */
export async function* sendChatMessage(
  message: string,
  signal?: AbortSignal,
): AsyncGenerator<AgentStreamEvent> {
  const res = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ threadId: getThreadId() ?? undefined, message }),
    signal,
  });

  if (!res.ok || !res.body) {
    yield { type: "error", message: "The assistant is unavailable right now. Please try again." };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        try {
          const event = JSON.parse(line.slice(6)) as AgentStreamEvent;
          if (event.type === "thread") setThreadId(event.threadId);
          yield event;
        } catch {
          /* skip malformed frame */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export type LoadedHistory = {
  role: "user" | "assistant";
  content: string;
  metadata: { products?: AgentProduct[]; actions?: AgentAction[] } | null;
};

export async function loadThreadHistory(): Promise<ChatMessage[]> {
  const threadId = getThreadId();
  if (!threadId) return [];
  try {
    const res = await fetch(`/api/agent/chat?threadId=${encodeURIComponent(threadId)}`, {
      headers: await authHeader(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { messages: LoadedHistory[] };
    return (data.messages ?? []).map((m, i) => ({
      id: `h${i}`,
      role: m.role,
      content: m.content,
      products: m.metadata?.products,
      actions: m.metadata?.actions,
    }));
  } catch {
    return [];
  }
}
