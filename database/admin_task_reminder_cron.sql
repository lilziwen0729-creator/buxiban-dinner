-- 先將下方兩個 REPLACE 值換成正式網址與 Vercel 的 CRON_SECRET，再整份執行。
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'admin-task-reminders-every-minute'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end $$;

select cron.schedule(
  'admin-task-reminders-every-minute',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://REPLACE_WITH_PRODUCTION_DOMAIN/api/admin-task-reminders',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer REPLACE_WITH_CRON_SECRET'
    )
  );
  $$
);

