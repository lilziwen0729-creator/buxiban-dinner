begin;

-- NULL identifies legacy tasks; an empty array is an explicitly individual roster.
alter table public.learning_tasks add column if not exists class_names text[];

create or replace function public.save_learning_task_with_classes(
  p_id uuid, p_expected_version integer, p_date date, p_subject text,
  p_kind text, p_scope text, p_note text, p_student_ids uuid[], p_class_names text[]
) returns uuid language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  if p_class_names is null or cardinality(p_class_names)>50
    or exists(select 1 from unnest(p_class_names) n where n is null or length(btrim(n)) not between 1 and 200)
    then raise exception '班級標示格式不正確'; end if;
  -- Reuse the roster validation, version lock and completion-history protection atomically.
  perform public.save_learning_task(p_id,p_expected_version,p_date,p_subject,p_kind,p_scope,p_note,p_student_ids);
  update public.learning_tasks set class_names=(
    select coalesce(array_agg(name order by first_position),'{}'::text[])
    from (select btrim(name) as name,min(position) as first_position
      from unnest(p_class_names) with ordinality as names(name,position) group by btrim(name)) q
  ) where id=p_id;
  return p_id;
end;
$$;
revoke all on function public.save_learning_task_with_classes(uuid,integer,date,text,text,text,text,uuid[],text[]) from public,anon;
grant execute on function public.save_learning_task_with_classes(uuid,integer,date,text,text,text,text,uuid[],text[]) to authenticated;
notify pgrst,'reload schema';
commit;
