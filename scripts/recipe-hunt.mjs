// Recipe hunt: find a better tested recipe for every dish you haven't cooked yet.
// The research is done by recipe-scout subagents (.claude/agents/recipe-scout.md),
// one dish each, driven by the /recipe-hunt skill. This script is the
// deterministic part: it builds the worklist, reads recipe pages, checks every
// link the scouts pick, and renders the final table.
//
//   node scripts/recipe-hunt.mjs queue            # rebuild the worklist from recipes.js + Supabase cooking_log
//   node scripts/recipe-hunt.mjs next 15          # the next 15 dishes with no result yet ("id | country | dish")
//   node scripts/recipe-hunt.mjs next 5 bhutan,spain  # only these ids, if they still need a result
//   node scripts/recipe-hunt.mjs read <url>       # a recipe page's structured data as compact JSON (scouts use this)
//   node scripts/recipe-hunt.mjs sites <dish>     # recipe links from Serious Eats / NYT / ATK / BBC Good Food's own search pages
//   node scripts/recipe-hunt.mjs verify [ids]     # check winner + runner-up links of results not yet verified (or these ids)
//   node scripts/recipe-hunt.mjs report           # write recipe-hunt/report.md from all results
//   node scripts/recipe-hunt.mjs status           # counts by state
//
// Files: recipe-hunt/queue.json (worklist), recipe-hunt/results/<id>.json (one per
// dish, written by a scout, then stamped by verify), recipe-hunt/cache/<id>.json
// (the winning recipe's ingredients and steps, saved at verify time; git-ignored
// because it holds the publishers' own text), recipe-hunt/report.md (generated).

import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const HUNT = path.join(ROOT, "recipe-hunt");
const RESULTS = path.join(HUNT, "results");
const CACHE = path.join(HUNT, "cache");
const QUEUE = path.join(HUNT, "queue.json");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PAYWALLED_HOSTS = ["americastestkitchen.com", "cooksillustrated.com", "cookscountry.com", "cooking.nytimes.com"];

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n"); };
const resultPath = (id) => path.join(RESULTS, `${id}.json`);
const loadResult = (id) => (fs.existsSync(resultPath(id)) ? readJson(resultPath(id)) : null);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const isPaywalled = (u) => PAYWALLED_HOSTS.some((h) => hostOf(u) === h || hostOf(u).endsWith("." + h));

// ── queue ─────────────────────────────────────────────────────────────────────

function readEnvLocal() {
  const p = path.join(ROOT, ".env.local");
  if (!fs.existsSync(p)) throw new Error(".env.local not found — it supplies the Supabase URL and anon key");
  const env = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

async function cmdQueue() {
  const { RECIPES } = await import(pathToFileURL(path.join(ROOT, "src", "data", "recipes.js")).href);
  const env = readEnvLocal();
  const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${url}/rest/v1/cooking_log?select=recipe_id&cooked=eq.true`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Supabase cooking_log read failed: HTTP ${res.status}`);
  const cooked = new Set((await res.json()).map((r) => r.recipe_id));
  const queue = RECIPES.filter((r) => !cooked.has(r.id)).map((r) => ({ id: r.id, country: r.country, dish: r.dish }));
  writeJson(QUEUE, queue);
  console.log(`${RECIPES.length} recipes, ${cooked.size} cooked (from ${hostOf(url)}), ${queue.length} queued → recipe-hunt/queue.json`);
}

const loadQueue = () => {
  if (!fs.existsSync(QUEUE)) throw new Error("No queue yet — run: node scripts/recipe-hunt.mjs queue");
  return readJson(QUEUE);
};

// A dish needs scouting if it has no result, or its result failed verification
// and has no usable link left (stamped "needs-retry" by verify).
const needsScout = (id) => { const r = loadResult(id); return !r || r.verification?.state === "needs-retry"; };

