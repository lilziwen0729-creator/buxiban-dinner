import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logNotification } from "@/lib/notificationLog";

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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const threshold = Number(body.threshold || DEFAULT_THRESHOLD);
    const dryRun = body.dryRun === true;

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

    for (const student of students || []) {
      if (((student as any).enrollment_status || "active") !== "active") continue;
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
          metadata: { balance: student.balance || 0, threshold },
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

      const message = [
        "方華補習班餐費提醒",
        `${student.name || "學生"} 目前餐費餘額為 $${student.balance || 0}，已低於提醒門檻 $${threshold}。`,
        "請方便時協助安排儲值，謝謝您。",
      ].join("\n");

      if (dryRun) {
        await logNotification({
          notificationType: "low_balance",
          studentId: student.id,
          studentName: student.name || "學生",
          status: "skipped",
          message,
          errorMessage: "dryRun 未發送",
          metadata: { balance: student.balance || 0, threshold, parent_count: lineUserIds.length },
        });
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
            metadata: { balance: student.balance || 0, threshold },
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
          metadata: { balance: student.balance || 0, threshold },
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
      results,
    }, { status: failed === 0 ? 200 : 207 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
