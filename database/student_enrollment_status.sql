alter table public.students
  add column if not exists enrollment_status text not null default 'active'
  check (enrollment_status in ('active', 'withdrawn'));

update public.students
set enrollment_status = 'active'
where enrollment_status is null;

create index if not exists students_enrollment_status_idx
  on public.students(enrollment_status);
