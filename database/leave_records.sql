create table if not exists public.leave_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  leave_date date not null,
  student_id uuid not null references public.students(id) on delete cascade,
  student_name text null,
  source text not null default 'admin',
  reason text null,
  cancelled_order boolean not null default false,
  refunded boolean not null default false,
  refund_amount integer not null default 0,
  kept_order boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  unique (leave_date, student_id)
);

create index if not exists leave_records_leave_date_idx on public.leave_records (leave_date desc);
create index if not exists leave_records_student_id_idx on public.leave_records (student_id);
create index if not exists leave_records_source_idx on public.leave_records (source);

alter table public.leave_records disable row level security;
