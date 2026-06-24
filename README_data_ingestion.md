# Data Ingestion Runbook

How to populate the _Count of Monte Cristo Experience_ with schedule data, people, Gutenberg chapter text, Gallica scans, and Claude translations. Run jobs in the order below.

For translation architecture, models, and version history, see [README_translation_architecture.md](./README_translation_architecture.md).

---

## One-time setup

### 1. Install dependencies

```bash
cd count-of-monte-cristo
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` (or `.env.local`) and fill in:

| Variable                                                                              | Needed for                                                                |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                                            | Everything                                                                |
| `SUPABASE_SERVICE_ROLE_KEY`                                                           | All CLI scripts                                                           |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `R2_BUCKET_NAME` | R2 uploads (Gutenberg, scans, translations)                               |
| `R2_PUBLIC_URL`                                                                       | Serving images and text in the app (without this, media will not display) |
| `ANTHROPIC_API_KEY`                                                                   | Translation only                                                          |
| `TRANSLATION_MODEL`                                                                   | Translation only (see `.env.example`)                                     |

### 3. Load env in your shell

Many scripts do not auto-read `.env`. Run this once per terminal session before CLI commands:

```bash
set -a && source .env && set +a
```

Scripts that load dotenv themselves: `seed-contributors`, `upload-contributor-assets`, `recompute-graph`, everything under `scripts/translate/`, and everything under `scripts/gallica/` (via `_shared.ts`).

---

## Phase 1 — Bootstrap the schedule (run once)

Creates `content/schedule.json`, seeds all 139 `installments` rows, and empty `day_content` rows. Day pages and the translate button require `day_content` rows.

```bash
npx tsx scripts/parse-schedule.ts
```

