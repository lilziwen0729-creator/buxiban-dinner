"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import AttendanceTab from "@/components/admin/AttendanceTab"; 

type Order = {
  id: string;
  received: boolean;
  student_id: string;
  studentName: string;
  studentGrade: string;
};

export default function TeacherPage() {
  // 1. 預設改為 attendance (點名)
  const [tab, setTab] = useState<"attendance" | "meal">("attendance"); 
  
  // 2. 將年級選擇拉到最上層，預設小一
  const [selectedGrade, setSelectedGrade] = useState("小一");
  
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  const grades = [
    "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三",
  ];

  const todayDisplay = new Date().toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  useEffect(() => {
    if (tab === "meal") {
      fetchOrders();
      const interval = setInterval(() => {
        fetchOrders();
      }, 30000);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGrade, tab]);

  const fetchOrders = async () => {
    const today = getToday();
    const { data: orderData } = await supabase.from("orders").select("*").eq("order_date", today);
    if (!orderData) { setOrders([]); setAllOrders([]); return; }

    const { data: studentData } = await supabase.from("students").select("*");
    if (!studentData) { setOrders([]); setAllOrders([]); return; }

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
    setOrders((prev) => prev.map((order) => order.id === id ? { ...order, received: newValue } : order));
    setAllOrders((prev) => prev.map((order) => order.id === id ? { ...order, received: newValue } : order));
    const { error } = await supabase.from("orders").update({ received: newValue }).eq("id", id);
    if (error) {
      setOrders((prev) => prev.map((order) => order.id === id ? { ...order, received: current } : order));
      setAllOrders((prev) => prev.map((order) => order.id === id ? { ...order, received: current } : order));
      alert("更新失敗");
    }
  };

  // 計算目前「選定年級」的領餐狀況
  const currentGradeTotal = allOrders.filter((o) => o.studentGrade === selectedGrade).length;
  const currentGradeReceived = allOrders.filter((o) => o.studentGrade === selectedGrade && o.received).length;

  return (
    <main className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">

        {/* 頂部切換按鈕 (順序對調) */}
        <div className="bg-white rounded-3xl p-3 shadow-sm flex gap-2">
          <button
            onClick={() => setTab("attendance")}
            className={`flex-1 py-4 px-2 rounded-2xl font-bold text-lg transition-colors ${
              tab === "attendance" ? "bg-blue-600 text-white shadow-md" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            📝 點名與作業
          </button>
          <button
            onClick={() => setTab("meal")}
            className={`flex-1 py-4 px-2 rounded-2xl font-bold text-lg transition-colors ${
              tab === "meal" ? "bg-blue-600 text-white shadow-md" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            🍱 領餐確認
          </button>
        </div>

        {/* 全域年級選擇器 (所有分頁共用) */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border-t-4 border-slate-800">
          <label className="block text-gray-600 font-bold mb-3 text-lg">👨‍🏫 請選擇您負責的年級：</label>
          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            className="w-full border-2 border-blue-200 rounded-xl px-4 py-4 text-black font-bold text-xl focus:border-blue-500 outline-none bg-blue-50"
          >
            {grades.map((grade) => (
              <option key={grade} value={grade}>{grade}</option>
            ))}
          </select>
        </div>

        {/* ================= 點名與作業分頁內容 ================= */}
        {tab === "attendance" && (
          <div className="animation-fade-in">
            {/* 傳入老師選定的年級，讓組件只顯示該年級 */}
            <AttendanceTab teacherGrade={selectedGrade} />
          </div>
        )}

        {/* ================= 領餐分頁內容 ================= */}
        {tab === "meal" && (
          <div className="space-y-6 md:space-y-8 animation-fade-in">
            <div className="bg-blue-600 text-white rounded-3xl p-6 md:p-8">
              <h1 className="text-2xl md:text-3xl font-bold">教師領餐確認</h1>
              <p className="mt-2 text-blue-100">{todayDisplay}</p>
              
              <div className="mt-5 bg-blue-500 rounded-2xl p-4 md:p-5">
                <p className="text-base md:text-lg text-blue-100 font-bold">📍 {selectedGrade} 領餐進度</p>
                <p className="text-2xl md:text-3xl font-bold mt-1">
                  已領 {currentGradeReceived} / {currentGradeTotal}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 md:p-8 shadow">
              <h2 className="text-xl font-bold text-black mb-5">學生名單</h2>
              <div className="space-y-4">
                {orders.length === 0 ? (
                  <p className="text-center text-gray-500 py-6">今日無訂餐</p>
                ) : (
                  orders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => toggleReceived(order.id, order.received)}
                      className={`w-full flex justify-between items-center p-4 md:p-5 rounded-2xl text-lg md:text-xl font-bold transition ${
                        order.received ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600 border border-gray-200"
                      }`}
                    >
                      <span>{order.studentName}</span>
                      <span>{order.received ? "✅ 已領" : "未領"}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}