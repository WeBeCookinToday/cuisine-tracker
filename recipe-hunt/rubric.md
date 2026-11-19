# Recipe-hunt grading rubric

The single source of truth for how a recipe-scout judges candidates. Edit the
weights or rules here; every future scout picks them up.

## Goal

For one traditional dish, find the single best **tested, home-cookable** recipe
on the web for a cook in the United States, and back the choice with evidence
from the page itself.

## Hard rules

1. **Only URLs you found this run.** Every URL you record must come from a
   WebSearch result (or a link named on a page you read) during this task.
   Never type a URL from memory or build one from a pattern.
2. **Read before you score.** Score a candidate only after reading the recipe
   itself — `node scripts/recipe-hunt.mjs read <url>` first, WebFetch if that
   finds no structured data. Never score from a search snippet.
3. **At least 3 candidates read**, from at least 2 different sites, unless
   fewer than 3 real recipes for the dish exist.
4. **It must be the dish.** The candidate must be recognizably the dish named,
   not a fusion or "inspired by" version. A regional variant of the same dish
   is fine.
5. **No winner below 60.** If no candidate scores 60 or more, report
   `none-found` and still record the best one you saw.

## Disqualified outright

- Video-only recipes, or no ingredient amounts.
- Scraper / aggregator copies of someone else's recipe (getrecipecart,
  bigoven re-posts, cdkitchen, recipe "mirror" sites). Find the original.
- Pages that do not load (`read` reports anything other than HTTP 200).
- AI-generated content farms (generic text, no author, stock photos only).

ATK (americastestkitchen.com, cooksillustrated.com, cookscountry.com) and NYT
Cooking **are allowed**. The user can open them. Their full recipe is in the
page's structured data, so `read` works without a login. Their "why this
recipe works" text and step photos may be hidden behind the login, so judge
Testing and Photos from what `read` returns and the publisher's known test
process. Don't mark them down because content is hidden.

## Scoring (100 points)

| Criterion | Pts | Full marks | Zero |
|---|---|---|---|
| **Authenticity** | 25 | Traditional preparation; author is from the cuisine or a recognized authority on it; explains the dish's roots and regional context | Westernized or shortcut version that changes what the dish is |
| **Precision** | 25 | Weights or exact volumes; specific produce sizes ("1 medium onion, 200 g"); pan size given; **doneness cues** (visual, texture, temperature) for each key step | "Time-only traps": steps that give only minutes, no cue; vague sizing ("1 onion", "a handful", "a large pot") |
| **Testing & food science** | 20 | Test kitchen, or the author explains *why* (why this rice, why this ratio, what goes wrong) | No sign the recipe was tested; no reasoning |
| **Process photos** | 15 | Photos of the key stages, so you can match what's in your pan | Only a hero shot |
| **Time efficiency** | 10 | No wasted steps; good use of parallel work; realistic stated times | Needless steps or wildly understated times |
| **US ingredient access** | 5 | Everything at a US grocery, or the hard-to-find items have substitutions | Key ingredients unobtainable in the US with no substitute |

Score each criterion in whole points. The total is the sum.

Use the `signals` block from `read` as evidence, not as the score:
`ingredientsWithWeights`, `temperaturesInSteps`, `sensoryCuesInSteps`,
`panSizesInSteps`, `stepImagesInSchema` and `imagesOnPage` are counts. A high
image count can be ads, so confirm process photos with WebFetch when it
matters.

**Tie-break:** higher Precision, then a large number of positive reviews
(`rating` ≥ 4.5 with `ratingCount` in the hundreds).

## Where to look

Search broadly, then go deep on the best 3–5. Good places to try, depending on
the dish:

- **Test kitchens:** Serious Eats, ATK / Cook's Illustrated, NYT Cooking,
  BBC Good Food, Bon Appétit, Food52, King Arthur (baking).
- **Cuisine authorities:** cooks and bloggers known for that cuisine, e.g.
  Maangchi (Korean), Hot Thai Kitchen, The Woks of Life, Just One Cookbook,
  RecipeTin Eats, Hilda's Kitchen Blog (Ethiopian), Simply Recipes, Hungry
  Lankan, Spain on a Fork, The Mediterranean Dish, Chef Lola's Kitchen,
  Immaculate Bites (African and Caribbean), Food & Wine and Saveur features.
- **Always run `node scripts/recipe-hunt.mjs sites <dish name>`** (and again
  with the native-language name if it differs). The WebSearch tool almost never
  returns Serious Eats or NYT Cooking pages, so this command searches Serious
  Eats, NYT Cooking, ATK and BBC Good Food through their own search pages. It
  lists titles, authors and NYT rating counts. In the test run, it found a
  625-rating NYT doro wat that WebSearch missed.
- If a scraper site names an NYT or ATK original, search for that original's
  title. Also search the dish's native-language name.

## Two-part dishes

When the dish names two components ("Doro Wat with Injera", "Pulaka with
Coconut Fish"), score the main component, which is the first one named. Then
also record the best recipe you read for the second component under
`companions`. If no single recipe covers the whole dish, a strong main recipe
plus a companion is a full answer, not a `none-found`.
