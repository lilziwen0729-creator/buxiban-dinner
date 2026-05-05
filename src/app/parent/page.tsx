"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

type Student = {
  id: string;
  name: string;
  grade: string;
  fixed_days: string[];
  today_cancelled: boolean;
  auto_ordered?: boolean;
  balance: number;
};

type Transaction = {
  id: string;
  amount: number;
  type: string;
  note: string;
  created_at: string;
};

export default function ParentPage() {
  const router = useRouter();

  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [transactions, setTransactions] = useState<{
  id: string;
  type: string;
  amount: number;
  created_at: string;
  note?: string;
}[]>([]);
  const [loading, setLoading] = useState(true);

  const taipeiHour = new Date().toLocaleString("en-US", {
  timeZone: "Asia/Taipei",
  hour: "numeric",
  hour12: false,
  });

  const isLocked = Number(taipeiHour) >= 12;

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    setLoading(true);

    await generateTodayOrders();
    await fetchStudents();

    setLoading(false);
  };

  const generateTodayOrders = async () => {
    const today = getToday();

    const weekMap: Record<number, string> = {
      1: "週一",
      2: "週二",
      3: "週三",
      4: "週四",
      5: "週五",
    };

    const todayWeek = weekMap[new Date().getDay()];

    if (!todayWeek) return;

    const { data: allStudents } = await supabase
      .from("students")
      .select("*");

    if (!allStudents) return;

    for (const student of allStudents) {
      if (!student.fixed_days?.includes(todayWeek))
        continue;

      await supabase
        .from("orders")
        .upsert(
          {
            student_id: student.id,
            order_date: today,
            received: false,
          },
          {
            onConflict: "student_id,order_date",
          }
        );
    }
  };

  const fetchTransactions = async (
  studentId: string
) => {
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", {
      ascending: false,
    });

  setTransactions(data || []);
};

  const fetchStudents = async () => {
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

    if (!parent) {
     setLoading(false);
     return;
    }

    const { data: studentData } = await supabase
      .from("students")
      .select("*")
      .eq("parent_id", parent.id);

    if (!studentData) return;

    const today = getToday();

    const todayWeek = {
     1: "週一",
     2: "週二",
     3: "週三",
     4: "週四",
     5: "週五",
    }[new Date().getDay()];

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
          auto_ordered:
           student.fixed_days?.includes(todayWeek),
        };
      })
    );

    setStudents(updatedStudents);
    const id =
  selectedId || updatedStudents[0]?.id || "";

setSelectedId(id);

