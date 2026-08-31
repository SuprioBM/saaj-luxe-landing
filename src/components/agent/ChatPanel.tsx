import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, RotateCcw, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatBDT } from "@/data/catalog";
import {
  clearThread,
  loadThreadHistory,
  sendChatMessage,
  type AgentAction,
  type AgentProduct,
  type ChatMessage,
} from "@/lib/agent-client";

const AGENT_ICON = "/favicon_io/android-chrome-192x192.png";
const TOOL_LABEL: Record<string, string> = {
  search_products: "Searching the collection…",
  get_product_details: "Checking that piece…",
  get_product_availability: "Checking stock…",
  get_exclusive_products: "Checking SAAJ Club exclusives…",
  get_early_access_products: "Checking upcoming drops…",
  get_membership_benefits: "Checking SAAJ Club…",
  get_customer_membership: "Checking your membership…",
  get_customer_rewards: "Checking your reward points…",
  get_customer_orders: "Finding your orders…",
  get_order_status: "Checking your order…",
  get_order_details: "Checking your order…",
  get_cancellation_eligibility: "Checking cancellation…",
  get_store_policies: "Reading SAAJ policies…",
};

function uid() {
  return Math.random().toString(36).slice(2);
}

export function ChatPanel({
  onClose,
  side = "right",
}: {
  onClose: () => void;
  side?: "left" | "right";
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [toolNote, setToolNote] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastUserMsg = useRef<string>("");

  useEffect(() => {
    void loadThreadHistory().then((h) => {
      setMessages(h);
      setHistoryLoaded(true);
    });
    return () => abortRef.current?.abort();
  }, []);

  const scrollDown = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollDown();
  }, [messages, toolNote, scrollDown]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const run = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      lastUserMsg.current = trimmed;
      setInput("");
      setStreaming(true);
      setToolNote(null);

      const userMsg: ChatMessage = { id: uid(), role: "user", content: trimmed };
      const assistantId = uid();
      setMessages((m) => [
        ...m,
        userMsg,
        { id: assistantId, role: "assistant", content: "", pending: true },
      ]);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const products: AgentProduct[] = [];
      const actions: AgentAction[] = [];
      let text0 = "";

      try {
        for await (const event of sendChatMessage(trimmed, ctrl.signal)) {
          if (event.type === "token") {
            text0 += event.value;
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId ? { ...msg, content: text0, pending: false } : msg,
              ),
            );
          } else if (event.type === "tool") {
            setToolNote(event.phase === "start" ? (TOOL_LABEL[event.name] ?? "Working…") : null);
          } else if (event.type === "products") {
            products.push(...event.products);
          } else if (event.type === "actions") {
            actions.push(...event.actions);
          } else if (event.type === "error") {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: event.message, pending: false, error: true }
                  : msg,
              ),
            );
          } else if (event.type === "done") {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId
                  ? {
                      ...msg,
                      content: event.content || text0 || msg.content,
                      pending: false,
                      products: products.length ? products : undefined,
                      actions: actions.length ? actions : undefined,
                    }
                  : msg,
              ),
            );
          }
        }
      } catch {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId && !msg.content
              ? {
                  ...msg,
                  content: "Something went wrong. Please try again.",
                  pending: false,
                  error: true,
                }
              : msg,
          ),
        );
      } finally {
        setStreaming(false);
        setToolNote(null);
        abortRef.current = null;
      }
    },
    [streaming],
  );

  const retry = useCallback(() => {
    setMessages((m) => {
      // drop the trailing errored assistant + its user turn, then re-send
      const copy = [...m];
      if (copy.at(-1)?.role === "assistant") copy.pop();
      if (copy.at(-1)?.role === "user") copy.pop();
      return copy;
    });
    void run(lastUserMsg.current);
  }, [run]);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    clearThread();
    setMessages([]);
    setStreaming(false);
    setToolNote(null);
    inputRef.current?.focus();
  }, []);

  const canSend = input.trim().length > 0 && !streaming;
  const showIntro = historyLoaded && messages.length === 0;

  return (
    <section
      role="dialog"
      aria-label="SAAJ assistant"
      className={`pointer-events-auto fixed z-[101] flex flex-col overflow-hidden border border-saaj-line bg-background shadow-2xl
        inset-x-0 bottom-0 top-0
        sm:inset-auto sm:bottom-4 sm:top-auto sm:h-[min(620px,calc(100dvh-2rem))] sm:w-[min(400px,calc(100vw-2rem))]
        ${side === "left" ? "sm:left-4" : "sm:right-4"}`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* header */}
      <header className="flex items-center gap-3 border-b border-saaj-line px-4 py-3">
        <img src={AGENT_ICON} alt="" className="h-7 w-7 rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-none text-saaj-champagne">SAAJ</p>
          <p className="mt-0.5 text-[0.5625rem] tracking-[0.22em] text-muted-foreground">
            ASSISTANT
          </p>
        </div>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={newChat}
            aria-label="New chat"
            className="text-muted-foreground transition-colors hover:text-saaj-champagne"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.25} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="text-muted-foreground transition-colors hover:text-saaj-champagne"
        >
          <X className="h-4.5 w-4.5" strokeWidth={1.25} />
        </button>
      </header>

      {/* messages — this is the ONLY thing that scrolls */}
      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5">
        {showIntro ? <Intro onPick={(q) => void run(q)} /> : null}

        {messages.map((m) => (
          <Bubble key={m.id} message={m} onClose={onClose} />
        ))}

        {toolNote ? (
          <p className="flex items-center gap-2 text-[0.6875rem] italic text-muted-foreground">
            <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-saaj-champagne" />
            {toolNote}
          </p>
        ) : null}

        {streaming &&
        !toolNote &&
        !messages.some((m) => m.role === "assistant" && m.pending === false && m.content)
          ? null
          : null}

        {messages.at(-1)?.error && !streaming ? (
          <button
            type="button"
            onClick={retry}
            className="flex items-center gap-2 text-[0.625rem] tracking-[0.2em] text-saaj-champagne hover:underline"
          >
            <RotateCcw className="h-3 w-3" strokeWidth={1.5} />
            RETRY
          </button>
        ) : null}
      </div>

      {/* input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(input);
        }}
        className="flex items-end gap-2 border-t border-saaj-line p-3"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void run(input);
            }
          }}
          rows={1}
          placeholder="Ask SAAJ…"
          className="max-h-28 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground/70"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center border border-saaj-line text-muted-foreground transition-colors enabled:hover:border-saaj-champagne enabled:hover:text-saaj-champagne disabled:opacity-30"
        >
          <Send className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </form>
    </section>
  );
}

function Intro({ onPick }: { onPick: (q: string) => void }) {
  const suggestions = useMemo(
    () => [
      "Show me black rings under ৳1500",
      "What is SAAJ Club?",
      "How long do refunds take?",
      "Which pieces are members-only?",
    ],
    [],
  );
  return (
    <div>
      <p className="text-sm leading-relaxed text-foreground/90">
        I can help you find pieces, explain SAAJ Club, check policies, and — once you're signed in —
        look up your orders and rewards.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="border border-saaj-line px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ message, onClose }: { message: ChatMessage; onClose: () => void }) {
  const navigate = useNavigate();
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap border border-saaj-line bg-saaj-panel px-3 py-2 text-sm">
          {message.content}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {message.pending && !message.content ? (
        <p className="flex items-center gap-2 text-[0.6875rem] italic text-muted-foreground">
          <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-saaj-champagne" />
          SAAJ is thinking…
        </p>
      ) : (
        <p
          className={`max-w-[92%] whitespace-pre-wrap text-sm leading-relaxed ${
            message.error ? "text-destructive" : "text-foreground/90"
          }`}
        >
          {message.content}
        </p>
      )}

      {message.products?.length ? (
        <div className="grid grid-cols-2 gap-2">
          {message.products.slice(0, 6).map((p) => (
            <ProductCard key={p.slug} product={p} onNavigate={onClose} />
          ))}
        </div>
      ) : null}

      {message.actions?.length ? (
        <div className="flex flex-wrap gap-2">
          {message.actions.map((a) => (
            <button
              key={a.href}
              type="button"
              onClick={() => {
                onClose();
                void navigate({ href: a.href });
              }}
              className="inline-flex items-center gap-1.5 border border-saaj-line px-3 py-1.5 text-[0.625rem] tracking-[0.16em] text-saaj-champagne transition-colors hover:bg-saaj-champagne hover:text-background"
            >
              {a.label.toUpperCase()}
              <ArrowUpRight className="h-3 w-3" strokeWidth={1.5} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProductCard({ product, onNavigate }: { product: AgentProduct; onNavigate: () => void }) {
  return (
    <Link
      to="/product/$slug"
      params={{ slug: product.slug }}
      onClick={onNavigate}
      className="group flex flex-col border border-saaj-line bg-saaj-panel transition-colors hover:border-saaj-champagne/50"
    >
      <div className="relative aspect-square overflow-hidden">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-background" />
        )}
        {product.membersOnly ? (
          <span className="absolute left-1.5 top-1.5 border border-saaj-champagne/50 bg-background/80 px-1.5 py-0.5 text-[0.5rem] tracking-[0.16em] text-saaj-champagne backdrop-blur">
            CLUB
          </span>
        ) : null}
      </div>
      <div className="p-2">
        <p className="truncate text-[0.6875rem] leading-tight">{product.name}</p>
        <p className="mt-1 text-[0.625rem] text-muted-foreground">
          {product.memberPrice < product.price ? (
            <>
              <span className="line-through">{formatBDT(product.price)}</span>{" "}
              <span className="text-saaj-champagne">{formatBDT(product.memberPrice)}</span>
            </>
          ) : (
            formatBDT(product.price)
          )}
        </p>
      </div>
    </Link>
  );
}
