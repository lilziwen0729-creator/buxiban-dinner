create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  notification_type text not null,
  channel text not null default 'line',
  recipient_type text null,
  recipient_id text null,
  recipient_name text null,
  student_id uuid null references public.students(id) on delete set null,
  student_name text null,
  status text not null default 'pending',
  message text null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists notification_logs_created_at_idx on public.notification_logs (created_at desc);
create index if not exists notification_logs_type_idx on public.notification_logs (notification_type);
create index if not exists notification_logs_status_idx on public.notification_logs (status);
create index if not exists notification_logs_student_id_idx on public.notification_logs (student_id);

alter table public.notification_logs disable row level security;
