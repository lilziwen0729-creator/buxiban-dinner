create table if not exists public.operation_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid null,
  actor_name text null,
  action text not null,
  target_type text null,
  target_id uuid null,
  target_name text null,
  student_id uuid null,
  student_name text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists operation_logs_created_at_idx on public.operation_logs (created_at desc);
create index if not exists operation_logs_action_idx on public.operation_logs (action);
create index if not exists operation_logs_student_id_idx on public.operation_logs (student_id);

alter table public.operation_logs disable row level security;
