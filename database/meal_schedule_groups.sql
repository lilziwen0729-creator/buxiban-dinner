begin;

-- Backfill once. Re-running must not overwrite a group's deliberately empty menu.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'weekly_schedule' and column_name = 'primary_menu_id') then
    alter table public.weekly_schedule
      add column primary_vendor_id uuid references public.vendors(id),
      add column primary_menu_id uuid references public.menus(id);
    update public.weekly_schedule set primary_vendor_id = vendor_id, primary_menu_id = menu_id;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'weekly_schedule' and column_name = 'junior_menu_id') then
    alter table public.weekly_schedule
      add column junior_vendor_id uuid references public.vendors(id),
      add column junior_menu_id uuid references public.menus(id);
    update public.weekly_schedule set junior_vendor_id = vendor_id, junior_menu_id = menu_id;
  end if;
end;
$$;

-- A removed vendor/menu must not cascade into the other group's daily plan.
do $$
declare v_fk record;
begin
  for v_fk in
    select c.conname, a.attname, c.confrelid::regclass as target
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.conrelid = 'public.weekly_schedule'::regclass and c.contype = 'f'
      and cardinality(c.conkey) = 1 and c.confdeltype <> 'n'
      and a.attname in ('vendor_id','menu_id','primary_vendor_id','primary_menu_id','junior_vendor_id','junior_menu_id')
  loop
    execute format('alter table public.weekly_schedule drop constraint %I, add constraint %I foreign key (%I) references %s(id) on delete set null', v_fk.conname, v_fk.conname, v_fk.attname, v_fk.target);
  end loop;
end;
$$;

create or replace function public.meal_school_group(p_grade text)
returns text language sql immutable set search_path = public
as $$
  select case
    when regexp_replace(coalesce(p_grade, ''), '\s', '', 'g') ~ '^(小|國小)' then 'primary'
    when regexp_replace(coalesce(p_grade, ''), '\s', '', 'g') ~ '^國' then 'junior'
    else 'other' end;
$$;

create or replace function public.save_grouped_meal_schedule(p_rows jsonb, p_sync_today boolean default true)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_item jsonb;
  v_day text;
  v_group text;
  v_vendor uuid;
  v_menu uuid;
  v_old_vendor uuid;
  v_old_menu uuid;
  v_saved public.weekly_schedule%rowtype;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_today_day text := (array['星期一','星期二','星期三','星期四','星期五','星期六','星期日'])[extract(isodow from v_today)::integer];
  v_changed integer := 0;
  v_synced integer := 0;
  v_count integer;
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception '排餐資料格式不正確'; end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 15 then
    raise exception '請提供 1 至 15 項排餐設定';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r group by r->>'weekday', r->>'meal_group' having count(*) > 1) then
    raise exception '排餐設定重複';
  end if;
  perform pg_advisory_xact_lock(hashtext('grouped_meal_schedule'));
  for v_item in select value from jsonb_array_elements(p_rows) order by value->>'weekday', value->>'meal_group' loop
    v_day := v_item->>'weekday';
    v_group := v_item->>'meal_group';
    if v_day is null or v_day not in ('星期一','星期二','星期三','星期四','星期五')
      or v_group is null or v_group not in ('primary','junior','other') then
      raise exception '星期或年級分組不正確';
    end if;
    if not (v_item ? 'expected_vendor_id' and v_item ? 'expected_menu_id') then
      raise exception '缺少原排餐資料，請重新整理後再儲存';
    end if;
    v_vendor := nullif(v_item->>'vendor_id', '')::uuid;
    v_menu := nullif(v_item->>'menu_id', '')::uuid;
    if (v_vendor is null) <> (v_menu is null) then raise exception '請同時選擇商家與餐點，或清空兩者'; end if;

    insert into public.weekly_schedule (weekday) values (v_day) on conflict (weekday) do nothing;
    select * into v_saved from public.weekly_schedule where weekday = v_day for update;
    v_old_vendor := case v_group when 'primary' then v_saved.primary_vendor_id when 'junior' then v_saved.junior_vendor_id else v_saved.vendor_id end;
    v_old_menu := case v_group when 'primary' then v_saved.primary_menu_id when 'junior' then v_saved.junior_menu_id else v_saved.menu_id end;
    if v_old_vendor is distinct from nullif(v_item->>'expected_vendor_id', '')::uuid
      or v_old_menu is distinct from nullif(v_item->>'expected_menu_id', '')::uuid then
      raise exception '% 的排餐已被其他人更新，請重新整理後確認', v_day;
    end if;
    if v_menu is not null and not exists (
      select 1 from public.menus m where m.id = v_menu and m.vendor_id = v_vendor
        and (v_menu = v_old_menu or coalesce((to_jsonb(m)->>'is_active')::boolean, true))
    ) then raise exception '餐點不屬於所選商家，或餐點已停用'; end if;
    if v_old_vendor is distinct from v_vendor or v_old_menu is distinct from v_menu then
      update public.weekly_schedule set
        primary_vendor_id = case when v_group = 'primary' then v_vendor else primary_vendor_id end,
        primary_menu_id = case when v_group = 'primary' then v_menu else primary_menu_id end,
        junior_vendor_id = case when v_group = 'junior' then v_vendor else junior_vendor_id end,
        junior_menu_id = case when v_group = 'junior' then v_menu else junior_menu_id end,
        vendor_id = case when v_group = 'other' then v_vendor else vendor_id end,
        menu_id = case when v_group = 'other' then v_menu else menu_id end
      where weekday = v_day;
      v_changed := v_changed + 1;
    end if;
    -- Re-saving an unchanged plan also repairs earlier missed synchronizations.
    if coalesce(p_sync_today, false) and v_day = v_today_day
      and (v_menu is not null or v_old_menu is distinct from v_menu) then
      update public.orders o set meal_id = v_menu
      from public.students s
      where o.student_id = s.id and public.meal_school_group(s.grade) = v_group
        and o.order_date = v_today and not coalesce(o.cancelled, false)
        and not coalesce(o.charged, false)
        and o.meal_id is distinct from v_menu;
      get diagnostics v_count = row_count;
      v_synced := v_synced + v_count;
    end if;
  end loop;
  return jsonb_build_object('changed', v_changed, 'synced_orders', v_synced);
