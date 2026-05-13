import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

// 同時準備中文、英文、和家長端常用的「週X」對照表
const zhDays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const enDays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const shortZhDays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

export async function GET() {
  const today = getToday();
  const dayIndex = new Date().getDay();
  
  const weekdayZh = zhDays[dayIndex];
  const weekdayEn = enDays[dayIndex];
  const weekdayShort = shortZhDays[dayIndex]; // 例如 "週四"

  // 1. 抓取今日排餐 (支援雙語，只要有 "星期四" 或 "thu" 都抓得出來！)
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

  // 3. 檢查今天是否已經產生過訂單
  const { data: existingOrders } = await supabase
    .from("orders")
    .select("student_id")
    .eq("order_date", today);
  
  const existingStudentIds = existingOrders?.map(o => o.student_id) || [];

  // 4. 準備寫入清單
  const insertData = [];

  for (const student of students) {
    const daysOff = student.fixed_days_off || [];
    
    // 過濾 A：不管家長是存 "星期四" 還是 "週四"，只要有中就當作請假跳過
    if (daysOff.includes(weekdayZh) || daysOff.includes(weekdayShort) || daysOff.includes(weekdayEn)) {
      continue;
    }
    
    // 過濾 B：如果這個學生今天已經有訂單了，就跳過
    if (existingStudentIds.includes(student.id)) continue;

    // 加入新增名單
    insertData.push({
      student_id: student.id,
      order_date: today,
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