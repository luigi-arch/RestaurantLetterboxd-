/**
 * Star display in half increments.
 *
 * Drawn as SVG rather than the ★ glyph so the shape is identical across
 * platforms — the text star is noticeably different on Android and Windows, and
 * half-fills done with a clipped glyph wobble as the font changes.
 */
export function Stars({
  value,
  size = 16,
  className = "",
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const gap = size * 0.14;

  return (
    <span
      className={`inline-flex items-center ${className}`}
      style={{ gap }}
      role="img"
      aria-label={`${value} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((position) => {
        // 0 empty, 0.5 half, 1 full — clamped per star.
        const fill = Math.max(0, Math.min(1, value - position + 1));
        return <Star key={position} size={size} fill={fill} />;
      })}
    </span>
  );
}

function Star({ size, fill }: { size: number; fill: number }) {
  const id = `star-${size}-${fill}`.replace(/\./g, "-");
  const path =
    "M12 2.6l2.9 5.88 6.49.95-4.7 4.58 1.11 6.46L12 17.42l-5.8 3.05 1.1-6.46-4.69-4.58 6.49-.95z";

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={id}>
          <stop offset={`${fill * 100}%`} stopColor="var(--limestone)" />
          <stop offset={`${fill * 100}%`} stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d={path}
        fill={fill > 0 ? `url(#${id})` : "transparent"}
        stroke="var(--limestone)"
        strokeWidth={1.4}
        strokeLinejoin="round"
        opacity={fill > 0 ? 1 : 0.32}
      />
    </svg>
  );
}

/** Price band as € symbols. Renders nothing when unknown rather than guessing. */
export function PriceBand({ band }: { band: number | null }) {
  if (!band) return null;
  return (
    <span className="tabular text-faint" title={`Price band ${band} of 4`}>
      <span className="text-dim">{"€".repeat(band)}</span>
      <span className="opacity-35">{"€".repeat(4 - band)}</span>
    </span>
  );
}

/**
 * Would-return badge. The one field nobody may skip, so it gets a consistent
 * shape and colour everywhere it appears — olive for yes, terracotta for no.
 */
export function ReturnBadge({ wouldReturn }: { wouldReturn: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
        wouldReturn
          ? "bg-success/12 text-success"
          : "bg-danger/12 text-danger"
      }`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: "currentColor" }}
      />
      {wouldReturn ? "Would return" : "Wouldn't return"}
    </span>
  );
}
