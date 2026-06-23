"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
import AttendanceRecordsTab from "@/components/admin/AttendanceRecordsTab";
import NotificationCenterTab from "@/components/admin/NotificationCenterTab";
import NotificationTemplatesTab from "@/components/admin/NotificationTemplatesTab";
import MonthlyReportTab from "@/components/admin/MonthlyReportTab";
import AdminTasksTab from "@/components/admin/AdminTasksTab";
import CourseScheduleTab from "@/components/admin/CourseScheduleTab";
import QuestionBankTab from "@/components/admin/QuestionBankTab";
import ParentBindingTab from "@/components/admin/ParentBindingTab";
import CourseAttendanceReportTab from "@/components/admin/CourseAttendanceReportTab";
import NotificationBroadcastTab from "@/components/admin/NotificationBroadcastTab";
import TransportScheduleTab from "@/components/admin/TransportScheduleTab";
import ContactBookTab from "@/components/admin/ContactBookTab";

export default function AdminPage() {
  // 現在 AdminPage 只需要管「目前在哪個分頁」即可
  const [tab, setTab] = useState("dashboard");
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // 用於顯示左上角的日期
  const todayDisplay = new Date().toLocaleDateString("zh-TW", { 
    year: "numeric", month: "long", day: "numeric", weekday: "long" 
  });

  // 進來後台時，檢查有沒有登入
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "/admin-login";
      }
    };

    void checkAdmin();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/admin-login";
  };

  const navGroups = [
    {
      label: "每日營運",
      tone: "text-rose-600",
      items: [
        { id: "attendance", label: "點名系統", hint: "到班與作業" },
        { id: "adminTasks", label: "行政待辦", hint: "櫃台提醒" },
        { id: "transport", label: "交通車", hint: "每週接送" },
      ],
    },
    {
      label: "餐務管理",
      tone: "text-emerald-600",
      items: [
        { id: "orders", label: "今日訂餐", hint: "餐數與領餐" },
        { id: "schedule", label: "本週排餐", hint: "每日餐點" },
        { id: "menu", label: "商家管理", hint: "店家與菜單" },
      ],
    },
    {
      label: "教務成績",
      tone: "text-amber-600",
      items: [
        { id: "courseSchedule", label: "課程排課", hint: "全校課程" },
        { id: "courseAttendanceReport", label: "課程點名報表", hint: "出席穩定度" },
        { id: "scores", label: "成績管理", hint: "登錄與通知" },
        { id: "contactBook", label: "聯絡簿", hint: "課程回顧" },
        { id: "questionBank", label: "題庫系統", hint: "外部題庫" },
      ],
    },
    {
      label: "學生資料",
      tone: "text-fuchsia-600",
      items: [
        { id: "students", label: "學生管理", hint: "資料與錢包" },
        { id: "parentBinding", label: "家長綁定", hint: "LINE 連結" },
      ],
    },
    {
      label: "通知管理",
      tone: "text-cyan-600",
      items: [
        { id: "broadcast", label: "通知廣播", hint: "年級群發" },
        { id: "notifications", label: "通知中心", hint: "LINE 狀態" },
        { id: "notificationTemplates", label: "通知模板", hint: "推播文字" },
      ],
    },
    {
      label: "紀錄報表",
      tone: "text-orange-600",
      items: [
        { id: "attendanceRecords", label: "出缺席紀錄", hint: "點名匯出" },
        { id: "leaveRecords", label: "請假紀錄", hint: "請假與餐務" },
        { id: "history", label: "歷史紀錄", hint: "回查訂單" },
        { id: "monthlyReport", label: "月結報表", hint: "帳務彙整" },
      ],
    },
    {
      label: "系統管理",
      tone: "text-fuchsia-600",
      items: [
        { id: "operationLogs", label: "操作紀錄", hint: "追蹤異動" },
      ],
    },
  ];

  const homeTab = { id: "dashboard", label: "今日總覽", hint: "營運提醒" };
  const tabs = [homeTab, ...navGroups.flatMap((group) => group.items)];
  const activeTab = tabs.find((t) => t.id === tab);
  const activeGroup = navGroups.find((group) => group.items.some((item) => item.id === tab));

  const toggleGroup = (label: string) => {
    setOpenGroup((current) => current === label ? "__none" : label);
  };

  const selectTab = (nextTab: string) => {
    setTab(nextTab);
    setOpenGroup(null);
  };

  const renderNavItem = (t: { id: string; label: string; hint: string }) => (
    <button
      key={t.id}
      onClick={() => selectTab(t.id)}
      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${
        tab === t.id
          ? "bg-rose-500 text-white shadow-md shadow-rose-100"
          : "text-slate-500 hover:bg-white hover:text-rose-700"
      }`}
    >
      <span>
        <span className="block text-[15px] font-black leading-snug">{t.label}</span>
        <span className={`mt-1 block text-xs font-bold leading-snug ${tab === t.id ? "text-rose-100" : "text-slate-400"}`}>{t.hint}</span>
      </span>
      {tab === t.id && <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-black">目前</span>}
    </button>
  );

  const adminShellClass = "mx-auto w-full max-w-[1800px] px-4 sm:px-6 2xl:px-8";
  const isGroupOpen = (label: string) =>
    openGroup === label || (openGroup === null && activeGroup?.label === label);

  return (
    <main className="app-page pb-20 font-sans">
      
      {/* --- 頂部 Header 與導覽列 --- */}
      <div className="sticky top-0 z-40 border-b border-rose-100 bg-white/94 shadow-sm backdrop-blur-xl">
        
        {/* 標題區 */}
        <div className={`${adminShellClass} flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between md:py-2.5`}>
          <div className="flex items-center gap-3">
            <div className="brand-mark hidden h-14 w-14 shrink-0 rounded-2xl sm:block">
              <Image src="/images/funwa-study-corner.png" alt="方華補習班書包插畫" width={104} height={104} priority />
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="cute-chip">楊梅校</span>
                <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-500">{todayDisplay}</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-[1.55rem]">方華補習班管理系統</h1>
              <p className="mt-0.5 text-sm font-bold text-slate-500">{activeTab?.label} · {activeTab?.hint}</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            <a
              href="https://manager.line.biz/"
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl bg-green-50 px-5 py-2.5 text-center text-sm font-black text-green-700 transition hover:bg-green-500 hover:text-white"
            >
              LINE 官方
            </a>
            <button
              onClick={() => selectTab("dashboard")}
              className={`rounded-2xl px-5 py-2.5 text-sm font-black transition ${
                tab === "dashboard"
                  ? "brand-panel shadow-lg shadow-rose-100"
                  : "bg-rose-50 text-rose-700 hover:bg-rose-500 hover:text-white"
              }`}
            >
              首頁總覽
            </button>
            <button onClick={logout} className="rounded-2xl bg-red-50 px-5 py-2.5 text-sm font-black text-red-600 transition hover:bg-red-500 hover:text-white">
              登出系統
            </button>
          </div>
        </div>

        {/* 手機版分類下拉導覽 */}
        <div className={`${adminShellClass} grid gap-2 pb-4 pt-1 lg:hidden`}>
          {navGroups.map((group) => (
            <section key={group.label} className="overflow-hidden rounded-2xl border border-rose-100 bg-rose-50/70 shadow-sm">
              <button
                onClick={() => toggleGroup(group.label)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                  activeGroup?.label === group.label ? "brand-panel" : "bg-white text-slate-700 hover:bg-rose-50"
                }`}
              >
                <span>
                  <span className={`block text-[15px] font-black leading-snug ${activeGroup?.label === group.label ? "text-white" : group.tone}`}>{group.label}</span>
                  <span className={`mt-1 block text-xs font-bold leading-snug ${activeGroup?.label === group.label ? "text-slate-300" : "text-slate-400"}`}>
                    {group.items.length} 個功能
                  </span>
                </span>
                <span className={`text-lg font-black transition ${openGroup === group.label ? "rotate-90" : ""}`}>›</span>
              </button>

              {openGroup === group.label && (
                <div className="space-y-1 p-2">
                  {group.items.map(renderNavItem)}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>

      {/* --- 內容區域：根據選擇的 Tab 載入對應的組件 --- */}
      <div className={`${adminShellClass} mt-5 flex items-start gap-5 md:mt-6`}>
        <aside className="sticky top-32 hidden max-h-[calc(100vh-9rem)] w-60 shrink-0 overflow-y-auto rounded-[1.75rem] border border-slate-100 bg-white/88 p-3 shadow-sm backdrop-blur-xl xl:w-64 lg:block">
          <button
            onClick={() => selectTab("dashboard")}
            className={`mb-2 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition ${
              tab === "dashboard"
                ? "brand-panel shadow-md shadow-rose-100"
                : "bg-rose-50/60 text-slate-600 hover:bg-rose-100 hover:text-rose-700"
            }`}
          >
            <span>
              <span className="block text-[15px] font-black leading-snug">{homeTab.label}</span>
              <span className={`mt-1 block text-xs font-bold leading-snug ${tab === "dashboard" ? "text-slate-300" : "text-slate-400"}`}>{homeTab.hint}</span>
            </span>
            {tab === "dashboard" && <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-black">目前</span>}
          </button>

          <div className="space-y-3">
            {navGroups.map((group) => (
              <section key={group.label} className="overflow-hidden rounded-2xl bg-rose-50/55">
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                    activeGroup?.label === group.label ? "brand-panel" : "hover:bg-white"
                  }`}
                >
                  <span>
                    <span className={`block text-sm font-black leading-snug ${activeGroup?.label === group.label ? "text-white" : group.tone}`}>{group.label}</span>
                    <span className={`mt-1 block text-xs font-bold leading-snug ${activeGroup?.label === group.label ? "text-slate-300" : "text-slate-400"}`}>{group.items.length} 個功能</span>
                  </span>
                  <span className={`text-lg font-black transition ${isGroupOpen(group.label) ? "rotate-90" : ""}`}>›</span>
                </button>

                {isGroupOpen(group.label) && (
                  <div className="space-y-1 p-2">
                    {group.items.map(renderNavItem)}
                  </div>
                )}
              </section>
            ))}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {tab === "dashboard" && <DashboardTab />}
          {tab === "orders" && <OrdersTab />}
          
          {tab === "attendance" && (
            <div className="app-card overflow-hidden p-2 md:p-4">
               <AttendanceTab mode="attendance" />
            </div>
          )}
          {tab === "scores" && (
            <div className="app-card overflow-hidden p-2 md:p-4">
               <AttendanceTab mode="scores" />
            </div>
          )}
          
          {tab === "schedule" && <ScheduleTab />}
          {tab === "courseSchedule" && <CourseScheduleTab />}
          {tab === "courseAttendanceReport" && <CourseAttendanceReportTab />}
          {tab === "questionBank" && <QuestionBankTab />}
          {tab === "contactBook" && <ContactBookTab />}
          {tab === "students" && <StudentsTab />}
          {tab === "parentBinding" && <ParentBindingTab />}
          {tab === "menu" && <MenuTab />}
          {tab === "history" && <HistoryTab />}
          {tab === "monthlyReport" && <MonthlyReportTab />}
          {tab === "adminTasks" && <AdminTasksTab />}
          {tab === "transport" && <TransportScheduleTab />}
          {tab === "attendanceRecords" && <AttendanceRecordsTab />}
          {tab === "leaveRecords" && <LeaveRecordsTab />}
          {tab === "broadcast" && <NotificationBroadcastTab />}
          {tab === "notifications" && <NotificationCenterTab />}
          {tab === "notificationTemplates" && <NotificationTemplatesTab />}
          {tab === "operationLogs" && <OperationLogsTab />}
        </div>
      </div>

    </main>
  );
}
