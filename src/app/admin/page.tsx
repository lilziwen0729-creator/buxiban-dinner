"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// --- 引入我們拆分出來的 6 個獨立核心組件 ---
import OrdersTab from "@/components/admin/OrdersTab";
import AttendanceTab from "@/components/admin/AttendanceTab";
import ScheduleTab from "@/components/admin/ScheduleTab";
import StudentsTab from "@/components/admin/StudentsTab";
import MenuTab from "@/components/admin/MenuTab";
import HistoryTab from "@/components/admin/HistoryTab";

export default function AdminPage() {
  // 現在 AdminPage 只需要管「目前在哪個分頁」即可
  const [tab, setTab] = useState("orders");

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
    { id: "orders", label: "今日訂餐" },
    { id: "attendance", label: "點名系統" },
    { id: "schedule", label: "本週排餐" },
    { id: "students", label: "學生管理" },
    { id: "menu", label: "商家管理" },
    { id: "history", label: "歷史紀錄" }
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-20">
      
      {/* --- 頂部 Header 與導覽列 --- */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        
        {/* 標題區 */}
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">
              方華補習班 <span className="text-blue-600">楊梅校</span>
            </h1>
            <p className="text-slate-500 font-bold text-sm mt-1">{todayDisplay}</p>
          </div>
          <button onClick={logout} className="bg-red-50 text-red-600 px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-red-500 hover:text-white transition">
            登出系統
          </button>
        </div>

        {/* 分頁按鈕區 */}
        <div className="max-w-7xl mx-auto px-6 flex gap-2 overflow-x-auto pb-3 scrollbar-hide pt-2">
          {tabs.map((t) => (
            <button 
              key={t.id} 
              onClick={() => setTab(t.id)} 
              className={`px-8 py-3 rounded-xl font-black whitespace-nowrap transition-all ${
                tab === t.id 
                ? "bg-slate-900 text-white shadow-lg" 
                : "bg-white text-slate-500 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* --- 內容區域：根據選擇的 Tab 載入對應的組件 --- */}
      <div className="max-w-7xl mx-auto px-6 mt-8">
        {tab === "orders" && <OrdersTab />}
        
        {tab === "attendance" && (
          <div className="bg-white rounded-[2.5rem] p-4 shadow-sm border border-slate-200">
             <AttendanceTab />
          </div>
        )}
        
        {tab === "schedule" && <ScheduleTab />}
        {tab === "students" && <StudentsTab />}
        {tab === "menu" && <MenuTab />}
        {tab === "history" && <HistoryTab />}
      </div>

    </main>
  );
}