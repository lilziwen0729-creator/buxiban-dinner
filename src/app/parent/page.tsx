"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  grade: string;
  fixed_days: string[];
  today_cancelled: boolean;
};

export default function ParentPage() {
  const router = useRouter();

  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState("");

  const now = new Date();
  const isLocked = now.getHours() >= 12;

  useEffect(() => {
    fetchStudents();
  }, []);

  const generateTodayOrders = async () => {
  const weekdays = [
    "週日",
    "週一",
    "週二",
    "週三",
    "週四",
    "週五",
    "週六",
  ];

  const today = new Date();
  const todayStr = today
    .toISOString()
    .split("T")[0];

  const todayWeekday =
    weekdays[today.getDay()];

  const { data: allStudents } =
    await supabase
      .from("students")
      .select("*");

  if (!allStudents) return;

  for (const student of allStudents) {
    if (
      student.fixed_days?.includes(
        todayWeekday
      )
    ) {
      const { data: existing } =
        await supabase
          .from("orders")
          .select("id")
          .eq("student_id", student.id)
          .eq("order_date", todayStr)
          .maybeSingle();

      if (!existing) {
        await supabase
          .from("orders")
          .insert({
            student_id: student.id,
            order_date: todayStr,
            received: false,
          });
      }
    }
  }
};

const fetchStudents = async () => {
  await generateTodayOrders();
  
  const phone = localStorage.getItem("currentParent");

  if (!phone) {
    router.push("/login");
    return;
  }

  const { data: parent } = await supabase
    .from("parents")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (!parent) return;

  const { data: studentData } = await supabase
    .from("students")
    .select("*")
    .eq("parent_id", parent.id);

  if (!studentData) return;

  const today = new Date().toISOString().split("T")[0];

  const updatedStudents = await Promise.all(
    studentData.map(async (student) => {
      const { data: order } = await supabase
        .from("orders")
        .select("*")
        .eq("student_id", student.id)
        .eq("order_date", today)
        .maybeSingle();

      return {
        ...student,
        today_cancelled: !order,
      };
    })
  );

  setStudents(updatedStudents);
  setSelectedId((prev) => prev || updatedStudents[0]?.id || "");
};

  const selectedStudent = students.find(
    (s) => s.id === selectedId
  );

  const toggleTodayOrder = async () => {
  if (!selectedStudent || isLocked) return;

  const today = new Date().toISOString().split("T")[0];

  if (selectedStudent.today_cancelled) {
    // 恢復訂餐 → 新增訂單
    await supabase.from("orders").insert({
      student_id: selectedStudent.id,
      order_date: today,
    });
  } else {
    // 取消訂餐 → 刪除訂單
    await supabase
      .from("orders")
      .delete()
      .eq("student_id", selectedStudent.id)
      .eq("order_date", today);
    }

    fetchStudents();
  };

  const toggleFixedDay = async (day: string) => {
    if (!selectedStudent) return;

    const updated = selectedStudent.fixed_days.includes(day)
      ? selectedStudent.fixed_days.filter((d) => d !== day)
      : [...selectedStudent.fixed_days, day];

    await supabase
      .from("students")
      .update({
        fixed_days: updated,
      })
      .eq("id", selectedStudent.id);

    fetchStudents();
  };

  const logout = () => {
    localStorage.removeItem("currentParent");
    router.push("/login");
  };

  if (!selectedStudent) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white text-3xl">
        尚未綁定學生
      </div>
    );
  }

  const weekdays = ["週一", "週二", "週三", "週四", "週五"];

  return (
    <main className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <div className="w-full max-w-xl space-y-6">

        <div className="bg-blue-600 rounded-3xl shadow p-8 text-white">
          <p className="font-bold">方華補習班 楊梅校</p>

          <h1 className="text-5xl font-bold mt-2">
            晚餐訂餐系統
          </h1>

          <p className="mt-2">
            家長線上管理訂餐
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow p-8">
          <select
            value={selectedId}
            onChange={(e) =>
              setSelectedId(e.target.value)
            }
            className="w-full border-2 border-gray-300 rounded-xl px-4 py-4 mb-6 text-black"
          >
            {students.map((student) => (
              <option
                key={student.id}
                value={student.id}
              >
                {student.name}（{student.grade}）
              </option>
            ))}
          </select>

          <h2 className="text-5xl font-bold text-center text-black">
            {selectedStudent.name}
          </h2>

          <p className="text-center text-2xl text-gray-600 mt-2">
            {selectedStudent.grade}
          </p>

          <p
            className={`text-center text-3xl font-bold mt-6 ${
              selectedStudent.today_cancelled
                ? "text-red-500"
                : "text-green-500"
            }`}
          >
            {selectedStudent.today_cancelled
              ? "今日已取消"
              : "今日正常訂餐"}
          </p>

          <button
            onClick={toggleTodayOrder}
            disabled={isLocked}
            className={`w-full mt-8 py-5 rounded-2xl text-2xl font-bold ${
              isLocked
                ? "bg-gray-400 text-white"
                : selectedStudent.today_cancelled
                ? "bg-green-600 text-white"
                : "bg-red-500 text-white"
            }`}
          >
            {isLocked
              ? "今日已截止"
              : selectedStudent.today_cancelled
              ? "恢復訂餐"
              : "取消今日訂餐"}
          </button>

          <p className="text-center text-red-500 mt-4 font-bold">
            每日中午 12:00 後無法修改
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow p-8">
          <h3 className="text-2xl font-bold text-black mb-6">
            每週固定訂餐
          </h3>

          <div className="grid grid-cols-5 gap-3">
            {weekdays.map((day) => {
              const active =
                selectedStudent.fixed_days.includes(day);

              return (
                <button
                  key={day}
                  onClick={() =>
                    toggleFixedDay(day)
                  }
                  className={`py-4 rounded-xl font-bold ${
                    active
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-black"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full bg-slate-900 text-white py-5 rounded-2xl text-xl font-bold"
        >
          登出
        </button>
      </div>
    </main>
  );
}