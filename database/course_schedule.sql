create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade text,
  day_of_week integer not null,
  start_time time,
  end_time time,
  created_at timestamptz not null default now()
);

alter table public.courses
  add column if not exists name text,
  add column if not exists grade text,
  add column if not exists day_of_week integer,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.student_courses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, course_id)
);

alter table public.student_courses
  add column if not exists student_id uuid references public.students(id) on delete cascade,
  add column if not exists course_id uuid references public.courses(id) on delete cascade,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists student_courses_student_course_key
  on public.student_courses(student_id, course_id);
create index if not exists courses_day_of_week_idx
  on public.courses(day_of_week);
create index if not exists student_courses_course_id_idx
  on public.student_courses(course_id);

alter table public.courses disable row level security;
alter table public.student_courses disable row level security;
