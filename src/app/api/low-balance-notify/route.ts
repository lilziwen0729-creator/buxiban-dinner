import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logNotification } from "@/lib/notificationLog";
import { renderNotificationTemplate } from "@/lib/notificationTemplate";
import { validateAuthenticatedRequest } from "@/lib/apiAuth";

const DEFAULT_THRESHOLD = 200;

type NotifyResult = {
  student_id: string;
  student_name: string;
  balance: number;
  parent_count: number;
  sent: number;
  status: "sent" | "skipped" | "failed";
  reason?: string;
};

const hasFixedMealPlan = (student: any) => {
  const fixedDays = student.fixed_days_off;
  return student.auto_order === true || (Array.isArray(fixedDays) && fixedDays.length > 0);
};

export async function POST(req: Request) {
  const unauthorized = await validateAuthenticatedRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => ({}));
    const threshold = Number(body.threshold || DEFAULT_THRESHOLD);
    const dryRun = body.dryRun === true;
    const requestedStudentIds = Array.isArray(body.studentIds)
      ? new Set(body.studentIds.map((id: unknown) => String(id)))
      : null;

    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN && !dryRun) {
      return NextResponse.json({ error: "缺少 LINE_CHANNEL_ACCESS_TOKEN" }, { status: 500 });
    }

    const { data: students, error } = await supabase
      .from("students")
      .select(`
        id,
        name,
        grade,
        enrollment_status,
        balance,
        fixed_days_off,
        auto_order,
        student_parent_relations (
          parents (
            line_user_id
          )
        )
      `)
      .lt("balance", threshold)
      .order("balance", { ascending: true });

    if (error) throw error;

    const results: NotifyResult[] = [];
    let ignoredNoFixedMeal = 0;

    for (const student of students || []) {
      if (requestedStudentIds && !requestedStudentIds.has(String(student.id))) continue;
      if (((student as any).enrollment_status || "active") !== "active") continue;
      if (!hasFixedMealPlan(student)) {
        ignoredNoFixedMeal += 1;
        continue;
      }
      const relations = (student as any).student_parent_relations || [];
      const lineUserIds = Array.from(new Set(
        relations
          .map((relation: any) => {
            const parent = Array.isArray(relation.parents) ? relation.parents[0] : relation.parents;
            return parent?.line_user_id;
          })
          .filter(Boolean)
      )) as string[];

      if (lineUserIds.length === 0) {
        await logNotification({
          notificationType: "low_balance",
          studentId: student.id,
          studentName: student.name || "學生",
          status: "skipped",
          errorMessage: "沒有已綁定 LINE 的家長",
          metadata: { balance: student.balance || 0, threshold, fixed_meal_only: true },
        });
        results.push({
          student_id: student.id,
          student_name: student.name || "學生",
          balance: Number(student.balance || 0),
          parent_count: 0,
          sent: 0,
          status: "skipped",
          reason: "沒有已綁定 LINE 的家長",
        });
        continue;
      }

      const fallbackMessage = [
        "方華補習班餐費提醒",
        `${student.name || "學生"} 目前餐費餘額為 $${student.balance || 0}，已低於提醒門檻 $${threshold}。`,
        "請方便時協助安排儲值，謝謝您。",
      ].join("\n");
      const message = await renderNotificationTemplate("low_balance", fallbackMessage, {
        studentName: student.name || "學生",
        balance: student.balance || 0,
        threshold,
      });

      if (dryRun) {
        results.push({
          student_id: student.id,
          student_name: student.name || "學生",
          balance: Number(student.balance || 0),
          parent_count: lineUserIds.length,
          sent: 0,
          status: "skipped",
          reason: "dryRun 未發送",
        });
        continue;
      }

      let sent = 0;

      for (const lineUserId of lineUserIds) {
        const response = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            to: lineUserId,
            messages: [{ type: "text", text: message }],
          }),
        });

        if (!response.ok) {
          const detail = await response.text();
          await logNotification({
            notificationType: "low_balance",
            recipientId: lineUserId,
            studentId: student.id,
            studentName: student.name || "學生",
            status: "failed",
            message,
            errorMessage: detail || `LINE API ${response.status}`,
            metadata: { balance: student.balance || 0, threshold, fixed_meal_only: true },
          });
          results.push({
            student_id: student.id,
            student_name: student.name || "學生",
            balance: Number(student.balance || 0),
            parent_count: lineUserIds.length,
            sent,
            status: "failed",
            reason: detail || `LINE API ${response.status}`,
          });
          continue;
        }

        sent += 1;
        await logNotification({
          notificationType: "low_balance",
          recipientId: lineUserId,
          studentId: student.id,
          studentName: student.name || "學生",
          status: "sent",
          message,
          metadata: { balance: student.balance || 0, threshold, fixed_meal_only: true },
        });
      }

      if (sent > 0) {
        results.push({
          student_id: student.id,
          student_name: student.name || "學生",
          balance: Number(student.balance || 0),
          parent_count: lineUserIds.length,
          sent,
          status: "sent",
        });
      }
    }

    const sentStudents = results.filter((result) => result.status === "sent").length;
    const skipped = results.filter((result) => result.status === "skipped").length;
    const failed = results.filter((result) => result.status === "failed").length;

    return NextResponse.json({
      success: failed === 0,
      threshold,
      dryRun,
      total: results.length,
      sentStudents,
      skipped,
      failed,
      ignoredNoFixedMeal,
      results,
    }, { status: failed === 0 ? 200 : 207 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
