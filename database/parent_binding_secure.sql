alter table public.parents
  add column if not exists reset_code text;

with duplicate_codes as (
  select
    id,
    row_number() over (partition by reset_code order by id) as duplicate_number
  from public.parents
  where reset_code is not null
)
update public.parents as parent
set reset_code = null
from duplicate_codes
where parent.id = duplicate_codes.id
  and duplicate_codes.duplicate_number > 1;

drop index if exists public.parents_reset_code_idx;
create unique index if not exists parents_reset_code_unique_idx
  on public.parents(reset_code)
  where reset_code is not null;

create or replace function public.issue_parent_binding_code_atomic(p_parent_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempt integer := 0;
begin
  perform 1 from public.parents where id = p_parent_id for update;
  if not found then
    raise exception '找不到家長資料';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := lpad(floor(random() * 1000000)::integer::text, 6, '0');
    exit when not exists (
      select 1 from public.parents where reset_code = v_code
    );
    if v_attempt >= 20 then
      raise exception '暫時無法產生綁定碼，請稍後再試';
    end if;
  end loop;

  update public.parents set reset_code = v_code where id = p_parent_id;
  return v_code;
end;
$$;

create or replace function public.bind_parent_line_atomic(
  p_reset_code text,
  p_line_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
  v_existing_line_user_id text;
begin
  if p_reset_code !~ '^\d{6}$' then
    raise exception '綁定碼格式不正確';
  end if;
  if nullif(trim(p_line_user_id), '') is null then
    raise exception '缺少 LINE 使用者資料';
  end if;

  select id, line_user_id
    into v_parent_id, v_existing_line_user_id
  from public.parents
  where reset_code = p_reset_code
  for update;

  if not found then
    raise exception '綁定碼無效或已使用';
  end if;
  if v_existing_line_user_id is not null
     and v_existing_line_user_id <> p_line_user_id then
    raise exception '此家長已綁定其他 LINE 帳號';
  end if;
  if exists (
    select 1
    from public.parents
    where line_user_id = p_line_user_id
      and id <> v_parent_id
  ) then
    raise exception '此 LINE 帳號已綁定其他家長資料';
  end if;

  update public.parents
  set line_user_id = p_line_user_id,
      reset_code = null
  where id = v_parent_id;

  return jsonb_build_object('status', 'bound', 'parent_id', v_parent_id);
end;
$$;

revoke all on function public.issue_parent_binding_code_atomic(uuid) from public;
revoke all on function public.bind_parent_line_atomic(text, text) from public;

grant execute on function public.issue_parent_binding_code_atomic(uuid) to authenticated;
grant execute on function public.bind_parent_line_atomic(text, text) to anon, authenticated;
