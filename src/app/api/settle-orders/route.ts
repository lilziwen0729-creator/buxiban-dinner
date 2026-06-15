import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCronRequest } from "@/lib/cronAuth";
import { getToday } from "@/lib/date";
import { logAutomationRun } from "@/lib/automationRun";

type SettlementResult = {
  order_id: string;
  student_id: string;
  student_name: string;
  amount: number;
  status: "charged" | "skipped" | "failed";
  reason?: string;
};

export async function GET(req: Request) {
  const unauthorized = validateCronRequest(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const targetDate = url.searchParams.get("date") || getToday();
  const dryRun = url.searchParams.get("dryRun") === "true";

  try {
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, student_id, meal_id, order_date, received, charged, students(name, balance), menus(price, name)")
      .eq("order_date", targetDate)
      .eq("received", true)
      .eq("charged", false);

    if (error) throw error;

    const results: SettlementResult[] = [];

    for (const order of orders || []) {
      const student = order.students as any;
      const meal = order.menus as any;
      const price = Number(meal?.price || 0);

      if (!student) {
        results.push({
          order_id: order.id,
          student_id: order.student_id,
          student_name: "未知",
          amount: 0,
          status: "skipped",
          reason: "找不到學生資料",
        });
        continue;
      }

      if (price <= 0) {
        results.push({
          order_id: order.id,
          student_id: order.student_id,
          student_name: student.name || "未知",
          amount: 0,
          status: "skipped",
          reason: "找不到餐點價格",
        });
        continue;
      }

      const newBalance = Number(student.balance || 0) - price;

      if (dryRun) {
        results.push({
          order_id: order.id,
          student_id: order.student_id,
          student_name: student.name || "未知",
          amount: -price,
          status: "charged",
          reason: "dryRun 未寫入資料庫",
        });
        continue;
      }

      try {
        const { error: balanceError } = await supabase
          .from("students")
          .update({ balance: newBalance })
          .eq("id", order.student_id);
        if (balanceError) throw balanceError;

        const { error: txError } = await supabase.from("transactions").insert([{
          student_id: order.student_id,
          type: "order",
          amount: -price,
          balance_after: newBalance,
          description: `每日結算扣款：${meal?.name || "今日餐點"}`,
        }]);
        if (txError) throw txError;

        const { error: orderError } = await supabase
          .from("orders")
          .update({ charged: true })
          .eq("id", order.id);
        if (orderError) throw orderError;

        results.push({
          order_id: order.id,
          student_id: order.student_id,
          student_name: student.name || "未知",
          amount: -price,
          status: "charged",
        });
      } catch (settlementError: any) {
        results.push({
          order_id: order.id,
          student_id: order.student_id,
          student_name: student.name || "未知",
          amount: -price,
          status: "failed",
          reason: settlementError.message,
        });
      }
    }

    const charged = results.filter(result => result.status === "charged").length;
    const skipped = results.filter(result => result.status === "skipped").length;
    const failed = results.filter(result => result.status === "failed").length;

    await logAutomationRun({
      jobName: "settle_orders",
      runDate: targetDate,
      status: failed > 0 ? "partial" : "success",
      total: results.length,
      successCount: charged,
      skippedCount: skipped,
      failedCount: failed,
      message: dryRun ? "dryRun 結算檢查完成" : "餐費批次結算完成",
      metadata: { dryRun, results },
    });

    return NextResponse.json({
      success: failed === 0,
      date: targetDate,
      dryRun,
      total: results.length,
      charged,
      skipped,
      failed,
      results,
    }, { status: failed === 0 ? 200 : 207 });
  } catch (error: any) {
    console.error("餐費批次結算失敗:", error);
    await logAutomationRun({
      jobName: "settle_orders",
      runDate: getToday(),
      status: "failed",
      failedCount: 1,
      message: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
