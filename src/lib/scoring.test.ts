import { describe, expect, it } from "vitest";
import {
  computeStats,
  HALF_LIFE_MONTHS,
  monthsBetween,
  plainAverage,
  recencyWeight,
  recencyWeightedRating,
  returnRate,
  roundToHalfStar,
  wouldReturnPct,
  type ScoredVisit,
} from "./scoring";

const NOW = new Date("2026-08-15T12:00:00Z");

/** Builds a visit `monthsAgo` before NOW. */
function visit(
  userId: string,
  monthsAgo: number,
  rating: number | null,
  wouldReturn = true,
): ScoredVisit {
  const visitedOn = new Date(NOW.getTime() - monthsAgo * 30.436875 * 86_400_000);
  return { userId, visitedOn, rating, wouldReturn };
}

/** Disables shrinkage so a test can assert the raw weighted mean. */
const NO_PRIOR = { priorWeight: 0 };

describe("monthsBetween", () => {
  it("is zero for the same instant", () => {
    expect(monthsBetween(NOW, NOW)).toBe(0);
  });

  it("counts a year as twelve months", () => {
    const yearAgo = new Date(NOW.getTime() - 365.2425 * 86_400_000);
    expect(monthsBetween(yearAgo, NOW)).toBeCloseTo(12, 5);
  });

  it("is negative for future dates", () => {
    const future = new Date(NOW.getTime() + 30 * 86_400_000);
    expect(monthsBetween(future, NOW)).toBeLessThan(0);
  });
});

describe("recencyWeight", () => {
  it("weighs a visit today at 1", () => {
    expect(recencyWeight(NOW, NOW)).toBe(1);
  });

  it("halves after exactly one half-life", () => {
    const then = new Date(
      NOW.getTime() - HALF_LIFE_MONTHS * 30.436875 * 86_400_000,
    );
    expect(recencyWeight(then, NOW)).toBeCloseTo(0.5, 6);
  });

  it("quarters after two half-lives", () => {
    const then = new Date(
      NOW.getTime() - 2 * HALF_LIFE_MONTHS * 30.436875 * 86_400_000,
    );
    expect(recencyWeight(then, NOW)).toBeCloseTo(0.25, 6);
  });

  it("clamps future-dated visits to 1 rather than letting them outweigh the present", () => {
    // Guards against a mistyped year handing one visit runaway influence.
    const future = new Date(NOW.getTime() + 500 * 86_400_000);
    expect(recencyWeight(future, NOW)).toBe(1);
  });

  it("decays monotonically", () => {
    const weights = [0, 3, 6, 12, 24, 48].map((m) =>
      recencyWeight(visit("u", m, 5).visitedOn, NOW),
    );
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeLessThan(weights[i - 1]);
    }
  });
});

describe("roundToHalfStar", () => {
  it.each([
    [4.24, 4],
    [4.25, 4.5],
    [4.3, 4.5],
    [4.74, 4.5],
    [4.75, 5],
    [3, 3],
  ])("rounds %s to %s", (input, expected) => {
    expect(roundToHalfStar(input)).toBe(expected);
  });
});

describe("recencyWeightedRating", () => {
  it("returns null when nobody has rated", () => {
    // Distinct from a zero score: the UI must say "not yet rated", not "bad".
    expect(recencyWeightedRating([], NOW)).toBeNull();
    expect(
      recencyWeightedRating([visit("a", 1, null), visit("b", 2, null)], NOW),
    ).toBeNull();
  });

  it("returns the rating itself when all diners agree and it is recent", () => {
    const visits = [visit("a", 0, 4), visit("b", 0, 4), visit("c", 0, 4)];
    expect(recencyWeightedRating(visits, NOW, NO_PRIOR)).toBe(4);
  });

  it("favours recent opinion over stale opinion", () => {
    // A restaurant that was great years ago and is poor now must read as poor.
    const declined = [
      visit("a", 40, 5),
      visit("b", 38, 5),
      visit("c", 1, 2),
      visit("d", 0, 2),
    ];
    const score = recencyWeightedRating(declined, NOW, NO_PRIOR)!;
    expect(score).toBeLessThan(3);
  });

  it("lets a recovering restaurant climb back", () => {
    const recovered = [
      visit("a", 40, 1.5),
      visit("b", 38, 2),
      visit("c", 1, 5),
      visit("d", 0, 4.5),
    ];
    expect(recencyWeightedRating(recovered, NOW, NO_PRIOR)!).toBeGreaterThan(4);
  });

  it("stops one enthusiast outvoting the room", () => {
    // The owner's best friend logging twenty visits must not beat four diners.
    const manyFromOne: ScoredVisit[] = Array.from({ length: 20 }, () =>
      visit("superfan", 0, 5),
    );
    const others = [
      visit("a", 0, 2),
      visit("b", 0, 2),
      visit("c", 0, 2),
      visit("d", 0, 2),
    ];
    const score = recencyWeightedRating([...manyFromOne, ...others], NOW, NO_PRIOR)!;
    // One diner in five rating 5, four rating 2 → 2.6, not 4.5.
    expect(score).toBe(2.5);
  });

  it("shrinks a lone five-star toward the market mean", () => {
    const lone = [visit("a", 0, 5)];
    const shrunk = recencyWeightedRating(lone, NOW, {
      priorMean: 3.5,
      priorWeight: 5,
    })!;
    expect(shrunk).toBeLessThan(5);
    expect(shrunk).toBeGreaterThan(3.5);
  });

  it("lets a well-reviewed restaurant escape the prior", () => {
    const many = Array.from({ length: 60 }, (_, i) => visit(`u${i}`, 0, 5));
    const score = recencyWeightedRating(many, NOW, {
      priorMean: 3.5,
      priorWeight: 5,
    })!;
    expect(score).toBeGreaterThanOrEqual(4.5);
  });

  it("ranks fifty strong ratings above one perfect rating", () => {
    // The core ordering property that makes shrinkage worth having.
    const opts = { priorMean: 3.5, priorWeight: 5 };
    const established = Array.from({ length: 50 }, (_, i) => visit(`u${i}`, 0, 4.5));
    const newcomer = [visit("solo", 0, 5)];
    expect(recencyWeightedRating(established, NOW, opts)!).toBeGreaterThan(
      recencyWeightedRating(newcomer, NOW, opts)!,
    );
  });

  it("discounts a diner whose last visit was long ago", () => {
    const opts = NO_PRIOR;
    const stale = [visit("old", 60, 5), visit("fresh", 0, 3)];
    const bothFresh = [visit("old", 0, 5), visit("fresh", 0, 3)];
    expect(recencyWeightedRating(stale, NOW, opts)!).toBeLessThan(
      recencyWeightedRating(bothFresh, NOW, opts)!,
    );
  });

  it("ignores unrated visits without discarding the diner's other ratings", () => {
    const visits = [visit("a", 0, null), visit("a", 0, 4), visit("b", 0, 4)];
    expect(recencyWeightedRating(visits, NOW, NO_PRIOR)).toBe(4);
  });
});

