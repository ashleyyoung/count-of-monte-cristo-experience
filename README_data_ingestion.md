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

To batch a date range (skips gaps automatically, pauses between dates, prints a failure summary):

```bash
# Optional: pre-warm year-level Issues XML (3 calls for 1844–1846, not one per date)
npx tsx scripts/gallica/warm-issues-cache.ts

npx tsx scripts/ingest-range.ts --from=1844-08-28 --to=1844-09-07
```

Omit `--from`/`--to` entirely to sweep the whole schedule — this skips any date that already has a Gallica ALTO French-source file in R2, so it's safe to use as a "resume an overnight run" command: it only touches dates that haven't succeeded yet. `--force` disables that skip and reprocesses everything in range (with or without `--from`/`--to`):

```bash
npx tsx scripts/ingest-range.ts --max-consecutive-failures=30 --cooldown-on-error=300
```

Set `GALLICA_CONTACT=you@example.com` in `.env` so Gallica requests identify your project (BnF asks bots to include contact info; helps with Cloudflare).

Pass `--delay=N` (seconds, default 60) to adjust the pause between dates. On throttle/DNS errors, `ingest-range` cools down (default 5 min, doubling up to 30 min) and retries failed dates once after a 10-minute pause. The script only processes dates in the serialization schedule; non-publication days like Sundays are silently skipped. For an unattended overnight run, raise `--max-consecutive-failures` (default 5) well above its default — a sustained BnF-side quota/penalty window (distinct from a per-request rate-limit violation; see **Gallica outages** below) can otherwise trip the abort before the cooldown has a chance to ride it out.

Before starting, `ingest-range` (and `ingest-day`) run a quick Gallica reachability check and warn (but proceed) if it fails — see **Gallica outages** below for details, `--skip-preflight` to disable, and `GALLICA_DNS_SERVERS` if you're seeing DNS errors.

To pull scans and French source first, then translate in a separate pass:

```bash
npx tsx scripts/ingest-range.ts --from=1844-08-31 --to=1844-09-07 --skip-translation

for DATE in 1844-08-28 1844-08-29 1844-08-31 ...; do
  npx tsx scripts/translate/translate-day.ts --date=$DATE
done
```

This runs, in order: `resolve-issue`, `pull-scans`, `crop-strip`,
`fetch-french-source` (ALTO), `translate-day`. Scans and crops already in R2 are
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
npx tsx scripts/translate/fetch-french-alto.ts        --date=$DATE   # default for now (see below)
npx tsx scripts/translate/fetch-french-textebrut.ts   --date=$DATE   # disabled by default — see below
npx tsx scripts/translate/transcribe-french-vision.ts --date=$DATE   # last resort (needs pull-scans first)

# C. Translate the French in R2 -> English, saved to day_content
npx tsx scripts/translate/translate-day.ts --date=$DATE
# Default model is claude-sonnet-4-6. For higher quality: --model=claude-opus-4-8

