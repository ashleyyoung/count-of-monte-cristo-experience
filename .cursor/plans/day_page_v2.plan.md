---
name: Day Page v2 — Reader Experience
overview: A revised plan for the day page. Keeps the "open a real 1844 Paris morning" thesis from day_tabs_ux, but defaults to the novel (Chapter-first), merges the two language editions of the issue behind one FR/EN toggle, fixes the layout problems a 5-tab model creates, and unblocks discarded front-page news via a schema fix in the translation pipeline.
isProject: false
supersedes: day_tabs_ux_b10f933c.plan.md
decisions:
  - Default tab is Chapter (novel-first). The serialized novel is the reason to return daily; the persistent header keeps the day's world one click away.
  - Original (French scans) and Translated (English) merge into one "The paper" surface with a French/English toggle — same issue, two languages. Not side-by-side; a single switch. Galignani stays separate.
  - "Paris, that day" is a highlights overview (scandals, surprises, per-section blurbs from summarize-day) plus reader subtabs for full arts/literature/science content when populated. Not the whole issue on one scroll. See amendment below (June 2026).
amends:
  - step_3_paris_tab: superseded by highlights + teasers model; full sections stay in admin tabs and The paper only
related_plan: auto-summarize_after_translate_2b0ba9f1.plan.md
---

# Day Page v2 — Reader Experience Plan

## Thesis (retained from day_tabs_ux)

The day page should feel like opening a real newspaper on a specific 1844 Paris morning. Dumas's chapter is the *feuilleton* that ran at the foot of page 1 and sold the paper; everything else reconstructs the city its first readers lived in. Immersion comes from a strong sense of time and place and from fewer, richer surfaces with connective tissue — not from more tabs.

**Where this plan diverges from day_tabs_ux** (rationale in the review section at the end):
1. **Chapter is the default tab**, not "Paris, that day." Novel-first.
2. **Original + Translated merge into one "The paper" surface with an FR/EN toggle.** Four reader tabs, not five.
3. **Layout fixes the 5-tab model glossed over** are first-class: the mobile tab grid and the always-on desktop sidebar stealing width from scan tabs.
4. **Day-of-week ships now** in the dateline — cheapest authentic-morning signal there is.
5. **A pipeline schema fix** unblocks front-page news/politics into `doc.news` (for admin editing and teaser cards), separate from `doc.overview` (the highlights essay).

## Reader-facing tab model

Four tabs. The persistent novel header (chapter kicker, title, Continue/Listen CTAs in [ReadingColumn.tsx](components/day/ReadingColumn.tsx)) sits above the tabs on every surface, so novel orientation is always present.

- **Chapter** *(default)* — the novel itself: full text, narration, multi-chapter flow. The core reason to return.
- **Paris, that day** — highlights overview (scandals, surprises, brief per-section blurbs) plus subtabs for full arts, literature, and science content when the issue has them. Optional subtabs for music, theatre, and news when populated.
- **The paper** — the artifact: the real *Journal des Débats* issue, with a **French / English** toggle (French = Gallica scans + the feuilleton relationship; English = the verbatim per-page translation). Framed around the feuilleton at the foot of page 1.
- **Galignani** — the English-in-Paris lens: what the city's British and American residents read that morning.

Admin mode is unchanged in spirit: every granular section (`overview`/lead, `news`, `debats.*`, `art_exhibitions`, `science`, both language editions, `galignani`) stays visible and editable even when empty, with actionable empty states. Readers never see thin empty tabs; admins always see every section.

## Implementation steps

