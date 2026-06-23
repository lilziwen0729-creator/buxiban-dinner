alter table public.courses
  add column if not exists attendance_section text not null default 'auto';

alter table public.courses
  drop constraint if exists courses_attendance_section_check;

alter table public.courses
  add constraint courses_attendance_section_check
  check (attendance_section in ('auto', 'primary', 'junior', 'hidden'));

update public.courses
set attendance_section = case
  when grade in ('幼兒', '大班', '小一', '小二', '小三', '小四', '小五', '小六') then 'primary'
  when grade in ('國一', '國二', '國三') then 'junior'
  else 'auto'
end
where attendance_section is null or attendance_section = 'auto';
