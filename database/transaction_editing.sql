-- Requires accounting_atomic.sql and operation_logs.sql.
begin;

alter table public.transactions add column if not exists edit_version integer not null default 0;
create index if not exists transactions_student_chronology_idx
  on public.transactions(student_id, created_at, id);

-- Use the same student-first lock order as settlement, refunds and top-ups.
create or replace function public.edit_transaction_atomic(
  p_transaction_id uuid,
  p_student_id uuid,
  p_expected_version integer,
  p_amount numeric,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.transactions%rowtype;
  v_balance numeric;
  v_student_name text;
  v_delta numeric;
  v_order_id uuid;
  v_latest_charge_id uuid;
  v_candidate_count integer;
  v_charge_count integer;
  v_description text := trim(p_description);
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity')
    or trunc(p_amount) <> p_amount or abs(p_amount) > 2147483647 then
    raise exception '請輸入有效的整數金額';
  end if;
  if nullif(v_description, '') is null then raise exception '請填寫明細內容'; end if;

  select coalesce(balance, 0), name into v_balance, v_student_name
  from public.students where id = p_student_id for update;
  if not found then raise exception '找不到學生資料'; end if;

  select * into v_entry from public.transactions
  where id = p_transaction_id and student_id = p_student_id for update;
  if not found then raise exception '找不到這筆明細，請重新整理'; end if;
  if v_entry.edit_version is distinct from p_expected_version then
    raise exception '這筆明細已被修改，請重新整理後再編輯';
  end if;
  if v_entry.amount is null or v_entry.created_at is null then
    raise exception '原始明細資料不完整，請先核對帳目';
  end if;
  if v_entry.type = 'order' and p_amount > 0 then
    raise exception '餐費扣款請填負數或 0';
  end if;
  if v_entry.type in ('topup', 'refund') and p_amount < 0 then
    raise exception '儲值與退款請填正數或 0';
  end if;

  v_delta := p_amount - v_entry.amount;
  if v_delta = 0 and v_description is not distinct from v_entry.description then
    return jsonb_build_object('status', 'unchanged', 'transaction_id', v_entry.id,
      'balance_after', v_balance, 'delta', 0, 'edit_version', v_entry.edit_version);
  end if;

  v_order_id := v_entry.order_id;
  if v_delta <> 0 and v_entry.type = 'order' then
    -- Older ledger rows may predate order_id. Link only an unambiguous debit.
    if v_order_id is null then
      select count(*), (array_agg(id))[1] into v_candidate_count, v_order_id
      from public.orders where student_id = p_student_id
        and order_date = (v_entry.created_at at time zone 'Asia/Taipei')::date
        and charged is true and cancelled is not true;
      if v_candidate_count > 0 then
        select count(*) into v_charge_count from public.transactions
        where student_id = p_student_id and type = 'order'
          and (created_at at time zone 'Asia/Taipei')::date = (v_entry.created_at at time zone 'Asia/Taipei')::date;
        if v_candidate_count <> 1 or v_charge_count <> 1
          or exists(select 1 from public.transactions where order_id = v_order_id and type = 'order') then
          raise exception '這筆舊明細無法唯一對應訂單，請先核對訂單後再修改金額';
        end if;
      end if;
    end if;

    if v_order_id is not null then
      perform 1 from public.orders where id = v_order_id and student_id = p_student_id for update;
      if found then
        select id into v_latest_charge_id from public.transactions
        where student_id = p_student_id and type = 'order' and (order_id = v_order_id or id = v_entry.id)
        order by created_at desc, id desc limit 1;
        -- Editing a previous refunded cycle must not change the current charge.
        if v_latest_charge_id = v_entry.id then
          update public.orders set charged_amount = -p_amount
          where id = v_order_id and student_id = p_student_id
            and charged is true and cancelled is not true;
        end if;
      else
        v_order_id := v_entry.order_id;
      end if;
    end if;
  end if;

  update public.transactions set amount = p_amount, description = v_description,
    edit_version = edit_version + 1, order_id = v_order_id
  where id = v_entry.id;

  if v_delta <> 0 then
    -- Preserve opening/imported balances; shift this entry and all later snapshots.
    update public.transactions set balance_after = balance_after + v_delta
    where student_id = p_student_id and (created_at, id) >= (v_entry.created_at, v_entry.id);
    update public.students set balance = v_balance + v_delta where id = p_student_id;
  end if;

  insert into public.operation_logs (
    actor_id, actor_name, action, target_type, target_id, target_name,
    student_id, student_name, metadata
  ) values (
    auth.uid(), coalesce(auth.jwt()->>'email', '管理員'), 'transaction_edit', 'transaction', v_entry.id,
    v_description, p_student_id, v_student_name,
    jsonb_build_object('amount_before', v_entry.amount, 'amount_after', p_amount,
      'description_before', v_entry.description, 'description_after', v_description,
      'delta', v_delta, 'balance_before', v_balance, 'balance_after', v_balance + v_delta,
      'transaction_date', v_entry.created_at, 'order_id', v_order_id)
  );

  return jsonb_build_object('status', 'updated', 'transaction_id', v_entry.id,
    'balance_after', v_balance + v_delta, 'delta', v_delta, 'edit_version', v_entry.edit_version + 1);
end;
$$;

revoke all on function public.edit_transaction_atomic(uuid, uuid, integer, numeric, text) from public, anon;
grant execute on function public.edit_transaction_atomic(uuid, uuid, integer, numeric, text) to authenticated;

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
  if v_order.charged_amount >= 0 then return v_order.charged_amount; end if;

  select -amount into v_amount from public.transactions
  where order_id = p_order_id and student_id = v_order.student_id and type = 'order' and amount <= 0
  order by created_at desc, id desc limit 1;
  if found then return v_amount; end if;

  select count(*), max(-amount) into v_count, v_amount from public.transactions
  where student_id = v_order.student_id and type = 'order' and amount < 0 and order_id is null
    and (created_at at time zone 'Asia/Taipei')::date = v_order.order_date;
  if v_count = 1 then return v_amount; end if;
  return null;
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
    if v_amount is null or v_amount < 0 or (v_manual and v_amount = 0) or v_amount::text in ('NaN', 'Infinity', '-Infinity')
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
      select name into v_meal_name
      from public.menus
      where id = v_meal_id;

      v_price := public.order_refund_amount(v_order_id);
      if v_price is null or v_price < 0 then
        raise exception '無法確認原扣款金額，請由管理員核對後退款';
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

revoke all on function public.order_refund_amount(uuid) from public, anon, authenticated;
revoke all on function public.cancel_order_atomic(uuid, boolean, boolean, numeric, text) from public, anon;
grant execute on function public.cancel_order_atomic(uuid, boolean, boolean, numeric, text) to authenticated;
revoke all on function public.register_parent_leave_atomic(uuid, date, boolean, text) from public, anon, authenticated;
grant execute on function public.register_parent_leave_atomic(uuid, date, boolean, text) to service_role;

notify pgrst, 'reload schema';
commit;
