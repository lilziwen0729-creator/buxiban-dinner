-- 每位學生的固定到班規則。
-- all: 依課程正常點名；attend: 只有指定星期要到；absent: 指定星期固定不到。
alter table public.students
  add column if not exists attendance_schedule_mode text not null default 'all',
  add column if not exists attendance_schedule_days smallint[] not null default '{}';

alter table public.students
  drop constraint if exists students_attendance_schedule_mode_check;

alter table public.students
  add constraint students_attendance_schedule_mode_check
  check (attendance_schedule_mode in ('all', 'attend', 'absent'));

alter table public.students
  drop constraint if exists students_attendance_schedule_days_check;

alter table public.students
  add constraint students_attendance_schedule_days_check
  check (attendance_schedule_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]);

