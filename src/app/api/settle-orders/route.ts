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
      .or("cancelled.eq.false,cancelled.is.null")
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
        const { data, error: settlementError } = await supabase.rpc("settle_order_atomic", {
          p_order_id: order.id,
        });
        if (settlementError) {
          if (settlementError.message.includes("settle_order_atomic")) {
            throw new Error("請先到 Supabase 執行 database/accounting_atomic.sql");
          }
          throw settlementError;
        }

        const result = (data || {}) as {
          status?: "charged" | "skipped";
          amount?: number;
          reason?: string;
        };

        if (result.status !== "charged") {
          results.push({
            order_id: order.id,
            student_id: order.student_id,
            student_name: student.name || "未知",
            amount: 0,
            status: "skipped",
            reason: result.reason || "訂單未扣款",
          });
          continue;
        }

        results.push({
          order_id: order.id,
          student_id: order.student_id,
          student_name: student.name || "未知",
          amount: Number(result.amount ?? -price),
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
