create table if not exists public.admin_tasks (
  id uuid primary key default gen_random_uuid(),
  task_date date not null,
  task_time time not null,
  task_type text not null default 'other',
  title text not null,
  note text,
  student_id uuid references public.students(id) on delete set null,
  student_name text,
  grade text,
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  created_by uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_tasks_date_status_idx
  on public.admin_tasks(task_date, status, task_time);