describe("returnRate", () => {
  it("is zero with no visits", () => {
    expect(returnRate([])).toBe(0);
  });

  it("is zero when nobody came back", () => {
    expect(returnRate([visit("a", 0, 4), visit("b", 0, 4)])).toBe(0);
  });

  it("is one when everybody came back", () => {
    const visits = [
      visit("a", 0, 4),
      visit("a", 5, 4),
      visit("b", 0, 4),
      visit("b", 3, 4),
    ];
    expect(returnRate(visits)).toBe(1);
  });

  it("counts diners, not visits", () => {
    // Two of four diners returned, regardless of how many times.
    const visits = [
      visit("a", 0, 4),
      visit("a", 2, 4),
      visit("a", 4, 4),
      visit("b", 0, 4),
      visit("b", 2, 4),
      visit("c", 0, 4),
      visit("d", 0, 4),
    ];
    expect(returnRate(visits)).toBe(0.5);
  });

  it("counts old returns the same as recent ones", () => {
    const visits = [visit("a", 90, 4), visit("a", 80, 4)];
    expect(returnRate(visits)).toBe(1);
  });
});

describe("wouldReturnPct", () => {
  it("is null with no visits", () => {
    expect(wouldReturnPct([])).toBeNull();
  });

  it("uses each diner's most recent answer", () => {
    // Loved it twice, let down on the last visit → counts as a no.
    const disappointed = [
      visit("a", 10, 5, true),
      visit("a", 8, 5, true),
      visit("a", 0, 2, false),
    ];
    expect(wouldReturnPct(disappointed)).toBe(0);
  });

  it("counts a diner who came back around", () => {
    const wonOver = [visit("a", 10, 2, false), visit("a", 0, 5, true)];
    expect(wouldReturnPct(wonOver)).toBe(1);
  });

  it("weights every diner equally regardless of visit count", () => {
    const visits = [
      visit("a", 0, 5, true),
      visit("a", 1, 5, true),
      visit("a", 2, 5, true),
      visit("b", 0, 2, false),
    ];
    expect(wouldReturnPct(visits)).toBe(0.5);
  });
});

describe("plainAverage", () => {
  it("is null when nothing is rated", () => {
    expect(plainAverage([visit("a", 0, null)])).toBeNull();
  });

  it("ignores recency entirely", () => {
    expect(plainAverage([visit("a", 100, 5), visit("b", 0, 4)])).toBe(4.5);
  });
});

describe("computeStats", () => {
  it("reports an empty restaurant without pretending it is bad", () => {
    const stats = computeStats([], NOW);
    expect(stats).toEqual({
      recentRating: null,
      avgRating: null,
      returnRate: 0,
      wouldReturnPct: null,
      visitCount: 0,
      distinctDiners: 0,
    });
  });

  it("summarises a realistic restaurant", () => {
    const visits = [
      visit("a", 0, 4.5, true),
      visit("a", 6, 4, true),
      visit("b", 1, 4, true),
      visit("c", 2, 3, false),
      visit("d", 30, 5, true),
    ];
    const stats = computeStats(visits, NOW);

    expect(stats.visitCount).toBe(5);
    expect(stats.distinctDiners).toBe(4);
    expect(stats.returnRate).toBe(0.25); // only diner "a" came back
    expect(stats.wouldReturnPct).toBe(0.75); // "c" said no
    expect(stats.recentRating).toBeGreaterThan(3);
    expect(stats.recentRating).toBeLessThanOrEqual(5);
  });
});
