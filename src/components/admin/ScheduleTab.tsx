"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// --- 型別定義 ---
type Vendor = {
  id: string;
  name: string;
};

type MenuItem = {
  id: string;
  vendor_id: string;
  name: string;
  price: number;
};

export default function ScheduleTab() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [weeklySchedule, setWeeklySchedule] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  const daysConfig = [
    { key: "mon", label: "星期一" },
    { key: "tue", label: "星期二" },
    { key: "wed", label: "星期三" },
    { key: "thu", label: "星期四" },
    { key: "fri", label: "星期五" },
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // 1. 同時抓取商家、菜單與目前的排餐設定，節省載入時間
    const [vendorsRes, menusRes, scheduleRes] = await Promise.all([
      supabase.from("vendors").select("id, name").order("created_at"),
      supabase.from("menus").select("id, vendor_id, name, price"),
      supabase.from("weekly_schedule").select("*")
    ]);

    if (vendorsRes.data) setVendors(vendorsRes.data);
    if (menusRes.data) setMenus(menusRes.data);
    
    // 2. 將資料庫的排餐轉為前端好綁定的格式
    if (scheduleRes.data) {
      const formatted: any = {};
      scheduleRes.data.forEach((item) => { 
        formatted[item.weekday] = { vendor_id: item.vendor_id, menu_id: item.menu_id }; 
      });
      setWeeklySchedule(formatted);
    }
  };

  const handleSaveSchedule = async () => {
    setIsSaving(true);
    // 將前端格式轉回資料庫陣列格式
    const rows = Object.entries(weeklySchedule).map(([weekday, value]: any) => ({ 
      weekday, 
      vendor_id: value.vendor_id || null, 
      menu_id: value.menu_id || null 
    }));

    const { error } = await supabase.from("weekly_schedule").upsert(rows, { onConflict: "weekday" });
    
    if (error) {
      alert("儲存失敗：" + error.message);
    } else {
      alert("本週排餐已成功更新！");
    }
    setIsSaving(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 標題區塊 */}
      <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200">
        <h2 className="text-3xl font-black text-slate-900">本週排餐設定</h2>
        <p className="text-slate-500 mt-2 font-bold">安排本週每日供餐的商家與預設餐點</p>
      </div>

      {/* 設定區塊 */}
      <div className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-sm border border-slate-200 space-y-4">
        {daysConfig.map(({ key, label }) => (
          <div key={key} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center border-b border-slate-100 pb-6 pt-2 hover:bg-slate-50/50 transition px-4 rounded-3xl">
            
            {/* 星期標籤 */}
            <div className="font-black text-xl text-blue-600 flex items-center gap-3">
              <span className="w-2 h-8 bg-blue-600 rounded-full inline-block"></span>
              {label}
            </div>

            {/* 選擇商家 */}
            <select 
              value={weeklySchedule[key]?.vendor_id || ""} 
              onChange={(e) => setWeeklySchedule((prev: any) => ({ ...prev, [key]: { vendor_id: e.target.value, menu_id: "" } }))} 
              className="md:col-span-1 bg-slate-50 border border-slate-100 px-6 py-4 rounded-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            >
              <option value="">-- 選擇商家 --</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>

            {/* 選擇餐點 */}
            <select 
              value={weeklySchedule[key]?.menu_id || ""} 
              onChange={(e) => setWeeklySchedule((prev: any) => ({ ...prev, [key]: { ...prev[key], menu_id: e.target.value } }))} 
              className="md:col-span-2 bg-slate-50 border border-slate-100 px-6 py-4 rounded-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition disabled:opacity-50"
              disabled={!weeklySchedule[key]?.vendor_id}
            >
              <option value="">-- 選擇預設餐點 --</option>
              {menus
                .filter((menu) => menu.vendor_id === weeklySchedule[key]?.vendor_id)
                .map((menu) => (
                  <option key={menu.id} value={menu.id}>{menu.name} (${menu.price})</option>
                ))
              }
            </select>
          </div>
        ))}

        {/* 儲存按鈕 */}
        <button 
          onClick={handleSaveSchedule} 
          disabled={isSaving}
          className="w-full mt-8 bg-slate-900 hover:bg-slate-800 text-white py-5 rounded-2xl font-black text-lg transition shadow-xl disabled:bg-slate-400 disabled:cursor-not-allowed flex justify-center items-center gap-2"
        >
          {isSaving ? "儲存中..." : "💾 儲存本週排餐"}
        </button>
      </div>
    </div>
  );
}