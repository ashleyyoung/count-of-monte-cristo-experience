---
name: MC Master Coordination
overview: "The coordination layer above the sub-plans: the project north star, experience pillars, design and engineering standards, and an execution index that sequences and tracks all eleven sub-plans. The detailed design reference remains monte_cristo_experience_ceccdb4a.plan.md."
todos:
  - id: exec-sprint-1
    content: Execute Sprint 1 — Foundation (schema incl. graph_layout/graph_variants/editorial_blocks, auth, progress, R2 helpers, content libs, schedule + chapter text)
    status: pending
  - id: exec-sprint-2
    content: Execute Sprint 2 — Design System (sepia tokens + fonts, landing page, admin-mode chrome)
    status: pending
  - id: exec-sprint-3
    content: Execute Sprint 3 — Timeline Views (horizontal + vertical, progress, anchors, auto-navigate)
    status: pending
  - id: exec-sprint-4
    content: Execute Sprint 4 — Day Detail Pages (3-column layout + all tabs incl. Original paper)
    status: pending
  - id: exec-graph-engine
    content: Execute Graph Engine (lib/graph-layout.ts, SVG renderers, variants, edit overlay, deterministic tests) — parallelizable with Sprints 3-4
    status: pending
  - id: exec-sprint-5
    content: Execute Sprint 5 — Profiles + Débats Hub (profiles, timelines, gallery, paper hub; mount graph engine; seed people/relationships + initial recompute)
    status: pending
  - id: exec-sprint-6
    content: Execute Sprint 6 — Citation & Attribution System (Pinyon Script token, Cite + AdminNote primitives, unify source rendering, markdown footnotes)
    status: pending
  - id: exec-sprint-7
    content: Execute Sprint 7 — Inline Admin Mode (shared edit primitives, server actions for existing entities, per-surface wiring, AudioPlayer) — parallelizable with Sprints 6, 8
    status: pending
  - id: exec-sprint-8
    content: Execute Sprint 8 — Gallica Scan/Crop Pipeline (lib/gallica.ts, scripts/gallica: resolve-issue, pull-scans, crop-strip, alto-ocr) — parallelizable with Sprints 6, 7
    status: pending
  - id: exec-sprint-9
    content: Execute Sprint 9 — Translation Subsystem (schema + translation_versions, LLM client, translate pipeline, import-existing, vision experiment + trigger, translateDay, TranslationHistory)
    status: pending
  - id: exec-sprint-10
    content: Execute Sprint 10 — Content Population + Launch (run pipelines, work 139 packets, prod env + migrations, end-to-end validation)
    status: pending
isProject: false
---

# Monte Cristo — Master Coordination Plan

This is the **orchestration + tracking** layer. It sequences the sub-plans, holds the cross-cutting goals and standards, and is the document to re-read before starting or merging any sprint so the work stays centered.

