-- Sprint 9: translation_versions table
-- Stores every translation ever produced for a (installment_date, section, slot_key) triple.
-- The LIVE public text lives in day_content.doc (TextItem.text_r2_key); this table
-- holds the full history including displaced versions, challengers, and the exact
-- snapshot taken at the moment each version was set live.

create table translation_versions (
  id uuid primary key default gen_random_uuid(),

  -- Identity
  installment_date date not null references installments(installment_date) on delete cascade,
  -- Fixed section identifier: 'overview' | 'chapter' | 'debats.music' | 'debats.theater'
  -- | 'debats.art' | 'debats.literature' | 'art_exhibitions' | 'science' | 'galignani'
  section text not null,
  -- Stable per-item identity (mirrors TextItem.slot_key); survives re-segmentation.
  slot_key text not null,

  -- Snapshot of the translated English text on R2 + its provenance at translation time
  text_r2_key text not null,
  source text not null,
  original_date date,
  gallica_url text,
  license text not null,
  attribution text not null,
  contributor_id uuid references people(id),

  -- Translation provenance
  -- 'machine_claude' | 'existing_published' | 'staff_translation'
  translation_origin text not null,
  -- Exact model id that produced this version (null for existing_published)
  model_used text,
  -- Human translator name when translation_origin = 'existing_published'
  translator text,
  -- URL of an existing published translation (existing_published only)
  translation_source_url text,
  -- Public permalink to the untranslated French source (Gallica texteBrut, FMC Project, etc.)
  source_text_url text,
  -- Admin-only R2 key for the exact French text that was translated (side-by-side diff)
  fr_intermediate_r2_key text,
  -- Per-call cost from TranslationUsage (null for existing_published)
  cost_usd numeric,
  -- True when the model or source flagged low confidence in accuracy
  low_confidence boolean not null default false,
  -- Admin-only notes about this version (quality flags, manual overrides, etc.)
  admin_notes text,

  -- Versioning meta
  translated_at timestamptz not null default now(),
  translated_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Efficient lookup: list all versions for a slot in reverse-chronological order
create index idx_tv_lookup
  on translation_versions (installment_date, section, slot_key, translated_at desc);

-- Admin-only access; public readers query day_content.doc, never this table
alter table translation_versions enable row level security;

create policy "admin read translation_versions"
  on translation_versions for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "admin write translation_versions"
  on translation_versions for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
