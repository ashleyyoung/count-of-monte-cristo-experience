-- =============================================================================
-- Add a short one-line tagline to people, used for hover cards on bylines and
-- named figures across the day page. Distinct from bio_md_r2_key (the full bio
-- markdown in R2): the tagline is a single editorial sentence cheap enough to
-- ship in a tooltip. When null, the UI falls back to "<beat> · <birth>–<death>".
-- =============================================================================

alter table people
  add column tagline text;

-- Backfill taglines for the seeded contributors (mirrors scripts/seed-contributors.ts,
-- which carries the same values for fresh databases). Idempotent — keyed by slug.
update people set tagline = 'Drama critic of the Journal des Débats for four decades; called the prince of critics.' where slug = 'jules-janin';
update people set tagline = 'Composer of the Symphonie fantastique and music critic for the Journal des Débats.' where slug = 'hector-berlioz';
update people set tagline = 'Art critic of the Journal des Débats; a pupil of David and chronicler of the Salon.' where slug = 'etienne-jean-delecluze';
update people set tagline = 'Literary editorialist of the Journal des Débats and curator at the Bibliothèque Mazarine.' where slug = 'silvestre-de-sacy';
update people set tagline = 'Comparative-literature critic and scholar of English and American letters.' where slug = 'philarete-chasles';
update people set tagline = 'Physicist who later proved Earth''s rotation with his pendulum; co-wrote the paper''s science feuilleton.' where slug = 'leon-foucault';
update people set tagline = 'Physician and microscopy pioneer who wrote the Journal des Débats science feuilleton.' where slug = 'alfred-donne';
update people set tagline = 'Sorbonne professor, deputy, and political editorialist for the Journal des Débats.' where slug = 'saint-marc-girardin';
update people set tagline = 'Foreign-affairs writer for the Journal des Débats, expert on English politics.' where slug = 'john-lemoinne';
update people set tagline = 'Economist and Saint-Simonian; champion of free trade and the railways.' where slug = 'michel-chevalier';
update people set tagline = 'Historian and columnist, former tutor to the Orléans princes.' where slug = 'alfred-cuvillier-fleury';
update people set tagline = 'Proprietor and director of the Journal des Débats.' where slug = 'armand-bertin';

-- person_page_view: surface the tagline alongside the existing fields.
-- `create or replace view` can only append columns at the end of the SELECT.
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
  background.download_blocked as background_download_blocked,
  p.tagline
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
  background.attribution, background.download_blocked,
  p.tagline;
