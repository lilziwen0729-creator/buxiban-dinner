import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCronRequest } from "@/lib/cronAuth";
import { getTaipeiNow, getToday } from "@/lib/date";
import { logNotification } from "@/lib/notificationLog";

type AdminTask = {
  id: string;
  task_date: string;
  task_time: string;
  task_type: string;
  title: string;
  note: string | null;
  student_name: string | null;
  grade: string | null;
  notify_staff: boolean;
  notification_group_ids: string[];
};

type StaffGroup = {
  group_id: string;
  group_name: string | null;
};

const REMINDER_MINUTES = 5;
const DELIVERY_WINDOW_MINUTES = 5;

const taskTypeLabels: Record<string, string> = {
  early_leave: "提早離開",
  pickup: "接送提醒",
  call_parent: "聯絡家長",
  payment: "收費提醒",
  other: "其他事項",
};

const timeToMinutes = (time: string) => {
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
};

const buildMessage = (task: AdminTask) => {
  const student = task.student_name
    ? `${task.grade || "未分級"}・${task.student_name}`
    : "未指定學生";

  return [
    "方華行政待辦提醒",
    `時間：${task.task_time.slice(0, 5)}`,
    `學生：${student}`,
    `事項：${task.task_type === "other" ? task.title : taskTypeLabels[task.task_type] || task.title}`,
    task.note ? `備註：${task.note}` : "",
    "請於完成後回到系統勾選完成。",
  ].filter(Boolean).join("\n");
};

const pushToGroup = async (groupId: string, message: string, accessToken: string) => {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: groupId,
      messages: [{ type: "text", text: message }],
    }),
  });

  const body = await response.text();
  if (!response.ok) throw new Error(body || `LINE API ${response.status}`);
};

const runReminders = async (req: Request) => {
  const unauthorized = validateCronRequest(req);
  if (unauthorized) return unauthorized;

  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "缺少 LINE_CHANNEL_ACCESS_TOKEN" }, { status: 503 });
  }

  const now = getTaipeiNow();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const today = getToday();

  const [{ data: taskRows, error: taskError }, { data: groupRows, error: groupError }] = await Promise.all([
    supabase
      .from("admin_tasks")
      .select("id, task_date, task_time, task_type, title, note, student_name, grade, notify_staff, notification_group_ids")
      .eq("task_date", today)
      .eq("status", "pending")
      .eq("notify_staff", true)
      .is("reminder_sent_at", null),
    supabase
      .from("line_staff_groups")
      .select("group_id, group_name")
      .eq("is_active", true),
  ]);

  if (taskError) return NextResponse.json({ error: taskError.message }, { status: 500 });
  if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 });

  const dueTasks = ((taskRows || []) as AdminTask[]).filter((task) => {
    const reminderAt = timeToMinutes(task.task_time) - REMINDER_MINUTES;
    return nowMinutes >= reminderAt && nowMinutes < reminderAt + DELIVERY_WINDOW_MINUTES;
  });
  const groups = (groupRows || []) as StaffGroup[];
  if (dueTasks.length > 0 && groups.length === 0) {
    return NextResponse.json({ error: "尚未綁定老師 LINE 群組" }, { status: 409 });
  }

  const results: Array<{ taskId: string; status: "sent" | "failed"; error?: string }> = [];

  for (const task of dueTasks) {
    const message = buildMessage(task);
    const targetGroups = groups.filter((group) => task.notification_group_ids?.includes(group.group_id));

    if (targetGroups.length === 0) {
      const errorMessage = "這筆待辦沒有可用的推播群組";
      await supabase.from("admin_tasks").update({ reminder_error: errorMessage }).eq("id", task.id);
      results.push({ taskId: task.id, status: "failed", error: errorMessage });
      continue;
    }

    try {
      const claimedAt = new Date().toISOString();
      const { data: claimedTask, error: claimError } = await supabase
        .from("admin_tasks")
        .update({ reminder_sent_at: claimedAt, reminder_error: null })
        .eq("id", task.id)
        .is("reminder_sent_at", null)
        .select("id")
        .maybeSingle();

      if (claimError) throw claimError;
      if (!claimedTask) continue;

      await Promise.all(targetGroups.map((group) => pushToGroup(group.group_id, message, accessToken)));

      await logNotification({
        notificationType: "admin_task",
        recipientType: "staff_group",
        recipientName: targetGroups.map((group) => group.group_name || "老師群").join("、"),
        studentName: task.student_name || undefined,
        status: "sent",
        message,
        metadata: { task_id: task.id, reminder_minutes: REMINDER_MINUTES, group_ids: targetGroups.map((group) => group.group_id) },
      });
      results.push({ taskId: task.id, status: "sent" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知錯誤";
      await supabase
        .from("admin_tasks")
        .update({ reminder_sent_at: null, reminder_error: errorMessage })
        .eq("id", task.id);
      await logNotification({
        notificationType: "admin_task",
        recipientType: "staff_group",
        studentName: task.student_name || undefined,
        status: "failed",
        message,
        errorMessage,
        metadata: { task_id: task.id, reminder_minutes: REMINDER_MINUTES },
      });
      results.push({ taskId: task.id, status: "failed", error: errorMessage });
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    checked: (taskRows || []).length,
    due: dueTasks.length,
    groups: groups.length,
    results,
  });
};

export async function GET(req: Request) {
  return runReminders(req);
}

export async function POST(req: Request) {
  return runReminders(req);
}
