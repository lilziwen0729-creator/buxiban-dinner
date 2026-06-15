alter table public.students
  add column if not exists dietary_restrictions text null,
  add column if not exists meal_preference text null;
