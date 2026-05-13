import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

const weekdays = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];

export async function GET() {
  const today = getToday();
  const weekday = weekdays[new Date().getDay()];

  // 1. 抓取今日排餐 (只需抓 menu_id 就好，不用抓價格，因為產生訂單時不扣錢)
  const { data: schedule } = await supabase
    .from("weekly_schedule")
    .select("menu_id")
    .eq("weekday", weekday)
    .maybeSingle();

  // 如果今天沒設定排餐，直接結束
  if (!schedule || !schedule.menu_id) {
    return NextResponse.json({ message: `今日 (${weekday}) 無排餐設定` });
  }

  // 2. 只抓取「有開啟自動訂餐」的學生
  const { data: students } = await supabase
    .from("students")
    .select("id, name, fixed_days_off")
    .eq("auto_order", true); 

  if (!students || students.length === 0) {
    return NextResponse.json({ message: "沒有開啟自動訂餐的學生" });
  }

  // 3. 檢查今天是否已經產生過訂單 (防呆，避免你按兩次產生兩份)
  const { data: existingOrders } = await supabase
    .from("orders")
    .select("student_id")
    .eq("order_date", today);
  
  const existingStudentIds = existingOrders?.map(o => o.student_id) || [];

  // 4. 準備寫入清單
  const insertData = [];

  for (const student of students) {
    // 過濾 A：如果學生今天「固定請假」，就跳過
    if (student.fixed_days_off?.includes(weekday)) continue;
    
    // 過濾 B：如果這個學生今天已經有訂單了，就跳過
    if (existingStudentIds.includes(student.id)) continue;

    // 加入新增名單 (純建檔，絕對不扣錢，等老師下午按領餐才扣)
    insertData.push({
      student_id: student.id,
      order_date: today,
      meal_id: schedule.menu_id, // 👈 完美帶入便當 ID
      ordered: true,
      received: false, 
      charged: false
    });
  }

  // 5. 批次寫入資料庫 (一次寫入所有學生，超快速)
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