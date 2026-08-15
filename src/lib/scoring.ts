/**
 * Restaurant scoring.
 *
 * The central problem this module solves: a film is the same film forever, but a
 * restaurant changes chef and dies. A plain mean rating lets a glowing 2019
 * review defend a restaurant that has been bad since the kitchen turned over.
 *
 * Three ideas do the work:
 *
 *   1. Recency decay — a visit's influence halves every `HALF_LIFE_MONTHS`.
 *   2. Per-diner normalisation — every diner counts once, however often they log,
 *      so one enthusiast (or one owner's friend) cannot move the number.
 *   3. Bayesian shrinkage — a single five-star visit does not outrank fifty
 *      four-and-a-halfs. New restaurants start near the market mean and earn
 *      their way out of it.
 *
 * All of this is pure and unit-tested; the database calls it from a scheduled
 * refresh of `restaurant_stats`.
 */

/** A visit's influence halves after this many months. */
export const HALF_LIFE_MONTHS = 15;

/** Average days per month across a 400-year Gregorian cycle. */
const DAYS_PER_MONTH = 30.436875;
const MS_PER_DAY = 86_400_000;

/**
 * Strength of the Bayesian prior, in "virtual visits". A restaurant needs
 * roughly this many real diners before its own score dominates the market mean.
 * Deliberately weak. On an island this small most restaurants will sit at three
 * to eight diners for months, and a heavier prior flattens the whole catalogue
 * toward the mean — every place reading 3.5-4.0 and nothing distinguishable.
 */
export const PRIOR_WEIGHT = 3;

/** Fallback prior when a market mean isn't available yet (cold start). */
export const DEFAULT_PRIOR_MEAN = 3.5;

export type ScoredVisit = {
  userId: string;
  /** Date of the meal itself, not when it was logged. */
  visitedOn: Date;
  /** 0.5–5.0 in half steps. Null when the diner logged without rating. */
  rating: number | null;
  wouldReturn: boolean;
};

export type RestaurantStats = {
  /** Recency-weighted, per-diner-normalised, Bayesian-shrunk. The headline number. */
  recentRating: number | null;
  /** Plain arithmetic mean of every rating ever. Shown quietly beside the above. */
  avgRating: number | null;
  /** Share of diners who came back at least once. 0–1. */
  returnRate: number;
  /** Share of diners whose most recent visit said they'd return. 0–1. */
  wouldReturnPct: number | null;
  visitCount: number;
  distinctDiners: number;
};

/** Months between two dates, fractional. Negative if `then` is in the future. */
export function monthsBetween(then: Date, now: Date): number {
  return (now.getTime() - then.getTime()) / MS_PER_DAY / DAYS_PER_MONTH;
}

/**
 * Exponential recency weight in (0, 1]. A visit today weighs 1; a visit one
 * half-life ago weighs 0.5. Future-dated visits are clamped to 1 rather than
 * allowed to weigh more than the present — otherwise a typo'd year would let a
 * single visit dominate.
 */
export function recencyWeight(
  visitedOn: Date,
  now: Date,
  halfLifeMonths: number = HALF_LIFE_MONTHS,
): number {
  const age = monthsBetween(visitedOn, now);
  if (age <= 0) return 1;
  return Math.pow(0.5, age / halfLifeMonths);
}

