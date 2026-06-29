-- =============================================================================
-- Add a per-profile background/backdrop image, mirroring portrait_media_asset_id.
-- =============================================================================

-- Allow media_assets to register backdrop images (distinct from 'portrait').
alter table media_assets drop constraint media_assets_kind_check;
alter table media_assets add constraint media_assets_kind_check
  check (kind in (
    'illustration', 'portrait', 'background', 'caricature', 'playbill',
    'architecture', 'novel_plate', 'scan', 'audio', 'other'
  ));

alter table people
  add column background_media_asset_id uuid references media_assets;

-- person_page_view: surface the resolved background asset alongside the portrait.
-- New columns are appended at the end of the SELECT list — `create or replace view`
-- can only add columns there, not interleaved with the original ones.
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
  portrait.download_blocked as portrait_download_blocked,
  p.background_media_asset_id,
  background.r2_key      as background_r2_key,
  background.source_url  as background_source_url,
  background.attribution as background_attribution,
  background.download_blocked as background_download_blocked
from people p
left join life_events le on le.person_id = p.id
left join relationships r
  on r.from_person = p.id or r.to_person = p.id
left join contributor_attributions ca on ca.person_id = p.id
left join media_assets portrait on portrait.id = p.portrait_media_asset_id
left join media_assets background on background.id = p.background_media_asset_id
group by
  p.id, p.slug, p.name, p.is_contributor, p.category, p.beat,
  p.birth, p.death, p.bio_md_r2_key, p.autobio_md_r2_key,
  p.portrait_media_asset_id, p.sources, p.created_at,
  portrait.r2_key, portrait.source_url,
  portrait.attribution, portrait.download_blocked,
  p.background_media_asset_id,
  background.r2_key, background.source_url,
  background.attribution, background.download_blocked;
