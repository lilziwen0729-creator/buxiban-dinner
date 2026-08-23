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
import FixedMealSettingsTab from "@/components/admin/FixedMealSettingsTab";
import GradeManagementTab from "@/components/admin/GradeManagementTab";

const ADMIN_TAB_IDS = new Set([
  "dashboard",
  "attendance",
  "orders",
  "adminTasks",
  "transport",
  "students",
  "parentBinding",
  "courseSchedule",
  "scores",
  "contactBook",
  "questionBank",
  "fixedMealSettings",
  "schedule",
  "menu",
  "broadcast",
  "notifications",
  "notificationTemplates",
  "attendanceRecords",
  "courseAttendanceReport",
  "leaveRecords",
  "history",
  "monthlyReport",
  "gradeManagement",
  "operationLogs",
]);

const ADMIN_TAB_STORAGE_KEY = "funwa-admin-active-tab";
const ADMIN_SIDEBAR_STORAGE_KEY = "funwa-admin-sidebar-collapsed";

export default function AdminPage() {
  // 現在 AdminPage 只需要管「目前在哪個分頁」即可
  const [tab, setTab] = useState("dashboard");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [initializing, setInitializing] = useState(true);

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
        return;
      }

      const urlTab = new URLSearchParams(window.location.search).get("tab");
      const savedTab = window.localStorage.getItem(ADMIN_TAB_STORAGE_KEY);
      const initialTab = urlTab && ADMIN_TAB_IDS.has(urlTab)
        ? urlTab
        : savedTab && ADMIN_TAB_IDS.has(savedTab)
          ? savedTab
          : "dashboard";

      if (!urlTab && initialTab !== "dashboard") {
        const initialUrl = new URL(window.location.href);
        initialUrl.searchParams.set("tab", initialTab);
        window.history.replaceState({ tab: initialTab }, "", `${initialUrl.pathname}${initialUrl.search}${initialUrl.hash}`);
      }

      setTab(initialTab);
      setSidebarCollapsed(window.localStorage.getItem(ADMIN_SIDEBAR_STORAGE_KEY) === "true");
      setInitializing(false);
    };

    void checkAdmin();
  }, []);

  useEffect(() => {
    const handleHistoryNavigation = () => {
      const urlTab = new URLSearchParams(window.location.search).get("tab");
      const nextTab = urlTab && ADMIN_TAB_IDS.has(urlTab) ? urlTab : "dashboard";
      setTab(nextTab);
      window.localStorage.setItem(ADMIN_TAB_STORAGE_KEY, nextTab);
      setOpenGroup("__none");
    };

    window.addEventListener("popstate", handleHistoryNavigation);
    return () => window.removeEventListener("popstate", handleHistoryNavigation);
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
        { id: "orders", label: "今日訂餐", hint: "餐數與領餐" },
        { id: "adminTasks", label: "行政待辦", hint: "櫃台提醒" },
        { id: "transport", label: "交通車", hint: "日期接送" },
      ],
    },
    {
      label: "學生家長",
      tone: "text-fuchsia-600",
      items: [
        { id: "students", label: "學生管理", hint: "資料與錢包" },
        { id: "parentBinding", label: "家長綁定", hint: "LINE 連結" },
      ],
    },
    {
      label: "教務成績",
      tone: "text-amber-600",
      items: [
        { id: "courseSchedule", label: "課程排課", hint: "全校課程" },
        { id: "scores", label: "成績管理", hint: "登錄與通知" },
        { id: "contactBook", label: "聯絡簿", hint: "課程回顧" },
        { id: "questionBank", label: "題庫系統", hint: "外部題庫" },
      ],
    },
    {
      label: "餐務管理",
      tone: "text-emerald-600",
      items: [
        { id: "fixedMealSettings", label: "固定訂餐", hint: "學生每週設定" },
        { id: "schedule", label: "本週排餐", hint: "每日餐點" },
        { id: "menu", label: "商家管理", hint: "店家與菜單" },
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
        { id: "courseAttendanceReport", label: "課程點名報表", hint: "出席穩定度" },
        { id: "leaveRecords", label: "請假紀錄", hint: "請假與餐務" },
        { id: "history", label: "歷史紀錄", hint: "回查訂單" },
        { id: "monthlyReport", label: "月結報表", hint: "帳務彙整" },
      ],
    },
    {
      label: "系統管理",
      tone: "text-fuchsia-600",
      items: [
        { id: "gradeManagement", label: "年級調整", hint: "手動升降級" },
        { id: "operationLogs", label: "操作紀錄", hint: "追蹤異動" },
      ],
    },
  ];

  const homeTab = { id: "dashboard", label: "今日總覽", hint: "營運提醒" };
  const tabs = [homeTab, ...navGroups.flatMap((group) => group.items)];
  const activeTab = tabs.find((t) => t.id === tab);
  const activeGroup = navGroups.find((group) => group.items.some((item) => item.id === tab));

  useEffect(() => {
    document.title = `${activeTab?.label ?? "管理系統"}｜方華補習班`;
  }, [activeTab?.label]);

  const toggleGroup = (label: string) => {
    setOpenGroup((current) => current === label ? "__none" : label);
  };

  const selectTab = (nextTab: string) => {
    if (!ADMIN_TAB_IDS.has(nextTab)) return;

    const isSameTab = nextTab === tab;
    setTab(nextTab);
    setOpenGroup("__none");
    window.localStorage.setItem(ADMIN_TAB_STORAGE_KEY, nextTab);

    const url = new URL(window.location.href);
    if (nextTab === "dashboard") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", nextTab);
    }
    window.history[isSameTab ? "replaceState" : "pushState"]({ tab: nextTab }, "", `${url.pathname}${url.search}${url.hash}`);

    window.requestAnimationFrame(() => {
      document.getElementById("admin-content")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const nextValue = !current;
      window.localStorage.setItem(ADMIN_SIDEBAR_STORAGE_KEY, String(nextValue));
      return nextValue;
    });
  };

  const renderNavItem = (t: { id: string; label: string; hint: string }) => (
    <button
      key={t.id}
      type="button"
      onClick={() => selectTab(t.id)}
      className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition-all ${
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

  const renderActiveTab = () => {
    switch (tab) {
      case "dashboard": return <DashboardTab />;
      case "orders": return <OrdersTab />;
      case "fixedMealSettings": return <FixedMealSettingsTab />;
      case "attendance": return <div className="app-card overflow-hidden p-2 md:p-4"><AttendanceTab mode="attendance" /></div>;
      case "scores": return <div className="app-card overflow-hidden p-2 md:p-4"><AttendanceTab mode="scores" /></div>;
      case "schedule": return <ScheduleTab />;
      case "courseSchedule": return <CourseScheduleTab />;
      case "courseAttendanceReport": return <CourseAttendanceReportTab />;
      case "questionBank": return <QuestionBankTab />;
      case "contactBook": return <ContactBookTab />;
      case "students": return <StudentsTab />;
      case "parentBinding": return <ParentBindingTab />;
      case "menu": return <MenuTab />;
      case "history": return <HistoryTab />;
      case "monthlyReport": return <MonthlyReportTab />;
      case "adminTasks": return <AdminTasksTab />;
      case "transport": return <TransportScheduleTab />;
      case "attendanceRecords": return <AttendanceRecordsTab />;
      case "leaveRecords": return <LeaveRecordsTab />;
      case "broadcast": return <NotificationBroadcastTab />;
      case "notifications": return <NotificationCenterTab />;
      case "notificationTemplates": return <NotificationTemplatesTab />;
      case "gradeManagement": return <GradeManagementTab />;
      case "operationLogs": return <OperationLogsTab />;
      default: return <DashboardTab />;
    }
  };

  return (
    <main className="app-page pb-20 font-sans">
      
      {/* --- 頂部 Header 與導覽列 --- */}
      <div className="sticky top-0 z-40 border-b border-rose-100 bg-white/94 shadow-sm backdrop-blur-xl">
        
        {/* 標題區 */}
        <div className={`${adminShellClass} flex flex-col gap-2 py-2 md:flex-row md:items-center md:justify-between`}>
          <div className="flex items-center gap-3">
            <div className="brand-mark h-11 w-11 shrink-0 rounded-xl sm:h-13 sm:w-13 sm:rounded-2xl">
              <Image src="/images/funwa-study-corner.png" alt="方華補習班書包插畫" width={104} height={104} priority />
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="cute-chip">楊梅校</span>
                <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-500">{todayDisplay}</span>
              </div>
              <h1 className="text-lg font-black tracking-tight text-slate-950 sm:text-2xl md:text-[1.55rem]">方華補習班管理系統</h1>
              <p className="mt-0.5 text-xs font-bold text-slate-500 sm:text-sm">{activeTab?.label} · {activeTab?.hint}</p>
            </div>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 md:flex md:w-auto">
            <a
              href="https://manager.line.biz/"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-green-50 px-2 py-2 text-center text-xs font-black text-green-700 transition hover:bg-green-500 hover:text-white sm:px-4 sm:text-sm"
            >
              <span className="sm:hidden">LINE</span><span className="hidden sm:inline">LINE 官方</span>
            </a>
            <button
              type="button"
              onClick={() => selectTab("dashboard")}
              className={`rounded-xl px-2 py-2 text-xs font-black transition sm:px-4 sm:text-sm ${
                tab === "dashboard"
                  ? "brand-panel shadow-lg shadow-rose-100"
                  : "bg-rose-50 text-rose-700 hover:bg-rose-500 hover:text-white"
              }`}
            >
              <span className="sm:hidden">總覽</span><span className="hidden sm:inline">首頁總覽</span>
            </button>
            <button type="button" onClick={logout} className="rounded-xl bg-red-50 px-2 py-2 text-xs font-black text-red-600 transition hover:bg-red-500 hover:text-white sm:px-4 sm:text-sm">
              <span className="sm:hidden">登出</span><span className="hidden sm:inline">登出系統</span>
            </button>
          </div>
        </div>

        {/* 手機版使用單列選單，避免導覽佔滿整個畫面 */}
        <div className={`${adminShellClass} flex items-center gap-2 pb-2 lg:hidden`}>
          <span className="cute-chip shrink-0">{activeGroup?.label ?? "首頁"}</span>
          <label htmlFor="mobile-admin-tab" className="sr-only">選擇管理功能</label>
          <select
            id="mobile-admin-tab"
            value={tab}
            onChange={(event) => selectTab(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-rose-100 bg-white px-3 py-2.5 text-sm font-black text-slate-700 shadow-sm outline-none focus:border-rose-300"
          >
            <option value={homeTab.id}>{homeTab.label}｜{homeTab.hint}</option>
            {navGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}｜{item.hint}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {/* --- 內容區域：根據選擇的 Tab 載入對應的組件 --- */}
      <div className={`${adminShellClass} mt-4 flex items-start gap-4 md:mt-5 xl:gap-5`}>
        <aside className={`sticky top-31 hidden max-h-[calc(100vh-8.5rem)] shrink-0 overflow-y-auto border border-rose-100 bg-white/90 shadow-sm backdrop-blur-xl transition-[width,padding] lg:block ${sidebarCollapsed ? "w-14 rounded-2xl p-2" : "w-56 rounded-2xl p-3 xl:w-60"}`}>
          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={toggleSidebar}
              className="flex h-11 w-full items-center justify-center rounded-xl bg-rose-50 text-2xl font-black text-rose-700 hover:bg-rose-100"
              aria-label="展開功能選單"
              title="展開功能選單"
            >
              ›
            </button>
          ) : (
            <>
          <div className="mb-2 flex items-center justify-between px-2 py-1">
            <span className="text-xs font-black text-slate-400">功能選單</span>
            <button
              type="button"
              onClick={toggleSidebar}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-xl font-black text-slate-400 hover:bg-rose-50 hover:text-rose-700"
              aria-label="收合功能選單"
              title="收合功能選單"
            >
              ‹
            </button>
          </div>
          <button
            type="button"
            onClick={() => selectTab("dashboard")}
            className={`mb-2 flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition ${
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
              <section key={group.label} className="overflow-hidden rounded-xl bg-rose-50/55">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                    activeGroup?.label === group.label ? "brand-panel" : "hover:bg-white"
                  }`}
                  aria-expanded={isGroupOpen(group.label)}
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
            </>
          )}
        </aside>

        <div id="admin-content" className="min-w-0 flex-1 scroll-mt-32">
          {initializing
            ? <div className="app-card py-20 text-center font-bold text-slate-400">正在確認管理員身分...</div>
            : renderActiveTab()}
        </div>
      </div>

    </main>
  );
}
