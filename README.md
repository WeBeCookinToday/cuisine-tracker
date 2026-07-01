# Cuisine Tracker

A world-map-based log for cooking one iconic dish per country — track what you've
cooked, rate dishes, add your own photos, and leave notes and comments. Built with
React + D3, backed by Supabase for photos, likes, and comments.

## Prerequisites

- **Node.js 18+** and npm (comes with Node). Check with:
  ```bash
  node --version
  npm --version
  ```
  If you don't have Node, install it from https://nodejs.org (LTS is fine).

## Run it locally

From the project root:

```bash
npm install                 # first time only — downloads dependencies
cp .env.example .env.local  # then edit .env.local with your Supabase values
npm run dev                 # start the local dev server
```

The Supabase URL and key are read from environment variables (see
[Environments & Supabase](#environments--supabase) below), so you need a
`.env.local` file before the backend features work. Point it at your **staging**
project so local testing never touches production data.

`npm run dev` prints a local URL (default **http://localhost:5173**). Open it in your
browser. The dev server has hot reload — edits to files in `src/` show up instantly
without a manual refresh.

To stop the server, press `Ctrl+C` in the terminal.

> **Why npm is required now:** the app is written in JSX and split across many files.
> A build tool ([Vite](https://vitejs.dev)) compiles that into plain JavaScript the
> browser can run. You can no longer just open `index.html` as a file — it's only a
> shell that loads the compiled app.

## Build for production

```bash
npm run build     # outputs an optimized static site into dist/
npm run preview   # serve the built dist/ locally to check it (http://localhost:4173)
```

`npm run build` produces a plain static site in `dist/` (HTML + JS + assets). Deploy
the **contents of `dist/`** to any static host (GitHub Pages, Netlify, Vercel, etc.).

## Available scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server with hot reload (for development) |
| `npm run build` | Compile an optimized production build into `dist/` |
| `npm run preview` | Serve the production build locally to verify it |

## Project structure

```
index.html            App shell — loads src/main.jsx (do not put app code here)
vite.config.js        Vite + React config
package.json          Dependencies and scripts
.env.example          Template for .env.local (Supabase env vars)
.github/workflows/    GitHub Actions deploy workflow (main + staging)
supabase/schema.sql   SQL to provision a Supabase project (tables, bucket, RLS)

src/
  main.jsx            React entry point
  App.jsx             Top-level app: header, map, and recipe card grid
  components/         UI components
    WorldMap.jsx        D3 world map (fetches country shapes from a CDN at runtime)
    DishImage.jsx       Card/detail image with flag + photo layering
    RecipeSection.jsx   Ingredients, mise en place, and method
    StarRating.jsx      Star rating widget
    CookingLog.jsx      "Cooked" toggle, photo upload, notes
    LikesAndComments.jsx  Community likes and comments
    DetailView.jsx      Full recipe detail page
  lib/                Non-UI helpers
    supabase.js         Supabase client + photo/like/comment functions
    theme.js            Shared color palette
    topo.js             TopoJSON → GeoJSON decoder for the map
    format.jsx          Formatting utilities (units, fractions, times, flags)
  data/               Pure data (no logic)
    recipes.js          All recipes
    flags.js            Country flags (base64 SVG)
    continents.js       Country → continent mapping + display order
    areas.js            Country land areas (used to sort cards)
    initLog.js          Seed cooking-log state
```

## Environments & Supabase

The app has two deployed environments, each pointing at its **own** Supabase
project so staging never touches production data:

| Environment | Branch | URL | Supabase project |
|---|---|---|---|
| Production | `main` | `https://<user>.github.io/cuisine-tracker/` | prod project |
| Staging | `staging` | `https://<user>.github.io/cuisine-tracker/staging/` | staging project |

The Supabase URL + anon key are **not** hardcoded — they come from build-time env
vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), read in
`src/lib/supabase.js`. Locally they come from `.env.local`; in CI they come from
per-environment GitHub secrets.

### How deploys work

`.github/workflows/deploy.yml` runs on every push to `main` or `staging`:

- picks the matching GitHub Environment (so the right Supabase secrets are injected),
- runs `npm ci && npm run build`,
- publishes `dist/` to the `gh-pages` branch — `main` to the root, `staging` to
  the `/staging/` subfolder (`keep_files: true` preserves the other environment).

So: **push to `staging` → the `/staging/` URL updates against the staging Supabase
project. Push to `main` → the root URL updates against the prod project.** Promote
a change by merging `staging` into `main`.

> Because `keep_files: true` never deletes old files, stale hashed assets can
> accumulate on `gh-pages` over time. They're harmless (the current `index.html`
> only references current hashes), but you can occasionally clear the `gh-pages`
> branch to tidy up.

### Security note (RLS)

The anon key is meant to be public, but it only stays safe if **Row-Level
Security (RLS)** is enabled on the `photos`, `likes`, and `comments` tables.
`supabase/schema.sql` enables RLS and adds the needed policies. If you set up
tables by hand instead, make sure RLS is on — otherwise anyone with the key can
read/write/delete those tables.

## Notes

- The world map loads country geometry from a CDN at runtime, so the map needs
  internet access. The recipe grid still works offline.
- Requires internet for Google Fonts and the Supabase-backed community features.
