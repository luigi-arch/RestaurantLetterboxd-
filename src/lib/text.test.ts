import { describe, expect, it } from "vitest";
import { normalize, slugify, uniqueSlug } from "./text";

/**
 * These cases are duplicated in supabase/tests/01_rls_and_stats.sql against the
 * SQL `mt_normalize`. If the two implementations drift, search silently stops
 * matching rows the index contains — so they are pinned in both places.
 */
describe("normalize — parity with SQL mt_normalize", () => {
  it.each([
    ["Għajnsielem", "ghajnsielem"],
    ["Ħamrun", "hamrun"],
    ["Żebbuġ", "zebbug"],
    ["Ta' Ċenċ", "ta' cenc"],
    ["Marsaxlokk", "marsaxlokk"],
    ["Birżebbuġa", "birzebbuga"],
    ["Siġġiewi", "siggiewi"],
    ["Pietà", "pieta"],
    ["San Ġiljan", "san giljan"],
  ])("folds %s to %s", (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it("lets a plain-keyboard query match a diacritic name", () => {
    // The whole point: nobody types ħ on a phone.
    expect(normalize("Ghajnsielem")).toBe(normalize("Għajnsielem"));
    expect(normalize("Hamrun")).toBe(normalize("Ħamrun"));
    expect(normalize("Zebbug")).toBe(normalize("Żebbuġ"));
  });

  it("is idempotent", () => {
    const once = normalize("Ħaż-Żebbuġ");
    expect(normalize(once)).toBe(once);
  });
});

describe("slugify", () => {
  it.each([
    ["Ta' Marija", "ta-marija"],
    ["Nenu the Artisan Baker", "nenu-the-artisan-baker"],
    ["Ħamrun Grill", "hamrun-grill"],
    ["Rampila  —  Valletta", "rampila-valletta"],
    ["  spaced  out  ", "spaced-out"],
    ["Café del Mar", "cafe-del-mar"],
    ["is-Serkin (Crystal Palace)", "is-serkin-crystal-palace"],
  ])("slugifies %s to %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("drops apostrophes rather than turning them into hyphens", () => {
    expect(slugify("Ta' Kris")).toBe("ta-kris");
    expect(slugify("St Julian’s")).toBe("st-julians");
  });

  it("never returns an empty slug", () => {
    expect(slugify("!!!")).toBe("restaurant");
    expect(slugify("")).toBe("restaurant");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when it is free", () => {
    expect(uniqueSlug("ta-marija", new Set())).toBe("ta-marija");
  });

  it("prefers a locality suffix over a number", () => {
    // "ta-marija-mosta" reads better than "ta-marija-2" and stays stable.
    const taken = new Set(["ta-marija"]);
    expect(uniqueSlug("ta-marija", taken, "Mosta")).toBe("ta-marija-mosta");
  });

  it("falls back to a number when the locality is also taken", () => {
    const taken = new Set(["ta-marija", "ta-marija-mosta"]);
    expect(uniqueSlug("ta-marija", taken, "Mosta")).toBe("ta-marija-mosta-2");
  });

  it("records what it hands out so a loop cannot collide", () => {
    const taken = new Set<string>();
    const first = uniqueSlug("cafe-jubilee", taken, "Valletta");
    const second = uniqueSlug("cafe-jubilee", taken, "Gzira");
    const third = uniqueSlug("cafe-jubilee", taken, "Victoria");
    expect(new Set([first, second, third]).size).toBe(3);
    expect(first).toBe("cafe-jubilee");
    expect(second).toBe("cafe-jubilee-gzira");
  });

  it("normalises the discriminator too", () => {
    const taken = new Set(["il-forn"]);
    expect(uniqueSlug("il-forn", taken, "Żebbuġ")).toBe("il-forn-zebbug");
  });
});
