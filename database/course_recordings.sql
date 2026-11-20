begin;

create table if not exists public.recording_settings (
  id boolean primary key default true check (id),
  google_client_id text not null check (google_client_id ~ '^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$')
);
create table if not exists public.course_recordings (
  id uuid primary key,
  course_id uuid references public.courses(id) on delete set null,
  lesson_date date not null,
  course_title text not null check (length(btrim(course_title)) between 1 and 70 and course_title !~ '[<>]'),
  classroom text not null default '' check (length(classroom)<=50),
  share_token uuid not null unique default gen_random_uuid(),
  share_enabled boolean not null default false,
  archived boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique(lesson_date,course_title,classroom)
);
create table if not exists public.recording_parts (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.course_recordings(id) on delete cascade,
  part_no integer not null check (part_no between 1 and 30),
  file_name text not null check (length(file_name) between 1 and 255),
  file_size bigint not null check (file_size between 1 and 274877906944),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending','uploading','paused','processing','ready','failed')),
  uploaded_bytes bigint not null default 0 check (uploaded_bytes>=0 and uploaded_bytes<=file_size),
  upload_url text,
  youtube_id text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  channel_id text,
  error_message text not null default '',
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  unique(recording_id,part_no), unique(recording_id,fingerprint),
  check (status not in ('processing','ready') or youtube_id is not null)
);
create index if not exists course_recordings_date_idx on public.course_recordings(lesson_date desc);
create unique index if not exists recording_parts_video_idx on public.recording_parts(recording_id,youtube_id) where youtube_id is not null;

-- Only existing password-authenticated administrators may access recording jobs.
alter table public.recording_settings enable row level security;
alter table public.course_recordings enable row level security;
alter table public.recording_parts enable row level security;
revoke all on public.recording_settings,public.course_recordings,public.recording_parts from public,anon,authenticated;
grant select on public.recording_settings,public.course_recordings,public.recording_parts to authenticated;
grant insert,update on public.recording_settings to authenticated;
drop policy if exists recording_settings_admin on public.recording_settings;
create policy recording_settings_admin on public.recording_settings for all to authenticated using(auth.uid() is not null) with check(auth.uid() is not null);
drop policy if exists recordings_admin_read on public.course_recordings;
create policy recordings_admin_read on public.course_recordings for select to authenticated using(auth.uid() is not null);
drop policy if exists recording_parts_admin_read on public.recording_parts;
create policy recording_parts_admin_read on public.recording_parts for select to authenticated using(auth.uid() is not null);

