create table if not exists public.contact_books (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  entry_date date not null,
  lesson_content text,
  homework text,
  quiz_scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(course_id, entry_date)
);

create index if not exists contact_books_entry_date_idx
  on public.contact_books(entry_date desc);

create index if not exists contact_books_course_date_idx
  on public.contact_books(course_id, entry_date desc);

alter table public.contact_books disable row level security;
