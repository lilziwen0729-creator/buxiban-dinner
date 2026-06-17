alter table public.parents
  add column if not exists reset_code text;

create index if not exists parents_reset_code_idx
  on public.parents(reset_code);
