"use client";

import { useCallback, useEffect, useState } from "react";
import AttendanceTab from "@/components/admin/AttendanceTab";
import { getToday } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import {
  formatTeacherGrade,
  formatTeacherStudentName,
  teacherText,
  type TeacherLanguage,
} from "@/lib/teacherLanguage";

type Order = {
  id: string;
  received: boolean;
  charged: boolean;
  student_id: string;
  studentName: string;
  studentEnglishName: string;
  studentGrade: string;
};

export default function TeacherPage() {
  const [tab, setTab] = useState<"attendance" | "meal">("attendance");
  const [language, setLanguage] = useState<TeacherLanguage>("zh");
  const [selectedGrade, setSelectedGrade] = useState("小一");
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [attendanceStats, setAttendanceStats] = useState({
    total: 0,
    arrived: 0,
    leave: 0,
    hwIncomplete: 0,
  });

  const grades = ["小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三"];
  const isPrimary = selectedGrade.includes("小");
  const tx = (zh: string, en: string) => teacherText(language, zh, en);
  const orderDisplayName = (order: Order) => formatTeacherStudentName({
    name: order.studentName,
    english_name: order.studentEnglishName,
  }, language);
  const todayDisplay = new Date().toLocaleDateString(language === "en" ? "en-US" : "zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.localStorage.getItem("teacher_language") === "en") setLanguage("en");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const changeLanguage = (nextLanguage: TeacherLanguage) => {
    setLanguage(nextLanguage);
    window.localStorage.setItem("teacher_language", nextLanguage);
  };

  const fetchAttendanceStats = useCallback(async () => {
    const today = getToday();
    const { count } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .or("enrollment_status.eq.active,enrollment_status.is.null");
    const { data: attendanceData } = await supabase
      .from("attendance_logs")
      .select("status")
      .eq("date", today);

    const signedInStatuses = ["arrived", "homework_done", "left"];
    setAttendanceStats({
      total: count || 0,
      arrived: attendanceData?.filter((item) => signedInStatuses.includes(item.status)).length || 0,
      leave: attendanceData?.filter((item) => item.status === "leave").length || 0,
      hwIncomplete: attendanceData?.filter((item) => item.status === "arrived").length || 0,
    });
  }, []);

  const fetchOrders = useCallback(async () => {
    const today = getToday();
    const [orderResult, studentResult] = await Promise.all([
      supabase.from("orders").select("*").eq("order_date", today).or("cancelled.eq.false,cancelled.is.null"),
      supabase.from("students").select("id, name, english_name, grade, enrollment_status"),
    ]);
    if (!orderResult.data || !studentResult.data) return;

    const activeStudents = studentResult.data.filter((student) => (student.enrollment_status || "active") === "active");
    const merged = orderResult.data.map((order) => {
      const student = activeStudents.find((item) => item.id === order.student_id);
      return {
        id: order.id,
        received: order.received || false,
        charged: order.charged || false,
        student_id: order.student_id,
        studentName: student?.name || "未知",
        studentEnglishName: student?.english_name || "",
        studentGrade: student?.grade || "",
      };
    });

    setAllOrders(merged);
    setOrders(merged
      .filter((order) => order.studentGrade === selectedGrade)
      .sort((a, b) => a.studentName.localeCompare(b.studentName, "zh-Hant")));
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
        throw new Error(tx("這筆訂餐已取消或不存在，名單已重新整理。", "This meal order was cancelled or no longer exists. The list has been refreshed."));
      }

      if (currentStatus) {
        if (currentOrder.charged === true) {
          alert(tx("此筆餐費已由管理員結算扣款，如需修正請到管理員後台處理。", "This meal has already been charged. Ask an administrator to correct it."));
          return;
        }
        if (!confirm(tx(`確定取消 ${studentName} 的領餐紀錄？`, `Undo meal collection for ${studentName}?`))) return;
      }

      let update = supabase
        .from("orders")
        .update({ received: !currentStatus })
        .eq("id", orderId)
        .or("cancelled.eq.false,cancelled.is.null");
      if (currentStatus) update = update.not("charged", "is", true);
      const { data: updated, error } = await update.select("id");
      if (error) throw error;
      if (!updated?.length) {
        await fetchOrders();
        throw new Error(tx("訂單狀態已變更，請確認重新整理後的名單。", "The order changed. Please check the refreshed list."));
      }
      await fetchOrders();
    } catch (error) {
      console.error("領餐狀態更新失敗:", error);
      alert(tx("領餐狀態更新失敗，請檢查網路連線或聯繫管理員。", "Unable to update meal collection. Check the connection or contact an administrator."));
    }
  };

  const refreshData = useCallback(() => {
    void Promise.all([fetchOrders(), fetchAttendanceStats()]);
  }, [fetchAttendanceStats, fetchOrders]);

  useEffect(() => {
    const initialTimer = window.setTimeout(refreshData, 0);
    const interval = window.setInterval(refreshData, 30000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [refreshData, tab]);

  const currentGradeOrders = allOrders.filter((order) => order.studentGrade === selectedGrade);
  const currentGradeTotal = currentGradeOrders.length;
  const currentGradeReceived = currentGradeOrders.filter((order) => order.received).length;
  const totalMealOrders = allOrders.length;
  const totalMealReceived = allOrders.filter((order) => order.received).length;

  return (
    <main className="app-page min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="brand-panel rounded-[2rem] p-6 shadow-xl shadow-rose-100">
          <div className="mb-5 flex justify-end">
            <div className="inline-grid grid-cols-2 rounded-xl bg-white/10 p-1" role="group" aria-label="Language">
              <button
                type="button"
                aria-pressed={language === "zh"}
                onClick={() => changeLanguage("zh")}
                className={`min-h-10 rounded-lg px-4 text-sm font-black transition ${language === "zh" ? "bg-white text-slate-900 shadow-sm" : "text-white hover:bg-white/10"}`}
              >
                中文
              </button>
              <button
                type="button"
                aria-pressed={language === "en"}
                onClick={() => changeLanguage("en")}
                className={`min-h-10 rounded-lg px-4 text-sm font-black transition ${language === "en" ? "bg-white text-slate-900 shadow-sm" : "text-white hover:bg-white/10"}`}
              >
                English
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold text-rose-200">{tx("方華補習班 楊梅校", "Fang Hua Cram School · Yangmei")}</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">{tx("老師工作台", "Teacher Workspace")}</h1>
              <p className="mt-2 text-sm font-bold text-slate-300">{todayDisplay} · {tx("今日狀態一眼看清楚", "Today's overview")}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 md:min-w-[24rem]">
              <div className="rounded-2xl bg-white/10 p-3 text-center">
                <p className="text-[11px] font-bold text-slate-300">{tx("今日到班", "Checked In")}</p>
                <p className="mt-1 text-xl font-black">{attendanceStats.arrived}<span className="text-xs text-slate-400">/{attendanceStats.total}</span></p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 text-center">
                <p className="text-[11px] font-bold text-slate-300">{tx("今日領餐", "Meals")}</p>
                <p className="mt-1 text-xl font-black">{totalMealReceived}<span className="text-xs text-slate-400">/{totalMealOrders}</span></p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 text-center">
                <p className="text-[11px] font-bold text-slate-300">{tx("今日請假", "Absent")}</p>
                <p className="mt-1 text-xl font-black">{attendanceStats.leave}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="app-card flex gap-2 p-1.5">
          <button onClick={() => setTab("attendance")} className={`flex-1 rounded-2xl py-4 text-sm font-black transition ${tab === "attendance" ? "bg-rose-500 text-white shadow-lg shadow-rose-100" : "text-slate-500 hover:bg-rose-50"}`}>{tx("點名與作業", "Attendance")}</button>
          <button onClick={() => setTab("meal")} className={`flex-1 rounded-2xl py-4 text-sm font-black transition ${tab === "meal" ? "bg-rose-500 text-white shadow-lg shadow-rose-100" : "text-slate-500 hover:bg-rose-50"}`}>{tx("領餐紀錄", "Meal Collection")}</button>
        </div>

        {tab === "meal" && (
          <div className="app-card p-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row">
              <div className="flex-1">
                <label className="mb-2 block text-sm font-black text-slate-500">{tx("負責年級", "Grade")}</label>
                <select value={selectedGrade} onChange={(event) => setSelectedGrade(event.target.value)} className="app-input px-4 py-3 text-xl font-black">
                  {grades.map((grade) => <option key={grade} value={grade}>{formatTeacherGrade(grade, language)}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-3 text-center">
                  <p className="mb-1 text-xs font-black text-blue-500">{tx("今日簽到", "Checked In")}</p>
                  <p className="text-2xl font-black text-blue-700">{attendanceStats.arrived} <span className="text-sm font-normal text-blue-400">/ {attendanceStats.total}</span></p>
                </div>
                <div className="rounded-2xl border border-green-100 bg-green-50 px-5 py-3 text-center">
                  <p className="mb-1 text-xs font-black text-green-500">{tx("今日領餐", "Meals")}</p>
                  <p className="text-2xl font-black text-green-700">{currentGradeReceived} <span className="text-sm font-normal text-green-400">/ {currentGradeTotal}</span></p>
                </div>
                {isPrimary && (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-3 text-center">
                    <p className="mb-1 text-xs font-black text-red-500">{tx("作業未完", "Homework Pending")}</p>
                    <p className="text-2xl font-black text-red-700">{attendanceStats.hwIncomplete}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "attendance" ? (
          <div className="app-card min-h-[400px] overflow-hidden p-2">
            <AttendanceTab mode="mixed" allowAdminLeave={false} language={language} />
          </div>
        ) : (
          <div className="app-card p-5">
            <h2 className="mb-4 flex flex-col justify-between gap-1 text-xl font-black text-slate-900 sm:flex-row">
              <span>{tx("領餐清單", "Meal List")} ({formatTeacherGrade(selectedGrade, language)})</span>
              <span className="text-sm font-bold text-slate-400">{todayDisplay}</span>
            </h2>
            <div className="grid gap-3">
              {orders.length === 0 ? (
                <p className="py-10 text-center text-sm font-bold text-slate-400">{tx("今日無訂餐紀錄", "No meal orders today")}</p>
              ) : (
                orders.map((order) => {
                  const displayName = orderDisplayName(order);
                  return (
                    <button
                      key={order.id}
                      onClick={() => toggleReceived(order.id, order.received, displayName)}
                      className={`flex w-full items-center justify-between rounded-2xl p-5 text-left font-bold transition-all ${order.received ? "border border-slate-100 bg-slate-100 text-slate-400" : "border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-3 w-3 rounded-full ${order.received ? "bg-gray-300" : "bg-green-500"}`} />
                        <span className="text-xl">{displayName}</span>
                      </div>
                      {order.received ? (
                        <span className="rounded-lg bg-slate-200 px-3 py-1 text-sm">{tx("已領", "Collected")}</span>
                      ) : (
                        <span className="text-sm font-black text-blue-600">{tx("點擊標記領餐", "Mark as collected")}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
        <div className="py-4 text-center text-xs font-bold text-slate-300">{tx("方華管理系統 V2.0 - 老師端操作面板", "Fang Hua Management System V2.0 · Teacher Portal")}</div>
      </div>
    </main>
  );
}
