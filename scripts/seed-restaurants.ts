/**
 * Seeds the restaurant catalogue from OpenStreetMap via the Overpass API.
 *
 * OSM is the right source for a bootstrap: free, complete enough, and legally
 * clean under ODbL — which requires visible attribution, hence the footer credit.
 * Google Places is not an option here because its terms forbid storing and
 * redisplaying place data.
 *
 * Expect ~1,500–2,500 rows of mixed quality. This script gets them in and
 * roughly right; the manual curation pass over the ~400 that matter is what
 * makes search actually usable, and is the highest-leverage day of work in the
 * project. A search box that cannot find Nenu the Artisan Baker kills the
 * first session.
 *
 *   npm run seed:restaurants           # fetches, caches, writes
 *   npm run seed:restaurants -- --dry  # fetch and report, write nothing
 *
 * The raw Overpass response is cached to data/osm-raw.json so repeat runs do not
 * hammer a free community service. Delete that file to force a refetch.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { ACTIVE_MARKET, type Market } from "../src/config/market";
import { createAdminClient } from "../src/lib/supabase/admin";
import { normalize, slugify, uniqueSlug } from "../src/lib/text";

const CACHE_PATH = path.join(process.cwd(), "data", "osm-raw.json");

// Community-run mirrors. Tried in order; these are free services, so we ask once
// and cache the answer.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/**
 * Venue types that count as "eating out". Deliberately excludes fast_food
 * chains' delivery-only kitchens and bare `bar` entries with no food, which are
 * filtered further below.
 */
const AMENITIES = ["restaurant", "cafe", "fast_food", "bar", "pub", "ice_cream"];

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = { elements: OverpassElement[] };

function buildQuery(market: Market): string {
  const [west, south, east, north] = market.bounds;
  const bbox = `${south},${west},${north},${east}`;
  const clauses = AMENITIES.flatMap((amenity) => [
    `node["amenity"="${amenity}"](${bbox});`,
    `way["amenity"="${amenity}"](${bbox});`,
  ]).join("\n  ");

  return `[out:json][timeout:180];\n(\n  ${clauses}\n);\nout center tags;`;
}

async function fetchFromOverpass(market: Market): Promise<OverpassResponse> {
  const query = buildQuery(market);
  let lastError: unknown;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`Querying ${endpoint} …`);
      const response = await fetch(endpoint, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        headers: {
          // Overpass asks for a contactable UA. Be honest about who we are.
          "User-Agent": "restaurant-letterboxd-malta/0.1 (seed script)",
        },
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return (await response.json()) as OverpassResponse;
    } catch (error) {
      console.warn(`  failed: ${(error as Error).message}`);
      lastError = error;
    }
  }

  throw new Error(
    `All Overpass endpoints failed. Last error: ${(lastError as Error)?.message}. ` +
      `If your network blocks Overpass, run this script somewhere it is reachable ` +
      `and commit the resulting data/osm-raw.json.`,
  );
}

async function loadElements(market: Market): Promise<OverpassElement[]> {
  try {
    const cached = await readFile(CACHE_PATH, "utf8");
    const parsed = JSON.parse(cached) as OverpassResponse;
    console.log(`Using cached Overpass response (${parsed.elements.length} elements).`);
    console.log(`Delete ${path.relative(process.cwd(), CACHE_PATH)} to refetch.`);
    return parsed.elements;
  } catch {
    // No usable cache — go to the network.
  }

  const response = await fetchFromOverpass(market);
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(response, null, 2));
  console.log(`Fetched ${response.elements.length} elements and cached them.`);
  return response.elements;
}

type StagedRestaurant = {
  osm_id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  cuisines: string[];
  phone: string | null;
  website: string | null;
  /** OSM's addr:city, used to match a locality by name before falling back to geometry. */
  addrCity: string | null;
  price_band: number | null;
};

/** OSM cuisine tags are semicolon-delimited and inconsistently cased. */
function parseCuisines(tags: Record<string, string>): string[] {
  const raw = tags.cuisine ?? "";
  return raw
    .split(";")
    .map((c) => c.trim().toLowerCase().replace(/_/g, " "))
    .filter(Boolean);
}

function parsePriceBand(tags: Record<string, string>): number | null {
  // OSM has no consistent price field. `amenity=fast_food` is a reliable floor;
  // everything else is left null for the curation pass rather than invented.
  if (tags.amenity === "fast_food" || tags.amenity === "ice_cream") return 1;
  return null;
}