function cmdNext(n = 15, only) {
  const want = only ? new Set(only.split(",")) : null;
  const rows = loadQueue().filter((q) => (!want || want.has(q.id)) && needsScout(q.id)).slice(0, Number(n));
  for (const q of rows) {
    const r = loadResult(q.id);
    const retry = r?.verification?.state === "needs-retry" ? ` | RETRY: ${r.verification.reason}` : "";
    console.log(`${q.id} | ${q.country} | ${q.dish}${retry}`);
  }
  if (!rows.length) console.log("(nothing left to scout)");
}

// ── read: structured recipe data from a page ──────────────────────────────────

async function fetchPage(url) {
  const res = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(20000) });
  const html = await res.text();
  return { status: res.status, finalUrl: res.url, html };
}

const flat = (x) => (Array.isArray(x) ? x.flatMap(flat) : x && x["@graph"] ? flat(x["@graph"]) : x ? [x] : []);
const types = (n) => [].concat(n?.["@type"] || []);
const decode = (s) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\s+/g, " ").trim();

function extractRecipe(html) {
  const nodes = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => { try { return JSON.parse(m[1].trim()); } catch { return null; } })
    .flatMap(flat);
  const rec = nodes.find((n) => types(n).includes("Recipe"));
  if (!rec) return null;
  // Steps can be strings, HowToStep, or HowToSection{itemListElement:[HowToStep]}.
  const steps = [];
  for (const s of flat(rec.recipeInstructions || [])) {
    if (typeof s === "string") steps.push({ text: decode(s) });
    else if (s.itemListElement) for (const t of flat(s.itemListElement)) steps.push({ section: decode(s.name), text: decode(t.text || t.name), image: !!t.image });
    else steps.push({ text: decode(s.text || s.name), image: !!s.image });
  }
  const free = rec.isAccessibleForFree ?? nodes.find((n) => n.isAccessibleForFree !== undefined)?.isAccessibleForFree;
  const author = [].concat(rec.author || []).map((a) => (typeof a === "string" ? a : a?.name)).filter(Boolean).join(", ");
  const publisher = rec.publisher?.name || nodes.find((n) => types(n).includes("Organization") || types(n).includes("WebSite"))?.name;
  const ingredients = (rec.recipeIngredient || []).map(decode);
  return {
    name: decode(rec.name),
    author: author || undefined,
    publisher: publisher ? decode(publisher) : undefined,
    description: decode(rec.description).slice(0, 400) || undefined,
    yield: [].concat(rec.recipeYield || []).map(String).join(" / ") || undefined,
    prepTime: rec.prepTime, cookTime: rec.cookTime, totalTime: rec.totalTime,
    rating: rec.aggregateRating?.ratingValue != null ? Number(rec.aggregateRating.ratingValue) : undefined,
    ratingCount: Number(rec.aggregateRating?.ratingCount ?? rec.aggregateRating?.reviewCount) || undefined,
    paywalledBySchema: free === false || free === "False" || undefined,
    ingredients,
    steps: steps.filter((s) => s.text),
  };
}

