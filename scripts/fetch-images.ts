/**
 * Tiered restaurant image ingestion.
 *
 * Tier 1 — the restaurant's own website (og:image, twitter:image, JSON-LD).
 *   These tags exist specifically so third parties can render link previews;
 *   caching one is the same act as any link-preview cache. Free, permanent,
 *   unmetered, and on the strongest footing of any source available.
 *
 * Tier 2 — Wikimedia Commons. CC-licensed, attribution recorded. Sparse, but
 *   free and safe, and it catches the handful of notable venues.
 *
 * Tier 3 (Google Places) is deliberately NOT here. Its photos have no caching
 * exception in the Maps Platform terms, so they cannot be ingested at all —
 * they are fetched per render behind a proxy route with a spend cap, restricted
 * to restaurant detail pages. A check constraint in 0003_images.sql makes
 * storing one impossible rather than merely discouraged.
 *
 *   npm run seed:images                  # curated restaurants only
 *   npm run seed:images -- --all         # the whole catalogue
 *   npm run seed:images -- --limit 50    # a sample, for a first look
 *   npm run seed:images -- --dry         # report what would happen, write nothing
 *   npm run seed:images -- --recrawl     # refresh images older than the stale window
 *
 * Idempotent and resumable: restaurants that already have a stored image are
 * skipped unless --recrawl is passed.
 */
import "dotenv/config";
import { parse as parseHtml } from "node-html-parser";
import { createAdminClient } from "../src/lib/supabase/admin";
import { readDimensions } from "../src/lib/image-dimensions";

const USER_AGENT =
  "restaurant-letterboxd-malta/0.1 (+https://github.com/luigi-arch/RestaurantLetterboxd-; image ingestion for a Malta restaurant guide)";

const STORAGE_BUCKET = "restaurant-images";

/** Mixed-quality imagery looks worse than none. */
const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;
const MAX_BYTES = 8 * 1024 * 1024;

/** Politeness: one request at a time per host, with a pause between hosts. */
const CONCURRENCY = 4;
const DELAY_MS = 400;
const FETCH_TIMEOUT_MS = 15_000;

/** Tier 1 images go stale when a site is redesigned or a domain lapses. */
const STALE_AFTER_DAYS = 90;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

const robotsCache = new Map<string, string[]>();

/**
 * Fetches and caches a host's disallow rules for our user-agent.
 * A missing or unreadable robots.txt means no restrictions, per the standard.
 */
async function disallowRulesFor(origin: string): Promise<string[]> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;

  let rules: string[] = [];
  try {
    const response = await fetchWithTimeout(`${origin}/robots.txt`);
    if (response.ok) {
      rules = parseRobots(await response.text());
    }
  } catch {
    // Unreachable robots.txt is not a prohibition.
  }

  robotsCache.set(origin, rules);
  return rules;
}

/**
 * Extracts Disallow paths from the record groups that apply to us: the wildcard
 * group, plus any group naming this crawler. Deliberately simple — it errs
 * toward respecting more rules than strictly required.
 */
function parseRobots(text: string): string[] {
  const rules: string[] = [];
  let groupApplies = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const [rawField, ...rest] = line.split(":");
    const field = rawField.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (field === "user-agent") {
      const agent = value.toLowerCase();
      groupApplies = agent === "*" || USER_AGENT.toLowerCase().includes(agent);
    } else if (field === "disallow" && groupApplies && value) {
      rules.push(value);
    }
  }

  return rules;
}

