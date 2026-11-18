-- Requires transaction_editing.sql, special_meals.sql and operation_logs.sql.
begin;

alter table public.orders add column if not exists meal_edit_version integer not null default 0;

-- Private snapshot shared by preview and save; never infer a paid amount from today's menu price.
create or replace function public.history_order_item_context(p_order_id uuid)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_entry public.transactions%rowtype;
  v_meal public.menus%rowtype;
  v_count integer;
  v_entry_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.cancelled is true then raise exception '訂單不存在或已取消，請重新整理'; end if;
  select * into v_meal from public.menus where id = v_order.meal_id;

  if v_order.charged is true then
    select * into v_entry from public.transactions
    where order_id = v_order.id and student_id = v_order.student_id and type = 'order'
    order by created_at desc, id desc limit 1;
    if not found then
      select count(*), (array_agg(id))[1] into v_count, v_entry_id from public.transactions
      where student_id = v_order.student_id and type = 'order'
        and (created_at at time zone 'Asia/Taipei')::date = v_order.order_date;
      if v_count <> 1 then raise exception '舊訂單無法唯一對應扣款明細，請先到學生明細核對帳目'; end if;
      select * into v_entry from public.transactions where id = v_entry_id;
      select count(*) into v_count from public.orders
      where student_id = v_order.student_id and order_date = v_order.order_date
        and charged is true and cancelled is not true;
      if v_count <> 1 or v_entry.order_id is not null then
        raise exception '舊訂單無法唯一對應扣款明細，請先到學生明細核對帳目';
      end if;
    end if;
    if v_entry.amount is null or v_entry.amount > 0 or v_entry.created_at is null
      or (v_order.charged_amount is not null and v_order.charged_amount <> -v_entry.amount) then
      raise exception '訂單與扣款明細金額不一致，請先到學生明細核對帳目';
    end if;
  end if;

  return jsonb_build_object(
    'order_id', v_order.id, 'student_id', v_order.student_id, 'order_date', v_order.order_date,
    'meal_id', v_order.meal_id, 'meal_name', coalesce(v_meal.name, '缺少餐點資料'),
    'vendor_id', v_meal.vendor_id, 'price', v_meal.price,
    'received', coalesce(v_order.received, false), 'charged', coalesce(v_order.charged, false),
    'charged_amount', case when v_order.charged is true then -v_entry.amount else null end,
    'transaction_id', v_entry.id, 'transaction_version', v_entry.edit_version,
    'meal_edit_version', v_order.meal_edit_version
  );
end;
$$;
revoke all on function public.history_order_item_context(uuid) from public, anon, authenticated;

create or replace function public.preview_history_order_item(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  return public.history_order_item_context(p_order_id);
end;
$$;
revoke all on function public.preview_history_order_item(uuid) from public, anon;
grant execute on function public.preview_history_order_item(uuid) to authenticated;

create or replace function public.change_history_order_item_atomic(
  p_order_id uuid, p_meal_id uuid, p_expected jsonb, p_expected_price numeric
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_student_id uuid;
  v_student_name text;
  v_context jsonb;
  v_meal public.menus%rowtype;
  v_result jsonb;
  v_delta numeric := 0;
  v_balance numeric;
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  select student_id into v_student_id from public.orders where id = p_order_id;
  if not found then raise exception '找不到訂單，請重新整理'; end if;
  -- All wallet operations lock the student before the order and ledger rows.
  select name, coalesce(balance, 0) into v_student_name, v_balance
  from public.students where id = v_student_id for update;
  if not found then raise exception '找不到學生資料'; end if;
  perform 1 from public.orders where id = p_order_id and student_id = v_student_id for update;
  if not found then raise exception '訂單已變更，請重新整理'; end if;
  v_context := public.history_order_item_context(p_order_id);
  if v_context is distinct from p_expected then
    raise exception '訂單或扣款明細已變更，請重新載入後再確認';
  end if;
  if p_meal_id is not distinct from (v_context->>'meal_id')::uuid then
    return jsonb_build_object('status', 'unchanged', 'delta', 0, 'balance_after', v_balance);
  end if;
  select * into v_meal from public.menus where id = p_meal_id for share;
  if not found or v_meal.is_active is false then raise exception '餐點不存在或已停用，請重新選擇'; end if;
  if v_meal.price is null or v_meal.price <= 0 or v_meal.price::text in ('NaN', 'Infinity', '-Infinity')
    or trunc(v_meal.price) <> v_meal.price or v_meal.price > 2147483647 then
    raise exception '餐點價格必須為大於 0 的整數';
  end if;
  if v_meal.price is distinct from p_expected_price then raise exception '餐點價格已變更，請重新載入後再確認'; end if;

  if (v_context->>'charged')::boolean then
    v_result := public.edit_transaction_atomic(
      (v_context->>'transaction_id')::uuid, v_student_id,
      (v_context->>'transaction_version')::integer, -v_meal.price, '餐費結算：' || v_meal.name
    );
    v_delta := (v_result->>'delta')::numeric;
    v_balance := (v_result->>'balance_after')::numeric;
    -- Also link same-price legacy corrections, which do not enter the delta branch above.
    update public.transactions set order_id = p_order_id where id = (v_context->>'transaction_id')::uuid;
    update public.orders set charged_amount = v_meal.price where id = p_order_id;
  end if;

  -- An explicit item choice must survive automatic weekly-menu synchronization.
  update public.orders set meal_id = p_meal_id, special_meal = true,
    meal_edit_version = meal_edit_version + 1 where id = p_order_id;
  insert into public.operation_logs (
    actor_id, actor_name, action, target_type, target_id, target_name, student_id, student_name, metadata
  ) values (
    auth.uid(), coalesce(auth.jwt()->>'email', '管理員'), 'order_item_change', 'order', p_order_id,
    v_context->>'order_date', v_student_id, v_student_name,
    jsonb_build_object('date', v_context->>'order_date', 'meal_name_before', v_context->>'meal_name',
      'meal_name_after', v_meal.name, 'amount_before', case when (v_context->>'charged')::boolean
        then v_context->'charged_amount' else v_context->'price' end,
      'amount_after', v_meal.price, 'charged', v_context->'charged', 'delta', v_delta,
      'balance_after', v_balance, 'source', 'history')
  );
  return jsonb_build_object('status', 'updated', 'meal_name', v_meal.name, 'price', v_meal.price,
    'charged', v_context->'charged', 'delta', v_delta, 'balance_after', v_balance);
end;
$$;
revoke all on function public.change_history_order_item_atomic(uuid, uuid, jsonb, numeric) from public, anon;
grant execute on function public.change_history_order_item_atomic(uuid, uuid, jsonb, numeric) to authenticated;

notify pgrst, 'reload schema';
commit;
