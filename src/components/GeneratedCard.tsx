/**
 * Deterministic artwork for a restaurant with no photograph.
 *
 * Letterboxd gets its whole visual identity free from film posters. Restaurants
 * have no canonical image, and this is where clones of the idea end up looking
 * like a spreadsheet.
 *
 * So every restaurant gets a stable identity anyway: the pattern comes from the
 * cuisine, the palette and rotation from the name. Same restaurant, same card,
 * every time, with no network request — and two pizzerias look related without
 * looking identical.
 */

/** Muted, plaster-and-pigment tones. Nothing here competes with a real photo. */
const PALETTES = [
  ["#153b63", "#2f628f"], // Mediterranean navy
  ["#5a4632", "#8a6d4b"], // baked earth
  ["#61754a", "#88a06b"], // olive grove
  ["#7a3b30", "#b45a45"], // terracotta
  ["#3c4a56", "#63757f"], // harbour slate
  ["#6b5578", "#94799f"], // bougainvillea
];

/** Each family of cuisine gets its own motif, so the pattern carries meaning. */
type Motif = "arches" | "waves" | "grain" | "vine" | "tiles" | "rays";

const CUISINE_MOTIFS: [RegExp, Motif][] = [
  [/seafood|fish|sushi/, "waves"],
  [/pizza|italian|pasta|bakery|ftira|pastizzi|bread/, "grain"],
  [/wine|bar|tapas|cheese/, "vine"],
  [/maltese|rabbit|traditional|farm/, "arches"],
  [/cafe|coffee|cake|pastr|ice ?cream|dessert/, "rays"],
];

function motifFor(cuisines: string[]): Motif {
  const joined = cuisines.join(" ").toLowerCase();
  for (const [pattern, motif] of CUISINE_MOTIFS) {
    if (pattern.test(joined)) return motif;
  }
  return "tiles";
}

/** FNV-1a: stable across runs, unlike hashing by object identity. */
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
  cuisines = [],
  className = "",
  showInitial = true,
}: {
  name: string;
  cuisines?: string[];
  className?: string;
  showInitial?: boolean;
}) {
  const h = hash(name);
  const [base, light] = PALETTES[h % PALETTES.length];
  const motif = motifFor(cuisines);
  const rotation = (h % 3) * 12 - 12;

  // Maltese articles are not the identifying letter: Ta' Kris reads as K.
  const initial =
    name.replace(/^(the|il-|is-|ir-|ta'|tal-|tas-|l-|id-)\s*/i, "").charAt(0) ||
    name.charAt(0);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: base }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 120 120"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <g fill={light} fillOpacity="0.5" transform={`rotate(${rotation} 60 60)`}>
          {motif === "arches" && (
            <>
              <path d="M8 120V64a26 26 0 0 1 52 0v56Z" />
              <path d="M66 120V80a20 20 0 0 1 40 0v40Z" fillOpacity="0.32" />
            </>
          )}
          {motif === "waves" && (
            <>
              <path d="M-10 74c20-14 40 14 60 0s40-14 60 0v56h-120Z" />
              <path
                d="M-10 96c20-14 40 14 60 0s40-14 60 0v34h-120Z"
                fillOpacity="0.34"
              />
            </>
          )}
          {motif === "grain" && (
            <>
              <circle cx="34" cy="40" r="26" />
              <circle cx="86" cy="84" r="34" fillOpacity="0.3" />
            </>
          )}
          {motif === "vine" && (
            <>
              <path d="M-10 30h140v16h-140Z" />
              <path d="M-10 68h140v10h-140Z" fillOpacity="0.4" />
              <path d="M-10 92h140v6h-140Z" fillOpacity="0.28" />
            </>
          )}
          {motif === "tiles" && (
            <>
              <rect x="-6" y="-6" width="46" height="46" />
              <rect x="66" y="66" width="60" height="60" fillOpacity="0.3" />
              <rect x="66" y="-6" width="46" height="46" fillOpacity="0.18" />
            </>
          )}
          {motif === "rays" && (
            <>
              <path d="M60 60 120 0v120Z" />
              <path d="M60 60 0 12v96Z" fillOpacity="0.3" />
            </>
          )}
        </g>
      </svg>

      {showInitial && (
        <span className="display absolute inset-0 flex items-center justify-center text-[2.75rem] text-white/80">
          {initial}
        </span>
      )}
    </div>
  );
}
