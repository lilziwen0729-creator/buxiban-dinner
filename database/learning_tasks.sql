begin;

create table if not exists public.learning_tasks (
  id uuid primary key,
  task_date date not null,
  subject text not null check (length(btrim(subject)) between 1 and 40),
  task_kind text not null check (task_kind in ('paper','fill','recite','practice','correction','other')),
  scope text not null check (length(btrim(scope)) between 1 and 1000),
  note text not null default '' check (length(note) <= 2000),
  archived boolean not null default false,
  version integer not null default 1,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_task_students (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.learning_tasks(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  student_name text not null,
  grade text not null default '',
  active boolean not null default true,
  completed boolean not null default false,
  completed_at timestamptz,
  note text not null default '' check (length(note) <= 1000),
  version integer not null default 1,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  unique(task_id, student_id),
  check (completed = (completed_at is not null))
);
create index if not exists learning_tasks_date_idx on public.learning_tasks(archived, task_date desc);
create index if not exists learning_task_students_task_idx on public.learning_task_students(task_id, active, completed);
create index if not exists learning_task_students_student_idx on public.learning_task_students(student_id);

-- Supabase password sessions are the existing admin identity. Teacher/LINE clients
-- use anon access and must not be able to read these private records.
alter table public.learning_tasks enable row level security;
alter table public.learning_task_students enable row level security;
revoke all on public.learning_tasks, public.learning_task_students from public, anon, authenticated;
grant select on public.learning_tasks, public.learning_task_students to authenticated;
drop policy if exists learning_tasks_admin_read on public.learning_tasks;
create policy learning_tasks_admin_read on public.learning_tasks for select to authenticated using (auth.uid() is not null);
drop policy if exists learning_task_students_admin_read on public.learning_task_students;
create policy learning_task_students_admin_read on public.learning_task_students for select to authenticated using (auth.uid() is not null);

create or replace function public.save_learning_task(
  p_id uuid, p_expected_version integer, p_date date, p_subject text,
  p_kind text, p_scope text, p_note text, p_student_ids uuid[]
) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_task public.learning_tasks%rowtype; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception '請先登入管理員帳號'; end if;
  if p_id is null or p_date is null or p_expected_version is null then raise exception '任務資料不完整'; end if;
  if coalesce(length(btrim(p_subject)),0) not between 1 and 40
    or coalesce(length(btrim(p_scope)),0) not between 1 and 1000
    or length(coalesce(p_note,'')) > 2000
    or p_kind is null or p_kind not in ('paper','fill','recite','practice','correction','other') then
    raise exception '請確認科目、任務類型與範圍';
  end if;
  if p_student_ids is null or cardinality(p_student_ids) > 1000 or array_position(p_student_ids,null) is not null then
    raise exception '學生名單格式不正確';
  end if;
  perform pg_advisory_xact_lock(hashtext('learning_task:' || p_id::text));
  select * into v_task from public.learning_tasks where id=p_id for update;
  if found then
    if v_task.archived then raise exception '請先還原封存任務'; end if;
    if v_task.version <> p_expected_version then raise exception '任務已被更新，請重新整理後再編輯'; end if;
  elsif p_expected_version <> 0 then raise exception '任務不存在';
  end if;
  if exists (
    select 1 from unnest(p_student_ids) sid where not exists (
      select 1 from public.students s where s.id=sid and coalesce(s.enrollment_status,'active')='active'
    ) and not exists (
      select 1 from public.learning_task_students r where r.task_id=p_id and r.student_id=sid
    )
  ) then raise exception '部分學生已離班或不存在，請重新選取名單'; end if;
  if cardinality(p_student_ids)=0 and not exists (
    select 1 from public.learning_task_students where task_id=p_id and active and student_id is null
  ) then raise exception '請至少選擇一位學生'; end if;

  if v_task.id is null then
    insert into public.learning_tasks(id,task_date,subject,task_kind,scope,note,created_by,updated_by)
    values(p_id,p_date,btrim(p_subject),p_kind,btrim(p_scope),btrim(coalesce(p_note,'')),v_actor,v_actor);
  else
    update public.learning_tasks set task_date=p_date,subject=btrim(p_subject),task_kind=p_kind,
      scope=btrim(p_scope),note=btrim(coalesce(p_note,'')),version=version+1,updated_by=v_actor,updated_at=now() where id=p_id;
  end if;
  -- Keep snapshots and completion history when temporarily removing a pupil.
  update public.learning_task_students set active=false,version=version+1,updated_by=v_actor,updated_at=now()
    where task_id=p_id and active and student_id is not null and not (student_id=any(p_student_ids));
  insert into public.learning_task_students(task_id,student_id,student_name,grade,updated_by)
    select p_id,s.id,s.name,coalesce(s.grade,''),v_actor from public.students s where s.id=any(p_student_ids)
    on conflict(task_id,student_id) do update set active=true,version=learning_task_students.version+1,
      updated_by=v_actor,updated_at=now() where not learning_task_students.active;
  return p_id;
end;
$$;

create or replace function public.update_learning_task_student(
  p_id uuid, p_expected_version integer, p_completed boolean, p_note text
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_entry public.learning_task_students%rowtype; v_task public.learning_tasks%rowtype; v_actor uuid := auth.uid(); v_task_id uuid;
begin
  if v_actor is null then raise exception '請先登入管理員帳號'; end if;
  if p_completed is null or length(coalesce(p_note,''))>1000 then raise exception '完成紀錄格式不正確'; end if;
  select task_id into v_task_id from public.learning_task_students where id=p_id;
  select * into v_task from public.learning_tasks where id=v_task_id for update;
  if not found or v_task.archived then raise exception '任務不存在或已封存'; end if;
  select * into v_entry from public.learning_task_students where id=p_id for update;
  if not v_entry.active then raise exception '學生已移出此任務，請重新整理'; end if;
  if p_expected_version is null or v_entry.version <> p_expected_version then raise exception '完成紀錄已被更新，請重新整理後確認'; end if;
  update public.learning_task_students set completed=p_completed,
    completed_at=case when p_completed then coalesce(completed_at,now()) else null end,
    note=btrim(coalesce(p_note,'')),version=version+1,updated_by=v_actor,updated_at=now()
    where id=p_id returning * into v_entry;
  return to_jsonb(v_entry);
end;
$$;

create or replace function public.archive_learning_task(p_id uuid,p_expected_version integer,p_archived boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare v_task public.learning_tasks%rowtype; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception '請先登入管理員帳號'; end if;
  select * into v_task from public.learning_tasks where id=p_id for update;
  if not found then raise exception '任務不存在'; end if;
  if p_expected_version is null or v_task.version <> p_expected_version then raise exception '任務已被更新，請重新整理'; end if;
  if p_archived is null then raise exception '封存狀態不正確'; end if;
  update public.learning_tasks set archived=p_archived,version=version+1,updated_by=v_actor,updated_at=now() where id=p_id;
end;
$$;

revoke all on function public.save_learning_task(uuid,integer,date,text,text,text,text,uuid[]) from public,anon;
revoke all on function public.update_learning_task_student(uuid,integer,boolean,text) from public,anon;
revoke all on function public.archive_learning_task(uuid,integer,boolean) from public,anon;
grant execute on function public.save_learning_task(uuid,integer,date,text,text,text,text,uuid[]) to authenticated;
grant execute on function public.update_learning_task_student(uuid,integer,boolean,text) to authenticated;
grant execute on function public.archive_learning_task(uuid,integer,boolean) to authenticated;

create or replace function public.list_learning_tasks(p_view text,p_from date,p_to date,p_archived boolean default false)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare v_rows jsonb;
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  if p_view is null or p_view not in ('day','pending','history') or p_from is null or p_to is null or p_from>p_to then
    raise exception '查詢日期或模式不正確';
  end if;
  select coalesce(jsonb_agg(row_data),'[]'::jsonb) into v_rows from (
    select to_jsonb(t) || jsonb_build_object('learning_task_students',(
      select coalesce(jsonb_agg(r order by r.grade,r.student_name,r.id),'[]'::jsonb)
      from public.learning_task_students r where r.task_id=t.id and r.active
    )) as row_data from public.learning_tasks t
    where (case when p_view='history' then (coalesce(p_archived,false) or not t.archived) else not t.archived end)
      and (case when p_view='pending' then t.task_date<=p_to and exists (
        select 1 from public.learning_task_students r where r.task_id=t.id and r.active and not r.completed
      ) else t.task_date between p_from and p_to end)
    order by case when p_view='pending' then t.task_date end asc,t.task_date desc,t.created_at desc,t.id
    limit 201
  ) q;
  return v_rows;
end;
$$;
revoke all on function public.list_learning_tasks(text,date,date,boolean) from public,anon;
grant execute on function public.list_learning_tasks(text,date,date,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
