/**
 * Deterministic geometric artwork for a restaurant with no photograph.
 *
 * Letterboxd gets its entire visual identity free from film posters. Restaurants
 * have no canonical image and, on day one, no diner photos either — which is
 * where most clones of this idea end up looking like a spreadsheet.
 *
 * So the floor is never an empty grey box. Each restaurant gets a stable pattern
 * derived from its own name, in the Malta palette: same restaurant, same card,
 * every time, with no network request.
 */

const PALETTES = [
  ["#1e6f8c", "#35a0c4"], // Mediterranean
  ["#a8342a", "#d4674f"], // balcony red
  ["#2f6b4f", "#4f9670"], // balcony green
  ["#8a6d1f", "#d8a629"], // brass and gold
  ["#5c4a7a", "#8a72ad"], // dusk
  ["#a35a2b", "#d1874a"], // terracotta
];

/** FNV-1a: small, fast, and stable across runs — unlike hashing by object identity. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h);
}

export function GeneratedCard({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const h = hash(name);
  const [dark, light] = PALETTES[h % PALETTES.length];
  const variant = Math.floor(h / 7) % 4;
  const rotation = (h % 4) * 15;

  // The initial gives an otherwise abstract card something to identify it by.
  const initial = name.replace(/^(the|il-|is-|ta'|tal-|ir-|l-)\s*/i, "").charAt(0);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: dark }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 120 120"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <g
          transform={`rotate(${rotation} 60 60)`}
          fill={light}
          fillOpacity="0.55"
        >
          {variant === 0 && (
            <>
              <circle cx="30" cy="30" r="34" />
              <circle cx="95" cy="88" r="46" fillOpacity="0.35" />
            </>
          )}
          {variant === 1 && (
            <>
              <rect x="-10" y="20" width="140" height="26" />
              <rect x="-10" y="66" width="140" height="14" fillOpacity="0.4" />
            </>
          )}
          {variant === 2 && (
            <>
              <path d="M0 120 L60 10 L120 120 Z" />
              <path d="M0 120 L35 55 L70 120 Z" fillOpacity="0.35" />
            </>
          )}
          {variant === 3 && (
            <>
              {/* Arches, after the limestone balconies. */}
              <path d="M10 120 V60 a25 25 0 0 1 50 0 V120 Z" />
              <path d="M66 120 V78 a20 20 0 0 1 40 0 V120 Z" fillOpacity="0.4" />
            </>
          )}
        </g>
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-display text-5xl font-semibold text-white/85"
        style={{ textShadow: "0 2px 12px rgba(0,0,0,0.35)" }}
      >
        {initial}
      </span>
    </div>
  );
}
