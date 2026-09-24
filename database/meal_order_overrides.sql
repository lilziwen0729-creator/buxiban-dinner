begin;

create table if not exists public.meal_order_overrides (
  student_id uuid not null references public.students(id) on delete cascade,
  order_date date not null,
  should_order boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (student_id, order_date)
);
create index if not exists meal_order_overrides_date_idx on public.meal_order_overrides(order_date);

alter table public.meal_order_overrides enable row level security;
drop policy if exists meal_order_overrides_read on public.meal_order_overrides;
create policy meal_order_overrides_read on public.meal_order_overrides
  for select to authenticated using (true);
revoke all on public.meal_order_overrides from anon, authenticated;
grant select on public.meal_order_overrides to authenticated;
grant select on public.meal_order_overrides to service_role;

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
        select menu_id into v_menu_id from public.weekly_schedule
          where replace(replace(weekday, '周', '週'), '星期', '週') = v_day
          limit 1;
        if v_date = v_today and v_menu_id is null then
          raise exception '今日尚未設定排餐，無法加訂';
        end if;
        if v_order.id is not null then
          update public.orders set ordered = true, cancelled = false,
            meal_id = case when v_date = v_today then v_menu_id else meal_id end
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
