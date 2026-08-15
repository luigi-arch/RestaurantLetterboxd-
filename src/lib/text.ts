/**
 * Text normalisation, mirroring the SQL `mt_normalize` in 0001_core.sql.
 *
 * Maltese uses ħ ġ ż ċ and nobody types them on a phone keyboard. Searching for
 * "ghajnsielem" must find Għajnsielem, and "Hamrun" must find Ħamrun. Keep this
 * in step with the SQL function — a mismatch means the client and the index
 * disagree about what matches, which shows up as search silently missing rows.
 * src/lib/text.test.ts pins the shared cases.
 */

/**
 * Maltese letters that Unicode decomposition will NOT fold, because the stroke
 * and dot are part of the base character rather than combining marks.
 */
const MALTESE_FOLDING: Record<string, string> = {
  "ħ": "h",
  "Ħ": "h",
  "ġ": "g",
  "Ġ": "g",
  "ż": "z",
  "Ż": "z",
  "ċ": "c",
  "Ċ": "c",
};

/** Unicode combining diacritical marks — what NFD leaves behind. */
const COMBINING_MARKS = /[̀-ͯ]/g;

export function normalize(input: string): string {
  return input
    .replace(/[ħĦġĠżŻċĊ]/g, (ch) => MALTESE_FOLDING[ch] ?? ch)
    // Decompose, then drop the marks: à → a, é → e, ô → o.
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase();
}

/** URL-safe slug: normalised, non-alphanumerics collapsed to single hyphens. */
export function slugify(input: string): string {
  const slug = normalize(input)
    // Apostrophes vanish rather than becoming hyphens: Ta' Marija → ta-marija,
    // not ta--marija.
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "restaurant";
}

/**
 * Makes `base` unique against `taken`, appending a discriminator. Mutates
 * `taken` so it can be threaded through a loop.
 */
export function uniqueSlug(
  base: string,
  taken: Set<string>,
  discriminator?: string,
): string {
  // Prefer a meaningful suffix ("ta-marija-mosta") over a numeric one.
  const candidates = discriminator
    ? [base, `${base}-${slugify(discriminator)}`]
    : [base];

  for (const candidate of candidates) {
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }

  const seed = candidates[candidates.length - 1];
  let n = 2;
  while (taken.has(`${seed}-${n}`)) n += 1;
  const result = `${seed}-${n}`;
  taken.add(result);
  return result;
}
