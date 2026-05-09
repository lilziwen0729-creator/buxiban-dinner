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

  const { data: schedule } = await supabase
    .from("weekly_schedule")
    .select("*")
    .eq("weekday", weekday)
    .single();

  if (!schedule) {
    return NextResponse.json({
      message: "今日無排餐",
    });
  }

  const { data: students } = await supabase
    .from("students")
    .select("*");

  for (const student of students || []) {
    if (!student.fixed_days?.includes(weekday)) continue;

    const newBalance =
      (student.balance || 0) - schedule.price;

    if (newBalance < -500) {
      await supabase
        .from("students")
        .update({
          meal_blocked: true,
        })
        .eq("id", student.id);

      continue;
    }

    await supabase.from("orders").insert([
      {
        student_id: student.id,
        order_date: today,
        received: false,
      },
    ]);

    await supabase
      .from("students")
      .update({
        balance: newBalance,
      })
      .eq("id", student.id);

    await supabase.from("transactions").insert([
      {
        student_id: student.id,
        type: "meal",
        amount: -schedule.price,
        balance_after: newBalance,
        description: `${weekday} 自動扣餐`,
      },
    ]);
  }

  return NextResponse.json({
    success: true,
  });
}