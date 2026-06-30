---
name: Day Tabs UX
overview: Review and revise the day page tab model so each surface has a distinct purpose, repetition is removed, and the page reads like opening a newspaper on a specific 1844 Paris morning, with strong cultural-context connective tissue.
todos:
  - id: fix-correctness
    content: Fix the `translated` valid-tab mismatch in page.tsx and the `scripts/ingest-day.ts` translate-step helper call.
    status: pending
  - id: tab-model
    content: Move to a 5-tab reader model; drop the standalone Overview tab and consolidate Débats / Art / Science into one "Paris, that day" tab with internal sections; keep all granular sections editable in admin mode.
    status: pending
  - id: tab-availability-admin
    content: Derive per-tab availability and counts from `DayPageData.resolved`; readers see populated/badged tabs, admin always sees every tab and section with actionable empty states.
    status: pending
  - id: paris-lead
    content: Fold the curated overview highlights into the "Paris, that day" lead standfirst; rely on the persistent novel header for story orientation rather than a separate tab.
    status: pending
  - id: sidebar-role
    content: Convert the persistent sidebar into a slim "On this day" orientation rail (dateline, almanac facts, jump links); remove dead Annonce card and rough OCR from ambient chrome.
    status: pending
  - id: connective-tissue
    content: Add cultural-context connective tissue, linking people, institutions, and the timeline from day content so each clipping ties into a person and a thread.
    status: pending
  - id: source-framing
    content: Reframe Original paper around the feuilleton relationship and Galignani as the English-in-Paris lens, with clear provenance and cross-links.
    status: pending
isProject: false
---

# Day Page Tabs Review And Improvement Plan

## Core thesis

The day page should feel like opening a newspaper on a specific morning in 1844 Paris. Dumas's chapter is the *feuilleton*, the serialized fiction at the foot of page 1 that sold the paper; everything around it reconstructs the city the original readers lived in that day. Immersion comes less from more tabs and more from a strong sense of time and place, fewer but richer surfaces, and connective tissue between the novel, the people, and the events.

## Findings

- Tabs render through [app/day/[date]/page.tsx](app/day/[date]/page.tsx), [components/day/DayPageView.tsx](components/day/DayPageView.tsx), [components/day/ReadingColumn.tsx](components/day/ReadingColumn.tsx), and [components/day/TabRow.tsx](components/day/TabRow.tsx). Data comes from [lib/content.ts](lib/content.ts) (`day_content.doc` + `media_assets` + R2 text into `resolved.*`).
- Population paths exist for most surfaces: `ingest-day` / `ingest-range` for scans, strip, French source, and translation; `translate-day` / `translate-all` for `translated_pages` plus segmented `chapter`, `debats`, `art_exhibitions`, `science`; `summarize-day` for Overview highlights; `pull-galignani` / `galignani-all` for Galignani.
- For `1844-08-31`, `Chapter`, `Original paper`, `Translated paper`, and `Galignani` are useful; `Débats`, `Art`, and `Science` mostly show empty states; the persistent `Paris, that day` sidebar repeats topical snippets and surfaces rough Galignani OCR on every tab. The `Annonce` card is hardcoded empty.
- Correctness gaps: [app/day/[date]/page.tsx](app/day/[date]/page.tsx) omits `translated` from `VALID_TABS`; [scripts/ingest-day.ts](scripts/ingest-day.ts) calls the one-argument `step` helper as `step(5, "translate-day")`.

## Verdicts on prior proposals

Accepted:
- Fix the `translated` tab validation and the `ingest-day` step bug.
- Per-tab availability metadata, with `adminMode` always showing every tab and section.
- Keep rough OCR confined to the Galignani disclosure, not ambient chrome.
- Reframe Galignani as the English-language lens on Paris.
- Cross-link source tabs to people and the timeline.

Rejected / dropped:
- Side-by-side original/translation anchors (dropped per request).
- OCR confidence notices in the reader UI (dropped per request).
- Treating overlap purely as "duplication" to delete. Teaser-to-full layering is fine; the real fix is giving each surface a distinct job.

Revised (my change of direction):
- Drop the standalone `Overview` tab. It duplicates both the persistent novel header above the tabs and the `Paris, that day` content. Its one unique asset, the curated highlights, becomes the lead of `Paris, that day`.
- Consolidate `Débats`, `Art & exhibitions`, and `Science` into the single `Paris, that day` tab with internal sections. Fewer top-level tabs, one clear doorway into the city, no thin empty tabs for readers. Admin keeps every granular section editable.
- With `Paris, that day` carrying the city content and the highlights lead, the persistent sidebar stops being a second content surface and becomes a slim "On this day" rail, removing the current sidebar/Overview/tab three-way overlap.

