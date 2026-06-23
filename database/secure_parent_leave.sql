-- 家長請假改由 /api/parent/leave 驗證 LINE 身分後，以 service role 呼叫。
-- 執行後，瀏覽器無法再直接指定任意學生、日期或截止時間呼叫退款流程。
revoke all on function public.register_parent_leave_atomic(uuid, date, boolean, text)
  from public, anon, authenticated;

grant execute on function public.register_parent_leave_atomic(uuid, date, boolean, text)
  to service_role;
