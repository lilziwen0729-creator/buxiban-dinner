create table if not exists public.transport_schedules (
  id uuid primary key default gen_random_uuid(),
  schedule_type text not null default 'daily_range' check (schedule_type in ('daily_range', 'weekly', 'temporary')),
  schedule_date date,
  start_date date,
  end_date date,
  weekday int not null check (weekday between 1 and 7),
  weekdays int[] not null default '{}',
  transport_time time not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  student_id uuid references public.students(id) on delete set null,
  student_name text not null,
  grade text,
  contact_phone text,
  contact_phone_2 text,
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

alter table public.transport_schedules
  add column if not exists schedule_type text not null default 'daily_range';

alter table public.transport_schedules
  add column if not exists weekdays int[] not null default '{}';

alter table public.transport_schedules
  add column if not exists schedule_date date;

alter table public.transport_schedules
  add column if not exists start_date date;

alter table public.transport_schedules
  add column if not exists end_date date;

alter table public.transport_schedules
  add column if not exists contact_phone text;

alter table public.transport_schedules
  add column if not exists contact_phone_2 text;

alter table public.transport_schedules
  drop constraint if exists transport_schedules_schedule_type_check;

alter table public.transport_schedules
  add constraint transport_schedules_schedule_type_check
  check (schedule_type in ('daily_range', 'weekly', 'temporary'));

-- 現有具起訖日期的舊資料，來自「日期區間每天搭車」畫面。
update public.transport_schedules
set schedule_type = 'daily_range'
where schedule_type = 'weekly'
  and start_date is not null
  and end_date is not null
  and coalesce(array_length(weekdays, 1), 0) = 0;

-- 舊版每週固定資料保留原本星期，讓新固定交通車頁可以繼續管理。
update public.transport_schedules
set weekdays = array[weekday]
where schedule_type = 'weekly'
  and coalesce(array_length(weekdays, 1), 0) = 0;

alter table public.transport_schedules
  drop constraint if exists transport_schedules_weekday_check;

alter table public.transport_schedules
  add constraint transport_schedules_weekday_check
  check (weekday between 1 and 7);

create index if not exists transport_schedules_date_time_idx
  on public.transport_schedules(schedule_date, transport_time);

create index if not exists transport_schedules_range_idx
  on public.transport_schedules(start_date, end_date);

create index if not exists transport_schedules_weekdays_idx
  on public.transport_schedules using gin(weekdays);
