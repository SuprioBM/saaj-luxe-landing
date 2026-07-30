import type { SizeStock } from "@/data/catalog";

export function SizePicker({
  sizes,
  value,
  onChange,
  compact = false,
}: {
  sizes: SizeStock[];
  value: string | null;
  onChange: (size: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {sizes.map(({ size, stock }) => {
        const out = stock <= 0;
        const selected = value === size;
        return (
          <button
            key={size}
            type="button"
            disabled={out}
            aria-pressed={selected}
            aria-label={out ? `${size} — unavailable` : `${size}, ${stock} in stock`}
            onClick={() => onChange(size)}
            className={[
              "border transition-all duration-300",
              compact ? "px-3 py-2 text-[0.5625rem]" : "px-4 py-3 text-[0.625rem]",
              "uppercase tracking-[0.2em]",
              out
                ? "cursor-not-allowed border-white/10 text-muted-foreground/40 line-through decoration-white/20"
                : selected
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/70 text-foreground hover:border-saaj-champagne hover:text-saaj-champagne",
            ].join(" ")}
          >
            {size}
            {!out && (
              <span className={selected ? "ml-2 opacity-60" : "ml-2 text-muted-foreground"}>
                ({stock})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