/** Rounds to the nearest half star, the granularity users actually input. */
export function roundToHalfStar(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Groups visits by diner, preserving input order within each group. */
function groupByDiner(visits: readonly ScoredVisit[]): Map<string, ScoredVisit[]> {
  const byDiner = new Map<string, ScoredVisit[]>();
  for (const visit of visits) {
    const existing = byDiner.get(visit.userId);
    if (existing) existing.push(visit);
    else byDiner.set(visit.userId, [visit]);
  }
  return byDiner;
}

/**
 * One diner's opinion, condensed: their recency-weighted mean rating, plus how
 * much that opinion should count (based on how recently they last ate there).
 */
function condenseDiner(
  visits: readonly ScoredVisit[],
  now: Date,
  halfLifeMonths: number,
): { rating: number | null; weight: number } {
  let weightedSum = 0;
  let weightTotal = 0;
  let mostRecentWeight = 0;

  for (const visit of visits) {
    const weight = recencyWeight(visit.visitedOn, now, halfLifeMonths);
    if (weight > mostRecentWeight) mostRecentWeight = weight;
    if (visit.rating !== null) {
      weightedSum += visit.rating * weight;
      weightTotal += weight;
    }
  }

  return {
    rating: weightTotal > 0 ? weightedSum / weightTotal : null,
    // A diner who last ate here five years ago should barely register, even if
    // they came weekly at the time.
    weight: mostRecentWeight,
  };
}

/** The diner's latest visit by date. Undefined only for an empty list. */
function latestVisit(visits: readonly ScoredVisit[]): ScoredVisit | undefined {
  return visits.reduce<ScoredVisit | undefined>(
    (latest, v) =>
      !latest || v.visitedOn.getTime() > latest.visitedOn.getTime() ? v : latest,
    undefined,
  );
}

/**
 * Share of diners who came back at least once.
 *
 * This is the metric no one else publishes and the hardest to fake: you can buy
 * a review, but buying a second genuine visit from the same person is expensive.
 * Deliberately *not* recency-weighted — a return is a return whenever it happened.
 */
export function returnRate(visits: readonly ScoredVisit[]): number {
  const byDiner = groupByDiner(visits);
  if (byDiner.size === 0) return 0;
  let returners = 0;
  for (const dinerVisits of byDiner.values()) {
    if (dinerVisits.length >= 2) returners += 1;
  }
  return returners / byDiner.size;
}

/**
 * Share of diners whose *most recent* visit said they'd return.
 *
 * Uses the latest answer per diner rather than all answers, so someone who loved
 * a place three times and was then let down counts as a no. That last answer is
 * the honest one.
 */
export function wouldReturnPct(visits: readonly ScoredVisit[]): number | null {
  const byDiner = groupByDiner(visits);
  if (byDiner.size === 0) return null;
  let yes = 0;
  for (const dinerVisits of byDiner.values()) {
    if (latestVisit(dinerVisits)?.wouldReturn) yes += 1;
  }
  return yes / byDiner.size;
}

/**
 * Recency-weighted, per-diner-normalised rating, shrunk toward the market mean.
 *
 * Returns null when nobody has rated the restaurant — distinct from a zero score,
 * and the UI must render it as "not yet rated" rather than as bad.
 */
export function recencyWeightedRating(
  visits: readonly ScoredVisit[],
  now: Date,
  options: {
    halfLifeMonths?: number;
    priorMean?: number;
    priorWeight?: number;
  } = {},
): number | null {
  const {
    halfLifeMonths = HALF_LIFE_MONTHS,
    priorMean = DEFAULT_PRIOR_MEAN,
    priorWeight = PRIOR_WEIGHT,
  } = options;

  let weightedSum = 0;
  let weightTotal = 0;

  for (const dinerVisits of groupByDiner(visits).values()) {
    const { rating, weight } = condenseDiner(dinerVisits, now, halfLifeMonths);
    if (rating === null) continue;
    weightedSum += rating * weight;
    weightTotal += weight;
  }

  if (weightTotal === 0) return null;

  // Bayesian shrinkage toward the market mean, in units of effective diners.
  const shrunk =
    (weightedSum + priorMean * priorWeight) / (weightTotal + priorWeight);

  return roundToHalfStar(shrunk);
}

/** Plain mean of every rating ever given. Familiar, unweighted, shown secondary. */
export function plainAverage(visits: readonly ScoredVisit[]): number | null {
  const rated = visits.filter((v) => v.rating !== null);
  if (rated.length === 0) return null;
  const sum = rated.reduce((acc, v) => acc + (v.rating as number), 0);
  return roundToHalfStar(sum / rated.length);
}

/** Computes the full stats bundle for one restaurant. */
export function computeStats(
  visits: readonly ScoredVisit[],
  now: Date,
  options: { priorMean?: number; priorWeight?: number; halfLifeMonths?: number } = {},
): RestaurantStats {
  return {
    recentRating: recencyWeightedRating(visits, now, options),
    avgRating: plainAverage(visits),
    returnRate: returnRate(visits),
    wouldReturnPct: wouldReturnPct(visits),
    visitCount: visits.length,
    distinctDiners: groupByDiner(visits).size,
  };
}
