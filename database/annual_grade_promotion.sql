-- 舊版年度自動升級資料庫函式。
-- 前端已不再於登入或 7 月 1 日自動呼叫；年級一律由「系統管理 > 年級調整」手動操作。

create table if not exists public.annual_grade_promotions (
  promotion_year integer primary key,
  promoted_at timestamptz not null default now(),
  promoted_by uuid,
  promoted_count integer not null default 0
);

alter table public.annual_grade_promotions disable row level security;

create or replace function public.run_annual_grade_promotion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_year integer := extract(year from (now() at time zone 'Asia/Taipei'))::integer;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception '需要管理員登入後才能執行年度升級';
  end if;

  if v_today < make_date(v_year, 7, 1) then
    return jsonb_build_object(
      'status', 'not_due',
      'promotion_year', v_year,
      'promoted_count', 0
    );
  end if;

  insert into public.annual_grade_promotions (promotion_year, promoted_by)
  values (v_year, auth.uid())
  on conflict (promotion_year) do nothing;

  if not found then
    return jsonb_build_object(
      'status', 'already_processed',
      'promotion_year', v_year,
      'promoted_count', 0
    );
  end if;

  update public.students
  set grade = case grade
    when '幼兒' then '大班'
    when '大班' then '小一'
    when '小一' then '小二'
    when '小二' then '小三'
    when '小三' then '小四'
    when '小四' then '小五'
    when '小五' then '小六'
    when '小六' then '國一'
    when '國一' then '國二'
    when '國二' then '國三'
    else grade
  end
  where coalesce(enrollment_status, 'active') = 'active'
    and grade in ('幼兒', '大班', '小一', '小二', '小三', '小四', '小五', '小六', '國一', '國二');

  get diagnostics v_count = row_count;

  update public.annual_grade_promotions
  set promoted_count = v_count,
      promoted_at = now(),
      promoted_by = auth.uid()
  where promotion_year = v_year;

  insert into public.operation_logs (
    actor_id,
    actor_name,
    action,
    target_type,
    target_name,
    metadata
  ) values (
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', '系統管理員'),
    'annual_grade_promotion',
    'system',
    v_year::text || ' 年度年級升級',
    jsonb_build_object(
      'promotion_year', v_year,
      'promoted_count', v_count,
      'rule_date', '07-01'
    )
  );

  return jsonb_build_object(
    'status', 'promoted',
    'promotion_year', v_year,
    'promoted_count', v_count
  );
end;
$$;

revoke all on function public.run_annual_grade_promotion() from public, anon;
grant execute on function public.run_annual_grade_promotion() to authenticated;
