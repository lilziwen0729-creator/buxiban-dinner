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
  const [tab, setTab] = useState<"attendance" | "meal">("attendance"); 
  const [selectedGrade, setSelectedGrade] = useState("小一");
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  
  // 新增：點名統計狀態
  const [attendanceStats, setAttendanceStats] = useState({ total: 0, arrived: 0 });

  const grades = [
    "大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "無"
  ];

  const todayDisplay = new Date().toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  useEffect(() => {
    if (tab === "meal") {
      fetchOrders();
    } else {
      fetchAttendanceStats(); // 切換到點名頁時抓統計
    }
    
    const interval = setInterval(() => {
      if (tab === "meal") fetchOrders();
      if (tab === "attendance") fetchAttendanceStats();
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedGrade, tab]);

  // --- 1. 抓取點名統計 ---
  const fetchAttendanceStats = async () => {
    const today = getToday();
    
    // 抓取該年級總人數
    const { count: totalCount } = await supabase
      .from("students")
      .select("*", { count: 'exact', head: true })
      .eq("grade", selectedGrade);

    // 抓取該年級今日已到人數 (連表查詢)
    const { data: attendanceData } = await supabase
      .from("daily_attendance")
      .select(`
        student_id,
        students!inner(grade)
      `)
      .eq("date", today)
      .eq("students.grade", selectedGrade);

    setAttendanceStats({
      total: totalCount || 0,
      arrived: attendanceData?.length || 0
    });
  };

  // --- 2. 抓取領餐訂單 ---
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

  // --- 3. 核心功能：領餐確認 + 自動扣款 ---
  const toggleReceived = async (orderId: string, currentStatus: boolean, studentId: string, studentName: string) => {
    // 如果是取消領餐 (已領 -> 未領)
    if (currentStatus === true) {
      if (!confirm(`確定取消 ${studentName} 的領餐？這不會自動退款喔！`)) return;
      await supabase.from("orders").update({ received: false }).eq("id", orderId);
      fetchOrders();
      return;
    }

    // 如果是確認領餐 (未領 -> 已領)
    try {
      const today = getToday();
      const weekday = new Date().toLocaleDateString("zh-TW", { weekday: "long" });

      // A. 抓餐費
      const { data: schedule } = await supabase
        .from("weekly_schedule")
        .select("menus(price, name)")
        .eq("weekday", weekday)
        .single();

      const mealPrice = (schedule?.menus as any)?.price || 0;
      const mealName = (schedule?.menus as any)?.name || "當日餐點";

      if (mealPrice <= 0) {
        alert("今日尚未排餐或設定價格，無法扣款。");
        return;
      }

      // B. 抓餘額
      const { data: student } = await supabase.from("students").select("balance").eq("id", studentId).single();
      const currentBalance = student?.balance || 0;
      const newBalance = currentBalance - mealPrice;

      // C. 連動更新 (餘額、交易紀錄、訂單狀態)
      await supabase.from("students").update({ balance: newBalance }).eq("id", studentId);
      await supabase.from("transactions").insert([{
        student_id: studentId,
        type: "order",
        amount: -mealPrice,
        balance_after: newBalance,
        description: `領餐扣款：${mealName}`
      }]);
      await supabase.from("orders").update({ received: true }).eq("id", orderId);

      fetchOrders();
    } catch (err) {
      alert("處理失敗，請檢查網路連線");
    }
  };

  // 計算領餐百分比
  const currentGradeTotal = allOrders.filter((o) => o.studentGrade === selectedGrade).length;
  const currentGradeReceived = allOrders.filter((o) => o.studentGrade === selectedGrade && o.received).length;

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* 1. 分頁導覽 */}
        <div className="bg-white rounded-3xl p-2 shadow-sm flex gap-2 border border-gray-100">
          <button
            onClick={() => setTab("attendance")}
            className={`flex-1 py-4 rounded-2xl font-bold transition ${
              tab === "attendance" ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:bg-gray-50"
            }`}
          >
            📝 點名
          </button>
          <button
            onClick={() => setTab("meal")}
            className={`flex-1 py-4 rounded-2xl font-bold transition ${
              tab === "meal" ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:bg-gray-50"
            }`}
          >
            🍱 領餐
          </button>
        </div>

        {/* 2. 年級與統計資訊 */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              <label className="block text-gray-500 font-bold mb-2 text-sm">年級：</label>
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-black font-bold text-xl outline-none bg-gray-50 focus:ring-2 focus:ring-blue-500"
              >
                {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
              </select>
            </div>
            
            {/* 統計面板 */}
            <div className="flex gap-3">
              <div className="bg-blue-50 px-6 py-3 rounded-2xl text-center border border-blue-100">
                <p className="text-blue-500 text-xs font-bold mb-1">今日簽到</p>
                <p className="text-2xl font-black text-blue-700">{attendanceStats.arrived} <span className="text-sm font-normal text-blue-400">/ {attendanceStats.total}</span></p>
              </div>
              <div className="bg-green-50 px-6 py-3 rounded-2xl text-center border border-green-100">
                <p className="text-green-500 text-xs font-bold mb-1">今日領餐</p>
                <p className="text-2xl font-black text-green-700">{currentGradeReceived} <span className="text-sm font-normal text-green-400">/ {currentGradeTotal}</span></p>
              </div>
            </div>
          </div>
        </div>

        {/* 3. 分頁內容 */}
        {tab === "attendance" ? (
          <div className="bg-white rounded-3xl p-2 shadow-sm border border-gray-100 min-h-[400px]">
             {/* 統計未到人數提示 */}
             {attendanceStats.total - attendanceStats.arrived > 0 && (
                <div className="m-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold text-center">
                  ⚠️ 還有 {attendanceStats.total - attendanceStats.arrived} 位學生尚未簽到
                </div>
             )}
            <AttendanceTab teacherGrade={selectedGrade} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex justify-between">
                <span>領餐清單 ({selectedGrade})</span>
                <span className="text-sm text-gray-400 font-normal">{todayDisplay}</span>
              </h2>
              <div className="grid gap-3">
                {orders.length === 0 ? (
                  <p className="text-center text-gray-400 py-10">本年級今日無訂餐紀錄</p>
                ) : (
                  orders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => toggleReceived(order.id, order.received, order.student_id, order.studentName)}
                      className={`w-full flex justify-between items-center p-5 rounded-2xl font-bold transition-all ${
                        order.received 
                        ? "bg-gray-100 text-gray-400 border-none" 
                        : "bg-white text-gray-700 border-2 border-gray-100 hover:border-blue-200 hover:bg-blue-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${order.received ? "bg-gray-300" : "bg-green-500"}`}></div>
                        <span className="text-xl">{order.studentName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {order.received ? (
                          <span className="text-sm bg-gray-200 px-3 py-1 rounded-lg">已扣款</span>
                        ) : (
                          <span className="text-sm text-blue-600">點擊領餐 ➔</span>
                        )}
                      </div>
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