-- Sprint 7: expose life_events.id and relationships.id in person_page_view
-- so admin mode can edit and delete individual records.
-- Also expose bio_md_r2_key, autobio_md_r2_key, portrait_media_asset_id
-- through PersonPageData for admin writes.

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
        'id',          le.id,
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
        'id',              r.id,
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
