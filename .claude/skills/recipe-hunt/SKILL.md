---
name: recipe-hunt
description: Find the best tested web recipe for the next N uncooked dishes. Runs one recipe-scout subagent per dish, checks every link with a script, and rebuilds recipe-hunt/report.md. Use when the user says /recipe-hunt, "run the next batch", or asks to continue the recipe hunt.
---

# /recipe-hunt [N] [ids]

N = how many dishes this run (default 15). Optional comma-separated ids limit
the run to those dishes.

You orchestrate only. Do no recipe research yourself, and keep your own context
small: scouts write their findings to files and reply with one line.

1. If `recipe-hunt/queue.json` is missing, or the user asks to refresh it, run
   `node scripts/recipe-hunt.mjs queue`.
2. Run `node scripts/recipe-hunt.mjs next <N> [ids]`. Each line is one dish:
   `id | country | dish` (plus `| RETRY: reason` for a dish whose links failed).
3. Spawn one `recipe-scout` subagent per line, **5 per message** (parallel). The
   prompt is the line itself, verbatim. If the `recipe-scout` type isn't
   available yet (agents load at session start), use `general-purpose` with
   model `sonnet`, and begin the prompt with: "Follow the instructions in
   .claude/agents/recipe-scout.md exactly (skip its frontmatter). Your task:".
   Wait for each wave of 5 to finish before starting the next.
4. Run `node scripts/recipe-hunt.mjs verify`. It checks the winner and
   runner-up links of every unverified result and promotes the runner-up when
   the winner fails.
5. For any dish reported `needs-retry`, spawn one more scout. `next` adds the
   RETRY reason, so run `node scripts/recipe-hunt.mjs next 50 <those ids>` and
   use its lines. Then run `verify` again. Retry each dish only once per run.
6. Run `node scripts/recipe-hunt.mjs report`, then `status`.
7. Tell the user what this run covered: how many found, none-found, and
   flagged ⚠️, and which ones need a manual look. Link `recipe-hunt/report.md`.
   Don't paste the whole table.

After about 50 dishes in one session, tell the user to start a fresh session
and run `/recipe-hunt` again. All progress is on disk, so a new session picks
up where this one stopped.