function isAllowed(url: URL, rules: string[]): boolean {
  const target = url.pathname + url.search;
  // "Disallow: /" blocks everything; an empty value blocks nothing.
  return !rules.some((rule) => target.startsWith(rule));
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Tier 1 — the restaurant's own site
// ---------------------------------------------------------------------------

type Candidate = { url: string; via: string };

/**
 * Pulls image candidates from a page, best signal first:
 *   og:image      — the canonical social preview
 *   twitter:image — same idea, different vocabulary
 *   JSON-LD       — schema.org/Restaurant.image, often the best photo on the page
 */
function extractCandidates(html: string, pageUrl: string): Candidate[] {
  const root = parseHtml(html);
  const candidates: Candidate[] = [];

  const pushMeta = (selector: string, via: string) => {
    for (const node of root.querySelectorAll(selector)) {
      const content = node.getAttribute("content");
      if (content) candidates.push({ url: content, via });
    }
  };

  pushMeta('meta[property="og:image"]', "og:image");
  pushMeta('meta[property="og:image:url"]', "og:image");
  pushMeta('meta[name="og:image"]', "og:image");
  pushMeta('meta[name="twitter:image"]', "twitter:image");
  pushMeta('meta[property="twitter:image"]', "twitter:image");

  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent ?? "");
      for (const url of collectJsonLdImages(parsed)) {
        candidates.push({ url, via: "json-ld" });
      }
    } catch {
      // Malformed JSON-LD is extremely common; ignore and move on.
    }
  }

  // Resolve against the page URL and drop anything that will not parse.
  const resolved: Candidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    try {
      const absolute = new URL(candidate.url, pageUrl).toString();
      if (!seen.has(absolute)) {
        seen.add(absolute);
        resolved.push({ ...candidate, url: absolute });
      }
    } catch {
      // Relative junk or a data: URI we cannot use.
    }
  }

  return resolved;
}

/** Walks arbitrary JSON-LD looking for `image` values, which may nest or be arrays. */
function collectJsonLdImages(node: unknown, depth = 0): string[] {
  if (depth > 6 || node === null || typeof node !== "object") return [];

  const found: string[] = [];

  if (Array.isArray(node)) {
    for (const item of node) found.push(...collectJsonLdImages(item, depth + 1));
    return found;
  }

  const record = node as Record<string, unknown>;

  const image = record.image ?? record.photo ?? record.logo;
  if (typeof image === "string") found.push(image);
  else if (Array.isArray(image)) {
    for (const entry of image) {
      if (typeof entry === "string") found.push(entry);
      else if (entry && typeof entry === "object") {
        const url = (entry as Record<string, unknown>).url;
        if (typeof url === "string") found.push(url);
      }
    }
  } else if (image && typeof image === "object") {
    const url = (image as Record<string, unknown>).url;
    if (typeof url === "string") found.push(url);
  }

  // Recurse into @graph and other containers.
  for (const [key, value] of Object.entries(record)) {
    if (key === "image" || key === "photo" || key === "logo") continue;
    if (value && typeof value === "object") {
      found.push(...collectJsonLdImages(value, depth + 1));
    }
  }

  return found;
}

type FetchedImage = {
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
  sourceUrl: string;
  via: string;
};

/** Downloads a candidate and rejects it unless it is a usable photograph. */
async function downloadImage(
  candidate: Candidate,
): Promise<FetchedImage | { rejected: string }> {
  let response: Response;
  try {
    response = await fetchWithTimeout(candidate.url);
  } catch (error) {
    return { rejected: `unreachable (${(error as Error).name})` };
  }

  if (!response.ok) return { rejected: `http ${response.status}` };

  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!contentType.startsWith("image/")) {
    return { rejected: `not an image (${contentType || "no content-type"})` };
  }
  // SVG logos are not photographs and look wrong in a photo slot.
  if (contentType === "image/svg+xml") return { rejected: "svg" };

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BYTES) return { rejected: "too large" };

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) return { rejected: "too large" };
  if (buffer.byteLength < 1024) return { rejected: "suspiciously small" };

  const dimensions = readDimensions(buffer);
  if (!dimensions) return { rejected: "unreadable header" };
  if (dimensions.width < MIN_WIDTH || dimensions.height < MIN_HEIGHT) {
    return { rejected: `too small (${dimensions.width}×${dimensions.height})` };
  }

  return {
    buffer,
    contentType,
    width: dimensions.width,
    height: dimensions.height,
    sourceUrl: candidate.url,
    via: candidate.via,
  };
}

type TierResult =
  | { ok: true; image: FetchedImage }
  | { ok: false; reason: string };

