-- =============================================================================
-- Monte Cristo Experience — Initial Schema Migration
-- =============================================================================
-- Applies: all tables, indexes, views, RLS policies, and triggers.
-- Run once against a fresh Supabase project.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

-- Install pg_trgm in the extensions schema (not public) per Supabase security guidance.
create schema if not exists extensions;
create extension if not exists pg_trgm schema extensions;
create extension if not exists "uuid-ossp"; -- uuid_generate_v4()

-- ---------------------------------------------------------------------------
-- 1. installments (thin reference table — FK anchor for all per-date data)
-- ---------------------------------------------------------------------------

create table installments (
  installment_date date primary key,
  part             smallint not null check (part between 1 and 4),
  part_index       smallint not null,   -- 1-based within the part
  global_index     smallint not null,   -- 1-based across all 139
  label            text not null,       -- "I. Marseilles — Arrival · II. Father and Son"
  chapters         jsonb not null default '[]'::jsonb,  -- [{num, title, cont}]
  is_hiatus_after  boolean not null default false       -- true on last entry before the gap
);

-- ---------------------------------------------------------------------------
-- 2. profiles (extends auth.users)
-- ---------------------------------------------------------------------------

create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  role         text not null default 'member' check (role in ('admin', 'member')),
  display_name text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row whenever a new user signs up.
-- security definer required to write to profiles from the auth trigger;
-- revoke public execute so it can't be called directly via the REST API.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. progress
-- ---------------------------------------------------------------------------

create table progress (
  user_id          uuid not null references auth.users on delete cascade,
  installment_date date not null references installments on delete cascade,
  completed_at     timestamptz not null default now(),
  primary key (user_id, installment_date)
);

-- ---------------------------------------------------------------------------
-- 4. user_prefs
-- ---------------------------------------------------------------------------