## Recommended reader-facing tab model

There is no separate `Overview` tab. Novel orientation already lives in persistent chrome above the tabs (the chapter kicker, title, and Continue/Listen CTAs in [components/day/ReadingColumn.tsx](components/day/ReadingColumn.tsx) and [components/day/DayTopBar.tsx](components/day/DayTopBar.tsx)), and the day's world is `Paris, that day`, which is itself the overview of the day. A second tab that re-teases headlines and doorways would just duplicate both.

Five tabs, each with a distinct job:
- `Paris, that day` — default tab and the day's front page: opens with the curated highlights lead (the `summarize-day` output), then politics, music, theatre, art and Salon, science, and literature as sections, each tied to people and the timeline.
- `Chapter` — the novel itself: full text, narration, multi-chapter flow. The core reading experience.
- `Original paper` — the artifact: the real Journal des Débats issue, framed around the feuilleton relationship.
- `Translated paper` — the English edition: per-page reading of the whole issue.
- `Galignani` — the English-in-Paris lens: what the city's British and American residents read that morning.

Admin mode overrides this: all granular sections (`overview`, `debats.music`, `debats.theater`, `debats.art`, `debats.literature`, `art_exhibitions`, `science`, etc.) stay visible and editable even when empty, with actionable empty states. The curated `overview` highlights remain an editable section; for readers they surface as the `Paris, that day` lead rather than a standalone tab.

## What actually drives immersion

Three principles, each tied to a concrete change; everything else is secondary.

1. Make the feuilleton relationship legible. This is the product's defining insight, and nothing on the page currently teaches it: the chapter a reader just finished ran along the foot of page 1 of a real newspaper. Concrete: in `Original paper`, show the page-1 scan with the feuilleton strip located in context and captioned with the relationship, rather than only as a separate left-rail crop. Highest-leverage and most distinctive work.
2. Turn clippings into a web through people and the timeline. Isolated translated sections read as disconnected scraps, yet the same composers, playwrights, scientists, and politicians recur for months. Concrete: link every byline and named figure to its `/people` profile, reuse [components/people/BeatBadge.tsx](components/people/BeatBadge.tsx), and add a compact "figures in today's paper" element tying the day into the broader cast and timeline.
3. Give every section intent, present or absent. A populated section should lead with one line on why it mattered that day; an empty one should still name what that part of Paris held and link to the original issue on Gallica, so absence reads as "to be recovered." Concrete: section headers carry a short standfirst; empty states carry a beat label plus Gallica link rather than generic "being prepared" copy.

Lighter touches, only if cheap: surface day of week in the existing dateline and keep prev/next continuity prominent. Deprioritized as speculative with no supporting data today: season/almanac facts and cross-day "still running" threads.

## Implementation shape

1. Fix correctness in [app/day/[date]/page.tsx](app/day/[date]/page.tsx) (add `translated` to `VALID_TABS`) and [scripts/ingest-day.ts](scripts/ingest-day.ts) (correct the `step` call).
2. Introduce a reader/admin tab model in [components/day/TabRow.tsx](components/day/TabRow.tsx) and [components/day/DayPageView.tsx](components/day/DayPageView.tsx): availability and counts from `DayPageData.resolved`, five reader tabs with `Paris, that day` as default, full granular set in admin mode.
3. Build the consolidated `Paris, that day` tab from the curated highlights plus [components/day/DebatsTab.tsx](components/day/DebatsTab.tsx), [components/day/ArtTab.tsx](components/day/ArtTab.tsx), and [components/day/ScienceTab.tsx](components/day/ScienceTab.tsx), with internal sections and per-section cross-links. The highlights from [components/day/OverviewTab.tsx](components/day/OverviewTab.tsx) become its lead standfirst rather than a separate tab.
4. Slim [components/day/ParisSidebar.tsx](components/day/ParisSidebar.tsx) into an "On this day" rail (dateline, jump links, figures today), removing the dead Annonce card and ambient OCR; retire the standalone Overview tab while keeping `overview` editable in admin mode.
5. Add connective tissue: link people and the timeline from day content, reusing contributor data resolved in [app/day/[date]/page.tsx](app/day/[date]/page.tsx) and the new [components/people/BeatBadge.tsx](components/people/BeatBadge.tsx).
6. Reframe source exploration in [components/day/OriginalPaperTab.tsx](components/day/OriginalPaperTab.tsx) (feuilleton relationship), [components/day/TranslatedPaperTab.tsx](components/day/TranslatedPaperTab.tsx) (English edition; replace the legacy fallback with a clean empty/translate state), and [components/day/GalignaniTab.tsx](components/day/GalignaniTab.tsx) (English-in-Paris framing).
