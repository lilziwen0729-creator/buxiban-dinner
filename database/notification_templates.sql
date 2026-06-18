create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null unique,
  title text not null,
  body text not null,
  variables text[] not null default '{}'::text[],
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.notification_templates (notification_type, title, body, variables)
values
  ('arrived', '到班通知', '方華補習班通知
學生：{{studentName}}
狀態：已安全抵達補習班', array['studentName']),
  ('left', '離班通知', '方華補習班通知
學生：{{studentName}}
狀態：已下課離班
提醒：請留意接送安全', array['studentName']),
  ('homework_done', '作業完成通知', '方華補習班通知
學生：{{studentName}}
事項：今日作業已檢查完成', array['studentName']),
  ('score', '成績通知', '{{message}}', array['message']),
  ('low_balance', '低餘額通知', '方華補習班餐費提醒
{{studentName}} 目前餐費餘額為 ${{balance}}，已低於提醒門檻 ${{threshold}}。
請方便時協助安排儲值，謝謝您。', array['studentName', 'balance', 'threshold']),
  ('broadcast', '廣播通知', '{{message}}', array['message'])
on conflict (notification_type) do nothing;

create index if not exists notification_templates_type_idx
  on public.notification_templates(notification_type);

alter table public.notification_templates disable row level security;
