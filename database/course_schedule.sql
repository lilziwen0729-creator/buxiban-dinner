create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade text,
  day_of_week integer not null,
  start_date date,
  start_time time,
  end_time time,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.courses
  add column if not exists name text,
  add column if not exists grade text,
  add column if not exists day_of_week integer,
  add column if not exists start_date date,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists attendance_section text not null default 'auto',
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now();

update public.courses
set start_date = (created_at at time zone 'Asia/Taipei')::date
where start_date is null;

alter table public.courses
  drop constraint if exists courses_attendance_section_check;

alter table public.courses
  add constraint courses_attendance_section_check
  check (attendance_section in ('auto', 'primary', 'junior', 'hidden'));

update public.courses
set attendance_section = case
  when grade in ('幼兒', '大班', '小一', '小二', '小三', '小四', '小五', '小六') then 'primary'
  when grade in ('國一', '國二', '國三') then 'junior'
  else 'auto'
end
where attendance_section is null or attendance_section = 'auto';

create table if not exists public.student_courses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  start_date date,
  created_at timestamptz not null default now(),
  unique (student_id, course_id)
);

alter table public.student_courses
  add column if not exists student_id uuid references public.students(id) on delete cascade,
  add column if not exists course_id uuid references public.courses(id) on delete cascade,
  add column if not exists start_date date,
  add column if not exists created_at timestamptz not null default now();

update public.student_courses
set start_date = (created_at at time zone 'Asia/Taipei')::date
where start_date is null;

create unique index if not exists student_courses_student_course_key
  on public.student_courses(student_id, course_id);
create index if not exists courses_day_of_week_idx
  on public.courses(day_of_week);
create index if not exists student_courses_course_id_idx
  on public.student_courses(course_id);
create index if not exists student_courses_start_date_idx
  on public.student_courses(start_date);

alter table public.courses disable row level security;
alter table public.student_courses disable row level security;
