# Demo data

Synthetic diners, visits and images, so the product can be looked at before real
people have used it. Everything here is designed to be removed in one pass.

## What is in the database

| Thing | Marker | Count |
|---|---|---|
| Demo diners | `auth.users.id` begins `dededede-` | 24 |
| Their visits | belong to those users | ~500 |
| Your demo visits | `note = '· demo ·'` on your own account | 23 |
| Placeholder images | `rl_restaurant_images.source = 'demo'` | 52 |

Your own genuinely logged visit is **not** marked and is not touched by the
purge below.

## Removing all of it

```sql
-- Placeholder images
delete from rl_restaurant_images where source = 'demo';

-- Demo visits on your own account, keeping anything you logged for real
delete from rl_visits
where user_id = (select id from rl_profiles where username = 'luigi')
  and note = '· demo ·';

-- Demo diners; their visits, wishlist rows and profiles cascade
delete from auth.users where id::text like 'dededede-%';

-- Recompute, or every restaurant keeps its phantom rating
select rl_refresh_restaurant_stats();
```

## How the numbers were generated

Not random. Random ratings produce a uniform smear where every restaurant lands
at the mean, which looks obviously fake and — worse — hides whether the scoring
actually works.

Instead each restaurant has a latent quality derived from its price band plus a
stable per-name offset, and each diner has a generosity bias. A rating is
`quality + bias + noise`, so fine dining tends to rate well, Karl marks everyone
down, and the leaderboard has a defensible order.

Repeat visits are drawn from the higher-rated half, which is the correlation the
return-rate metric claims exists. `would_return` is derived from the rating but
deliberately not identical: a perfectly decent meal you cannot be bothered to
repeat is a real thing, and so is a soft spot for a flawed place.

## What this exposed

The first pass used a Bayesian prior weight of 5 and produced ratings spanning
**3.5 to 4.0** — the whole catalogue flattened into half a star.

That was not a data problem. At Malta's scale most restaurants will sit at three
to eight diners for months, and a prior that heavy dominates until far more
people have logged. It would have shipped a leaderboard where nothing was
distinguishable from anything else.

The prior is now 3, in both `src/lib/scoring.ts` and
`rl_scoring_prior_weight()`. The same data now spans 3.0 to 4.5.

## Images

`loremflickr` URLs, keyword-matched to cuisine and deterministic per restaurant,
so a given place always shows the same photograph. They are stock photography of
*a* restaurant, never the real one, and the UI labels them as such — an
unlabelled generic shot on a real restaurant's page is a small lie, and the kind
that undermines trust in the ratings beside it.

They are stored as `source = 'demo'` with a remote `source_url` and no
`storage_path`, which keeps the provenance rules honest. The Google Places
constraint is untouched: those photos still may never be stored at all.
