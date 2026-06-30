-- =============================================================================
-- Monte Cristo Experience — Book reading/listening progress
-- =============================================================================
-- Per-user position for the "read the whole novel" and "listen end to end"
-- sections. Unlike `progress` (keyed by installment_date) this tracks position
-- by chapter Roman numeral, which is what those two linear views navigate by.
--
-- One row per user. last_listen_position is seconds into last_listen_chapter.
-- =============================================================================

create table book_progress (
  user_id              uuid primary key references auth.users on delete cascade,
  last_read_chapter    text,                                  -- Roman numeral, e.g. "XIV"
  last_listen_chapter  text,                                  -- Roman numeral, e.g. "XIV"
  last_listen_position double precision not null default 0,   -- seconds into last_listen_chapter
  last_listen_lang     text not null default 'en' check (last_listen_lang in ('en', 'fr')),
  updated_at           timestamptz not null default now()
);

alter table book_progress enable row level security;

-- book_progress: per-user
create policy "book_progress: own row"
  on book_progress for all
  using (user_id = auth.uid());