### 1. Correctness (do first)
- [page.tsx](app/day/[date]/page.tsx#L83-L85): `VALID_TABS` omits `translated`, so `?tab=translated` server-renders Overview then snaps to Translated client-side (SSR/hydration mismatch). With the merge, the source tab id becomes `paper` (or keep `original`/`translated` as aliases that both resolve to the merged surface + set the toggle) — make the server and [DayPageView.tsx](components/day/DayPageView.tsx#L218-L220) `VALID_TABS` agree, with `chapter` as the fallback default.
- [ingest-day.ts](scripts/ingest-day.ts): correct the `step(5, "translate-day")` call against the one-argument `step` helper (verify signature before editing).

### 2. Tab model + default
- [TabRow.tsx](components/day/TabRow.tsx#L19-L28): collapse to the four reader tabs above; default/fallback is `chapter`. Derive per-tab availability and counts from `DayPageData.resolved`; admin mode reveals the full granular set.
- **Mobile grid fix**: the row is a hardcoded `repeat(4, 1fr)` with `nth-child(4n)` / `nth-last-child(-n+4)` border logic ([TabRow.tsx:51-57](components/day/TabRow.tsx#L51-L57), [:83-96](components/day/TabRow.tsx#L83-L96)). Four reader tabs fit one clean row; make the border logic count-driven so the admin (more-than-4) case wraps correctly instead of orphaning cells.

### 3. "Paris, that day" content tab *(amended June 2026)*

**Original intent (step 3 as written):** editorial lead + full recovered news + Debats/Art/Science as stacked sections on one scroll. Implemented in [ParisThatDayTab.tsx](components/day/ParisThatDayTab.tsx) — too much on one page.

**Revised intent (latest):** overview + section subtabs.

- **Default pane:** `summarize-day` highlights (`doc.overview`) — scandals, surprises, through-line, feuilleton beat, **brief blurbs per populated section** (see backend prompt work in Paris subtabs plan).
- **Subtabs:** Arts, Literature, Science (minimum); Music, Theatre, News when content exists. Each subtab shows **full segmented translation** from `doc.debats.*`, `doc.art_exhibitions`, `doc.science`, `doc.news` — not teasers, not The paper verbatim.
- **Backend:** segmentation into dedicated sections **already exists** (Pass B). Gaps: chain summarize after translate; summarize from segmented texts; add "scandals" to Rule 5 in summarize prompt.
- Empty subtabs: hidden. Admin tabs keep Gallica empty-state pattern.
- Retire standalone Overview tab; keep `overview` editable in admin.

### 4. "The paper" merged surface (FR/EN toggle)
- Fold [OriginalPaperTab.tsx](components/day/OriginalPaperTab.tsx) and [TranslatedPaperTab.tsx](components/day/TranslatedPaperTab.tsx) into one surface with a French/English switch (toggle persisted in the URL, e.g. `?tab=paper&lang=fr`). Not side-by-side — one switch, one column.
- **French**: Gallica page scans (existing thumb grid + [ScanViewer.tsx](components/day/ScanViewer.tsx)) with the feuilleton strip located *in context* on the page-1 scan and captioned with the relationship — the chapter the reader just finished ran here. This is the most distinctive work on the page.
- **English**: the verbatim `translated_pages` per-page reader; replace the legacy fallback with a clean empty/translate state.
- Keep `original` and `translated` as URL aliases that resolve to this surface with the correct `lang` preset, so existing deep links keep working.

### 5. Slim the persistent sidebar into an "On this day" rail
- [ParisSidebar.tsx](components/day/ParisSidebar.tsx) currently re-renders music/theatre/politics/annonce on every tab — a third copy of content that now lives in "Paris, that day." Convert it to a slim orientation rail: dateline (with day-of-week), prev/next continuity, and "figures in today's paper" jump links.
- Remove the dead Annonce card (hardcoded `annonceItems={[]}` at [DayPageView.tsx:432](components/day/DayPageView.tsx#L432)) and the ambient Galignani OCR; rough OCR stays confined to the Galignani disclosure.
- **Width fix**: the rail spans every tab row in the desktop grid ([ReadingColumn.tsx:71-78](components/day/ReadingColumn.tsx#L71-L78)), stealing 318px from the scan-heavy "The paper" and Galignani tabs. Suppress the rail (or let content go full-width) on those two surfaces; keep it on Chapter and "Paris, that day" where ambient context helps. Also rename the hardcoded mobile toggle label "Paris, that day" ([ReadingColumn.tsx:327](components/day/ReadingColumn.tsx#L327)) to "On this day" to avoid colliding with the tab name.

### 6. Connective tissue — people hover cards (CRITICAL)
Every byline and named figure becomes a hover/tap target that shows a portrait, a one-line blurb, beat, and life years, with a link to the profile. This is the highest-value immersion work: it turns isolated clippings into a recurring cast.

**Reuse what exists — don't rebuild the interaction.** [useHoverCard.ts](components/ui/useHoverCard.ts) already handles the hover-gap grace timer, keyboard focus, **tap-to-open on touch** (no hover), and Escape/outside-click; it backs `<Cite>` and `<AdminNote>`. Build a new `PersonHoverCard` (`components/people/PersonHoverCard.tsx`) on that hook, modeled visually on [Cite.tsx](components/ui/Cite.tsx). Card contents:
- portrait thumbnail (from `portrait_media_asset_id`, resolved to a URL),
- name + `BeatBadge` ([reuse](components/people/BeatBadge.tsx)) + life years `(birth–death)`,
- a short blurb (see data note),
- "View profile →" link to `/people/{slug}`.

**Data — extend the contributor resolver.** `resolveContributors` in [page.tsx](app/day/[date]/page.tsx#L22-L50) selects only `id, name, slug, role`; add `beat, birth, death, portrait` (+ resolve portrait URL) and a blurb source to `ContributorInfo` ([ContributorByline.tsx:6-11](components/day/ContributorByline.tsx#L6-L11)).
- **Blurb:** the `people` table has no short field — only `bio_md_r2_key` (full bio in R2, too heavy to fetch per tooltip). Add a short `tagline` column to `people` (one editorial line, e.g. "Composer and conductor; champion of the *idée fixe*") plus a `tagline` field on the typed entries in [seed-contributors.ts](scripts/seed-contributors.ts). **Populate as part of this work:** write a tagline for each of the ~14 seeded people, distilled from the `beat` + `life_events` already in the seed file; this is bounded and done once. **Fallback when `tagline` is null** (covers people added later before a tagline is written): compose from `beat` + `(birth–death)`, so every linked person always has a usable card.

**Two scopes, sequence them:**
1. **Bylines (ship first, cheap).** `contributor_id` is already on text items and `ContributorByline` already links to `/people/{slug}` — just wrap the name in `PersonHoverCard`.
2. **Named figures in prose (larger; the real payoff).** Prose is rendered by a bespoke regex renderer ([render-prose.tsx](lib/render-prose.tsx)) and there is no mention markup today — inline `[...]` is already the translation's gloss syntax, so it can't be reused. Approach: a name-matching pass over `people.name` (+ an alias list) that wraps known names, surfaced as a **new token type in the renderer** (`renderClaudeInner` / `renderPublicDomainInline`) rather than re-tokenizing ad hoc. Needs alias handling and disambiguation (don't link "Alexandre" alone; require full-name or known-alias matches; link first mention per item only). Treat as its own task after bylines land.

**Supporting:**
- Add a compact "figures in today's paper" element (in the "On this day" rail and/or the foot of "Paris, that day") listing the people who appear that day, each with the same hover card — ties the day into the recurring cast and the timeline.
- Add **day-of-week** to the dateline in [DayTopBar.tsx](components/day/DayTopBar.tsx) now — cheap, and the single strongest "this is a morning in 1844" cue. (Galignani already computes weekday for its Sunday empty state, so the data path exists.)
- Defer as future bets, not now: season/almanac facts; cross-day "still running" threads.

### 7. Pipeline schema fix — unblock discarded front-page news (incorporated from pipeline notes; verified)
**Confirmed collision:** `setSectionItem` writes segmented front-page news/politics to `doc.overview` ([update-day-content.ts:126-131](scripts/translate/update-day-content.ts#L126-L131)), and `summarize-day` then overwrites `doc.overview` with the editorial prose ([summarize-day.ts:5,32](scripts/summarize/summarize-day.ts#L5)). The news/politics is silently discarded on every summarize run.
- **Fix:** give the segmented front-page news its own key — add `doc.news` to [content.ts:192-193](lib/types/content.ts#L192-L193) (parallel to `overview`), point Pass B's segmentation at `news`, and keep `doc.overview` solely for the editorial highlights essay. Segmented sections feed **admin editing** and **teaser cards**, not full reader-facing prose on Paris tab.
- **Supporting (lower priority, pipeline efficiency, not user-facing):**
  - Run Pass C (`summarize-day`) from the already-segmented section texts rather than re-reading the 4 verbatim `translated_pages` — fewer input tokens, likely better signal.
  - Pass B (segment) and Pass C (summarize) are both downstream of Pass A and independent — run them in parallel.
- **Leave alone:** Pass A verbatim per-page translation (correct source for the English edition, already on the Batches discount); Pass B's anchor approach (lean — re-translating sections would cost far more); the Galignani path (already English, separate ingest).

## Review of the prior plan (day_tabs_ux_b10f933c)

Right thesis, ~80% right on execution. Kept: all correctness fixes, dead Annonce removal, OCR confined to Galignani, Galignani reframing, per-tab availability with full admin visibility, people/timeline cross-links, the feuilleton-in-context idea. Changed:

- **Default tab.** It made "Paris, that day" the default, which buries the serialized novel that drives return visits. Chapter-first; the persistent header keeps the day's world one click away.
- **Source tabs.** It kept three same-shaped artifact tabs; Original and Translated are the same issue in two languages, so they merge behind one FR/EN toggle ("The paper"). Four reader tabs, not five.
- **Layout gaps it created.** Five tabs break the hardcoded `repeat(4,1fr)` mobile grid, and the always-on 318px sidebar steals width from the scan tabs — both now first-class fixes.
- **Day-of-week.** It deferred this as speculative; it's the cheapest authentic-morning cue, so it ships now.
- **Schema fix.** Neither prior doc caught that `summarize-day` overwrites Pass B's front-page news in `doc.overview`. Fixing it separates highlights (`overview`) from segmented news (`news`). Paris tab reader content is the highlights essay, not the news dump.
- **Paris tab scope (June 2026 amendment).** Step 3's "internal sections" were misread as full prose blocks on the reader tab. Correct model: highlights essay + teaser cards; full issue on The paper.