create or replace function public.create_course_recording(p_id uuid,p_course_id uuid,p_date date,p_title text,p_classroom text,p_parts jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_part jsonb; v_position integer:=0; v_existing public.course_recordings%rowtype;
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  if p_id is null or p_date is null or p_title is null or length(btrim(p_title)) not between 1 and 70
    or p_title ~ '[<>]' or p_parts is null or jsonb_typeof(p_parts)<>'array' then raise exception '錄影資料不完整'; end if;
  if jsonb_array_length(p_parts) not between 1 and 30 then raise exception '每堂課請選擇 1 至 30 支影片'; end if;
  perform pg_advisory_xact_lock(hashtext('recording:'||p_id::text));
  select * into v_existing from public.course_recordings where id=p_id;
  if found then
    if v_existing.course_id is distinct from p_course_id or v_existing.lesson_date<>p_date
      or v_existing.course_title<>btrim(p_title) or v_existing.classroom<>btrim(coalesce(p_classroom,''))
      or (select jsonb_agg(jsonb_build_object('file_name',file_name,'file_size',file_size,'fingerprint',fingerprint) order by part_no)
          from public.recording_parts where recording_id=p_id) is distinct from p_parts then
      raise exception '此匯入紀錄已存在，請重新整理';
    end if;
    return p_id;
  end if;
  insert into public.course_recordings(id,course_id,lesson_date,course_title,classroom)
    values(p_id,p_course_id,p_date,btrim(p_title),btrim(coalesce(p_classroom,'')));
  for v_part in select value from jsonb_array_elements(p_parts) loop
    v_position:=v_position+1;
    if lower(v_part->>'file_name') !~ '\.mp4$' then raise exception '僅接受 MP4 影片'; end if;
    insert into public.recording_parts(recording_id,part_no,file_name,file_size,fingerprint)
      values(p_id,v_position,v_part->>'file_name',(v_part->>'file_size')::bigint,v_part->>'fingerprint');
  end loop;
  return p_id;
end; $$;

create or replace function public.claim_recording_part(p_id uuid,p_lease uuid,p_channel text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_part public.recording_parts%rowtype;
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  if p_lease is null or coalesce(length(p_channel),0) not between 1 and 100 then raise exception 'YouTube 頻道未連線'; end if;
  select * into v_part from public.recording_parts where id=p_id for update;
  if not found then raise exception '影片不存在'; end if;
  if exists(select 1 from public.course_recordings where id=v_part.recording_id and archived) then raise exception '課程已封存'; end if;
  if v_part.youtube_id is not null then return to_jsonb(v_part); end if;
  if v_part.channel_id is not null and v_part.channel_id<>p_channel then raise exception '請連線至原本的 YouTube 頻道'; end if;
  if v_part.lease_until>now() and v_part.lease_token is distinct from p_lease then raise exception '這段影片正在另一個視窗上傳，請稍後再試'; end if;
  update public.recording_parts set lease_token=p_lease,lease_until=now()+interval '10 minutes',
    channel_id=p_channel,status='uploading',error_message='',updated_at=now() where id=p_id returning * into v_part;
  return to_jsonb(v_part);
end; $$;

create or replace function public.update_recording_upload(p_id uuid,p_lease uuid,p_url text,p_bytes bigint,p_video text,p_status text,p_error text default '')
returns void language plpgsql security definer set search_path=public as $$
declare v_part public.recording_parts%rowtype;
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  select * into v_part from public.recording_parts where id=p_id for update;
  if not found or p_lease is null or v_part.lease_token is distinct from p_lease then raise exception '上傳工作已被更新，請重新整理'; end if;
  if p_status is null or p_status not in ('uploading','paused','processing','failed') or p_bytes is null
    or p_bytes<0 or p_bytes>v_part.file_size or coalesce(length(p_error),0)>1000 then raise exception '上傳狀態不正確'; end if;
  if p_url is not null and (p_url !~ '^https://www\.googleapis\.com/upload/youtube/v3/videos\?' or length(p_url)>4096) then raise exception '上傳網址不正確'; end if;
  if v_part.upload_url is not null and p_url is distinct from v_part.upload_url then raise exception '不可覆蓋既有上傳工作'; end if;
  if v_part.youtube_id is not null and p_video is distinct from v_part.youtube_id then raise exception '影片已上傳，請勿重複上傳'; end if;
  if p_video is not null and p_status<>'processing' then raise exception '完成影片狀態不正確'; end if;
  update public.recording_parts set upload_url=p_url,uploaded_bytes=p_bytes,youtube_id=p_video,status=p_status,
    error_message=coalesce(p_error,''),updated_at=now(),lease_until=case when p_status='uploading' then now()+interval '10 minutes' else null end,
    lease_token=case when p_status='uploading' then p_lease else null end where id=p_id;
end; $$;

create or replace function public.verify_recording_video(p_id uuid,p_video text,p_status text,p_error text default '')
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  if p_status is null or p_status not in ('ready','processing','failed') or coalesce(length(p_error),0)>1000 then raise exception '影片狀態不正確'; end if;
  update public.recording_parts set status=p_status,error_message=coalesce(p_error,''),updated_at=now()
    where id=p_id and youtube_id=p_video and youtube_id is not null;
  if not found then raise exception '影片資料已改變，請重新整理'; end if;
end; $$;

create or replace function public.set_recording_visibility(p_id uuid,p_share boolean,p_archived boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  if p_share is null or p_archived is null then raise exception '設定不完整'; end if;
  perform 1 from public.course_recordings where id=p_id for update;
  if not found then raise exception '課程不存在'; end if;
  if p_share and (p_archived or not exists(select 1 from public.recording_parts where recording_id=p_id)
    or exists(select 1 from public.recording_parts where recording_id=p_id and status<>'ready')) then raise exception '請先確認每段影片皆可觀看'; end if;
  update public.course_recordings set share_enabled=p_share,archived=p_archived where id=p_id;
end; $$;

create or replace function public.recover_recording_part(p_id uuid,p_video text,p_channel text,p_reset boolean)
returns void language plpgsql security definer set search_path=public as $$
declare v_part public.recording_parts%rowtype;
begin
  if auth.uid() is null then raise exception '請先登入管理員帳號'; end if;
  select * into v_part from public.recording_parts where id=p_id for update;
  if not found then raise exception '影片不存在'; end if;
  if v_part.lease_until>now() then raise exception '影片仍在上傳中，請先暫停'; end if;
  if p_reset is true then
    if v_part.youtube_id is not null then raise exception '影片已有連結，不可重複上傳'; end if;
    update public.recording_parts set status='pending',upload_url=null,uploaded_bytes=0,lease_token=null,
      lease_until=null,error_message='',channel_id=null,updated_at=now() where id=p_id;
  else
    if p_video is null or p_video !~ '^[A-Za-z0-9_-]{11}$' or coalesce(length(p_channel),0)=0 then raise exception '影片連結不正確'; end if;
    if v_part.youtube_id is not null and v_part.youtube_id<>p_video then raise exception '影片已有連結，不可覆蓋'; end if;
    if v_part.channel_id is not null and v_part.channel_id<>p_channel then raise exception '請使用原本的 YouTube 頻道'; end if;
    update public.recording_parts set youtube_id=p_video,channel_id=p_channel,status='processing',
      uploaded_bytes=file_size,lease_token=null,lease_until=null,error_message='',updated_at=now() where id=p_id;
  end if;
end; $$;

-- Public capability links reveal only lesson titles and ready YouTube IDs, never
-- student data, local file names, Google credentials or resumable upload URLs.
create or replace function public.get_recording_share(p_token uuid)
returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object('date',r.lesson_date,'title',r.course_title,'parts',(
    select jsonb_agg(jsonb_build_object('part',p.part_no,'videoId',p.youtube_id) order by p.part_no)
    from public.recording_parts p where p.recording_id=r.id
  )) from public.course_recordings r where r.share_token=p_token and r.share_enabled and not r.archived
  and exists(select 1 from public.recording_parts where recording_id=r.id)
  and not exists(select 1 from public.recording_parts where recording_id=r.id and status<>'ready');
$$;

revoke all on function public.create_course_recording(uuid,uuid,date,text,text,jsonb),public.claim_recording_part(uuid,uuid,text),
  public.update_recording_upload(uuid,uuid,text,bigint,text,text,text),public.verify_recording_video(uuid,text,text,text),
  public.set_recording_visibility(uuid,boolean,boolean),public.recover_recording_part(uuid,text,text,boolean),public.get_recording_share(uuid) from public,anon,authenticated;
grant execute on function public.create_course_recording(uuid,uuid,date,text,text,jsonb),public.claim_recording_part(uuid,uuid,text),
  public.update_recording_upload(uuid,uuid,text,bigint,text,text,text),public.verify_recording_video(uuid,text,text,text),
  public.set_recording_visibility(uuid,boolean,boolean),public.recover_recording_part(uuid,text,text,boolean) to authenticated;
grant execute on function public.get_recording_share(uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
