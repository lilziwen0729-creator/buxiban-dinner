"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import AttendanceTab from "@/components/admin/AttendanceTab"; 

type Order = {
  id: string;
  received: boolean;
  charged: boolean;
  student_id: string;
  studentName: string;
  studentGrade: string;
};

export default function TeacherPage() {
  const [tab, setTab] = useState<"attendance" | "meal">("attendance"); 
  const [selectedGrade, setSelectedGrade] = useState("小一");
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  
  // 統計狀態
  const [attendanceStats, setAttendanceStats] = useState({ 
    total: 0, 
    arrived: 0,
    leave: 0,
    hwIncomplete: 0 
  });

  const grades = ["小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三"];
  
  const isPrimary = selectedGrade.includes("小"); // 國小部判斷

  const todayDisplay = new Date().toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  // --- 1. 抓取點名與作業統計 ---
  const fetchAttendanceStats = useCallback(async () => {
    const today = getToday();
    
    // 抓取全校總人數，頂部統計作為今日總覽，不跟下方模式混在一起
    const { count } = await supabase
      .from("students")
      .select("*", { count: 'exact', head: true })
      .or("enrollment_status.eq.active,enrollment_status.is.null");

    // 抓取今日點名狀況
    const { data: attData } = await supabase
      .from("attendance_logs")
      .select("status")
      .eq("date", today);

    const signedInStatuses = ["arrived", "homework_done", "left"];
    const arrived = attData?.filter(a => signedInStatuses.includes(a.status)).length || 0;
    const leave = attData?.filter(a => a.status === "leave").length || 0;
    const hwIncomplete = attData?.filter(a => a.status === "arrived").length || 0;

    setAttendanceStats({
      total: count || 0,
      arrived: arrived,
      leave,
      hwIncomplete
    });
  }, []);

  // --- 2. 領餐登記；餐費由管理員統一結算 ---
  const fetchOrders = useCallback(async () => {
    const today = getToday();
    const { data: orderData } = await supabase.from("orders").select("*").eq("order_date", today).or("cancelled.eq.false,cancelled.is.null");
    const { data: studentData } = await supabase.from("students").select("id, name, grade, enrollment_status");
    if (!orderData || !studentData) return;
    const activeStudents = studentData.filter((student) => (student.enrollment_status || "active") === "active");

    const merged = orderData.map((order) => {
      const student = activeStudents.find((s) => s.id === order.student_id);
      return {
        id: order.id,
        received: order.received || false,
        charged: order.charged || false,
        student_id: order.student_id,
        studentName: student?.name || "未知",
        studentGrade: student?.grade || "",
      };
    });

    setAllOrders(merged);
    setOrders(
      merged
        .filter((o) => o.studentGrade === selectedGrade)
        .sort((a, b) => a.studentName.localeCompare(b.studentName, "zh-Hant"))
    );
  }, [selectedGrade]);

const toggleReceived = async (orderId: string, currentStatus: boolean, studentName: string) => {
    try {
      const { data: currentOrder, error: readError } = await supabase
        .from("orders")
        .select("charged, cancelled")
        .eq("id", orderId)
        .maybeSingle();

      if (readError) throw readError;
      if (!currentOrder || currentOrder.cancelled) {
        await fetchOrders();
        throw new Error("這筆訂餐已取消或不存在，名單已重新整理。");
      }

      if (currentStatus === true) {
        if (currentOrder?.charged === true) {
          alert("此筆餐費已由管理員結算扣款，如需修正請到管理員後台處理。");
          return;
        }

        if (!confirm(`確定取消 ${studentName} 的領餐紀錄？`)) return;
      }

      let update = supabase.from("orders").update({ received: !currentStatus })
        .eq("id", orderId).or("cancelled.eq.false,cancelled.is.null");
      if (currentStatus) update = update.not("charged", "is", true);
      const { data: updated, error } = await update.select("id");
      if (error) throw error;
      if (!updated?.length) {
        await fetchOrders();
        throw new Error("訂單狀態已變更，請確認重新整理後的名單。");
      }
      
      if (typeof fetchOrders === "function") fetchOrders();
      
    } catch (err) {
      console.error("領餐狀態更新失敗:", err);
      alert("領餐狀態更新失敗，請檢查網路連線或聯繫管理員。");
    }
  };

  const refreshData = useCallback(() => {
    void Promise.all([fetchOrders(), fetchAttendanceStats()]);
  }, [fetchAttendanceStats, fetchOrders]);

  useEffect(() => {
    const initialTimer = window.setTimeout(refreshData, 0);
    const interval = setInterval(refreshData, 30000);
    return () => {
      window.clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [refreshData, tab]);

  const currentGradeTotal = allOrders.filter((o) => o.studentGrade === selectedGrade).length;
  const currentGradeReceived = allOrders.filter((o) => o.studentGrade === selectedGrade && o.received).length;
  const totalMealOrders = allOrders.length;
  const totalMealReceived = allOrders.filter((o) => o.received).length;

  return (
    <main className="app-page min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-5">

        <div className="brand-panel rounded-[2rem] p-6 shadow-xl shadow-rose-100">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold text-rose-200">方華補習班 楊梅校</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">老師工作台</h1>
              <p className="mt-2 text-sm font-bold text-slate-300">{todayDisplay} · 今日狀態一眼看清楚</p>
            </div>
            <div className="grid grid-cols-3 gap-2 md:min-w-[24rem]">
              <div className="rounded-2xl bg-white/10 p-3 text-center">
                <p className="text-[11px] font-bold text-slate-300">今日到班</p>
                <p className="mt-1 text-xl font-black">{attendanceStats.arrived}<span className="text-xs text-slate-400">/{attendanceStats.total}</span></p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 text-center">
                <p className="text-[11px] font-bold text-slate-300">今日領餐</p>
                <p className="mt-1 text-xl font-black">{totalMealReceived}<span className="text-xs text-slate-400">/{totalMealOrders}</span></p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 text-center">
                <p className="text-[11px] font-bold text-slate-300">今日請假</p>
                <p className="mt-1 text-xl font-black">{attendanceStats.leave}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 頂部切換 */}
        <div className="app-card flex gap-2 p-1.5">
          <button onClick={() => setTab("attendance")} className={`flex-1 rounded-2xl py-4 text-sm font-black transition ${tab === "attendance" ? "bg-rose-500 text-white shadow-lg shadow-rose-100" : "text-slate-500 hover:bg-rose-50"}`}>點名與作業</button>
          <button onClick={() => setTab("meal")} className={`flex-1 rounded-2xl py-4 text-sm font-black transition ${tab === "meal" ? "bg-rose-500 text-white shadow-lg shadow-rose-100" : "text-slate-500 hover:bg-rose-50"}`}>領餐紀錄</button>
        </div>

        {/* 統計面板 (設定成：只有在看「領餐紀錄」時才顯示) */}
        {tab === "meal" && (
          <div className="app-card p-5">
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <div className="flex-1">
                <label className="mb-2 block text-sm font-black text-slate-500">負責年級</label>
                <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} className="app-input px-4 py-3 text-xl font-black">
                  {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-3 text-center">
                  <p className="mb-1 text-xs font-black text-blue-500">今日簽到</p>
                  <p className="text-2xl font-black text-blue-700">{attendanceStats.arrived} <span className="text-sm font-normal text-blue-400">/ {attendanceStats.total}</span></p>
                </div>
                <div className="rounded-2xl border border-green-100 bg-green-50 px-5 py-3 text-center">
                  <p className="mb-1 text-xs font-black text-green-500">今日領餐</p>
                  <p className="text-2xl font-black text-green-700">{currentGradeReceived} <span className="text-sm font-normal text-green-400">/ {currentGradeTotal}</span></p>
                </div>
                {isPrimary && (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-3 text-center">
                    <p className="mb-1 text-xs font-black text-red-500">作業未完</p>
                    <p className="text-2xl font-black text-red-700">{attendanceStats.hwIncomplete}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 分頁內容 */}
        {tab === "attendance" ? (
          <div className="app-card min-h-[400px] overflow-hidden p-2">
            <AttendanceTab mode="mixed" allowAdminLeave={false} />
          </div>
        ) : (
          <div className="app-card p-5">
            <h2 className="mb-4 flex justify-between text-xl font-black text-slate-900">
              <span>領餐清單 ({selectedGrade})</span>
              <span className="text-sm font-bold text-slate-400">{todayDisplay}</span>
            </h2>
            <div className="grid gap-3">
              {orders.length === 0 ? (
                <p className="py-10 text-center text-sm font-bold text-slate-400">今日無訂餐紀錄</p>
              ) : (
                orders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => toggleReceived(order.id, order.received, order.studentName)}
                    className={`flex w-full items-center justify-between rounded-2xl p-5 text-left font-bold transition-all ${
                      order.received 
                      ? "border border-slate-100 bg-slate-100 text-slate-400" 
                      : "border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${order.received ? "bg-gray-300" : "bg-green-500"}`}></div>
                      <span className="text-xl">{order.studentName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.received ? (
                        <span className="rounded-lg bg-slate-200 px-3 py-1 text-sm">已領</span>
                      ) : (
                        <span className="text-sm font-black text-blue-600">點擊標記領餐</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
        <div className="py-4 text-center text-xs font-bold text-slate-300">方華管理系統 V2.0 - 老師端操作面板</div>
      </div>
    </main>
  );
}
