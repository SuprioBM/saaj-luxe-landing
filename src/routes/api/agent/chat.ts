import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * SAAJ AI Agent transport — Server-Sent Events.
 *
 * The project runs on Cloudflare Workers with no existing WebSocket layer;
 * SSE over a streamed Response is the right fit and needs no new infra.
 * This is a file API route (not a server function), so it is outside the
 * CSRF-for-serverFn filter in src/start.ts; identity still comes from the
 * Authorization header via identifyCaller — the request body is never
 * trusted for identity.
 *
 *   POST /api/agent/chat   { threadId?, message }  -> text/event-stream
 *   GET  /api/agent/chat?threadId=...              -> conversation history
 */

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function handlePost(request: Request): Promise<Response> {
  const { identifyCaller } = await import("@/lib/agent/identify");
  const { runAgent } = await import("@/lib/agent/service");
  const { assertRateLimit, RateLimitError } = await import("@/lib/mw/rateLimit");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let body: { threadId?: string; message?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return new Response("Empty message", { status: 400 });

  const userId = await identifyCaller(request);

  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anon";
  try {
    await assertRateLimit(supabaseAdmin, "agent_chat", userId ?? `ip:${ip}`, 20, 5);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return new Response(
        sse({ type: "error", message: e.message }) + sse({ type: "done", content: "" }),
        {
          headers: { "content-type": "text/event-stream" },
        },
      );
    }
    throw e;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAgent({
          admin: supabaseAdmin,
          threadId: body.threadId,
          message,
          userId,
        })) {
          controller.enqueue(encoder.encode(sse(event)));
        }
      } catch (err) {
        console.error("[agent chat] stream error", err);
        controller.enqueue(
          encoder.encode(
            sse({ type: "error", message: "Something went wrong. Please try again." }),
          ),
        );
        controller.enqueue(encoder.encode(sse({ type: "done", content: "" })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

async function handleGet(request: Request): Promise<Response> {
  const { identifyCaller } = await import("@/lib/agent/identify");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const threadId = new URL(request.url).searchParams.get("threadId");
  if (!threadId) return Response.json({ messages: [] });

  const userId = await identifyCaller(request);
  const { data: thread } = await supabaseAdmin
    .from("chat_threads")
    .select("id,user_id")
    .eq("id", threadId)
    .maybeSingle();
  // Guest threads are readable by whoever holds the id; a claimed thread
  // only by its owner.
  if (!thread || (thread.user_id && thread.user_id !== userId)) {
    return Response.json({ messages: [] });
  }

  const { data } = await supabaseAdmin
    .from("chat_messages")
    .select("role,content,metadata,created_at")
    .eq("thread_id", threadId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(100);

  return Response.json({
    threadId,
    messages: (data ?? []).map((m) => ({
      role: m.role,
      content: m.content,
      metadata: m.metadata,
      at: m.created_at,
    })),
  });
}

export const Route = createFileRoute("/api/agent/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handlePost(request);
        } catch (err) {
          console.error("[agent chat POST]", err);
          return new Response("Internal error", { status: 500 });
        }
      },
      GET: async ({ request }) => {
        try {
          return await handleGet(request);
        } catch (err) {
          console.error("[agent chat GET]", err);
          return Response.json({ messages: [] });
        }
      },
    },
  },
});
