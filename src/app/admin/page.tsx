"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// --- 引入我們拆分出來的 6 個獨立核心組件 ---
import DashboardTab from "@/components/admin/DashboardTab";
import OrdersTab from "@/components/admin/OrdersTab";
import AttendanceTab from "@/components/admin/AttendanceTab";
import ScheduleTab from "@/components/admin/ScheduleTab";
import StudentsTab from "@/components/admin/StudentsTab";
import MenuTab from "@/components/admin/MenuTab";
import HistoryTab from "@/components/admin/HistoryTab";
import OperationLogsTab from "@/components/admin/OperationLogsTab";
import LeaveRecordsTab from "@/components/admin/LeaveRecordsTab";
import NotificationCenterTab from "@/components/admin/NotificationCenterTab";
import MonthlyReportTab from "@/components/admin/MonthlyReportTab";

export default function AdminPage() {
  // 現在 AdminPage 只需要管「目前在哪個分頁」即可
  const [tab, setTab] = useState("dashboard");

  // 用於顯示左上角的日期
  const todayDisplay = new Date().toLocaleDateString("zh-TW", { 
    year: "numeric", month: "long", day: "numeric", weekday: "long" 
  });

  // 進來後台時，檢查有沒有登入
  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = "/admin-login";
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/admin-login";
  };

  // 定義導覽列按鈕 (已移除圖示)
  const tabs = [
    { id: "dashboard", label: "今日總覽", hint: "營運提醒" },
    { id: "attendance", label: "點名系統", hint: "到班與作業" },
    { id: "orders", label: "今日訂餐", hint: "餐數與領餐" },
    { id: "students", label: "學生管理", hint: "資料與錢包" },
    { id: "schedule", label: "本週排餐", hint: "每日餐點" },
    { id: "menu", label: "商家管理", hint: "店家與菜單" },
    { id: "leaveRecords", label: "請假紀錄", hint: "請假與餐務" },
    { id: "notifications", label: "通知中心", hint: "LINE 狀態" },
    { id: "history", label: "歷史紀錄", hint: "回查訂單" },
    { id: "monthlyReport", label: "月結報表", hint: "帳務彙整" },
    { id: "operationLogs", label: "操作紀錄", hint: "追蹤異動" }
  ];

  const activeTab = tabs.find((t) => t.id === tab);

  return (
    <main className="app-page pb-20 font-sans">
      
      {/* --- 頂部 Header 與導覽列 --- */}
      <div className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/92 shadow-sm backdrop-blur-xl">
        
        {/* 標題區 */}
        <div className="app-container px-2 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="cute-chip">楊梅校</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{todayDisplay}</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
              方華補習班管理系統
            </h1>
            <p className="mt-1 text-sm font-bold text-slate-500">{activeTab?.label} · {activeTab?.hint}</p>
          </div>
          <button onClick={logout} className="w-full rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-600 transition hover:bg-red-500 hover:text-white md:w-auto">
            登出系統
          </button>
        </div>

        {/* 分頁按鈕區 */}
        <div className="app-container flex gap-2 overflow-x-auto px-2 pb-3 pt-1 scrollbar-hide">
          {tabs.map((t) => (
            <button 
              key={t.id} 
              onClick={() => setTab(t.id)} 
              className={`min-w-[9rem] rounded-2xl px-5 py-3 text-left transition-all ${
                tab === t.id 
                ? "bg-slate-950 text-white shadow-lg shadow-slate-200" 
                : "bg-slate-50 text-slate-500 hover:bg-slate-100"
              }`}
            >
              <span className="block text-sm font-black">{t.label}</span>
              <span className={`mt-0.5 block text-[11px] font-bold ${tab === t.id ? "text-slate-300" : "text-slate-400"}`}>{t.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* --- 內容區域：根據選擇的 Tab 載入對應的組件 --- */}
      <div className="app-container mt-6 px-2 md:mt-8">
        {tab === "dashboard" && <DashboardTab />}
        {tab === "orders" && <OrdersTab />}
        
        {tab === "attendance" && (
          <div className="app-card overflow-hidden p-2 md:p-4">
             <AttendanceTab />
          </div>
        )}
        
        {tab === "schedule" && <ScheduleTab />}
        {tab === "students" && <StudentsTab />}
        {tab === "menu" && <MenuTab />}
        {tab === "history" && <HistoryTab />}
        {tab === "monthlyReport" && <MonthlyReportTab />}
        {tab === "leaveRecords" && <LeaveRecordsTab />}
        {tab === "notifications" && <NotificationCenterTab />}
        {tab === "operationLogs" && <OperationLogsTab />}
      </div>

    </main>
  );
}
