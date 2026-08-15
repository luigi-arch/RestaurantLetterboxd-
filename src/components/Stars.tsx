/** Star display in half increments, matching how ratings are entered. */
export function Stars({
  value,
  size = 16,
  className = "",
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, (value / 5) * 100));

  return (
    <span
      className={`relative inline-block leading-none ${className}`}
      style={{ fontSize: size }}
      role="img"
      aria-label={`${value} out of 5 stars`}
    >
      <span className="text-faint select-none">★★★★★</span>
      <span
        className="absolute inset-0 overflow-hidden text-gold select-none"
        style={{ width: `${percent}%` }}
      >
        ★★★★★
      </span>
    </span>
  );
}

/** Renders the price band as € symbols; nothing at all when unknown. */
export function PriceBand({ band }: { band: number | null }) {
  if (!band) return null;
  return (
    <span className="text-faint tabular" title={`Price band ${band} of 4`}>
      {"€".repeat(band)}
      <span className="opacity-30">{"€".repeat(4 - band)}</span>
    </span>
  );
}
