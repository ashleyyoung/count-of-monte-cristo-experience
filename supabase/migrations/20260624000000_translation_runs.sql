-- ---------------------------------------------------------------------------
-- translation_runs: per-day translation run status (local async runner)
--
-- Records each "Re-translate day locally" run kicked off from the admin UI (or
-- the CLI). Distinct from translation_versions (which holds translated content
-- history): this table holds run/job STATUS so the day page can show whether a
-- run is queued/running/done/failed on the next refresh. Admin-only; the public
-- never queries it.
-- ---------------------------------------------------------------------------

create table translation_runs (
  id                uuid primary key default gen_random_uuid(),
  installment_date  date not null references installments(installment_date) on delete cascade,
  status            text not null default 'queued'
                      check (status in ('queued', 'running', 'done', 'failed')),
  summary           jsonb,        -- {translated, challengers, created, skipped, failed[]}
  error             text,
  requested_by      uuid references profiles(id),
  created_at        timestamptz not null default now(),
  started_at        timestamptz,
  finished_at       timestamptz
);

-- Latest-run lookup per day (day page reads the most recent row).
create index idx_runs_latest
  on translation_runs (installment_date, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: admin-only for both read and write (no public read policy).
-- Service role (CLI script + createAdminClient) bypasses RLS.
-- ---------------------------------------------------------------------------

alter table translation_runs enable row level security;

create policy "translation_runs: admin all"
  on translation_runs for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
