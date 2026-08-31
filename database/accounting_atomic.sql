begin;

alter table public.orders
  add column if not exists cancelled boolean not null default false,
  add column if not exists charged_amount numeric;
alter table public.transactions add column if not exists order_id uuid;
create index if not exists transactions_order_id_idx on public.transactions(order_id);

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
  v_cancelled boolean;
  v_price numeric;
  v_meal_name text;
  v_student_name text;
  v_new_balance numeric;
begin
  -- All wallet operations lock the student before the order.
  select student_id into v_student_id from public.orders where id = p_order_id;
  select name into v_student_name from public.students where id = v_student_id for update;
  if not found then
    return jsonb_build_object('status', 'skipped', 'reason', '找不到學生或訂單');
  end if;

  select meal_id, received, charged, cancelled
    into v_meal_id, v_received, v_charged, v_cancelled
  from public.orders
  where id = p_order_id and student_id = v_student_id
  for update;

  if not found then
    return jsonb_build_object('status', 'skipped', 'reason', '找不到訂單');
  end if;
  if coalesce(v_cancelled, false) then
    return jsonb_build_object('status', 'skipped', 'reason', '訂單已取消');
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

  update public.students
  set balance = coalesce(balance, 0) - v_price
  where id = v_student_id
  returning balance into v_new_balance;

  insert into public.transactions (student_id, type, amount, balance_after, description, order_id)
  values (v_student_id, 'order', -v_price, v_new_balance, '餐費結算：' || coalesce(v_meal_name, '今日餐點'), p_order_id);

  update public.orders set charged = true, charged_amount = v_price where id = p_order_id;

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
  where student_id = p_student_id and order_date = p_leave_date and cancelled is not true
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

-- Legacy charges are usable only when there is exactly one matching ledger entry.
-- Never infer a refund from a menu's current price.
create or replace function public.order_refund_amount(p_order_id uuid)
returns numeric
language plpgsql
stable
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_count integer;
  v_amount numeric;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found or not coalesce(v_order.charged, false) then return 0; end if;
  if v_order.charged_amount > 0 then return v_order.charged_amount; end if;

  select -amount into v_amount from public.transactions
  where order_id = p_order_id and student_id = v_order.student_id and type = 'order' and amount < 0
  order by created_at desc limit 1;
  if found then return v_amount; end if;

  select count(*), max(-amount) into v_count, v_amount from public.transactions
  where student_id = v_order.student_id and type = 'order' and amount < 0 and order_id is null
    and (created_at at time zone 'Asia/Taipei')::date = v_order.order_date;
  if v_count = 1 then return v_amount; end if;
  return null;
end;
$$;

create or replace function public.preview_order_cancellation(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  if coalesce(v_order.cancelled, false) then return jsonb_build_object('status', 'already_cancelled'); end if;
  return jsonb_build_object(
    'status', 'ready', 'order_id', v_order.id, 'order_date', v_order.order_date,
    'received', coalesce(v_order.received, false), 'charged', coalesce(v_order.charged, false),
    'refund_amount', public.order_refund_amount(p_order_id)
  );
end;
$$;

create or replace function public.cancel_order_atomic(
  p_order_id uuid,
  p_expected_received boolean,
  p_expected_charged boolean,
  p_refund_amount numeric,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_student_id uuid;
  v_amount numeric := 0;
  v_balance numeric;
  v_manual boolean := false;
begin
  select student_id into v_student_id from public.orders where id = p_order_id;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  select balance into v_balance from public.students where id = v_student_id for update;
  if not found then raise exception '找不到學生資料，未取消訂餐'; end if;

  select * into v_order from public.orders
  where id = p_order_id and student_id = v_student_id for update;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  if coalesce(v_order.cancelled, false) then
    return jsonb_build_object('status', 'already_cancelled', 'refund_amount', 0);
  end if;
  if p_expected_received is distinct from coalesce(v_order.received, false)
    or p_expected_charged is distinct from coalesce(v_order.charged, false) then
    raise exception '訂單領餐或扣款狀態已變更，請關閉視窗後重新確認';
  end if;

  if coalesce(v_order.charged, false) then
    v_amount := public.order_refund_amount(p_order_id);
    v_manual := v_amount is null;
    if v_manual then
      if nullif(trim(p_reason), '') is null then raise exception '請填寫人工確認退款的原因'; end if;
      v_amount := p_refund_amount;
    elsif p_refund_amount is distinct from v_amount then
      raise exception '原扣款金額已變更，請關閉視窗後重新確認';
    end if;
    if v_amount is null or v_amount <= 0 or v_amount::text in ('NaN', 'Infinity', '-Infinity')
      or trunc(v_amount) <> v_amount then
      raise exception '請確認正確的退款金額';
    end if;

    update public.students set balance = coalesce(balance, 0) + v_amount
    where id = v_student_id returning balance into v_balance;
    insert into public.transactions (student_id, type, amount, balance_after, description, order_id)
    values (v_student_id, 'refund', v_amount, v_balance,
      '取消訂餐退款：' || v_order.order_date::text
      || case when v_manual then '（人工確認）' else '' end
      || case when nullif(trim(p_reason), '') is not null then '，' || trim(p_reason) else '' end,
      p_order_id);
  elsif p_refund_amount is distinct from 0::numeric then
    raise exception '未扣款訂單不可退款';
  end if;

  -- Keep the unique student/date row so automatic generation cannot resurrect it.
  update public.orders set cancelled = true, ordered = false, received = false, charged = false
  where id = p_order_id;
  return jsonb_build_object('status', 'cancelled', 'order_id', p_order_id,
    'refund_amount', v_amount, 'balance_after', v_balance, 'manual_refund', v_manual);
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

revoke all on function public.order_refund_amount(uuid) from public, anon, authenticated;
revoke all on function public.preview_order_cancellation(uuid) from public, anon;
revoke all on function public.cancel_order_atomic(uuid, boolean, boolean, numeric, text) from public, anon;
grant execute on function public.preview_order_cancellation(uuid) to authenticated;
grant execute on function public.cancel_order_atomic(uuid, boolean, boolean, numeric, text) to authenticated;

create unique index if not exists orders_student_date_unique
  on public.orders(student_id, order_date);

notify pgrst, 'reload schema';
commit;
