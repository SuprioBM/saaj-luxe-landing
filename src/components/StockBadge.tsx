import { stockState } from "@/data/catalog";

export function StockBadge({ qty, className = "" }: { qty: number; className?: string }) {
  const { label, tone } = stockState(qty);
  const tint =
    tone === "out"
      ? "text-muted-foreground/70 border-saaj-line"
      : tone === "low"
        ? "text-saaj-champagne border-saaj-champagne/40"
        : "text-foreground/80 border-saaj-line";

  return (
    <span
      className={`inline-flex items-center gap-2 border px-3 py-1.5 text-[0.5625rem] uppercase tracking-[0.22em] ${tint} ${className}`}
    >
      <span
        className={`h-1 w-1 rounded-full ${
          tone === "out"
            ? "bg-muted-foreground/60"
            : tone === "low"
              ? "bg-saaj-champagne"
              : "bg-foreground/70"
        }`}
      />
      {label}
    </span>
  );
}
