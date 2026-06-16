create table if not exists public.question_bank (
  id uuid primary key default gen_random_uuid(),
  grade text not null,
  subject text not null,
  unit text,
  difficulty text not null default 'basic' check (difficulty in ('basic', 'medium', 'advanced')),
  question_type text not null default 'short_answer' check (question_type in ('single_choice', 'multiple_choice', 'fill_blank', 'calculation', 'short_answer')),
  question_text text not null,
  answer_text text not null,
  explanation text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.question_bank
  add column if not exists grade text,
  add column if not exists subject text,
  add column if not exists unit text,
  add column if not exists difficulty text not null default 'basic',
  add column if not exists question_type text not null default 'short_answer',
  add column if not exists question_text text,
  add column if not exists answer_text text,
  add column if not exists explanation text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists question_bank_filter_idx
  on public.question_bank(grade, subject, difficulty, question_type);

create index if not exists question_bank_created_at_idx
  on public.question_bank(created_at desc);

alter table public.question_bank disable row level security;