function normaliseElement(element: OverpassElement): StagedRestaurant | null {
  const tags = element.tags ?? {};
  const name = (tags.name ?? tags["name:en"] ?? tags["name:mt"] ?? "").trim();

  // An unnamed venue is unsearchable and unloggable — skip rather than import
  // noise that makes the catalogue feel broken.
  if (!name) return null;

  // Bars and pubs only count when they actually serve food.
  if ((tags.amenity === "bar" || tags.amenity === "pub") && tags.food === "no") {
    return null;
  }

  // Delivery-only kitchens are not places you can go and eat.
  if (tags.delivery === "only" || tags["takeaway"] === "only") return null;

  const lat = element.lat ?? element.center?.lat ?? null;
  const lng = element.lon ?? element.center?.lon ?? null;

  return {
    osm_id: `${element.type}/${element.id}`,
    name,
    lat,
    lng,
    cuisines: parseCuisines(tags),
    phone: tags.phone ?? tags["contact:phone"] ?? null,
    website: tags.website ?? tags["contact:website"] ?? null,
    addrCity: tags["addr:city"] ?? null,
    price_band: parsePriceBand(tags),
  };
}

type Locality = {
  id: string;
  name: string;
  aliases: string[];
  lat: number | null;
  lng: number | null;
};

/** Builds a lookup from every normalised name and alias to a locality id. */
function buildLocalityIndex(localities: Locality[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const locality of localities) {
    index.set(normalize(locality.name), locality.id);
    for (const alias of locality.aliases ?? []) {
      // Real names win over aliases on collision (Rabat Malta vs Rabat Gozo).
      if (!index.has(normalize(alias))) index.set(normalize(alias), locality.id);
    }
  }
  return index;
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function main() {
  const dryRun = process.argv.includes("--dry");
  const market = ACTIVE_MARKET;

  const elements = await loadElements(market);

  const staged = elements
    .map(normaliseElement)
    .filter((r): r is StagedRestaurant => r !== null);

  // OSM sometimes carries both a node and a way for the same venue.
  const byIdentity = new Map<string, StagedRestaurant>();
  for (const restaurant of staged) {
    const key = `${normalize(restaurant.name)}|${restaurant.lat?.toFixed(4)}|${restaurant.lng?.toFixed(4)}`;
    if (!byIdentity.has(key)) byIdentity.set(key, restaurant);
  }
  const deduped = [...byIdentity.values()];

  console.log(
    `\n${elements.length} elements → ${staged.length} named venues → ${deduped.length} after dedupe.`,
  );

  const supabase = createAdminClient();

  const { data: localityRows, error: localityError } = await supabase
    .from("localities")
    .select("id, name, aliases, lat, lng")
    .eq("region", market.key);

  if (localityError) throw localityError;
  if (!localityRows?.length) {
    throw new Error("No localities found. Run `npm run seed:localities` first.");
  }

  const localities = localityRows as Locality[];
  const localityIndex = buildLocalityIndex(localities);

  // ---------------------------------------------------------------------
  // Pass 1 — assign a locality from OSM's addr:city tag.
  // ---------------------------------------------------------------------
  const assignments = new Map<string, string>();
  for (const restaurant of deduped) {
    if (!restaurant.addrCity) continue;
    const id = localityIndex.get(normalize(restaurant.addrCity));
    if (id) assignments.set(restaurant.osm_id, id);
  }

  console.log(`Pass 1: ${assignments.size} assigned a locality by addr:city.`);

  // ---------------------------------------------------------------------
  // Pass 2 — derive each locality's centroid from the venues just assigned.
  // More accurate than guessing coordinates, and self-correcting as OSM improves.
  // ---------------------------------------------------------------------
  const centroidAccumulator = new Map<string, { lat: number; lng: number; n: number }>();
  for (const restaurant of deduped) {
    const localityId = assignments.get(restaurant.osm_id);
    if (!localityId || restaurant.lat === null || restaurant.lng === null) continue;
    const acc = centroidAccumulator.get(localityId) ?? { lat: 0, lng: 0, n: 0 };
    acc.lat += restaurant.lat;
    acc.lng += restaurant.lng;
    acc.n += 1;
    centroidAccumulator.set(localityId, acc);
  }

  const centroids = new Map<string, { lat: number; lng: number }>();
  for (const [localityId, acc] of centroidAccumulator) {
    if (acc.n >= 3) {
      centroids.set(localityId, { lat: acc.lat / acc.n, lng: acc.lng / acc.n });
    }
  }
  // Keep any centroid a previous run already established.
  for (const locality of localities) {
    if (!centroids.has(locality.id) && locality.lat !== null && locality.lng !== null) {
      centroids.set(locality.id, { lat: locality.lat, lng: locality.lng });
    }
  }

  console.log(`Pass 2: derived ${centroids.size} locality centroids.`);

  // ---------------------------------------------------------------------
  // Pass 3 — assign the rest by nearest centroid.
  // ---------------------------------------------------------------------
  let byProximity = 0;
  for (const restaurant of deduped) {
    if (assignments.has(restaurant.osm_id)) continue;
    if (restaurant.lat === null || restaurant.lng === null) continue;

    let best: { id: string; km: number } | null = null;
    for (const [localityId, centroid] of centroids) {
      const km = haversineKm(
        { lat: restaurant.lat, lng: restaurant.lng },
        centroid,
      );
      if (!best || km < best.km) best = { id: localityId, km };
    }
    // Malta is 27km end to end; anything further than 5km from every centroid is
    // more likely bad data than a real venue, so leave it unassigned for review.
    if (best && best.km <= 5) {
      assignments.set(restaurant.osm_id, best.id);
      byProximity += 1;
    }
  }

  console.log(`Pass 3: ${byProximity} more assigned by proximity.`);
  console.log(
    `Unassigned: ${deduped.length - assignments.size} (kept, flagged for review).`,
  );

  // ---------------------------------------------------------------------
  // Slugs — stable and human-readable, disambiguated by locality.
  // ---------------------------------------------------------------------
  const { data: existing } = await supabase.from("restaurants").select("slug, osm_id");
  const takenSlugs = new Set((existing ?? []).map((r) => r.slug as string));
  // A restaurant keeps the slug it already has: links must not rot between runs.
  const slugByOsmId = new Map(
    (existing ?? [])
      .filter((r) => r.osm_id)
      .map((r) => [r.osm_id as string, r.slug as string]),
  );

  const localityNameById = new Map(localities.map((l) => [l.id, l.name]));

  const rows = deduped.map((restaurant) => {
    const localityId = assignments.get(restaurant.osm_id) ?? null;
    const slug =
      slugByOsmId.get(restaurant.osm_id) ??
      uniqueSlug(
        slugify(restaurant.name),
        takenSlugs,
        localityId ? localityNameById.get(localityId) : undefined,
      );

    return {
      osm_id: restaurant.osm_id,
      slug,
      name: restaurant.name,
      locality_id: localityId,
      lat: restaurant.lat,
      lng: restaurant.lng,
      cuisines: restaurant.cuisines,
      phone: restaurant.phone,
      website: restaurant.website,
      price_band: restaurant.price_band,
      // Everything from OSM starts unverified. Curation promotes to 'open'.
      status: "unverified" as const,
    };
  });

  if (dryRun) {
    console.log("\n--dry: nothing written. Sample of what would be inserted:\n");
    console.table(
      rows.slice(0, 10).map((r) => ({
        name: r.name,
        slug: r.slug,
        locality: r.locality_id ? localityNameById.get(r.locality_id) : "—",
        cuisines: r.cuisines.join(", ") || "—",
        website: r.website ? "yes" : "—",
      })),
    );
    reportCoverage(rows);
    return;
  }

  // Upsert in batches; idempotent on osm_id so re-runs update rather than duplicate.
  const BATCH = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("restaurants")
      .upsert(batch, { onConflict: "osm_id" });
    if (error) throw error;
    written += batch.length;
    process.stdout.write(`\r  wrote ${written}/${rows.length}`);
  }
  console.log("");

  // Persist the derived centroids so the map has somewhere to point.
  for (const [localityId, centroid] of centroids) {
    await supabase
      .from("localities")
      .update({ lat: centroid.lat, lng: centroid.lng })
      .eq("id", localityId);
  }

  console.log(`\nSeeded ${rows.length} restaurants.`);
  reportCoverage(rows);
  console.log(
    "\nNext: the curation pass. Set is_curated = true and status = 'open' on the\n" +
      "~400 venues that actually matter, and correct their names by hand.",
  );
}

function reportCoverage(rows: { website: string | null; cuisines: string[]; locality_id: string | null }[]) {
  const withWebsite = rows.filter((r) => r.website).length;
  const withCuisine = rows.filter((r) => r.cuisines.length > 0).length;
  const withLocality = rows.filter((r) => r.locality_id).length;
  const pct = (n: number) => `${((n / rows.length) * 100).toFixed(1)}%`;

  console.log("\nCoverage:");
  console.log(`  locality assigned   ${withLocality}/${rows.length}  ${pct(withLocality)}`);
  console.log(`  cuisine tagged      ${withCuisine}/${rows.length}  ${pct(withCuisine)}`);
  // This one is the leading indicator for Tier 1 image coverage: no website
  // means no og:image, which means falling through to a paid or generated source.
  console.log(`  has a website       ${withWebsite}/${rows.length}  ${pct(withWebsite)}`);
  console.log(
    `\n  The website figure is the ceiling on free (Tier 1) image coverage.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
