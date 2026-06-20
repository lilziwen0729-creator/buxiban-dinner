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
  notify_staff boolean not null default false,
  notification_group_ids text[] not null default '{}'::text[],
  reminder_sent_at timestamptz,
  reminder_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_tasks
  add column if not exists task_date date,
  add column if not exists task_time time,
  add column if not exists task_type text not null default 'other',
  add column if not exists title text,
  add column if not exists note text,
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists student_name text,
  add column if not exists grade text,
  add column if not exists status text not null default 'pending',
  add column if not exists created_by uuid,
  add column if not exists completed_at timestamptz,
  add column if not exists notify_staff boolean not null default false,
  add column if not exists notification_group_ids text[] not null default '{}'::text[],
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists reminder_error text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists admin_tasks_date_status_idx
  on public.admin_tasks(task_date, status, task_time);

alter table public.admin_tasks disable row level security;
