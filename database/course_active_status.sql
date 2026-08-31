begin;

alter table public.courses
  add column if not exists is_active boolean not null default true;

notify pgrst, 'reload schema';

commit;
