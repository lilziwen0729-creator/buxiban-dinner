"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import AttendanceTab from "@/components/admin/AttendanceTab"; // 引入點名元件

type Order = {
  id: string;
  received: boolean;
  student_id: string;
  studentName: string;
  studentGrade: string;
};

export default function TeacherPage() {
  const [tab, setTab] = useState<"meal" | "attendance">("meal"); // 新增 Tab 狀態
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedGrade, setSelectedGrade] = useState("國一");

  const grades = [
    "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三",
  ];

  const todayDisplay = new Date().toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  useEffect(() => {
    // 只有在領餐分頁時才去抓訂餐資料
    if (tab === "meal") {
      fetchOrders();
      const interval = setInterval(() => {
        fetchOrders();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [selectedGrade, tab]);

  const fetchOrders = async () => {
    const today = getToday();
    const { data: orderData } = await supabase
      .from("orders")
      .select("*")
      .eq("order_date", today);

    if (!orderData) {
      setOrders([]);
      setAllOrders([]);
      return;
    }

    const { data: studentData } = await supabase
      .from("students")
      .select("*");

    if (!studentData) {
      setOrders([]);
      setAllOrders([]);
      return;
    }

    const merged = orderData.map((order) => {
      const student = studentData.find((s) => s.id === order.student_id);
      return {
        id: order.id,
        received: order.received || false,
        student_id: order.student_id,
        studentName: student?.name || "未知",
        studentGrade: student?.grade || "",
      };
    });

    setAllOrders(merged);
    setOrders(
      merged
        .filter((order) => order.studentGrade === selectedGrade)
        .sort((a, b) => a.studentName.localeCompare(b.studentName, "zh-Hant"))
    );
  };

  const toggleReceived = async (id: string, current: boolean) => {
    const newValue = !current;

    // 先更新畫面
    setOrders((prev) => prev.map((order) => order.id === id ? { ...order, received: newValue } : order));
    setAllOrders((prev) => prev.map((order) => order.id === id ? { ...order, received: newValue } : order));

    // 再同步資料庫
    const { error } = await supabase.from("orders").update({ received: newValue }).eq("id", id);

    // 如果失敗就還原
    if (error) {
      setOrders((prev) => prev.map((order) => order.id === id ? { ...order, received: current } : order));
      setAllOrders((prev) => prev.map((order) => order.id === id ? { ...order, received: current } : order));
      alert("更新失敗");
    }
  };

  const totalReceived = allOrders.filter((o) => o.received).length;

  const gradeStats = grades.map((grade) => {
    const gradeOrders = allOrders.filter((o) => o.studentGrade === grade);
    return {
      grade,
      total: gradeOrders.length,
      received: gradeOrders.filter((o) => o.received).length,
    };
  });

  return (
    <main className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">

        {/* 頂部導覽列與切換按鈕 */}
        <div className="bg-white rounded-3xl p-4 shadow-sm flex gap-2 overflow-x-auto">
          <button
            onClick={() => setTab("meal")}
            className={`flex-1 py-4 px-2 rounded-2xl font-bold text-lg whitespace-nowrap transition-colors ${
              tab === "meal" ? "bg-blue-600 text-white shadow-md" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            🍱 領餐確認
          </button>
          <button
            onClick={() => setTab("attendance")}
            className={`flex-1 py-4 px-2 rounded-2xl font-bold text-lg whitespace-nowrap transition-colors ${
              tab === "attendance" ? "bg-blue-600 text-white shadow-md" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            📝 點名與作業
          </button>
        </div>

        {/* ================= 領餐分頁內容 ================= */}
        {tab === "meal" && (
          <div className="space-y-6 md:space-y-8">
            {/* 頂部總覽 */}
            <div className="bg-blue-600 text-white rounded-3xl p-6 md:p-8">
              <h1 className="text-2xl md:text-3xl font-bold">教師領餐確認</h1>
              <p className="mt-2 text-blue-100 text-sm md:text-base">{todayDisplay}</p>
              <p className="mt-2 text-sm text-blue-200">每日 12:00 已結單，此頁面僅供發餐確認</p>

              <div className="mt-5 bg-blue-500 rounded-2xl p-4 md:p-5">
                <p className="text-base md:text-lg text-blue-100">全年級總覽</p>
                <p className="text-2xl md:text-3xl font-bold mt-1">
                  已領 {totalReceived} / {allOrders.length}
                </p>
              </div>
            </div>

            {/* 各年級統計 */}
            <div className="bg-white rounded-3xl p-5 md:p-6 shadow">
              <h2 className="text-xl md:text-2xl font-bold text-black mb-5">各年級統計</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {gradeStats.map((stat) => (
                  <div key={stat.grade} className="bg-slate-50 border border-gray-200 rounded-2xl p-3 md:p-4">
                    <p className="text-black font-bold text-base md:text-lg">{stat.grade}</p>
                    <p className="text-gray-600 mt-2 text-sm md:text-base">
                      已領 {stat.received} / {stat.total}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* 名單區 */}
            <div className="bg-white rounded-3xl p-5 md:p-8 shadow">
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="w-full border-2 rounded-xl px-4 py-4 text-black mb-6"
              >
                {grades.map((grade) => (
                  <option key={grade}>{grade}</option>
                ))}
              </select>

              <div className="space-y-4">
                {orders.length === 0 ? (
                  <p className="text-center text-gray-500 py-6">今日無訂餐</p>
                ) : (
                  orders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => toggleReceived(order.id, order.received)}
                      className={`w-full flex justify-between items-center p-4 md:p-5 rounded-2xl text-lg md:text-xl font-bold transition ${
                        order.received ? "bg-green-500 text-white" : "bg-gray-200 text-black"
                      }`}
                    >
                      <span>{order.studentName}</span>
                      <span>{order.received ? "已領" : "未領"}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= 點名與作業分頁內容 ================= */}
        {tab === "attendance" && (
          <div className="animation-fade-in">
            {/* 這裡直接呼叫我們寫好的獨立組件 */}
            <AttendanceTab />
          </div>
        )}

      </div>
    </main>
  );
}