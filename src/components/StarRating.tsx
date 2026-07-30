import { Star } from "lucide-react";

export function StarRating({
  value,
  size = "sm",
  className = "",
}: {
  value: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const px = size === "md" ? "h-4 w-4" : "h-3 w-3";
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${px} ${i <= Math.round(value) ? "fill-saaj-champagne text-saaj-champagne" : "text-muted-foreground/50"}`}
          strokeWidth={1.25}
        />
      ))}
    </span>
  );
}
