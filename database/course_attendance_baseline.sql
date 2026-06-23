-- 課程出席率統計基準日：
-- 新加入課程的學生只從加入當天後開始計算應到，避免被回補成歷史缺席。
alter table public.courses
  add column if not exists created_at timestamptz not null default now();

alter table public.student_courses
  add column if not exists created_at timestamptz not null default now();

