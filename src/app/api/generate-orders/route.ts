import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCronRequest } from "@/lib/cronAuth";
import { getTaipeiNow, getTaipeiShortWeekday, getTaipeiWeekday, getToday } from "@/lib/date";
import { logAutomationRun } from "@/lib/automationRun";

const normalizeWeekday = (value: string) =>
  value.normalize("NFKC").replace(/\s/g, "").replace("周", "週");

export async function GET(req: Request) {
  const unauthorized = validateCronRequest(req);
  if (unauthorized) return unauthorized;

  try {
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
    const { data: schedules } = await supabase
      .from("weekly_schedule")
      .select("weekday, menu_id")
      .not("menu_id", "is", null);
    const schedule = schedules?.find((item: any) => normalizeWeekday(item.weekday || "") === normalizeWeekday(dbTodayStr));

    if (!schedule || !schedule.menu_id) {
      await logAutomationRun({
        jobName: "generate_orders",
        runDate: todayDateString,
        status: "skipped",
        message: `今天 (${dbTodayStr}) 沒有設定排餐，跳過執行`,
        metadata: { weekday: dbTodayStr },
      });
      return NextResponse.json({ message: `今天 (${dbTodayStr}) 沒有設定排餐，跳過執行` });
    }

    // ==========================================
    // 4. 抓取所有開啟自動訂餐的學生 (必須包含 fixed_days_off)
    // ==========================================
    const { data: students } = await supabase
      .from("students")
      .select("id, name, fixed_days_off, enrollment_status") // 👈 絕對不能漏掉這個欄位
      .eq("auto_order", true);

    if (!students || students.length === 0) {
      await logAutomationRun({
        jobName: "generate_orders",
        runDate: todayDateString,
        status: "skipped",
        message: "目前沒有開啟自動訂餐的學生",
      });
      return NextResponse.json({ message: "目前沒有開啟自動訂餐的學生" });
    }

    // ==========================================
    // 5. 抓取今天已經點過餐的人 (防呆，避免重複點餐)
    // ==========================================
    const { data: existingOrders } = await supabase
      .from("orders")
      .select("student_id")
      .eq("order_date", todayDateString);
    
    const existingStudentIds = existingOrders?.map(o => o.student_id) || [];

    // ==========================================
    // 6. 過濾並產生訂單陣列
    // ==========================================
    const insertData = [];

    for (const student of students) {
      if ((student.enrollment_status || "active") !== "active") continue;
      // 確保陣列存在，防止 null 報錯
      const myFixedDays = student.fixed_days_off || [];
      
      // 核心判斷：學生的清單裡有沒有 "週四"？ 而且他今天還沒點過餐？
      const hasFixedToday = myFixedDays.some((day: string) => normalizeWeekday(day) === normalizeWeekday(parentTodayStr));

      if (hasFixedToday && !existingStudentIds.includes(student.id)) {
        insertData.push({
          student_id: student.id,
          order_date: todayDateString,
          meal_id: schedule.menu_id,
          ordered: true,
          received: false,
          charged: false // 尚未扣款
        });
      }
    }

    // ==========================================
    // 7. 寫入資料庫
    // ==========================================
    if (insertData.length > 0) {
      const { error } = await supabase.from("orders").insert(insertData);
      if (error) throw error;
    }

    await logAutomationRun({
      jobName: "generate_orders",
      runDate: todayDateString,
      status: "success",
      total: insertData.length,
      successCount: insertData.length,
      skippedCount: students.length - insertData.length,
      message: `成功為 ${insertData.length} 位學生產生訂單`,
      metadata: {
        checked_day: parentTodayStr,
        weekday: dbTodayStr,
        auto_order_students: students.length,
        existing_orders: existingStudentIds.length,
      },
    });

    // 回報戰果
    return NextResponse.json({ 
      success: true, 
      message: `成功為 ${insertData.length} 位學生產生訂單！`,
      date: todayDateString,
      checked_day: parentTodayStr
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
