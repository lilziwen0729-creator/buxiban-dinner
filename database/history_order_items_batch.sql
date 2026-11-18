-- Requires history_order_items.sql. Reuses the single-order accounting safeguards.
begin;

create or replace function public.preview_history_order_items(p_order_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_orders jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  if coalesce(cardinality(p_order_ids), 0) not between 1 and 500 then
    raise exception '每次請選擇 1 至 500 筆訂單';
  end if;
  if (select count(distinct id) from unnest(p_order_ids) as t(id)) <> cardinality(p_order_ids) then
    raise exception '訂單名單含重複或空白編號';
  end if;
  foreach v_id in array p_order_ids loop
    begin
      v_orders := v_orders || jsonb_build_array(public.history_order_item_context(v_id));
    exception when others then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('order_id', v_id, 'message', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('orders', v_orders, 'errors', v_errors);
end;
$$;
revoke all on function public.preview_history_order_items(uuid[]) from public, anon;
grant execute on function public.preview_history_order_items(uuid[]) to authenticated;

create or replace function public.change_history_order_items_atomic(
  p_order_date date, p_meal_id uuid, p_expected jsonb, p_expected_price numeric
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_expected jsonb;
  v_result jsonb;
  v_name text;
  v_changed integer := 0;
  v_unchanged integer := 0;
  v_extra_charge numeric := 0;
  v_refund numeric := 0;
  v_delta numeric;
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  if p_order_date is null or p_order_date > (now() at time zone 'Asia/Taipei')::date then
    raise exception '請選擇今天或之前的訂單日期';
  end if;
  if p_expected is null or jsonb_typeof(p_expected) <> 'array' then raise exception '請重新載入訂單名單'; end if;
  if jsonb_array_length(p_expected) not between 1 and 500 then raise exception '每次請選擇 1 至 500 筆訂單'; end if;
  select array_agg((item->>'order_id')::uuid) into v_ids from jsonb_array_elements(p_expected) as t(item);
  if (select count(distinct id) from unnest(v_ids) as t(id)) <> cardinality(v_ids) then
    raise exception '訂單名單含重複或空白編號';
  end if;

  -- Deterministic student-first locks prevent overlapping batches from deadlocking.
  perform s.id from public.students s
  where s.id in (select student_id from public.orders where id = any(v_ids))
  order by s.id for update;
  perform id from public.orders where id = any(v_ids) order by id for update;
  if (select count(*) from public.orders where id = any(v_ids) and order_date = p_order_date) <> cardinality(v_ids) then
    raise exception '部分訂單不存在或不屬於所選日期，整批未更改，請重新載入';
  end if;
  for v_expected in select item from jsonb_array_elements(p_expected) as t(item) order by item->>'order_id' loop
    select s.name into v_name from public.students s join public.orders o on o.student_id = s.id
    where o.id = (v_expected->>'order_id')::uuid;
    begin
      v_result := public.change_history_order_item_atomic(
        (v_expected->>'order_id')::uuid, p_meal_id, v_expected, p_expected_price
      );
    exception when others then
      raise exception '整批未更改（%）：%', coalesce(v_name, '未知學生'), sqlerrm;
    end;
    if v_result->>'status' = 'updated' then
      v_changed := v_changed + 1;
      v_delta := (v_result->>'delta')::numeric;
      v_extra_charge := v_extra_charge + greatest(-v_delta, 0);
      v_refund := v_refund + greatest(v_delta, 0);
    else
      v_unchanged := v_unchanged + 1;
    end if;
  end loop;
  return jsonb_build_object('status', 'updated', 'changed', v_changed, 'unchanged', v_unchanged,
    'extra_charge', v_extra_charge, 'refund', v_refund);
end;
$$;
revoke all on function public.change_history_order_items_atomic(date, uuid, jsonb, numeric) from public, anon;
grant execute on function public.change_history_order_items_atomic(date, uuid, jsonb, numeric) to authenticated;

notify pgrst, 'reload schema';
commit;
