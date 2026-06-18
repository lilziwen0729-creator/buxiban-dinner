create table if not exists public.transport_schedules (
  id uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday between 1 and 5),
  transport_time time not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  student_id uuid references public.students(id) on delete set null,
  student_name text not null,
  grade text,
  location text,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transport_schedules_weekday_time_idx
  on public.transport_schedules(weekday, transport_time);

create index if not exists transport_schedules_student_idx
  on public.transport_schedules(student_id);

alter table public.transport_schedules disable row level security;

alter table public.transport_schedules
  alter column student_id drop not null;