**Verify:** in the **local app** (not Cloudflare). Run `npm run dev`, then open [http://localhost:3001/day/1844-08-28](http://localhost:3001/day/1844-08-28). You should see the day page shell with empty tabs, not a 404. Cloudflare R2 is only object storage at this stage; nothing to check there yet.

---

## Phase 2 — People and graph (run once)

```bash
# 12 Journal des Débats contributors, life events, relationships
npx tsx scripts/seed-contributors.ts

# Optional: bios and portraits from Wikimedia / hberlioz (slow, ~10–30 s per person)
npx tsx scripts/upload-contributor-assets.ts

# Relationship graph layouts (requires seed-contributors first)
npx tsx scripts/recompute-graph.ts
```

---

## Phase 3 — Chapter text from Gutenberg (run once)

Public-domain English chapter text for all installments. Requires Phase 1 and R2.

```bash
# Preview without writes:
npx tsx scripts/ingest-gutenberg.ts --dry-run

# Real run:
npx tsx scripts/ingest-gutenberg.ts
```

After this, the **Chapter** tab has Gutenberg text on every day that maps to a chapter.

---

## Phase 4 — Per-day ingest: scans, French source, translation

This phase turns one date into a finished day page: original-paper scans, the
feuilleton strip, the French source text, and the Claude English translation.
Every step is one descriptively-named script that does one thing, prints its
purpose on start, and prints a `Next:` line on success. Add `--help` to any
script to see what it writes and the typical next command.

### Setup (once per terminal)

```bash
cd count-of-monte-cristo
set -a && source .env && set +a
```

### Fastest path (one date, everything)

```bash
npx tsx scripts/ingest-day.ts --date=1844-08-29
```

This runs, in order: `resolve-issue`, `pull-scans`, `crop-strip`,
`fetch-french-textebrut`, `translate-day`. Scans and crops already in R2 are
skipped by default; pass `--force` to overwrite them. Translation is saved to
`day_content` incrementally as it runs — nothing to upload separately.
Then open [http://localhost:3001/day/1844-08-29](http://localhost:3001/day/1844-08-29).

### Step by step (when you want control or a step failed)

```bash
DATE=1844-08-29

# A. Original paper images -> R2
npx tsx scripts/gallica/resolve-issue.ts --date=$DATE
npx tsx scripts/gallica/pull-scans.ts   --date=$DATE --skip-existing
npx tsx scripts/gallica/crop-strip.ts   --date=$DATE --skip-existing

# B. French source text -> R2 (pick ONE)
npx tsx scripts/translate/fetch-french-textebrut.ts   --date=$DATE   # default
npx tsx scripts/translate/fetch-french-alto.ts        --date=$DATE   # if texteBrut is blocked
npx tsx scripts/translate/transcribe-french-vision.ts --date=$DATE   # last resort (needs pull-scans first)

# C. Translate the French in R2 -> English, saved to day_content
npx tsx scripts/translate/translate-day.ts --date=$DATE
# Bulk / lower cost: pass --model=claude-sonnet-4-5 (or claude-haiku-4-5)
```

Translation is saved to `day_content` incrementally as each section completes —
there is no separate upload step.

### Which French script do I run?

| Situation                                 | Run                                                |
| ----------------------------------------- | -------------------------------------------------- |
| texteBrut succeeds (the common case)      | `fetch-french-textebrut.ts`                        |
| texteBrut returns HTML / 403 (Cloudflare) | `fetch-french-alto.ts`                             |
| ALTO empty and texteBrut blocked          | `pull-scans.ts` then `transcribe-french-vision.ts` |

Run exactly one French-source script. `translate-day` translates whatever
French intermediate is in R2 (precedence: texteBrut → ALTO → vision), and
fetches texteBrut once itself if none exists.

`pull-scans.ts` and `crop-strip.ts` accept `--skip-existing` to skip individual pages or crops already in R2 (and recorded in `day_content`). `pull-scans` uploads each page to R2 and saves `doc.original_pages` immediately after every page, so you can safely stop and resume.

**Batch all dates (background-friendly):**

`ingest-all` runs in a **single process** with shared year-level Issues XML cache (3 API calls for 1844–1846, not hundreds). Defaults: **60 s** between dates, **5 min** cooldown (doubling up to 15 min) after 403/DNS errors, retry pass after **10 min** for failed dates.

```bash
# One-time: cache Issues XML to disk (when Gallica is reachable)
npx tsx scripts/gallica/warm-issues-cache.ts

# Recommended after resolve-issue URLs are written — pull + crop only
npx tsx scripts/gallica/ingest-all.ts --skip-existing --steps=pull,crop

# Full pipeline (resolve + pull + crop)
npx tsx scripts/gallica/ingest-all.ts --skip-existing

# Part 1 only, scans step
npx tsx scripts/gallica/ingest-all.ts --part=1 --steps=pull --skip-existing

# Date range; tune throttling (seconds)
npx tsx scripts/gallica/ingest-all.ts --from=1844-08-28 --to=1844-10-19 \
  --skip-existing --delay-between-dates=60 --cooldown-on-error=300

# Stop on first failure (default: log, cooldown, continue)
npx tsx scripts/gallica/ingest-all.ts --stop-on-error
```

Expect roughly 1 minute per issue for `pull` (13 s between IIIF page downloads). A full 139-date pull run is on the order of **3–4 hours** including inter-date delays.

**Gallica outages:** The Issues API sits behind Cloudflare. HTTP `522` (origin timeout) or `503` are usually transient; the client retries automatically (up to 6 attempts). If it still fails, wait a few minutes and rerun with `--skip-existing`. HTTP `403` from Cloudflare means bot protection blocked the request; `ingest-all` will cooldown and retry failed dates once.

**DNS / network errors:** A message like `DNS lookup failed for gallica.bnf.fr (ENOTFOUND)` or bare `fetch failed` means your machine could not reach Gallica at all (not an app bug). Check `dig gallica.bnf.fr`, toggle VPN, or try a different DNS resolver (e.g. 1.1.1.1), then retry.

Diagnostic only (no DB or R2 writes):

```bash
npx tsx scripts/gallica/alto-ocr.ts --date=$DATE
```

To batch many dates, loop in shell (one at a time; respect rate limits):

```bash
for DATE in 1844-08-28 1844-08-29 1844-08-30; do
  npx tsx scripts/gallica/resolve-issue.ts --date=$DATE
  npx tsx scripts/gallica/pull-scans.ts --date=$DATE
  npx tsx scripts/gallica/crop-strip.ts --date=$DATE
done
```

---

## Phase 5 — Translate from the UI, and curated imports

The translation itself runs in Phase 4 (`translate-day.ts`). This phase covers
the two other ways text reaches a day page: the admin button and curated human
translations. Translation works on **first-time** days (empty `day_content` is
fine after Phase 1) and does **not** overwrite Gutenberg chapter text; it adds a
machine translation as a challenger instead.

### Translate via the UI (no separate listener process)

```bash
npm run dev   # terminal 1
```

1. Open `/day/1844-08-28`
2. Enable admin mode
3. Click **"Re-translate day locally"** (visible in dev, or with `LOCAL_TRANSLATION_RUNNER=1`)
4. Wait a few minutes, then refresh the page

The dev server spawns `translate-day.ts` as a detached child process. There is no background worker or daemon to start separately. It reads the French intermediate already in R2, or fetches Gallica texteBrut once if none exists.

### Optional — Import curated human translations

```bash
npx tsx scripts/translate/import-existing.ts --date=$DATE --source=berlioz
```

The Berlioz URL index is mostly empty until you add entries. Gutenberg chapters are handled by `ingest-gutenberg.ts` instead.

---

## Suggested first smoke test

Run these in order to validate the full stack on one day:

```bash
set -a && source .env && set +a

npx tsx scripts/parse-schedule.ts
npx tsx scripts/seed-contributors.ts
npx tsx scripts/ingest-gutenberg.ts

npx tsx scripts/ingest-day.ts --date=1844-08-28

npm run dev
```

Then open [http://localhost:3001/day/1844-08-28](http://localhost:3001/day/1844-08-28).

---

## What each phase gives you

| Phase | What appears on the site                                  |
| ----- | --------------------------------------------------------- |
| 1     | Timeline and empty day pages                              |
| 2     | People profiles, Débats hub graph                         |
| 3     | Chapter tab (Gutenberg English)                           |
| 4     | Original paper scans, feuilleton strip image              |
| 5     | Débats sections, overview, science, etc. (Claude English) |

---

## Common gotchas

- **No `day_content` row** → day page 404s. Fix: run `parse-schedule.ts`.
- **R2 not configured** → scripts may write DB keys but nothing displays. Fix: set all four R2 env vars plus `R2_PUBLIC_URL`.
- **Gallica scripts don't load `.env`** → run `set -a && source .env && set +a` first.
- **Translation fails on a date** → Gallica `texteBrut` may be Cloudflare-blocked (HTML/403). Fix: `npx tsx scripts/translate/fetch-french-alto.ts --date=$DATE` then `translate-day.ts`. Check the terminal error or `translation_runs` status on the day page.
- **Chapter stays Gutenberg after translate** → expected; promote your Claude version in admin via **Compare translations** if you prefer it.
- **First-time translation prerequisites:** date must exist in `installments`, R2 and `ANTHROPIC_API_KEY` must be set, Gallica must have OCR text for that date. Scans and `resolve-issue` are optional for translation.

---

## Script reference

| Script                                          | When           | Notes                                                                                         |
| ----------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| `scripts/parse-schedule.ts`                     | Once           | Also writes `content/schedule.json`                                                           |
| `scripts/seed-contributors.ts`                  | Once           | 12 contributors                                                                               |
| `scripts/upload-contributor-assets.ts`          | Once, optional | Idempotent; skips existing bios                                                               |
| `scripts/recompute-graph.ts`                    | Once           | After contributors seeded                                                                     |
| `scripts/ingest-gutenberg.ts`                   | Once           | `--dry-run` supported                                                                         |
| `scripts/gallica/resolve-issue.ts`              | Per date       | Sets `doc.gallica_issue_url`                                                                  |
| `scripts/gallica/pull-scans.ts`                 | Per date       | Rate-limited; per-page `--skip-existing`                                                      |
| `scripts/gallica/crop-strip.ts`                 | Per date       | `--region=x,y,w,h`; `--skip-existing`                                                         |
| `scripts/gallica/ingest-all.ts`                 | Batch          | Single process; throttling; retry pass                                                        |
| `scripts/gallica/warm-issues-cache.ts`          | Once           | Pre-fetch Issues XML for 1844–1846                                                            |
| `scripts/gallica/alto-ocr.ts`                   | Per date       | Diagnostic only                                                                               |
| `scripts/ingest-day.ts`                         | Per date       | Wrapper: resolve → … → translate, one command                                                 |
| `scripts/translate/fetch-french-textebrut.ts`   | Per date       | French source (default): Gallica texteBrut → R2                                               |
| `scripts/translate/fetch-french-alto.ts`        | Per date       | French source: Gallica ALTO → R2 (when blocked)                                               |
| `scripts/translate/transcribe-french-vision.ts` | Per date       | French source: Claude vision OCR → R2 (last resort)                                           |
| `scripts/translate/translate-day.ts`            | Per date       | Translate French in R2 → English, saved to `day_content` immediately                          |
| `scripts/translate/update-day-content.ts`       | Per date       | Re-sync `day_content` from `translation_versions` (use after importing existing translations) |
| `scripts/translate/import-existing.ts`          | Per date       | `--source=berlioz\|gutenberg\|all`                                                            |
