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
  
  // 統計狀態：新增 hwIncomplete
  const [attendanceStats, setAttendanceStats] = useState({ 
    total: 0, 
    arrived: 0,
    hwIncomplete: 0 
  });

  const grades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "無"];
  const isPrimary = selectedGrade.includes("小"); // 判斷是否為國小部
  const isJuniorHigh = selectedGrade.includes("國"); // 判斷是否為國中部

  const todayDisplay = new Date().toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 30000);
    return () => clearInterval(interval);
  }, [selectedGrade, tab]);

  const refreshData = () => {
    if (tab === "meal") fetchOrders();
    fetchAttendanceStats();
  };

  // --- 1. 抓取統計資訊 ---
  const fetchAttendanceStats = async () => {
    const today = getToday();
    
    // 總人數
    const { count } = await supabase.from("students").select("*", { count: 'exact', head: true }).eq("grade", selectedGrade);

    // 簽到與作業統計
    const { data: attData } = await supabase
      .from("daily_attendance")
      .select(`hw_completed, students!inner(grade)`)
      .eq("date", today)
      .eq("students.grade", selectedGrade);

    const arrived = attData?.length || 0;
    const completedHW = attData?.filter(a => a.hw_completed).length || 0;

    setAttendanceStats({
      total: count || 0,
      arrived: arrived,
      hwIncomplete: arrived - completedHW // 已到的人裡面，作業還沒寫完的
    });
  };

  // --- 2. 領餐邏輯 (保持不變) ---
  const fetchOrders = async () => {
    const today = getToday();
    const { data: orderData } = await supabase.from("orders").select("*").eq("order_date", today);
    const { data: studentData } = await supabase.from("students").select("*");
    if (!orderData || !studentData) return;

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
    setOrders(merged.filter((o) => o.studentGrade === selectedGrade).sort((a, b) => a.studentName.localeCompare(b.studentName, "zh-Hant")));
  };

  const toggleReceived = async (orderId: string, currentStatus: boolean, studentId: string, studentName: string) => {
    if (currentStatus) {
      if (!confirm(`確定取消 ${studentName} 的領餐？`)) return;
      await supabase.from("orders").update({ received: false }).eq("id", orderId);
    } else {
      const today = getToday();
      const weekday = new Date().toLocaleDateString("zh-TW", { weekday: "long" });
      const { data: schedule } = await supabase.from("weekly_schedule").select("menus(price, name)").eq("weekday", weekday).single();
      const mealPrice = (schedule?.menus as any)?.price || 0;
      const mealName = (schedule?.menus as any)?.name || "當日餐點";

      const { data: st } = await supabase.from("students").select("balance").eq("id", studentId).single();
      const newBal = (st?.balance || 0) - mealPrice;

      await supabase.from("students").update({ balance: newBal }).eq("id", studentId);
      await supabase.from("transactions").insert([{ student_id: studentId, type: "order", amount: -mealPrice, balance_after: newBal, description: `領餐扣款：${mealName}` }]);
      await supabase.from("orders").update({ received: true }).eq("id", orderId);
    }
    fetchOrders();
  };

  // --- 3. 國中統一離班按鈕邏輯 ---
  const handleBulkLeave = async () => {
    if (!confirm(`確定要將【${selectedGrade}】所有已簽到學生設為離班？`)) return;
    const today = getToday();
    
    // 找出該年級今天已到但還沒離班的人
    const { data: currentAtt } = await supabase
      .from("daily_attendance")
      .select("id, student_id, students!inner(grade)")
      .eq("date", today)
      .eq("students.grade", selectedGrade)
      .is("left_at", null);

    if (currentAtt && currentAtt.length > 0) {
      const ids = currentAtt.map(a => a.id);
      await supabase
        .from("daily_attendance")
        .update({ left_at: new Date().toISOString() })
        .in("id", ids);
      
      alert(`已完成 ${ids.length} 位學生統一離班`);
      fetchAttendanceStats();
      window.location.reload(); // 重新整理子組件狀態
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* 1. 分頁導覽 */}
        <div className="bg-white rounded-3xl p-2 shadow-sm flex gap-2">
          <button onClick={() => setTab("attendance")} className={`flex-1 py-4 rounded-2xl font-bold transition ${tab === "attendance" ? "bg-blue-600 text-white shadow-lg" : "text-gray-400"}`}>📝 點名與作業</button>
          <button onClick={() => setTab("meal")} className={`flex-1 py-4 rounded-2xl font-bold transition ${tab === "meal" ? "bg-blue-600 text-white shadow-lg" : "text-gray-400"}`}>🍱 領餐扣款</button>
        </div>

        {/* 2. 核心統計與控制面板 */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <div className="flex-1">
                <label className="block text-gray-500 font-bold mb-2 text-sm">年級：</label>
                <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-black font-bold text-xl outline-none bg-gray-50">
                  {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <StatCard label="今日簽到" value={attendanceStats.arrived} total={attendanceStats.total} color="blue" />
                {isPrimary && <StatCard label="作業未完" value={attendanceStats.hwIncomplete} color="red" />}
              </div>
            </div>

            {/* 國中統一離班按鈕 */}
            {isJuniorHigh && tab === "attendance" && (
              <button 
                onClick={handleBulkLeave}
                className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold text-lg hover:bg-slate-900 shadow-lg transition"
              >
                🚀 {selectedGrade} 全體統一離班
              </button>
            )}
          </div>
        </div>

        {/* 3. 分頁內容 */}
        {tab === "attendance" ? (
          <div className="bg-white rounded-3xl p-2 shadow-sm border border-gray-100">
            <AttendanceTab teacherGrade={selectedGrade} />
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
             <h2 className="text-xl font-bold mb-4">領餐清單 ({selectedGrade})</h2>
             <div className="grid gap-3">
                {orders.map((order) => (
                  <button key={order.id} onClick={() => toggleReceived(order.id, order.received, order.student_id, order.studentName)} className={`w-full flex justify-between items-center p-5 rounded-2xl font-bold transition ${order.received ? "bg-gray-100 text-gray-400" : "bg-white border-2 border-gray-100"}`}>
                    <span className="text-xl">{order.studentName}</span>
                    <span>{order.received ? "✅ 已扣款" : "點擊扣款"}</span>
                  </button>
                ))}
             </div>
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value, total, color }: { label: string, value: number, total?: number, color: string }) {
  const colorClass = color === 'blue' ? 'text-blue-700 bg-blue-50' : 'text-red-700 bg-red-50';
  return (
    <div className={`px-5 py-3 rounded-2xl border border-opacity-20 text-center ${colorClass}`}>
      <p className="text-xs font-bold mb-1 opacity-70">{label}</p>
      <p className="text-2xl font-black">{value}{total !== undefined && <span className="text-sm font-normal opacity-50"> / {total}</span>}</p>
    </div>
  );
}