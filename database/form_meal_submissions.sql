begin;

create table if not exists public.form_meal_submissions (
  response_id text primary key,
  form_id text not null,
  student_name text not null,
  grade_group text not null,
  selected_dates date[] not null default '{}',
  submitted_at timestamptz,
  student_id uuid references public.students(id) on delete set null,
  status text not null check (status in ('received', 'unmatched', 'applied', 'review', 'error')),
  applied_dates date[] not null default '{}',
  skipped_dates date[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists form_meal_submissions_status_idx
  on public.form_meal_submissions(status, created_at desc);

alter table public.form_meal_submissions enable row level security;
drop policy if exists form_meal_submissions_read on public.form_meal_submissions;
create policy form_meal_submissions_read on public.form_meal_submissions
  for select to authenticated using (true);
revoke all on public.form_meal_submissions from anon, authenticated;
grant select on public.form_meal_submissions to authenticated;
grant all on public.form_meal_submissions to service_role;

notify pgrst, 'reload schema';
commit;
