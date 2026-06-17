alter table public.menus
  add column if not exists is_active boolean not null default true;

update public.menus
set is_active = true
where is_active is null;

create index if not exists menus_vendor_active_idx
  on public.menus(vendor_id, is_active);
