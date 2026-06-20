create table if not exists public.line_staff_groups (
  id uuid primary key default gen_random_uuid(),
  group_id text not null unique,
  group_name text,
  is_active boolean not null default true,
  bound_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists line_staff_groups_active_idx
  on public.line_staff_groups(is_active);

alter table public.line_staff_groups disable row level security;