// Signals the rubric cares about that can be counted rather than judged.
function signals(rec, html) {
  const ingText = rec.ingredients.join("\n");
  const stepText = rec.steps.map((s) => s.text).join("\n");
  const count = (re, s) => (s.match(re) || []).length;
  return {
    ingredients: rec.ingredients.length,
    ingredientsWithWeights: rec.ingredients.filter((i) => /\d\s?(g|grams?|kg|ml|oz|ounces?|lb|pounds?)\b/i.test(i)).length,
    steps: rec.steps.length,
    stepImagesInSchema: rec.steps.filter((s) => s.image).length,
    imagesOnPage: count(/<img\b/gi, html),
    temperaturesInSteps: count(/\d+\s?°\s?[FC]|\d+\s?degrees/gi, stepText),
    sensoryCuesInSteps: count(/\b(until|golden|browned|translucent|fragrant|thickened|tender|bubbl|crisp|caramel|opaque|coats? the back|internal temp)/gi, stepText),
    panSizesInSteps: count(/\d+(\.\d+)?\s?(-|–)?\s?(inch|in\.|"|cm)\b/gi, stepText + "\n" + ingText),
  };
}

async function readUrl(url) {
  const page = await fetchPage(url);
  const rec = page.status === 200 ? extractRecipe(page.html) : null;
  return { page, rec };
}

async function cmdRead(url) {
  if (!url) throw new Error("usage: read <url>");
  const { page, rec } = await readUrl(url);
  const out = { url, status: page.status, finalUrl: page.finalUrl !== url ? page.finalUrl : undefined, paywalled: isPaywalled(url) || undefined };
  if (!rec) out.note = page.status === 200 ? "Page loads but has no Recipe structured data — read it with WebFetch instead." : `HTTP ${page.status} — do not use this URL.`;
  else Object.assign(out, rec, { signals: signals(rec, page.html) });
  console.log(JSON.stringify(out, null, 1));
}

// ── sites: search the test kitchens' own search pages ─────────────────────────
// The WebSearch tool rarely returns Serious Eats or NYT Cooking pages, so this
// reads each site's own search results and lists the recipe links on them.
// Every URL printed was on a live page fetched just now.

const SITE_SEARCHES = [
  { name: "Serious Eats", url: (q) => `https://www.seriouseats.com/search?q=${q}`, host: "www.seriouseats.com", path: /^\/[a-z0-9-]+$/, skip: /^\/(search|about|.*-recipes(-\d+)?|best-.*-\d+)$/ },
  { name: "NYT Cooking 🔒", url: (q) => `https://cooking.nytimes.com/search?q=${q}`, host: "cooking.nytimes.com", path: /^\/recipes\/\d+-[a-z0-9-]+$/ },
  { name: "America's Test Kitchen 🔒", url: (q) => `https://www.americastestkitchen.com/search?q=${q}`, host: "www.americastestkitchen.com", path: /^\/recipes\/\d+-[a-z0-9-]+$/ },
  { name: "BBC Good Food", url: (q) => `https://www.bbcgoodfood.com/search?q=${q}`, host: "www.bbcgoodfood.com", path: /^\/recipes\/[a-z0-9-]+$/, skip: /^\/recipes\/(collection|category)/ },
];

async function cmdSites(...words) {
  const q = encodeURIComponent(words.join(" ").trim());
  if (!q) throw new Error("usage: sites <dish name>");
  const qTokens = tokens(words.join(" "));
  await Promise.all(SITE_SEARCHES.map(async (s) => {
    let lines;
    try {
      const { status, html } = await fetchPage(s.url(q));
      if (status === 404) { lines = ["  (no matching recipes)"]; } // Serious Eats 404s an empty search
      else if (status !== 200) { lines = [`  (search page returned HTTP ${status})`]; }
      else {
        const found = new Map();
        for (const m of html.matchAll(/<a\b[^>]*href="([^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
          let u; try { u = new URL(m[1], `https://${s.host}`); } catch { continue; }
          if (u.hostname !== s.host || !s.path.test(u.pathname) || s.skip?.test(u.pathname)) continue;
          // Keep only links whose slug or text has a whole word of the query
          // (drops menus, promos, and "wat" → "watercress" style matches).
          const words = new Set([...u.pathname.toLowerCase().split(/[^a-z0-9]+/), ...norm(decode(m[2])).split(/\s+/)]);
          if (!qTokens.some((t) => words.has(t))) continue;
          const href = `https://${s.host}${u.pathname}`;
          const text = decode(m[2]).slice(0, 160);
          if (!found.has(href) || (!found.get(href) && text)) found.set(href, text);
        }
        lines = [...found].slice(0, 8).map(([href, text]) => `  ${text || "(untitled)"} — ${href}`);
        if (!lines.length) lines = ["  (no matching recipes)"];
      }
    } catch (e) { lines = [`  (search failed: ${e.cause?.code || e.message})`]; }
    s.out = `${s.name}:\n${lines.join("\n")}`;
  }));
  console.log(SITE_SEARCHES.map((s) => s.out).join("\n"));
}

// ── verify ────────────────────────────────────────────────────────────────────

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ");
const STOP = new Set(["with", "and", "the", "a", "of", "de", "la", "el", "al", "con", "y", "in", "recipe", "style", "traditional", "authentic", "easy", "best"]);
const tokens = (s) => norm(s).split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));

// Pass if any significant word of the dish (or a scout-supplied alias) appears
// in the page's recipe name. Loose on purpose: catches "wrong dish", not wording.
function nameMatches(pageName, dish, aliases = []) {
  const page = new Set(tokens(pageName));
  return [dish, ...aliases].some((d) => tokens(d).some((t) => page.has(t) || [...page].some((p) => p.startsWith(t.slice(0, 5)))));
}

async function checkLink(url, dish, aliases) {
  if (!url) return { state: "fail", reason: "no URL" };
  let page, rec;
  try { ({ page, rec } = await readUrl(url)); } catch (e) { return { state: "fail", reason: `fetch error: ${e.cause?.code || e.message}` }; }
  if (page.status === 403 || page.status === 429) return { state: "warn", reason: `HTTP ${page.status} (likely bot-blocked) — open it by hand`, status: page.status };
  if (page.status !== 200) return { state: "fail", reason: `HTTP ${page.status}`, status: page.status };
  const finalPath = (() => { try { return new URL(page.finalUrl).pathname; } catch { return "/"; } })();
  if (page.finalUrl !== url && (finalPath === "/" || finalPath === "")) return { state: "fail", reason: `redirected to the homepage (${page.finalUrl})` };
  if (!rec) return { state: "warn", reason: "page loads but has no Recipe structured data", status: 200 };
  if (!nameMatches(rec.name, dish, aliases)) return { state: "warn", reason: `page recipe is "${rec.name}" — check it is the right dish`, status: 200, name: rec.name, rec };
  return { state: "pass", status: 200, name: rec.name, rec, rating: rec.rating, ratingCount: rec.ratingCount };
}

async function cmdVerify(idsArg) {
  const ids = idsArg ? idsArg.split(",") : fs.readdirSync(RESULTS).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).filter((id) => !loadResult(id).verification);
  for (const id of ids) {
    const r = loadResult(id);
    if (!r) { console.log(`${id}: no result file`); continue; }
    if (r.status === "none-found" && !r.winner?.url) {
      r.verification = { state: "none-found", checkedAt: new Date().toISOString() };
      writeJson(resultPath(id), r);
      console.log(`${id}: none-found (nothing to check)`);
      continue;
    }
    const aliases = r.aliases || [];
    const w = await checkLink(r.winner?.url, r.dish, aliases);
    const ru = r.runnerUp?.url ? await checkLink(r.runnerUp.url, r.dish, aliases) : null;
    const strip = (c) => c && (({ rec, ...rest }) => rest)(c);
    let state = w.state, reason = w.reason, used = w;
    if (w.state === "fail") {
      if (ru && ru.state !== "fail") {
        // Promote the runner-up so the table always shows a working link.
        r.demoted = r.winner; r.winner = r.runnerUp; r.runnerUp = null;
        state = ru.state === "pass" ? "promoted" : "warn"; reason = `winner failed (${w.reason}); runner-up promoted${ru.reason ? " — " + ru.reason : ""}`; used = ru;
      } else {
        state = "needs-retry"; reason = `winner failed (${w.reason})${ru ? `, runner-up failed (${ru.reason})` : ", no runner-up"}`;
      }
    }
    // Companion recipes (the "with Injera" half): drop any whose link is dead.
    const comp = [];
    for (const c of r.companions || []) {
      const cr = await checkLink(c.url, c.part || r.dish, []);
      if (cr.state === "fail") { (r.droppedCompanions ||= []).push({ ...c, reason: cr.reason }); continue; }
      c.check = cr.state; comp.push(c);
    }
    if (r.companions) r.companions = comp;
    r.verification = { state, reason, checkedAt: new Date().toISOString(), winner: strip(w), runnerUp: strip(ru) };
    if (used.rec) writeJson(path.join(CACHE, `${id}.json`), { url: r.winner.url, savedAt: new Date().toISOString(), ...used.rec });
    writeJson(resultPath(id), r);
    console.log(`${id}: ${state}${reason ? " — " + reason : ""}`);
  }
}

