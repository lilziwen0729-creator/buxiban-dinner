create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  job_name text not null,
  run_date date not null,
  status text not null default 'success',
  total integer not null default 0,
  success_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  message text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists automation_runs_job_date_idx on public.automation_runs (job_name, run_date, created_at desc);
create index if not exists automation_runs_status_idx on public.automation_runs (status);

alter table public.automation_runs disable row level security;
