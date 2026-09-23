// Lists every recipe step that inlines an ingredient with a {000N} placeholder
// (N = index into that recipe's ingredients array), next to the sentence the
// Method list actually renders. RecipeSection.jsx swaps each placeholder for the
// full shopping-list line — amount + unit + name, prep notes included — so a
// step like "with a spoonful of {0014}" comes out as "with a spoonful of 4 tbsp
// lingonberry jam, to serve". Run this after adding or editing recipes and read
// the output for sentences like that, or for a ref pointing at the wrong
// ingredient ("Season with ½ tsp black pepper and 200 ml water").
//
//   node scripts/list-step-refs.mjs                # every step with a ref
//   node scripts/list-step-refs.mjs sweden         # only recipes whose id, country or dish matches
//   node scripts/list-step-refs.mjs --flagged      # only steps with a warning
//   node scripts/list-step-refs.mjs --ingredients  # also print each recipe's numbered ingredients
//
// Warnings (⚠) mark things that are almost always a mistake: a ref past the end
// of the ingredients array (renders as nothing), the same ref twice in one step,
// an ingredient inlined in more than one step (its full amount reads as if it's
// needed each time), and a prep note like ", chopped" running into the rest of
// the sentence ("parsley, chopped over top").

import { fileURLToPath, pathToFileURL } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECIPES_PATH = path.join(__dirname, "..", "src", "data", "recipes.js");
const args = process.argv.slice(2);
const FLAGGED_ONLY = args.includes("--flagged");
const SHOW_INGREDIENTS = args.includes("--ingredients");
const filter = args.find(a => !a.startsWith("--"))?.toLowerCase();

// Copied from numToNiceString in src/lib/format.jsx, which Node can't import (JSX).
const FRACTION_OUT = [[0.125,"⅛"],[0.25,"¼"],[0.333,"⅓"],[0.375,"⅜"],[0.5,"½"],[0.625,"⅝"],[0.667,"⅔"],[0.75,"¾"],[0.875,"⅞"]];
function numToNiceString(n) {
  if (Number.isInteger(n)) return String(n);
  const whole = Math.floor(n);
  const frac = n - whole;
  for (const [val, sym] of FRACTION_OUT) {
    if (Math.abs(frac - val) < 0.02) return whole > 0 ? `${whole}${sym}` : sym;
  }
  return String(Math.round(n * 100) / 100);
}

// Same resolution as the recipe.steps.map block in RecipeSection.jsx, including
// dropping "(sub: …)" notes, which belong on the shopping list only.
const stripSub = (s) => s.replace(/\s*\(sub: [^)]*\)/g, "");
function resolveRef(ing) {
  if (!ing) return "";
  if (typeof ing === "string") return stripSub(ing);
  const amt = ing.amount != null ? numToNiceString(ing.amount) : "";
  const unit = ing.unit ? ing.unit + " " : "";
  return `${amt}${amt ? " " : ""}${unit}${stripSub(ing.name)}`.trim();
}

// Highlight the inlined text when printing to a terminal; plain text otherwise.
const tty = process.stdout.isTTY;
const hi = (s) => (tty ? `\x1b[1;4m${s}\x1b[0m` : s);
const dim = (s) => (tty ? `\x1b[2m${s}\x1b[0m` : s);

const { RECIPES } = await import(pathToFileURL(RECIPES_PATH).href);

const stepText = (step) => (typeof step === "object" && step !== null ? step.content : step);
let recipeCount = 0;
let stepCount = 0;
let warnCount = 0;
for (const recipe of RECIPES) {
  if (filter && ![recipe.id, recipe.country, recipe.dish].some(s => s?.toLowerCase().includes(filter))) continue;
  const steps = (recipe.steps || []).map(stepText);

  // Which steps inline each ingredient, to catch one amount being used twice.
  const stepsUsing = new Map();
  steps.forEach((raw, i) => {
    for (const [, idx] of raw.matchAll(/\{(\d{4})\}/g)) {
      const n = parseInt(idx, 10);
      if (!stepsUsing.has(n)) stepsUsing.set(n, new Set());
      stepsUsing.get(n).add(i + 1);
    }
  });

  const lines = [];
  steps.forEach((raw, i) => {
    if (!/\{\d{4}\}/.test(raw)) return;
    const warnings = [];
    const seen = new Set();
    const resolved = raw.replace(/\{(\d{4})\}/g, (ref, idx, offset) => {
      const n = parseInt(idx, 10);
      const ing = recipe.ingredients[n];
      const text = resolveRef(ing);
      if (!ing) warnings.push(`MISSING ${ref}: recipe has ${recipe.ingredients.length} ingredients`);
      const others = [...stepsUsing.get(n)].filter(s => s !== i + 1);
      if (seen.has(n)) warnings.push(`${ref} appears twice in this step`);
      else if (others.length) warnings.push(`${ref} is also inlined in step ${others.join(", ")}`);
      seen.add(n);
      const rest = raw.slice(offset + ref.length);
      if (/,[^,()]+$/.test(text) && /^\s+\w/.test(rest)) warnings.push(`prep note runs into the sentence: "${text}${rest.match(/^\s+\S+/)[0]}…"`);
      return hi(text);
    });
    stepCount++;
    warnCount += warnings.length;
    if (FLAGGED_ONLY && !warnings.length) return;
    lines.push(`  ${i + 1}. ${dim(raw)}`);
    lines.push(`     ${resolved}`);
    for (const w of warnings) lines.push(`     ⚠ ${w}`);
  });
  if (!lines.length) continue;
  recipeCount++;
  console.log(`${recipe.country} — ${recipe.dish} [${recipe.id}]`);
  if (SHOW_INGREDIENTS) recipe.ingredients.forEach((ing, i) => console.log(dim(`   {${String(i).padStart(4, "0")}} ${resolveRef(ing)}`)));
  console.log(lines.join("\n") + "\n");
}
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
console.log(`${plural(stepCount, "step")} with ingredient refs${FLAGGED_ONLY ? `, ${plural(recipeCount, "recipe")} with warnings shown` : ` across ${plural(recipeCount, "recipe")}`}, ${plural(warnCount, "warning")}.`);