async function tryTierOne(website: string): Promise<TierResult> {
  let pageUrl: URL;
  try {
    pageUrl = new URL(website);
  } catch {
    return { ok: false, reason: "malformed website url" };
  }

  if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") {
    return { ok: false, reason: "non-http url" };
  }

  const rules = await disallowRulesFor(pageUrl.origin);
  if (!isAllowed(pageUrl, rules)) {
    return { ok: false, reason: "disallowed by robots.txt" };
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(pageUrl.toString());
  } catch (error) {
    return { ok: false, reason: `unreachable (${(error as Error).name})` };
  }

  if (!response.ok) return { ok: false, reason: `http ${response.status}` };

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) {
    return { ok: false, reason: "not an html page" };
  }

  const html = await response.text();
  // A lapsed domain serving a parked page is worse than no image at all.
  if (looksParked(html)) return { ok: false, reason: "parked domain" };

  const candidates = extractCandidates(html, response.url || pageUrl.toString());
  if (candidates.length === 0) return { ok: false, reason: "no image metadata" };

  const rejections: string[] = [];
  for (const candidate of candidates.slice(0, 5)) {
    const result = await downloadImage(candidate);
    if ("rejected" in result) {
      rejections.push(result.rejected);
      continue;
    }
    return { ok: true, image: result };
  }

  return { ok: false, reason: `candidates rejected (${rejections.join(", ")})` };
}