# D. Summarize translated pages -> Highlights on Overview tab (optional)
npx tsx scripts/summarize/summarize-day.ts --date=$DATE
```

Translation is saved to `day_content` incrementally as each section completes —
there is no separate upload step.

### Which French script do I run?

**texteBrut is skipped by default for now** — `ingest-day.ts`/`ingest-range.ts` and `translate-day.ts`'s auto-fetch both go straight to ALTO. texteBrut has been hitting BnF's own Altcha bot-challenge page (an unsolvable-by-script proof-of-work CAPTCHA, served as HTTP 200 — not a transient error) and, separately, long genuine Cloudflare/origin outages costing up to ~30 minutes of retries before failing. ALTO is a different Gallica backend path (`RequestDigitalElement`, not `.texteBrut`) that has been reliable throughout. `fetchTexteBrutToR2`/`fetch-french-textebrut.ts` still exist and work if you want to try texteBrut by hand for a specific date.

| Situation                        | Run                                                |
| -------------------------------- | -------------------------------------------------- |
| Default                          | `fetch-french-alto.ts`                             |
| You want to try texteBrut anyway | `fetch-french-textebrut.ts`                        |
| ALTO empty too                   | `pull-scans.ts` then `transcribe-french-vision.ts` |

Run exactly one French-source script. `translate-day` translates whatever
French intermediate is in R2 (precedence: texteBrut → ALTO → vision — so a
pre-existing valid texteBrut cache from before this change still wins if
present), and
fetches texteBrut once itself if none exists.

`pull-scans.ts` and `crop-strip.ts` accept `--skip-existing` to skip individual pages or crops already in R2 (and recorded in `day_content`). `pull-scans` uploads each page to R2 and saves `doc.original_pages` immediately after every page, so you can safely stop and resume.

**Batch all dates (background-friendly):**

`ingest-all` runs in a **single process** with shared year-level Issues XML cache (3 API calls for 1844–1846, not hundreds). Defaults: **60 s** between dates, **5 min** cooldown (doubling up to 15 min) after 403/DNS errors, retry pass after **10 min** for failed dates.

`ingest-all`'s `--steps` is limited to `resolve`, `pull`, `crop` — there is no French-source-fetch or translation step in this script at all, on by default or otherwise. For French source (ALTO) plus an option to skip just the translate step, use `ingest-range.ts --skip-translation` instead (see **Batch a date range** above) — it runs the full pipeline (resolve → pull → crop → French source) and stops before translating.

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

**Gallica outages:** The Issues/Pagination APIs sit behind Cloudflare. HTTP `522` (origin timeout) or `503` are usually transient; the client retries automatically (up to 8 attempts, `GALLICA_MAX_ATTEMPTS`). If it still fails, wait a few minutes and rerun with `--skip-existing`. HTTP `403` from Cloudflare means bot protection blocked the request; `ingest-all`/`ingest-range` will cooldown and retry failed dates once. Note that BnF is currently mid-rollout of a new API manager, and third-party uptime monitors have shown gallica.bnf.fr having genuine connectivity issues independent of anything this pipeline does — during a known-bad window, prefer running several smaller date-range batches over one large multi-hour run, since a giant batch has more time to span both a healthy and an unhealthy period.

**Metadata rate limit:** BnF documents a hard 3-second minimum between any Pagination/Issues/ALTO/info.json query — faster than that is "the limit at which the BnF server considers queries malicious" and blocks the caller. This is separate from the well-known 5/min limit on IIIF full-image and texteBrut calls. The client throttles these metadata-class calls at 3.5s (`THROTTLE_MS.metadata` in `lib/gallica.ts`); don't lower it.

**Preflight check:** Before a batch (`ingest-range.ts`) or a single date (`ingest-day.ts`), the client does one lightweight `HEAD` request to confirm Gallica is reachable at all. If it fails after a few retries, the script logs a warning and waits out a cooldown (5 min by default for `ingest-day`; `ingest-range` reuses its `--cooldown-on-error` value) before proceeding — a failed preflight doesn't reliably predict the whole run will fail, so it doesn't abort, but it does pause first rather than immediately hammering an origin that's already struggling. Pass `--skip-preflight` to skip this check (and the cooldown) entirely.

**DNS / network errors:** A message like `DNS lookup failed for gallica.bnf.fr (ENOTFOUND)` or bare `fetch failed` means your machine could not reach Gallica at all (not an app bug). `GALLICA_DNS_SERVERS=1.1.1.1,8.8.8.8` in `.env` is available (opt-in, off by default) but **confirmed not to fix this**: on Node 22, the actual `fetch()` calls resolve hostnames via the OS-level resolver (`dns.lookup()`), which ignores `dns.setServers()` — only the internal post-`ENOTFOUND` recovery probe (which uses `dns.resolve4()`) is affected, not the request that matters. If you're seeing real ENOTFOUND errors, the fix has to happen at the OS/network level: change your Mac's DNS servers in System Settings → Network → (your connection) → Details → DNS to `1.1.1.1`/`8.8.8.8`, toggle VPN, or run `dig gallica.bnf.fr` to confirm resolution works outside Node before rerunning.

**If Gallica is fully unreachable for an extended period:** there's no good automated fallback for page-scan images — they only exist on Gallica's live IIIF endpoint. As a last resort for looking up specific issues by hand (not for scripting/scraping): archive.org's general `bnfgallica` collection mirrors some Gallica holdings, though it's unconfirmed whether this title's 1844 issues specifically are covered; RetroNews (retronews.fr) is a paid BnF-affiliated press archive with the same content, usable as a manual lookup only — its terms don't permit automated access.

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

## Phase 6 — Summarize (Highlights on Overview tab)

After `translate-day` has written `doc.translated_pages`, run the summarize job to produce an immersive **Highlights** briefing in `doc.overview` (shown on the Overview tab). It reads the live English page translations from R2; it does not call Gallica.

**Prerequisite:** `doc.translated_pages` must be non-empty for the date. Run `translate-day` first.

### Single day

```bash
npx tsx scripts/summarize/summarize-day.ts --date=1844-08-28
# Default model: TRANSLATION_MODEL env or claude-sonnet-4-6
npx tsx scripts/summarize/summarize-day.ts --date=1844-08-28 --model=claude-haiku-4-5
```

### Full backfill (139 installments, ~$14 at Sonnet pricing)

```bash
for DATE in $(node -e "const s=require('./content/schedule.json'); console.log(s.installments.map(i=>i.date).join(' '))"); do
  npx tsx scripts/summarize/summarize-day.ts --date=$DATE
done
```

### Output

- One `TextItem` in `doc.overview` with `slot_key=overview-1`
- English prose on R2 at `{date}/en/overview-1/{timestamp}.txt`
- Version history in `translation_versions` (`section='overview'`)
- Prior overview rows from the translate pipeline's segmentation pass remain in history

### Admin action

`app/actions/admin.ts` exports `summarizeDay(date, { model? })` for synchronous admin use (same pipeline as the CLI).

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

| Phase | What appears on the site                                         |
| ----- | ---------------------------------------------------------------- |
| 1     | Timeline and empty day pages                                     |
| 2     | People profiles, Débats hub graph                                |
| 3     | Chapter tab (Gutenberg English)                                  |
| 4     | Original paper scans, feuilleton strip image                     |
| 5     | Débats sections, overview, science, etc. (Claude English)        |
| 6     | Overview **Highlights** briefing (curated from translated pages) |

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
| `scripts/translate/fetch-french-alto.ts`        | Per date       | French source (default for now): Gallica ALTO → R2                                            |
| `scripts/translate/fetch-french-textebrut.ts`   | Per date       | French source: Gallica texteBrut → R2 (disabled by default — see "Which French script")       |
| `scripts/translate/transcribe-french-vision.ts` | Per date       | French source: Claude vision OCR → R2 (last resort)                                           |
| `scripts/translate/translate-day.ts`            | Per date       | Translate French in R2 → English, saved to `day_content` immediately                          |
| `scripts/summarize/summarize-day.ts`            | Per date       | Summarize `translated_pages` → `doc.overview` (Highlights); run after translate-day           |
| `scripts/translate/update-day-content.ts`       | Per date       | Re-sync `day_content` from `translation_versions` (use after importing existing translations) |
| `scripts/translate/import-existing.ts`          | Per date       | `--source=berlioz\|gutenberg\|all`                                                            |
