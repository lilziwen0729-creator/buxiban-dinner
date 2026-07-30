create table if not exists public.transport_cancellations (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.transport_schedules(id) on delete cascade,
  cancel_date date not null,
  student_id uuid references public.students(id) on delete set null,
  student_name text not null,
  grade text,
  transport_time time not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists transport_cancellations_schedule_date_idx
  on public.transport_cancellations(schedule_id, cancel_date);

create index if not exists transport_cancellations_date_time_idx
  on public.transport_cancellations(cancel_date, transport_time);

alter table public.transport_cancellations disable row level security;
