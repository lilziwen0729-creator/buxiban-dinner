begin;

alter table public.orders add column if not exists special_meal boolean not null default false;
create table if not exists public.special_meal_days (
  meal_date date primary key,
  title text not null check (length(btrim(title)) between 1 and 80),
  version integer not null default 1,
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);
alter table public.special_meal_days enable row level security;
revoke all on public.special_meal_days from public,anon,authenticated;
grant select on public.special_meal_days to authenticated;
drop policy if exists special_meal_days_admin_read on public.special_meal_days;
create policy special_meal_days_admin_read on public.special_meal_days for select to authenticated using(auth.uid() is not null);

create or replace function public.get_special_meal_day(p_date date)
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  if p_date is null then raise exception '請選擇日期'; end if;
  return jsonb_build_object(
    'day',(select to_jsonb(d) from public.special_meal_days d where meal_date=p_date),
    'students',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'name',s.name,'grade',coalesce(s.grade,''),'active',coalesce(s.enrollment_status,'active')='active',
      'absent',exists(select 1 from public.leave_records l where l.student_id=s.id and l.leave_date=p_date and not coalesce(l.kept_order,false)),
      'order',case when o.id is null then null else jsonb_build_object(
        'id',o.id,'meal_id',o.meal_id,'cancelled',coalesce(o.cancelled,false),'received',coalesce(o.received,false),
        'charged',coalesce(o.charged,false),'special_meal',o.special_meal) end
    ) order by s.grade,s.name,s.id),'[]'::jsonb)
      from public.students s left join public.orders o on o.student_id=s.id and o.order_date=p_date
      where coalesce(s.enrollment_status,'active')='active' or o.id is not null)
  );
end;
$$;

create or replace function public.update_special_meal_day(
  p_date date,p_title text,p_expected_version integer,p_action text,p_menu_id uuid,p_rows jsonb
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_day public.special_meal_days%rowtype;
  v_student public.students%rowtype;
  v_order public.orders%rowtype;
  v_row jsonb;
  v_actual jsonb;
  v_id uuid;
  v_reason text;
  v_changed integer := 0;
  v_skipped jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  if p_date is null or p_date<v_today or p_date>v_today+180 then raise exception '只能設定今天起 180 天內的日期'; end if;
  if coalesce(length(btrim(p_title)),0) not between 1 and 80 then raise exception '請填寫 1 至 80 字的活動名稱'; end if;
  if p_expected_version is null or p_action is null or p_action not in ('save','add','cancel','restore','menu')
    or p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception '操作資料不完整'; end if;
  if (p_action='save' and jsonb_array_length(p_rows)<>0)
    or (p_action<>'save' and jsonb_array_length(p_rows) not between 1 and 1000) then raise exception '請選擇 1 至 1000 位學生'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where not(r ? 'student_id' and r ? 'expected_order') or nullif(r->>'student_id','') is null)
    or exists(select 1 from jsonb_array_elements(p_rows) r group by r->>'student_id' having count(*)>1) then raise exception '學生名單格式不正確或重複'; end if;
  if p_action in ('add','restore','menu') and not exists(
    select 1 from public.menus m join public.vendors v on v.id=m.vendor_id
      where m.id=p_menu_id and coalesce((to_jsonb(m)->>'is_active')::boolean,true) and m.price>0
  ) then raise exception '請選擇啟用中且金額大於 0 的餐點'; end if;

  perform pg_advisory_xact_lock(hashtext('special_meal:' || p_date::text));
  select * into v_day from public.special_meal_days where meal_date=p_date for update;
  if coalesce(v_day.version,0)<>p_expected_version then raise exception '餐單已被更新，請重新整理後再操作'; end if;
  for v_row in select value from jsonb_array_elements(p_rows) order by value->>'student_id' loop
    v_id := (v_row->>'student_id')::uuid;
    select * into v_student from public.students where id=v_id for update;
    if not found then raise exception '學生已不存在，請重新整理'; end if;
    select * into v_order from public.orders where student_id=v_id and order_date=p_date for update;
    v_actual := case when v_order.id is null then 'null'::jsonb else jsonb_build_object(
      'id',v_order.id,'meal_id',v_order.meal_id,'cancelled',coalesce(v_order.cancelled,false),
      'received',coalesce(v_order.received,false),'charged',coalesce(v_order.charged,false),'special_meal',v_order.special_meal) end;
    if v_actual is distinct from v_row->'expected_order' then raise exception '% 的訂單已變更，請重新整理後再操作',v_student.name; end if;
    v_reason := null;
    if coalesce(v_order.received,false) or coalesce(v_order.charged,false) then v_reason := '已領餐或扣款，請至今日訂餐或歷史紀錄處理';
    elsif p_action<>'cancel' and coalesce(v_student.enrollment_status,'active')<>'active' then v_reason := '學生已退班';
    elsif p_action<>'cancel' and exists(select 1 from public.leave_records where student_id=v_id and leave_date=p_date and not coalesce(kept_order,false)) then v_reason := '已請假停餐';
    elsif p_action='add' and v_order.id is not null then v_reason := case when coalesce(v_order.cancelled,false) then '已取消，請使用恢復訂餐' else '已有訂餐，不重複新增' end;
    elsif p_action='restore' and (v_order.id is null or not coalesce(v_order.cancelled,false)) then v_reason := '沒有可恢復的已取消訂單';
    elsif p_action in ('cancel','menu') and (v_order.id is null or coalesce(v_order.cancelled,false)) then v_reason := '沒有有效訂單';
    end if;
    if v_reason is not null then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('name',v_student.name,'reason',v_reason));
      continue;
    end if;
    if p_action='add' then
      -- Create the real future order now, so a weekend does not depend on weekday cron.
      insert into public.orders(student_id,order_date,meal_id,ordered,cancelled,received,charged,special_meal)
      values(v_id,p_date,p_menu_id,true,false,false,false,true)
      on conflict(student_id,order_date) do nothing;
      if not found then raise exception '% 的訂單剛被新增，請重新整理',v_student.name; end if;
    elsif p_action='restore' then
      update public.orders set meal_id=p_menu_id,ordered=true,cancelled=false,special_meal=true where id=v_order.id;
    elsif p_action='menu' then
      update public.orders set meal_id=p_menu_id,special_meal=true where id=v_order.id;
    elsif p_action='cancel' then
      update public.orders set ordered=false,cancelled=true where id=v_order.id;
    end if;
    if p_action in ('add','restore','cancel') then
      insert into public.meal_order_overrides(student_id,order_date,should_order,created_by)
      values(v_id,p_date,p_action<>'cancel',auth.uid())
      on conflict(student_id,order_date) do update set should_order=excluded.should_order,created_by=excluded.created_by,updated_at=now();
    end if;
    v_changed := v_changed+1;
  end loop;
  insert into public.special_meal_days(meal_date,title,updated_by) values(p_date,btrim(p_title),auth.uid())
  on conflict(meal_date) do update set title=excluded.title,version=special_meal_days.version+1,updated_by=excluded.updated_by,updated_at=now();
  return jsonb_build_object('changed',v_changed,'skipped',v_skipped);
end;
$$;
revoke all on function public.get_special_meal_day(date) from public,anon;
revoke all on function public.update_special_meal_day(date,text,integer,text,uuid,jsonb) from public,anon;
grant execute on function public.get_special_meal_day(date) to authenticated;
grant execute on function public.update_special_meal_day(date,text,integer,text,uuid,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