end;
$$;
revoke all on function public.save_grouped_meal_schedule(jsonb, boolean) from public, anon;
grant execute on function public.save_grouped_meal_schedule(jsonb, boolean) to authenticated;

create or replace function public.set_meal_order_dates(
  p_student_id uuid,
  p_dates date[],
  p_should_order boolean
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_date date;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_day text;
  v_fixed boolean;
  v_should_order boolean;
  v_order public.orders%rowtype;
  v_menu_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  if p_student_id is null or p_dates is null or cardinality(p_dates) < 1 or cardinality(p_dates) > 31 then
    raise exception '一次請選擇 1 至 31 個日期';
  end if;

  select * into v_student from public.students where id = p_student_id for update;
  if not found or coalesce(v_student.enrollment_status, 'active') <> 'active' then
    raise exception '找不到在班學生';
  end if;

  for v_date in select distinct unnest(p_dates) order by 1 loop
    if v_date is null or v_date < v_today or v_date > v_today + 180 then
      raise exception '只能設定今天起 180 天內的日期';
    end if;
    if extract(isodow from v_date) > 5 then
      raise exception '週六、週日目前沒有自動排餐，請選擇平日';
    end if;

    v_day := (array['週一','週二','週三','週四','週五'])[extract(isodow from v_date)::integer];
    v_fixed := coalesce(v_student.auto_order, false)
      and exists (
        select 1 from jsonb_array_elements_text(coalesce(to_jsonb(v_student.fixed_days_off), '[]'::jsonb)) as day_name
        where replace(replace(day_name, '周', '週'), '星期', '週') = v_day
      );
    v_should_order := coalesce(p_should_order, v_fixed);

    if p_should_order is true and exists (
      select 1 from public.leave_records
      where student_id = p_student_id and leave_date = v_date and not kept_order
    ) then
      raise exception '% 已登記請假，請先取消請假或不要加訂', v_date;
    end if;
    if exists (
      select 1 from public.leave_records
      where student_id = p_student_id and leave_date = v_date and not kept_order
    ) then
      v_should_order := false;
    end if;

    select * into v_order from public.orders
      where student_id = p_student_id and order_date = v_date for update;
    if found and (coalesce(v_order.received, false) or coalesce(v_order.charged, false))
      and (not v_should_order or coalesce(v_order.cancelled, false)) then
      raise exception '% 的訂單已領餐或扣款，請至今日訂餐處理', v_date;
    end if;

    if p_should_order is null then
      delete from public.meal_order_overrides
        where student_id = p_student_id and order_date = v_date;
    else
      insert into public.meal_order_overrides (student_id, order_date, should_order, created_by)
      values (p_student_id, v_date, p_should_order, auth.uid())
      on conflict (student_id, order_date) do update
        set should_order = excluded.should_order,
            updated_at = now(), created_by = excluded.created_by;
    end if;

    if v_should_order then
      if v_date = v_today or v_order.id is not null then
        select (case
          when regexp_replace(coalesce(to_jsonb(v_student)->>'grade', ''), '\s', '', 'g') ~ '^(小|國小)'
            and to_jsonb(s) ? 'primary_menu_id' then to_jsonb(s)->>'primary_menu_id'
          when regexp_replace(coalesce(to_jsonb(v_student)->>'grade', ''), '\s', '', 'g') ~ '^國'
            and to_jsonb(s) ? 'junior_menu_id' then to_jsonb(s)->>'junior_menu_id'
          else to_jsonb(s)->>'menu_id' end)::uuid into v_menu_id
          from public.weekly_schedule s
          where replace(replace(s.weekday, '周', '週'), '星期', '週') = v_day
          limit 1;
        if v_date = v_today and v_menu_id is null then
          raise exception '此年級今日尚未設定排餐，無法加訂';
        end if;
        if v_order.id is not null then
          update public.orders set ordered = true, cancelled = false,
            meal_id = case when v_date = v_today and not coalesce(received, false)
              and not coalesce(charged, false) then v_menu_id else meal_id end
            where id = v_order.id;
        else
          insert into public.orders (student_id, order_date, meal_id, ordered, cancelled, received, charged)
          values (p_student_id, v_date, v_menu_id, true, false, false, false);
        end if;
      end if;
    elsif v_order.id is not null then
      update public.orders set ordered = false, cancelled = true
        where id = v_order.id;
    end if;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('updated', v_count);
end;
$$;

revoke all on function public.set_meal_order_dates(uuid, date[], boolean) from public, anon;
grant execute on function public.set_meal_order_dates(uuid, date[], boolean) to authenticated;
notify pgrst, 'reload schema';
commit;