// ── report ────────────────────────────────────────────────────────────────────

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const link = (u, label) => (u ? `[${cell(label || hostOf(u))}](${u})` : "—");
const STATE_LABEL = { pass: "✅", promoted: "✅ runner-up promoted", warn: "⚠️ check", "needs-retry": "❌ retry", "none-found": "— none found" };

function cmdReport() {
  const queue = loadQueue();
  const rows = [], pending = [];
  for (const q of queue) {
    const r = loadResult(q.id);
    if (!r) { pending.push(q); continue; }
    const v = r.verification;
    const w = r.winner || {};
    const lock = (u) => (u && isPaywalled(u) ? " 🔒" : "");
    const none = r.status === "none-found";
    const winCell = (none ? (w.url ? "**None qualified.** Best seen: " : "**None qualified**") : "") + (w.url ? link(w.url, w.title) + lock(w.url) : "")
      + (r.companions || []).map((c) => `<br>+ ${cell(c.part)}: ${link(c.url, c.title)}${lock(c.url)}`).join("");
    rows.push(`| ${cell(q.country)} | ${cell(q.dish)} | ${winCell} | ${w.score ?? "—"} | ${cell(w.source || hostOf(w.url))} | ${r.runnerUp?.url ? link(r.runnerUp.url, r.runnerUp.title) + (isPaywalled(r.runnerUp.url) ? " 🔒" : "") + ` (${r.runnerUp.score ?? "?"})` : "—"} | ${v ? STATE_LABEL[v.state] + (v.state === "warn" || v.state === "needs-retry" ? `: ${cell(v.reason)}` : "") : "not verified"} |`);
  }
  const md = [
    "# Recipe hunt",
    "",
    `Generated ${new Date().toISOString().slice(0, 10)} by \`node scripts/recipe-hunt.mjs report\`. ${rows.length} of ${queue.length} uncooked dishes scouted. Score is out of 100 (see \`recipe-hunt/rubric.md\`). 🔒 = paywalled (ATK / NYT Cooking).`,
    "",
    "| Country | Dish Name | Winning Recipe URL | Score | Source | Runner-up | Link check |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
    pending.length ? `## Not scouted yet (${pending.length})\n\n${pending.map((q) => q.country).join(", ")}\n` : "",
  ].join("\n");
  fs.writeFileSync(path.join(HUNT, "report.md"), md);
  console.log(`recipe-hunt/report.md: ${rows.length} rows, ${pending.length} not scouted yet`);
}

function cmdStatus() {
  const queue = loadQueue();
  const counts = {};
  for (const q of queue) {
    const r = loadResult(q.id);
    const k = !r ? "not scouted" : r.verification ? r.verification.state : "not verified";
    counts[k] = (counts[k] || 0) + 1;
  }
  console.log(`${queue.length} queued:`, Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", "));
}

// ── main ──────────────────────────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2);
const cmds = { queue: cmdQueue, next: cmdNext, read: cmdRead, sites: cmdSites, verify: cmdVerify, report: cmdReport, status: cmdStatus };
if (!cmds[cmd]) { console.log("usage: node scripts/recipe-hunt.mjs queue | next [n] [ids] | read <url> | sites <dish> | verify [ids] | report | status"); process.exit(1); }
try { await cmds[cmd](...rest); } catch (e) { console.error(e.message); process.exit(1); }
