export function QtyStepper({
  value,
  max,
  onChange,
  disabled = false,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center border border-saaj-line">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
        className="h-10 w-10 text-sm transition-colors hover:text-saaj-champagne disabled:opacity-30"
      >
        −
      </button>
      <span className="w-10 text-center text-xs tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className="h-10 w-10 text-sm transition-colors hover:text-saaj-champagne disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
