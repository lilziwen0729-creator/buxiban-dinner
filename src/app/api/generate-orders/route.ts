import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 🍎 破除 Vercel 死魚快取的終極符咒：強迫每次都重新執行，不拿舊資料！
export const dynamic = "force-dynamic";
const zhDays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const enDays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const shortZhDays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

export async function GET() {
  // 🍎 關鍵修正：強迫取得「台灣時間」的日期和星期
  const twDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  
  // 取得台灣時間的 YYYY-MM-DD
  const year = twDate.getFullYear();
  const month = String(twDate.getMonth() + 1).padStart(2, "0");
  const day = String(twDate.getDate()).padStart(2, "0");
  const todayStr = `${year}-${month}-${day}`;
  
  const dayIndex = twDate.getDay();
  const weekdayZh = zhDays[dayIndex];
  const weekdayEn = enDays[dayIndex];
  const weekdayShort = shortZhDays[dayIndex];

  // 1. 抓取今日排餐
  const { data: schedule } = await supabase
    .from("weekly_schedule")
    .select("menu_id")
    .in("weekday", [weekdayZh, weekdayEn])
    .limit(1)
    .maybeSingle();

  // 如果今天沒設定排餐，直接結束
  if (!schedule || !schedule.menu_id) {
    return NextResponse.json({ message: `今日 (${weekdayZh} / ${weekdayEn}) 無排餐設定` });
  }

  // 2. 只抓取「有開啟自動訂餐」的學生
  const { data: students } = await supabase
    .from("students")
    .select("id, name, fixed_days_off")
    .eq("auto_order", true); 

  if (!students || students.length === 0) {
    return NextResponse.json({ message: "目前沒有開啟自動訂餐 (auto_order=true) 的學生" });
  }

  // 3. 檢查今天是否已經產生過訂單 (使用台灣時間的 todayStr)
  const { data: existingOrders } = await supabase
    .from("orders")
    .select("student_id")
    .eq("order_date", todayStr);
  
  const existingStudentIds = existingOrders?.map(o => o.student_id) || [];

  // 4. 準備寫入清單
  const insertData = [];

  for (const student of students) {
    const daysOff = student.fixed_days_off || [];
    
    if (daysOff.includes(weekdayZh) || daysOff.includes(weekdayShort) || daysOff.includes(weekdayEn)) {
      continue;
    }
    
    if (existingStudentIds.includes(student.id)) continue;

    insertData.push({
      student_id: student.id,
      order_date: todayStr, // 使用台灣時間的日期寫入資料庫
      meal_id: schedule.menu_id, 
      ordered: true,
      received: false, 
      charged: false
    });
  }

  // 5. 批次寫入資料庫
  if (insertData.length > 0) {
    const { error } = await supabase.from("orders").insert(insertData);
    if (error) {
      console.error("產生訂單失敗:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    message: `成功為 ${insertData.length} 位學生產生訂單！`,
  });
}