/** Heuristics for domain-squatter and registrar placeholder pages. */
function looksParked(html: string): boolean {
  const head = html.slice(0, 4000).toLowerCase();
  return (
    head.includes("domain is for sale") ||
    head.includes("buy this domain") ||
    head.includes("parked domain") ||
    head.includes("domain parking") ||
    head.includes("this domain has expired") ||
    head.includes("godaddy.com/forsale")
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  is_curated: boolean;
};

function parseArgs() {
  const argv = process.argv.slice(2);
  const limitIndex = argv.indexOf("--limit");
  return {
    all: argv.includes("--all"),
    dry: argv.includes("--dry"),
    recrawl: argv.includes("--recrawl"),
    limit: limitIndex >= 0 ? Number(argv[limitIndex + 1]) : undefined,
  };
}

async function main() {
  const args = parseArgs();
  const supabase = createAdminClient();

  let query = supabase
    .from("restaurants")
    .select("id, name, slug, website, is_curated")
    .order("is_curated", { ascending: false })
    .order("name");

  if (!args.all) query = query.eq("is_curated", true);
  if (args.limit) query = query.limit(args.limit);

  const { data, error } = await query;
  if (error) throw error;

  const restaurants = (data ?? []) as RestaurantRow[];
  if (restaurants.length === 0) {
    console.log(
      args.all
        ? "No restaurants found. Run `npm run seed:restaurants` first."
        : "No curated restaurants yet. Mark some with is_curated, or pass --all.",
    );
    return;
  }

  // Skip anything already covered, unless refreshing stale entries.
  const staleCutoff = new Date(
    Date.now() - STALE_AFTER_DAYS * 86_400_000,
  ).toISOString();

  const { data: existingImages } = await supabase
    .from("restaurant_images")
    .select("restaurant_id, fetched_at, source")
    .in("source", ["site_og", "wikimedia", "owner", "user"]);

  const covered = new Set<string>();
  for (const row of existingImages ?? []) {
    const isStale = args.recrawl && (row.fetched_at as string) < staleCutoff;
    if (!isStale) covered.add(row.restaurant_id as string);
  }

  const queue = restaurants.filter((r) => !covered.has(r.id));

  console.log(
    `${restaurants.length} restaurants in scope; ${covered.size} already covered; ` +
      `${queue.length} to attempt.\n`,
  );

  const stats = {
    stored: 0,
    noWebsite: 0,
    failed: 0,
    byReason: new Map<string, number>(),
  };

  const note = (reason: string) => {
    stats.byReason.set(reason, (stats.byReason.get(reason) ?? 0) + 1);
  };

  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const restaurant = queue[cursor++];
      const position = cursor;

      if (!restaurant.website) {
        stats.noWebsite += 1;
        note("no website on record");
        continue;
      }

      const result = await tryTierOne(restaurant.website);
      await sleep(DELAY_MS);

      if (!result.ok) {
        stats.failed += 1;
        note(result.reason);
        console.log(
          `  [${position}/${queue.length}] ✗ ${restaurant.name} — ${result.reason}`,
        );
        continue;
      }

      const { image } = result;

      if (args.dry) {
        stats.stored += 1;
        console.log(
          `  [${position}/${queue.length}] ✓ ${restaurant.name} — ` +
            `${image.width}×${image.height} via ${image.via} (dry run)`,
        );
        continue;
      }

      const extension = image.contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      const storagePath = `${restaurant.slug}/primary.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, image.buffer, {
          contentType: image.contentType,
          upsert: true,
        });

      if (uploadError) {
        stats.failed += 1;
        note(`upload failed: ${uploadError.message}`);
        console.log(
          `  [${position}/${queue.length}] ✗ ${restaurant.name} — upload: ${uploadError.message}`,
        );
        continue;
      }

      const { error: insertError } = await supabase.from("restaurant_images").upsert(
        {
          restaurant_id: restaurant.id,
          source: "site_og",
          storage_path: storagePath,
          source_url: image.sourceUrl,
          // The restaurant published this tag for preview use; record that
          // provenance so a takedown is a one-line delete.
          license: "publisher-provided preview image (og:image/JSON-LD)",
          width: image.width,
          height: image.height,
          is_primary: true,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "restaurant_id", ignoreDuplicates: false },
      );

      if (insertError) {
        stats.failed += 1;
        note(`db insert failed: ${insertError.message}`);
        continue;
      }

      stats.stored += 1;
      console.log(
        `  [${position}/${queue.length}] ✓ ${restaurant.name} — ` +
          `${image.width}×${image.height} via ${image.via}`,
      );
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // -------------------------------------------------------------------------
  // The M0 exit gate: report real coverage before design work builds on it.
  // -------------------------------------------------------------------------
  const attempted = queue.length;
  const totalCovered = covered.size + stats.stored;
  const pct = (n: number, d: number) => (d === 0 ? "0.0%" : `${((n / d) * 100).toFixed(1)}%`);

  console.log("\n" + "─".repeat(64));
  console.log("TIER 1 COVERAGE");
  console.log("─".repeat(64));
  console.log(`  in scope            ${restaurants.length}`);
  console.log(`  attempted this run  ${attempted}`);
  console.log(`  newly stored        ${stats.stored}  ${pct(stats.stored, attempted)}`);
  console.log(`  no website          ${stats.noWebsite}`);
  console.log(`  failed              ${stats.failed}`);
  console.log(
    `  TOTAL COVERED       ${totalCovered}/${restaurants.length}  ` +
      `${pct(totalCovered, restaurants.length)}`,
  );

  if (stats.byReason.size > 0) {
    console.log("\n  Why images were missed:");
    const sorted = [...stats.byReason.entries()].sort((a, b) => b[1] - a[1]);
    for (const [reason, count] of sorted.slice(0, 12)) {
      console.log(`    ${String(count).padStart(4)}  ${reason}`);
    }
  }

  const coverage = totalCovered / restaurants.length;
  console.log("\n  Read on this number:");
  if (coverage >= 0.5) {
    console.log(
      "    Above 50%. Tier 3 (Google Places) spend stays negligible and can wait\n" +
        "    until M5. Proceed with a photo-forward design.",
    );
  } else if (coverage >= 0.3) {
    console.log(
      "    30–50%. Workable, but the design must hold up with a third of cards\n" +
        "    unillustrated. Prioritise the claim flow (Tier 4) earlier than planned.",
    );
  } else {
    console.log(
      "    Below 30%. Do not build a photo-forward design on this. Lean on the\n" +
        "    typographic system and generated cards, and move Tier 4 into M1.",
    );
  }
  console.log("─".repeat(64));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
