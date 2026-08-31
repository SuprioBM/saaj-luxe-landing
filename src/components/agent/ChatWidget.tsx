import { useCallback, useEffect, useState } from "react";

import { ChatPanel } from "@/components/agent/ChatPanel";
import { useBodyScrollLock } from "@/components/agent/useBodyScrollLock";
import { useDraggableBubble } from "@/components/agent/useDraggableBubble";

/**
 * The SAAJ AI Agent entry point — a floating, draggable bubble that uses the
 * SAAJ favicon as its icon. Tapping it opens the chat; while open, the
 * background page cannot scroll and only the conversation does; a click
 * outside the panel (or the close button, or Escape) closes it and restores
 * scrolling. Clicks inside the panel never close it.
 *
 * Mounted once in __root.tsx, so it rides on every storefront page without
 * changing any of them.
 */

const AGENT_ICON = "/favicon_io/android-chrome-192x192.png";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [mountedClient, setMountedClient] = useState(false);

  useEffect(() => setMountedClient(true), []);

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);

  const { pos, dragging, mounted, side, handlers } = useDraggableBubble(toggle);
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!mountedClient) return null;

  return (
    <>
      {open ? (
        <>
          {/* backdrop — outside-click closes; the panel is a SIBLING with a
              higher z-index, so a click inside it never reaches here */}
          <div
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px]"
            onClick={close}
            aria-hidden="true"
          />
          <ChatPanel onClose={close} side={side} />
        </>
      ) : null}

      {/* The launcher is hidden while the panel is open — the panel takes its
          place (desktop) or the screen (mobile), and closes via its own X,
          an outside click, or Escape. This avoids the launcher overlapping
          and intercepting clicks meant for the panel's input row. */}
      {!open ? (
        <button
          type="button"
          aria-label="Open SAAJ assistant"
          {...handlers}
          style={{
            left: mounted ? pos.x : undefined,
            top: mounted ? pos.y : undefined,
            right: mounted ? undefined : 16,
            bottom: mounted ? undefined : 16,
            touchAction: "none",
          }}
          className={`fixed z-[102] flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-saaj-champagne/40 bg-background shadow-xl select-none hover:shadow-2xl ${
            dragging
              ? "cursor-grabbing transition-shadow"
              : "cursor-grab transition-[left,top,box-shadow] duration-300 ease-out"
          }`}
        >
          <img src={AGENT_ICON} alt="" draggable={false} className="h-full w-full object-cover" />
        </button>
      ) : null}
    </>
  );
}
