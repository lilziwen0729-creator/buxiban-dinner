begin;

alter table public.courses add column if not exists course_category text;

update public.courses
set course_category = case
  when attendance_section = 'junior' or grade like '國%' or grade like '高%' then 'junior'
  when name ~ '(數學|數理|素養)' then 'primary_math'
  when name ~ '(美語|英語|英文)' then 'primary_english'
  when name ~ '(才藝|美術|繪畫|畫畫|音樂|舞蹈|書法|桌遊|程式|機器人|珠心算)' then 'primary_talent'
  else 'primary_tutoring'
end
where course_category is null;

alter table public.courses alter column course_category set default 'primary_tutoring';
alter table public.courses alter column course_category set not null;
alter table public.courses drop constraint if exists courses_course_category_check;
alter table public.courses add constraint courses_course_category_check
  check (course_category in ('primary_tutoring', 'primary_math', 'primary_english', 'primary_talent', 'junior'));

create index if not exists courses_course_category_idx on public.courses(course_category);
notify pgrst, 'reload schema';
commit;
