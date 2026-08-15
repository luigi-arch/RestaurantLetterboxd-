"use client";

import { useState } from "react";

/**
 * Half-star picker.
 *
 * Each star carries two invisible hit areas — left half and right half — which
 * is far more reliable on a phone than a slider, and needs no drag. The chosen
 * star springs on selection; that small piece of feedback is most of why rating
 * feels good rather than administrative.
 */
export function StarPicker({
  value,
  onChange,
  size = 40,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  size?: number;
}) {
  const [popped, setPopped] = useState<number | null>(null);

  function select(next: number) {
    // Tapping the same value again clears it — rating stays optional.
    if (value === next) {
      onChange(null);
      return;
    }
    onChange(next);
    setPopped(next);
    // Where supported, a short tick makes the selection feel physical.
    navigator.vibrate?.(8);
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex" style={{ gap: size * 0.1 }}>
        {[1, 2, 3, 4, 5].map((position) => {
          const fill = Math.max(0, Math.min(1, (value ?? 0) - position + 1));
          const isPopped = popped !== null && Math.ceil(popped) === position;

          return (
            <span
              key={position}
              className={`relative inline-flex ${isPopped ? "star-pop" : ""}`}
              onAnimationEnd={() => setPopped(null)}
              style={{ width: size, height: size }}
            >
              <button
                type="button"
                aria-label={`${position - 0.5} stars`}
                onClick={() => select(position - 0.5)}
                className="absolute inset-y-0 left-0 z-10 w-1/2"
              />
              <button
                type="button"
                aria-label={`${position} stars`}
                onClick={() => select(position)}
                className="absolute inset-y-0 right-0 z-10 w-1/2"
              />
              <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
                <defs>
                  <linearGradient id={`pick-${position}-${fill}`}>
                    <stop offset={`${fill * 100}%`} stopColor="var(--limestone)" />
                    <stop offset={`${fill * 100}%`} stopColor="transparent" />
                  </linearGradient>
                </defs>
                <path
                  d="M12 2.6l2.9 5.88 6.49.95-4.7 4.58 1.11 6.46L12 17.42l-5.8 3.05 1.1-6.46-4.69-4.58 6.49-.95z"
                  fill={fill > 0 ? `url(#pick-${position}-${fill})` : "transparent"}
                  stroke="var(--limestone)"
                  strokeWidth={1.3}
                  strokeLinejoin="round"
                  opacity={fill > 0 ? 1 : 0.3}
                />
              </svg>
            </span>
          );
        })}
      </div>

      <span className="tabular w-10 text-lg text-dim">
        {value !== null ? value.toFixed(1) : "—"}
      </span>
    </div>
  );
}
