import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Messenger-style draggable floating bubble.
 *
 *  - Pointer Events on `document` while dragging → mouse + touch, desktop +
 *    mobile, and never loses the pointer if it leaves the bubble
 *  - a small move threshold separates a drag from a tap (tap = open chat)
 *  - on release the bubble SNAPS to the nearer vertical edge (left / right)
 *    based on which half of the viewport its centre is in, keeping its
 *    height — like Messenger's chat head
 *  - clamped inside the viewport, re-snapped on resize, never off-screen
 *  - `touch-action: none` + preventDefault stop page scroll / text selection
 *    while dragging, and nothing else
 *  - last position remembered in localStorage (no backend)
 */

const KEY = "saaj.agent.bubblePos";
const SIZE = 56;
const MARGIN = 12;
const DRAG_THRESHOLD = 4;

type Pos = { x: number; y: number };
export type BubbleSide = "left" | "right";

function clampY(y: number): number {
  if (typeof window === "undefined") return y;
  const maxY = Math.max(MARGIN, window.innerHeight - SIZE - MARGIN);
  return Math.min(Math.max(MARGIN, y), maxY);
}

function edgeX(side: BubbleSide): number {
  if (typeof window === "undefined") return MARGIN;
  return side === "left" ? MARGIN : Math.max(MARGIN, window.innerWidth - SIZE - MARGIN);
}

function sideOf(x: number): BubbleSide {
  if (typeof window === "undefined") return "right";
  return x + SIZE / 2 < window.innerWidth / 2 ? "left" : "right";
}

/** Pin to the nearer vertical edge, keep the height. */
function snap(pos: Pos): Pos {
  return { x: edgeX(sideOf(pos.x)), y: clampY(pos.y) };
}

function defaultPos(): Pos {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return { x: edgeX("right"), y: clampY(window.innerHeight - SIZE - MARGIN - 4) };
}

function load(): Pos {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Pos;
      if (typeof p.x === "number" && typeof p.y === "number") return snap(p);
    }
  } catch {
    /* ignore */
  }
  return defaultPos();
}

export function useDraggableBubble(onTap: () => void) {
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);

  const posRef = useRef(pos);
  posRef.current = pos;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    setMounted(true);
    setPos(load());
    const onResize = () => setPos((p) => snap(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.px;
      const dy = e.clientY - d.py;
      if (!moved.current && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        moved.current = true;
        setDragging(true);
      }
      if (moved.current) {
        e.preventDefault();
        // free movement while the finger is down; snap happens on release
        setPos({
          x: Math.min(Math.max(0, d.ox + dx), Math.max(0, window.innerWidth - SIZE)),
          y: clampY(d.oy + dy),
        });
      }
    };
    const onUp = () => {
      if (!drag.current) return;
      const wasDrag = moved.current;
      drag.current = null;
      moved.current = false;
      setDragging(false);
      if (wasDrag) {
        const snapped = snap(posRef.current);
        setPos(snapped);
        try {
          window.localStorage.setItem(KEY, JSON.stringify(snapped));
        } catch {
          /* ignore */
        }
      } else {
        onTapRef.current();
      }
    };
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { px: e.clientX, py: e.clientY, ox: posRef.current.x, oy: posRef.current.y };
    moved.current = false;
  }, []);

  return {
    pos,
    dragging,
    mounted,
    side: mounted ? sideOf(pos.x) : ("right" as BubbleSide),
    handlers: { onPointerDown },
  };
}
