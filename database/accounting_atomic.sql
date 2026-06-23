create or replace function public.settle_order_atomic(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_meal_id uuid;
  v_received boolean;
  v_charged boolean;
  v_price numeric;
  v_meal_name text;
  v_student_name text;
  v_new_balance numeric;
begin
  select student_id, meal_id, received, charged
    into v_student_id, v_meal_id, v_received, v_charged
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('status', 'skipped', 'reason', '找不到訂單');
  end if;
  if v_charged then
    return jsonb_build_object('status', 'skipped', 'reason', '訂單已扣款');
  end if;
  if not coalesce(v_received, false) then
    return jsonb_build_object('status', 'skipped', 'reason', '尚未領餐');
  end if;
  if v_meal_id is null then
    return jsonb_build_object('status', 'skipped', 'reason', '缺少餐點');
  end if;

  select price, name into v_price, v_meal_name
  from public.menus
  where id = v_meal_id;

  if coalesce(v_price, 0) <= 0 then
    return jsonb_build_object('status', 'skipped', 'reason', '餐點價格異常');
  end if;

  select name into v_student_name
  from public.students
  where id = v_student_id
  for update;

  if not found then
    return jsonb_build_object('status', 'skipped', 'reason', '找不到學生');
  end if;

  update public.students
  set balance = coalesce(balance, 0) - v_price
  where id = v_student_id
  returning balance into v_new_balance;

  insert into public.transactions (student_id, type, amount, balance_after, description)
  values (v_student_id, 'order', -v_price, v_new_balance, '餐費結算：' || coalesce(v_meal_name, '今日餐點'));

  update public.orders set charged = true where id = p_order_id;

  return jsonb_build_object(
    'status', 'charged',
    'order_id', p_order_id,
    'student_id', v_student_id,
    'student_name', coalesce(v_student_name, '未知'),
    'amount', -v_price,
    'balance_after', v_new_balance
  );
end;
$$;

create or replace function public.register_parent_leave_atomic(
  p_student_id uuid,
  p_leave_date date,
  p_before_cutoff boolean,
  p_student_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attendance_id uuid;
  v_order_id uuid;
  v_order_charged boolean := false;
  v_meal_id uuid;
  v_price numeric := 0;
  v_meal_name text;
  v_name text;
  v_new_balance numeric;
  v_cancelled boolean := false;
  v_refunded boolean := false;
  v_kept boolean := false;
begin
  select name into v_name
  from public.students
  where id = p_student_id
  for update;

  if not found then
    raise exception '找不到學生資料';
  end if;
  v_name := coalesce(p_student_name, v_name);

  select id into v_attendance_id
  from public.attendance_logs
  where student_id = p_student_id
    and date = p_leave_date
    and course_id is null
  limit 1;

  if v_attendance_id is null then
    insert into public.attendance_logs (student_id, date, course_id, status)
    values (p_student_id, p_leave_date, null, 'leave');
  else
    update public.attendance_logs set status = 'leave' where id = v_attendance_id;
  end if;

  select id, charged, meal_id
    into v_order_id, v_order_charged, v_meal_id
  from public.orders
  where student_id = p_student_id and order_date = p_leave_date
  limit 1
  for update;

  if p_before_cutoff and v_order_id is not null then
    if coalesce(v_order_charged, false) then
      select price, name into v_price, v_meal_name
      from public.menus
      where id = v_meal_id;

      if coalesce(v_price, 0) <= 0 then
        raise exception '找不到今日餐點價格，無法退款';
      end if;

      update public.students
      set balance = coalesce(balance, 0) + v_price
      where id = p_student_id
      returning balance into v_new_balance;

      insert into public.transactions (student_id, type, amount, balance_after, description)
      values (p_student_id, 'refund', v_price, v_new_balance, '請假取消訂餐退款(' || coalesce(v_meal_name, '今日餐點') || ')');

      v_refunded := true;
    end if;

    delete from public.orders where id = v_order_id;
    v_cancelled := true;
  elsif not p_before_cutoff and v_order_id is not null then
    v_kept := true;
  end if;

  insert into public.leave_records as existing (
    leave_date, student_id, student_name, source, cancelled_order,
    refunded, refund_amount, kept_order, metadata
  ) values (
    p_leave_date, p_student_id, v_name, 'parent', v_cancelled,
    v_refunded, case when v_refunded then v_price else 0 end, v_kept,
    jsonb_build_object('cutoff_locked', not p_before_cutoff, 'atomic', true)
  )
  on conflict (leave_date, student_id) do update set
    student_name = excluded.student_name,
    source = excluded.source,
    cancelled_order = existing.cancelled_order or excluded.cancelled_order,
    refunded = existing.refunded or excluded.refunded,
    refund_amount = greatest(existing.refund_amount, excluded.refund_amount),
    kept_order = existing.kept_order or excluded.kept_order,
    metadata = excluded.metadata;

  return jsonb_build_object(
    'status', 'leave_registered',
    'cancelled_order', v_cancelled,
    'refunded', v_refunded,
    'refund_amount', case when v_refunded then v_price else 0 end,
    'kept_order', v_kept
  );
end;
$$;

create or replace function public.adjust_student_balance_atomic(
  p_student_id uuid,
  p_amount numeric,
  p_type text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance_before numeric;
  v_balance_after numeric;
begin
  if p_amount = 0 then
    raise exception '調整金額不可為 0';
  end if;
  if p_type not in ('topup', 'adjustment') then
    raise exception '不支援的調帳類型';
  end if;
  if nullif(trim(p_description), '') is null then
    raise exception '請填寫調整原因';
  end if;

  select coalesce(balance, 0) into v_balance_before
  from public.students
  where id = p_student_id
  for update;

  if not found then
    raise exception '找不到學生資料';
  end if;

  v_balance_after := v_balance_before + p_amount;
  update public.students set balance = v_balance_after where id = p_student_id;

  insert into public.transactions (student_id, type, amount, balance_after, description)
  values (p_student_id, p_type, p_amount, v_balance_after, p_description);

  return jsonb_build_object(
    'status', 'updated',
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'amount', p_amount
  );
end;
$$;

revoke all on function public.settle_order_atomic(uuid) from public;
revoke all on function public.register_parent_leave_atomic(uuid, date, boolean, text) from public;
revoke all on function public.adjust_student_balance_atomic(uuid, numeric, text, text) from public;

grant execute on function public.settle_order_atomic(uuid) to anon, authenticated;
grant execute on function public.register_parent_leave_atomic(uuid, date, boolean, text) to service_role;
grant execute on function public.adjust_student_balance_atomic(uuid, numeric, text, text) to authenticated;

create unique index if not exists orders_student_date_unique
  on public.orders(student_id, order_date);
