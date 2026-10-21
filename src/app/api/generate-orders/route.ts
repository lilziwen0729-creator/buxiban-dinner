import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { validateCronRequest } from "@/lib/cronAuth";
import { getTaipeiNow, getTaipeiShortWeekday, getTaipeiWeekday, getToday } from "@/lib/date";
import { logAutomationRun } from "@/lib/automationRun";
import { getMealOrderCandidates } from "@/lib/mealOrderPlanning";
import { findMealSchedule, planMealOrders } from "@/lib/mealSchedule";

export async function GET(req: Request) {
  const unauthorized = validateCronRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const supabase = getSupabaseAdmin();
    // ==========================================
    // 1. 取得準確的「台灣時間」與「星期幾」
    // ==========================================
    const dateObj = getTaipeiNow();
    const dayIndex = dateObj.getDay(); // 0是週日, 1是週一, 4是週四
    const todayDateString = getToday();

    // 假日不執行
    if (dayIndex === 0 || dayIndex === 6) {
      await logAutomationRun({
        jobName: "generate_orders",
        runDate: todayDateString,
        status: "skipped",
        message: "假日不產生訂單",
      });
      return NextResponse.json({ message: "假日不產生訂單" });
    }

    // ==========================================
    // 2. 字眼對齊：處理家長端與資料庫的文字差異
    // ==========================================
    // 對應【家長手機端】存入的字：["週一", "週二", "週三", "週四", "週五"]
    const parentTodayStr = getTaipeiShortWeekday(); // 例如："週四"

    // 對應【補習班後台 weekly_schedule】存的字："星期四"
    const dbTodayStr = getTaipeiWeekday(); // 例如："星期四"

    // ==========================================
    // 3. 檢查今天補習班有沒有賣便當
    // ==========================================
    const { data: schedules, error: scheduleError } = await supabase
      .from("weekly_schedule")
      .select("*");
    if (scheduleError) throw scheduleError;

    const schedule = findMealSchedule(schedules || [], dbTodayStr);

    if (!schedule) {
      await logAutomationRun({
        jobName: "generate_orders",
        runDate: todayDateString,
        status: "skipped",
        message: `今天 (${dbTodayStr}) 沒有設定排餐，跳過執行`,
        metadata: { weekday: dbTodayStr },
      });
      return NextResponse.json({ message: `今天 (${dbTodayStr}) 沒有設定排餐，跳過執行` });
    }

    const { students, eligibleStudents } = await getMealOrderCandidates(todayDateString, parentTodayStr, supabase);

    const { orders: insertData, missing } = planMealOrders(eligibleStudents, schedule, todayDateString);

    // ==========================================
    // 6. 寫入資料庫；唯一索引搭配 ON CONFLICT 避免併發重複產單
    // ==========================================
    let generatedCount = 0;
    if (insertData.length > 0) {
      const { data: insertedOrders, error } = await supabase
        .from("orders")
        .upsert(insertData, {
          onConflict: "student_id,order_date",
          ignoreDuplicates: true,
        })
        .select("student_id");
      if (error) throw error;
      generatedCount = insertedOrders?.length || 0;
    }

    const alreadyExistsCount = insertData.length - generatedCount;
    const ineligibleCount = students.length - eligibleStudents.length;

    await logAutomationRun({
      jobName: "generate_orders",
      runDate: todayDateString,
      status: "success",
      total: students.length,
      successCount: generatedCount,
      skippedCount: alreadyExistsCount + ineligibleCount + missing.length,
      message: `成功為 ${generatedCount} 位學生產生訂單${missing.length ? `，${missing.length} 位因所屬年級尚未排餐而略過` : ""}`,
      metadata: {
        checked_day: parentTodayStr,
        weekday: dbTodayStr,
        checked_students: students.length,
        eligible_students: eligibleStudents.length,
        already_exists: alreadyExistsCount,
        ineligible_students: ineligibleCount,
        missing_schedule: missing.length,
      },
    });

    // 回報戰果
    return NextResponse.json({ 
      success: true, 
      message: `成功為 ${generatedCount} 位學生產生訂單！`,
      date: todayDateString,
      checked_day: parentTodayStr,
      generated: generatedCount,
      already_exists: alreadyExistsCount,
      ineligible: ineligibleCount,
      missing_schedule: missing.length,
    });

  } catch (error: any) {
    console.error("產生訂單失敗:", error);
    await logAutomationRun({
      jobName: "generate_orders",
      runDate: getToday(),
      status: "failed",
      failedCount: 1,
      message: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