if (id) {
  fetchTransactions(id);
}
    setLoading(false);
  };

  const selectedStudent = students.find(
    (s) => s.id === selectedId
  );

  const toggleTodayOrder = async () => {
    if (!selectedStudent || isLocked) return;

    const today = getToday();

    if (selectedStudent.today_cancelled) {
      await supabase
        .from("orders")
        .upsert(
          {
            student_id: selectedStudent.id,
            order_date: today,
            received: false,
          },
          {
            onConflict: "student_id,order_date",
          }
        );
    } else {
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
      ? selectedStudent.fixed_days.filter(
          (d) => d !== day
        )
      : [...selectedStudent.fixed_days, day];

    await supabase
      .from("students")
      .update({ fixed_days: updated })
      .eq("id", selectedStudent.id);

    fetchStudents();
  };

  const logout = () => {
    localStorage.removeItem("currentParent");
    router.push("/login");
  };

  if (loading) {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-xl font-bold text-blue-600">
        載入中...
      </div>
    </div>
  );
  }

  if (!selectedStudent) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white text-xl">
        尚未綁定學生
      </div>
    );
  }

  const weekdays = [
    "週一",
    "週二",
    "週三",
    "週四",
    "週五",
  ];

  return (
    <main className="min-h-screen bg-gray-100 p-4 flex justify-center">
      <div className="w-full max-w-xl space-y-5">

        <div className="bg-blue-600 rounded-3xl shadow p-6 text-white">
          <p className="font-bold text-base">
            方華補習班 楊梅校
          </p>

          <h1 className="text-3xl font-bold mt-2">
            訂餐系統
          </h1>

          <p className="mt-2 text-sm">
            家長線上管理訂餐
          </p>
        </div>

        <div className="bg-amber-50 border-l-4 border-amber-400 rounded-2xl p-5 shadow-sm">
  <h3 className="text-amber-800 font-bold text-lg mb-3">
    使用說明
  </h3>

  <div className="space-y-2 text-sm text-amber-900">
    <p>① 依下方每周固定訂餐自動訂餐</p>
    <p>② 點擊「取消今日訂餐」可取消今天餐點</p>
    <p>③ 點擊「恢復今日訂餐」可重新加入訂單</p>
    <p>④ 每日中午 12:00 後停止修改</p>
    <p>⑤ 下方設定會自動套用到未來每週</p>
  </div>
</div>

        <div className="bg-white rounded-3xl shadow p-6">
          <select
            value={selectedId}
            onChange={(e) => {
          setSelectedId(e.target.value);
          fetchTransactions(e.target.value);
}}
            className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 mb-5 text-black"
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

          <h2 className="text-3xl font-bold text-center text-black">
            {selectedStudent.name}
          </h2>

          <p className="text-center text-lg text-gray-600 mt-2">
            {selectedStudent.grade}
          </p>

          <div className="mt-5 bg-blue-50 rounded-2xl p-4 text-center">
  <p className="text-gray-600 text-sm">
    目前餐費餘額
  </p>

  <div className="bg-white rounded-3xl shadow p-5 mt-4">
  <h3 className="text-lg font-bold text-black mb-3">
    儲值 / 扣款明細
  </h3>

  {transactions.length === 0 ? (
    <p className="text-gray-500 text-sm">
      尚無紀錄
    </p>
  ) : (
    <div className="space-y-3 max-h-64 overflow-y-auto">
      {transactions.map((tx: any) => (
        <div
          key={tx.id}
          className="flex justify-between border-b pb-2"
        >
          <div>
            <p className="font-semibold text-black">
              {tx.type === "topup"
                ? "儲值"
                : "訂餐扣款"}
            </p>

            <p className="text-xs text-gray-500">
              {new Date(tx.created_at).toLocaleString("zh-TW")}
            </p>
          </div>

          <p
            className={`font-bold ${
              tx.amount > 0
                ? "text-green-600"
                : "text-red-500"
            }`}
          >
            {tx.amount > 0 ? "+" : ""}
            ${tx.amount}
          </p>
        </div>
      ))}
    </div>
  )}
</div>

  <p
    className={`text-3xl font-bold mt-1 ${
      selectedStudent.balance < 200
        ? "text-red-500"
        : "text-blue-600"
    }`}
  >
    ${selectedStudent.balance || 0}
  </p>
</div>

          <p
            className={`text-center text-2xl font-bold mt-5 ${
              selectedStudent.today_cancelled
                ? "text-red-500"
                : "text-green-500"
            }`}
          >
            {selectedStudent.today_cancelled
              ? "今日無訂餐"
              : "今日訂餐"}
          </p>

          <button
            onClick={toggleTodayOrder}
            disabled={isLocked}
            className={`w-full mt-6 py-4 rounded-2xl text-xl font-bold transition ${
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
              ? "恢復今日訂餐"
              : "取消今日訂餐"}
          </button>

          <p className="text-center text-red-500 mt-3 text-sm font-bold">
            每日中午 12:00 後無法修改
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow p-6">
          <h3 className="text-xl font-bold text-black mb-5">
            每週固定訂餐
          </h3>

          <div className="bg-white rounded-3xl shadow p-6">
  <h3 className="text-xl font-bold text-black mb-5">
    消費明細
  </h3>

  <div className="space-y-3">
    {transactions.length === 0 ? (
      <p className="text-gray-500 text-center">
        尚無紀錄
      </p>
    ) : (
      transactions.map((tx) => (
        <div
          key={tx.id}
          className="flex justify-between items-center border-b pb-3"
        >
          <div>
            <p className="font-bold text-black">
              {tx.note}
            </p>

            <p className="text-sm text-gray-500">
              {new Date(
                tx.created_at
              ).toLocaleString("zh-TW")}
            </p>
          </div>

          <p
            className={`font-bold ${
              tx.amount > 0
                ? "text-green-600"
                : "text-red-500"
            }`}
          >
            {tx.amount > 0 ? "+" : ""}
            ${tx.amount}
          </p>
        </div>
      ))
    )}
  </div>
</div>

          <div className="grid grid-cols-5 gap-2">
            {weekdays.map((day) => {
              const active =
                selectedStudent.fixed_days.includes(day);

              return (
                <button
                  key={day}
                  onClick={() =>
                    toggleFixedDay(day)
                  }
                  className={`py-3 rounded-xl font-bold transition ${
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

        <div className="flex justify-center pt-2">
         <button
           onClick={logout}
           className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-1.5 rounded-lg text-sm font-medium transition"
         >
           登出
         </button>
        </div>

      </div>
    </main>
  );
}