create table user_prefs (
  user_id       uuid primary key references auth.users on delete cascade,
  last_location date references installments,
  view_pref     text not null default 'horizontal' check (view_pref in ('horizontal', 'vertical')),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. day_content (one JSON document per installment date)
-- ---------------------------------------------------------------------------

create table day_content (
  installment_date date primary key references installments on delete restrict,
  doc              jsonb not null default '{}'::jsonb,
  updated_by       uuid references auth.users,
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. media_assets (reusable binary assets on R2)
-- ---------------------------------------------------------------------------

create table media_assets (
  id                      uuid primary key default uuid_generate_v4(),
  kind                    text not null check (kind in (
                            'illustration', 'portrait', 'caricature', 'playbill',
                            'architecture', 'novel_plate', 'scan', 'audio', 'other'
                          )),
  title                   text,
  caption                 text,
  tags                    text[] not null default '{}',
  source                  text,
  source_url              text,
  iiif_region             text,     -- "x,y,w,h" pixel region on the Gallica page
  license                 text,
  attribution             text,
  r2_key                  text,     -- null only when download_blocked = true
  download_blocked        boolean not null default false,
  download_blocked_reason text,     -- required when download_blocked = true
  created_at              timestamptz not null default now(),

  constraint download_blocked_requires_reason
    check (not download_blocked or download_blocked_reason is not null),
  constraint no_r2_key_requires_blocked
    check (r2_key is not null or download_blocked)
);

-- GIN indexes for the MediaPicker search
create index media_assets_tags_gin  on media_assets using gin (tags);
create index media_assets_trgm_gin  on media_assets using gin (
  (coalesce(title, '') || ' ' || coalesce(attribution, '') || ' ' || coalesce(caption, ''))
  extensions.gin_trgm_ops
);

-- ---------------------------------------------------------------------------
-- 7. asset_links (polymorphic join — one asset on many dates/people/chapters)
-- ---------------------------------------------------------------------------

create table asset_links (
  id               uuid primary key default uuid_generate_v4(),
  media_asset_id   uuid not null references media_assets on delete cascade,
  target_type      text not null check (target_type in ('installment', 'person', 'chapter')),
  target_key       text not null,   -- installment_date::text, people.id::text, or chapter id
  tab              text,
  section          text,
  sort_order       integer not null default 0
);

create index asset_links_target on asset_links (target_type, target_key);

-- ---------------------------------------------------------------------------
-- 8. people (contributors + famous connections)
-- ---------------------------------------------------------------------------

create table people (
  id                    uuid primary key default uuid_generate_v4(),
  slug                  text not null unique,
  name                  text not null,
  is_contributor        boolean not null default false,
  category              text not null default 'figure'
                          check (category in ('contributor', 'figure', 'royalty')),
  beat                  text check (beat in (
                          'music', 'drama', 'art', 'literature', 'science',
                          'politics', 'foreign', 'economics', 'direction'
                        )),
  birth                 integer,    -- year
  death                 integer,    -- year
  bio_md_r2_key         text,       -- R2 key for biography markdown
  autobio_md_r2_key     text,       -- R2 key for autobiographical excerpts markdown
  portrait_media_asset_id uuid references media_assets,
  sources               jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 9. contributor_attributions
-- ---------------------------------------------------------------------------

create table contributor_attributions (
  person_id        uuid not null references people on delete cascade,
  installment_date date not null references installments on delete cascade,
  section          text not null,
  primary key (person_id, installment_date, section)
);

-- ---------------------------------------------------------------------------
-- 10. relationships (edges in the people graph)
-- ---------------------------------------------------------------------------

create table relationships (
  id          uuid primary key default uuid_generate_v4(),
  from_person uuid not null references people on delete cascade,
  to_person   uuid not null references people on delete cascade,
  kind        text not null check (kind in (
                'family', 'romantic', 'friend', 'rival', 'mentor',
                'collaborator', 'patron', 'royalty', 'professional'
              )),
  label       text,
  description text,
  start_year  integer,
  end_year    integer,
  sources     jsonb not null default '[]'::jsonb,

  -- Normalize symmetric edges: (least, greatest, kind) is unique.
  -- Directed kinds (mentor, patron) keep from→to meaningful.
  constraint relationships_no_self_loop check (from_person <> to_person)
);

-- Dedup index: prevents A→B and B→A for the same kind.
create unique index relationships_dedup
  on relationships (
    least(from_person::text, to_person::text),
    greatest(from_person::text, to_person::text),
    kind
  );

-- ---------------------------------------------------------------------------
-- 11. life_events
-- ---------------------------------------------------------------------------

create table life_events (
  id               uuid primary key default uuid_generate_v4(),
  person_id        uuid not null references people on delete cascade,
  event_date       date,
  precision        text check (precision in ('day', 'month', 'year')),
  title            text not null,
  description      text,
  kind             text not null check (kind in (
                     'birth', 'death', 'work', 'appointment', 'award',
                     'publication', 'premiere', 'discovery', 'personal'
                   )),
  sources          jsonb not null default '[]'::jsonb
);

-- ---------------------------------------------------------------------------
-- 12. editorial_blocks (page-level prose, admin-editable)
-- ---------------------------------------------------------------------------

create table editorial_blocks (
  key            text primary key,
  title          text,
  body_md_r2_key text,
  updated_by     uuid references auth.users,
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 13. graph_layout (persisted canonical coords for /debats whole-network graph)
-- ---------------------------------------------------------------------------

create table graph_layout (
  variant    text not null,
  person_id  uuid not null references people on delete cascade,
  x          real not null,
  y          real not null,
  updated_at timestamptz not null default now(),
  primary key (variant, person_id)
);

-- ---------------------------------------------------------------------------
-- 14. graph_variants (registered layout configurations)
-- ---------------------------------------------------------------------------

create table graph_variants (
  key        text primary key,
  label      text not null,
  params     jsonb not null default '{}'::jsonb,  -- LayoutOpts
  published  boolean not null default false,
  is_default boolean not null default false,
  sort       integer not null default 0
);

-- Ensure exactly one default variant at a time.
create unique index graph_variants_one_default
  on graph_variants (is_default) where is_default = true;

-- Seed the three standard variants (unpublished until we see them).
insert into graph_variants (key, label, params, sort) values
  ('structural',    'Structural',    '{"cohesion":"none",   "iters":200}', 1),
  ('beat-soft',     'Beat groups — soft',   '{"cohesion":"mild",   "iters":200}', 2),
  ('beat-grouped',  'Beat groups — strong', '{"cohesion":"strong", "iters":200}', 3);

-- ---------------------------------------------------------------------------
-- 15. Precomputed VIEWs
-- ---------------------------------------------------------------------------

-- day_page_view: all data needed to render /day/[date]
-- security_invoker = true ensures the view respects RLS on the underlying tables
-- (the querying user's policies apply, not the view definer's)
create or replace view day_page_view
with (security_invoker = true)
as
select
  dc.installment_date,
  dc.doc,
  coalesce(
    json_agg(
      jsonb_build_object(
        'id',          ma.id,
        'kind',        ma.kind,
        'title',       ma.title,
        'r2_key',      ma.r2_key,
        'source_url',  ma.source_url,
        'license',     ma.license,
        'attribution', ma.attribution,
        'tab',         al.tab,
        'section',     al.section,
        'sort_order',  al.sort_order
      ) order by al.sort_order
    ) filter (where ma.id is not null),
    '[]'::json
  ) as linked_assets
from day_content dc
left join asset_links al
  on al.target_type = 'installment'
  and al.target_key = dc.installment_date::text
left join media_assets ma on ma.id = al.media_asset_id
group by dc.installment_date, dc.doc;

-- person_page_view: all data needed to render /people/[slug]
-- security_invoker = true — same rationale as day_page_view
create or replace view person_page_view
with (security_invoker = true)
as
select
  p.id,
  p.slug,
  p.name,
  p.is_contributor,
  p.category,
  p.beat,
  p.birth,
  p.death,
  p.bio_md_r2_key,
  p.autobio_md_r2_key,
  p.portrait_media_asset_id,
  p.sources,
  p.created_at,
  coalesce(
    json_agg(
      distinct jsonb_build_object(
        'event_date',  le.event_date,
        'precision',   le.precision,
        'title',       le.title,
        'description', le.description,
        'kind',        le.kind,
        'sources',     le.sources
      )
    ) filter (where le.id is not null),
    '[]'::json
  ) as life_events,
  coalesce(
    json_agg(
      distinct jsonb_build_object(
        'other_person_id', case
          when r.from_person = p.id then r.to_person
          else r.from_person
        end,
        'kind',        r.kind,
        'label',       r.label,
        'description', r.description,
        'start_year',  r.start_year,
        'end_year',    r.end_year,
        'sources',     r.sources
      )
    ) filter (where r.id is not null),
    '[]'::json
  ) as relationships,
  coalesce(
    json_agg(
      distinct jsonb_build_object(
        'installment_date', ca.installment_date,
        'section',          ca.section
      )
    ) filter (where ca.person_id is not null),
    '[]'::json
  ) as attributions,
  portrait.r2_key      as portrait_r2_key,
  portrait.source_url  as portrait_source_url,
  portrait.attribution as portrait_attribution,
  portrait.download_blocked as portrait_download_blocked
from people p
left join life_events le on le.person_id = p.id
left join relationships r
  on r.from_person = p.id or r.to_person = p.id
left join contributor_attributions ca on ca.person_id = p.id
left join media_assets portrait on portrait.id = p.portrait_media_asset_id
group by
  p.id, p.slug, p.name, p.is_contributor, p.category, p.beat,
  p.birth, p.death, p.bio_md_r2_key, p.autobio_md_r2_key,
  p.portrait_media_asset_id, p.sources, p.created_at,
  portrait.r2_key, portrait.source_url,
  portrait.attribution, portrait.download_blocked;

-- ---------------------------------------------------------------------------
-- 16. Row-Level Security
-- ---------------------------------------------------------------------------

alter table profiles                  enable row level security;
alter table progress                  enable row level security;
alter table user_prefs                enable row level security;
alter table installments              enable row level security;
alter table day_content               enable row level security;
alter table media_assets              enable row level security;
alter table asset_links               enable row level security;
alter table people                    enable row level security;
alter table contributor_attributions  enable row level security;
alter table relationships             enable row level security;
alter table life_events               enable row level security;
alter table editorial_blocks          enable row level security;
alter table graph_layout              enable row level security;
alter table graph_variants            enable row level security;

-- profiles: users can read/update their own row only
create policy "profiles: own row"
  on profiles for all
  using (id = auth.uid());

-- progress: per-user
create policy "progress: own rows"
  on progress for all
  using (user_id = auth.uid());

-- user_prefs: per-user
create policy "user_prefs: own row"
  on user_prefs for all
  using (user_id = auth.uid());

-- installments: public read, admin write
create policy "installments: public read"
  on installments for select
  using (true);

create policy "installments: admin write"
  on installments for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Helper macro for the "public read, admin write" pattern.
-- Applied to: day_content, media_assets, asset_links, people,
--             contributor_attributions, relationships, life_events,
--             editorial_blocks, graph_layout, graph_variants

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'day_content', 'media_assets', 'asset_links', 'people',
    'contributor_attributions', 'relationships', 'life_events',
    'editorial_blocks', 'graph_layout', 'graph_variants'
  ] loop
    execute format(
      'create policy %I on %I for select using (true)',
      tbl || ': public read', tbl
    );
    execute format(
      'create policy %I on %I for all
       using (
         exists (
           select 1 from profiles
           where profiles.id = auth.uid()
             and profiles.role = ''admin''
         )
       )',
      tbl || ': admin write', tbl
    );
  end loop;
end $$;

-- profiles.role must not be self-assignable
create policy "profiles: role not self-assignable"
  on profiles for update
  using (id = auth.uid())
  with check (
    role = (select role from profiles where id = auth.uid())
    or
    exists (
      select 1 from profiles p2
      where p2.id = auth.uid() and p2.role = 'admin'
    )
  );