- **Canonical design reference (the detailed spec):** [`monte_cristo_experience_ceccdb4a.plan.md`](/Users/ashleyyoung/count-of-monte-cristo/monte_cristo_experience_ceccdb4a.plan.md).
- **Translation subsystem source of truth:** [`README_translation_architecture.md`](/Users/ashleyyoung/count-of-monte-cristo/README_translation_architecture.md).
- **Execution units (sub-plans):**
  - [Sprint 1 — Foundation](/Users/ashleyyoung/.cursor/plans/mc_sprint_1_foundation_4e9343bb.plan.md)
  - [Sprint 2 — Design System](/Users/ashleyyoung/.cursor/plans/mc_sprint_2_design_system_722003b2.plan.md)
  - [Sprint 3 — Timeline Views](/Users/ashleyyoung/.cursor/plans/mc_sprint_3_timeline_views_1e1a720e.plan.md)
  - [Sprint 4 — Day Detail Pages](/Users/ashleyyoung/.cursor/plans/mc_sprint_4_day_detail_pages_df7e2a8f.plan.md)
  - [Graph Engine](/Users/ashleyyoung/.cursor/plans/mc_graph_engine_01a7d13b.plan.md)
  - [Sprint 5 — Profiles + Débats Hub](/Users/ashleyyoung/.cursor/plans/mc_sprint_5_profiles_and_debats_hub_e1660e8e.plan.md)
  - [Sprint 6 — Citation & Attribution System](/Users/ashleyyoung/.cursor/plans/mc_sprint_6_citation_attribution_a1c2e3f4.plan.md)
  - [Sprint 7 — Inline Admin Mode](/Users/ashleyyoung/.cursor/plans/mc_sprint_7_inline_admin_mode_b2d3f4a5.plan.md)
  - [Sprint 8 — Gallica Scan/Crop Pipeline](/Users/ashleyyoung/.cursor/plans/mc_sprint_8_gallica_scan_pipeline_c3e4a5b6.plan.md)
  - [Sprint 9 — Translation Subsystem](/Users/ashleyyoung/.cursor/plans/mc_sprint_9_translation_subsystem_d4f5b6c7.plan.md)
  - [Sprint 10 — Content Population + Launch](/Users/ashleyyoung/.cursor/plans/mc_sprint_10_content_population_launch_e5a6c7d8.plan.md)

---

## North star

An **immersive cultural exploration from the perspective of a reader in Dumas's Paris (1844–46)**. The reader steps into the shoes of a _Journal des Débats_ subscriber following _The Count of Monte Cristo_ as it was serialized, surrounded by the music, theatre, art, science, politics, and daily news of those exact dates.

Every feature decision is judged against one question: **does this deepen the feeling of being a reader in that time and place?** If it doesn't serve the immersion, it doesn't ship.

## Experience pillars (keep us centered)

- **Self-paced and open.** All content is viewable without an account; login exists only to track progress.
- **Timeline-driven.** The 139 real installment dates are the spine; two views (horizontal cards, vertical scroll) over the same data.
- **The original as artifact.** Content shown is English; the original is presented as scanned pages of the paper plus a link to the Gallica issue. No French transcriptions.
- **Always link to sources.** Every excerpt, image, recording, bio, and edge shows a visible, clickable attribution. Nothing ships without provenance.
- **People as a living network.** Contributors and their famous connections are explorable via whole-life profiles and a deterministic relationship graph.
- **Period immersion over chrome.** Editorial, artifact-first presentation; UI recedes so the 1844 world is foreground.

## Design standard (non-negotiable)

- **Direction 1 — "Aged paper & sepia ink · subtle."** The exact aesthetic from `monte-cristo/Monte Cristo Experience.html`; tokens + fonts defined in Sprint 2.
- Fonts: UnifrakturMaguntia (masthead), Bodoni Moda (display), EB Garamond (body), IM Fell English (labels), Cormorant Garamond (supporting).
- Parchment grounds, warm brown inks, gilt accents, period rules and drop-caps. **Every surface** (timeline, day, profiles, hub, graph, admin affordances) uses these tokens. No Tailwind utility classes in UI components.
- Motion is subtle and respects `prefers-reduced-motion`.

## Engineering standards (enforced across all plans)

- **Modularity / no duplication.** Shared primitives are built once and reused: the content libs (`lib/content.ts`, `lib/people.ts`, `lib/installments.ts`), the inline-admin edit primitives, the Graph Engine, the R2/media helpers. New surfaces are wiring, not new infrastructure.
- **Single source of truth for shape.** One shared **Zod discriminated-union schema** validates `day_content` docs at every write path (admin + scripts); TS types derive from it.
- **Logical correctness by construction.** Plain Postgres views + fresh SSR (no stale cache); strict discriminated-union doc items (no precedence/fallback); deterministic graph layout; FK + uniqueness constraints; **RLS admin policies are the real authorization** (UI toggles are convenience).
- **Determinism + tests.** The graph engine and view/doc contracts are snapshot/contract-tested so drift fails CI.
- **Provenance is a required field**, not optional, on every content/media row, and is rendered.
- **Accessibility + responsiveness** on every page.
- **Latest stable versions** of frameworks/libraries.

