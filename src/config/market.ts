/**
 * Market configuration.
 *
 * Malta is the first market, not the only one. Everything market-specific lives
 * here so that adding Cyprus, the Balearics or Sicily is a config change plus a
 * locality seed, never a schema migration.
 *
 * Rule of thumb: if a value would be wrong in another country, it belongs in
 * this file and nowhere else.
 */

export type Market = {
  /** Stable key, also used as the `region` value on localities. */
  key: string;
  name: string;
  /** ISO 3166-1 alpha-2, used for geocoding and OSM area lookups. */
  countryCode: string;
  currency: string;
  locale: string;
  timezone: string;
  /** Map default view. */
  center: { lat: number; lng: number };
  defaultZoom: number;
  /** [west, south, east, north] — also the Overpass query bounds. */
  bounds: [number, number, number, number];
  /**
   * Rough count of venues that actually matter for dining out, as opposed to
   * every licensed food outlet. Drives the "you've eaten at 87 of N" copy.
   * Refined by hand after the curation pass.
   */
  curatedTargetCount: number;
};

export const MALTA: Market = {
  key: "malta",
  name: "Malta",
  countryCode: "MT",
  currency: "EUR",
  locale: "en-MT",
  timezone: "Europe/Malta",
  // Roughly the centre of the main island, framed to include Gozo and Comino.
  center: { lat: 35.917, lng: 14.409 },
  defaultZoom: 11,
  // Covers Malta, Gozo, Comino and territorial margin.
  bounds: [14.18, 35.78, 14.58, 36.09],
  curatedTargetCount: 400,
};

/**
 * The active market. Single source of truth for the running deployment —
 * multi-market support becomes a lookup here, not a refactor everywhere else.
 */
export const ACTIVE_MARKET: Market = MALTA;

export function formatPrice(amount: number, market: Market = ACTIVE_MARKET) {
  return new Intl.NumberFormat(market.locale, {
    style: "currency",
    currency: market.currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
