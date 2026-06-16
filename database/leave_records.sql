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

alter table public.leave_records
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists leave_date date,
  add column if not exists student_id uuid references public.students(id) on delete cascade,
  add column if not exists student_name text,
  add column if not exists source text not null default 'admin',
  add column if not exists reason text,
  add column if not exists cancelled_order boolean not null default false,
  add column if not exists refunded boolean not null default false,
  add column if not exists refund_amount integer not null default 0,
  add column if not exists kept_order boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists leave_records_leave_date_student_id_key
  on public.leave_records (leave_date, student_id);
create index if not exists leave_records_leave_date_idx on public.leave_records (leave_date desc);
create index if not exists leave_records_student_id_idx on public.leave_records (student_id);
create index if not exists leave_records_source_idx on public.leave_records (source);

alter table public.leave_records disable row level security;