### Sprint 6–10 series guardrails (the former monolithic Sprint 6, now split)

These five sub-plans share infrastructure, so a few rules keep them modular and prevent drift. Each sub-plan references this block rather than restating it.

- **One Anthropic entry point.** `lib/llm/translate.ts` is the only module that constructs an Anthropic client or names a model. Scripts and server actions call it; nothing else imports the SDK. Model ids come from env (`TRANSLATION_MODEL`, `TRANSLATION_VISION_MODEL`); never hardcoded.
- **Pure logic in `lib/`, I/O at the edges.** `lib/gallica.ts`, `lib/llm/translate.ts`, segmentation/confidence helpers are pure and unit-testable; network/R2/DB side effects live in `scripts/*` and `app/actions/admin.ts` (mirrors stock-tracker's transforms-vs-jobs split).
- **Shared edit primitives, built once.** `EditableText`, `EditableList`/`AddItemButton`, `ItemEditor`, `MediaPicker`/`MediaUploadField` (Sprint 7) are the only edit UI; every admin surface (incl. translation history in Sprint 9) composes them. No bespoke per-page editors.
- **One citation primitive.** `<Cite>` / `<AdminNote>` (Sprint 6) are the only attribution UI; all surfaces flow through them. `<Cite>` must render correctly when translation-provenance fields are absent (it ships before translations exist).
- **Stable content identity.** Each `day_content` text item carries a stable `slot_key`; translation history and re-translation key on `slot_key`, never on array position, so versions stay aligned across re-segmentation.
- **Single-writer to `translation_versions`.** Producers (`translate.ts`, `import-existing.ts`, `visionTranscribe`→translate) insert version rows; `update-day-content.ts`/`translateDay` only select the live item and snapshot the displaced one. No two code paths insert the same logical version.
- **No silent fallbacks.** On source-fetch or API failure: log a structured error (`{ day, section, slot_key, stage }`) and surface it in the admin UI. No DeepL, no Tesseract, no quiet substitution.
- **English-only public surface.** French is an admin-only intermediate (`fr_intermediate_r2_key`); never rendered to readers. We cite others' works and link to the French original, but never name our own translation model publicly.
- **Idempotent server actions.** `translateDay`, `visionTranscribe`, and every admin write re-check the admin session, Zod-validate, write base tables, then `router.refresh()`. `translateDay` is create-or-update: it populates a never-translated day and re-translates an existing one.
- **Each sub-plan leaves the app compiling and shippable** — a partial series never breaks the running site.

## Execution order + tracking

Build order (the todos below track status). The Graph Engine only needs Sprint 1 schema + Sprint 2 tokens, so it can run in parallel with Sprints 3–4 and must land before Sprint 5. The former monolithic Sprint 6 is now five sub-plans (6–10): 6, 7, and 8 each depend only on prior sprints and so run in parallel; 9 needs all three; 10 needs everything.

- **1 — [Sprint 1 Foundation](/Users/ashleyyoung/.cursor/plans/mc_sprint_1_foundation_4e9343bb.plan.md)** — schema (incl. `graph_layout`/`graph_variants`, `editorial_blocks`), auth, progress, R2 helpers, content libs, installment dataset + chapter text. Depends on: nothing.
- **2 — [Sprint 2 Design System](/Users/ashleyyoung/.cursor/plans/mc_sprint_2_design_system_722003b2.plan.md)** — sepia tokens + fonts, landing page, admin-mode chrome (provider + toggle). Depends on: 1.
- **3 — [Sprint 3 Timeline Views](/Users/ashleyyoung/.cursor/plans/mc_sprint_3_timeline_views_1e1a720e.plan.md)** — horizontal + vertical timelines, progress, anchors, auto-navigate. Depends on: 1, 2.
- **4 — [Sprint 4 Day Detail Pages](/Users/ashleyyoung/.cursor/plans/mc_sprint_4_day_detail_pages_df7e2a8f.plan.md)** — per-date 3-column page + all tabs (incl. Original paper). Depends on: 1, 2.
- **5 — [Graph Engine](/Users/ashleyyoung/.cursor/plans/mc_graph_engine_01a7d13b.plan.md)** — `lib/graph-layout.ts`, SVG renderers, variants, edit overlay, tests (fixtures). Depends on: 1, 2. Parallelizable with 3–4.
- **6 — [Sprint 5 Profiles + Débats Hub](/Users/ashleyyoung/.cursor/plans/mc_sprint_5_profiles_and_debats_hub_e1660e8e.plan.md)** — profiles, life timelines, gallery, paper hub; mounts the graph engine; seeds people/relationships + initial layout recompute. Depends on: 1–4, Graph Engine.
- **7 — [Sprint 6 Citation & Attribution System](/Users/ashleyyoung/.cursor/plans/mc_sprint_6_citation_attribution_a1c2e3f4.plan.md)** — Pinyon Script token, `<Cite>` + `<AdminNote>` primitives, markdown footnotes, migrate existing source surfaces. Depends on: 1, 2, 5. Parallelizable with Sprints 7, 8.
- **8 — [Sprint 7 Inline Admin Mode](/Users/ashleyyoung/.cursor/plans/mc_sprint_7_inline_admin_mode_b2d3f4a5.plan.md)** — shared edit primitives, `app/actions/admin.ts` for existing entities (incl. graph edit + `recomputeGraphLayout`, AdminNote resolve), per-surface wiring, `AudioPlayer`. Depends on: 1–5. Parallelizable with Sprints 6, 8.
- **9 — [Sprint 8 Gallica Scan/Crop Pipeline](/Users/ashleyyoung/.cursor/plans/mc_sprint_8_gallica_scan_pipeline_c3e4a5b6.plan.md)** — `lib/gallica.ts`, `scripts/gallica/*` (resolve-issue, pull-scans, crop-strip, alto-ocr); populates Original paper tab + feuilleton strip. Depends on: 1. Parallelizable with Sprints 6, 7.
- **10 — [Sprint 9 Translation Subsystem](/Users/ashleyyoung/.cursor/plans/mc_sprint_9_translation_subsystem_d4f5b6c7.plan.md)** — `TextItemSchema` extension + `slot_key`, `translation_versions` table, `lib/llm/translate.ts`, `scripts/translate/*`, `import-existing`, vision experiment + on-demand trigger, `translateDay`, `<TranslationHistory>` + chapter compare. Depends on: 6 (Cite/AdminNote), 7 (admin primitives + server actions), 8 (Gallica source + scans).
- **11 — [Sprint 10 Content Population + Launch](/Users/ashleyyoung/.cursor/plans/mc_sprint_10_content_population_launch_e5a6c7d8.plan.md)** — run pipelines, work all 139 packets, prod env + migrations, end-to-end validation. Depends on: all.

## Per-sprint merge gate (re-check before completing each)

Before marking a sprint done, confirm it upholds the invariants:

1. **Immersion** — the surface serves the "reader in 1844 Paris" feeling.
2. **Aesthetic** — Direction 1 tokens/fonts only; no stray utility classes; reduced-motion honored.
3. **Sources** — every excerpt/image/edge renders a visible, clickable source.
4. **English-only** — no French transcriptions; original shown as scans + Gallica link.
5. **Correctness** — fresh data (no stale cache); Zod-validated writes; RLS enforced; deterministic where claimed.
6. **Modularity** — reused shared primitives; no copy-paste of layout/edit/graph logic.
7. **A11y + responsive** — keyboard, contrast, mobile.

## Definition of done (project)

A reader moves through the full 1844–46 timeline in either view, optionally signs in to track progress, opens immersive per-date pages (chapter, Débats arts in English, art/science, Galignani, original-paper scans), explores fully sourced contributor profiles and the deterministic Débats relationship graph, and an admin can edit any page in place. All content is traceable to a clickable source, and the whole experience wears the sepia Direction 1 aesthetic.
