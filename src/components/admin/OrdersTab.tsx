"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import { error } from "console";

// --- 型別定義 (只保留這裡需要的) ---
type Order = {
  id: string;
  student_id: string;
  name: string;
  grade: string;
  received?: boolean;
};

type Vendor = {
  id: string;
  name: string;
  phone?: string;
};

export default function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [todayVendor, setTodayVendor] = useState<Vendor | null>(null);
  const [showUnreceived, setShowUnreceived] = useState(false);

  const grades = ["小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];

  // --- 生命週期：載入與自動刷新 ---
  useEffect(() => {
    fetchData();
    fetchTodayVendor();

    // 每 30 秒自動刷新訂單
    const interval = setInterval(fetchData, 30000);
    
    // 視窗重新聚焦時自動刷新
    const handleFocus = () => fetchData();
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // --- 資料抓取邏輯 ---
  const fetchData = async () => {
    const today = getToday();
    // 同時抓取學生與今日訂單
    const [studentRes, orderRes] = await Promise.all([
      supabase.from("students").select("id, name, grade"),
      supabase.from("orders").select("*").eq("order_date", today)
    ]);

    if (orderRes.data && studentRes.data) {
      const merged = orderRes.data.map((order) => {
        const student = studentRes.data.find((s) => s.id === order.student_id);
        return {
          id: order.id,
          student_id: order.student_id,
          name: student?.name || "未知",
          grade: student?.grade || "",
          received: order.received || false,
        };
      });
      setOrders(merged);
    }
  };

  const fetchTodayVendor = async () => {
    const days = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    const todayKey = days[new Date().getDay()];

    console.log("今日關鍵字:", todayKey);

    if (todayKey === '星期日' || todayKey === '星期六') { setTodayVendor(null); return; }
    
    const { data: schedule } = await supabase.from("weekly_schedule").select(`vendor_id, vendors (*)`).eq("weekday", todayKey).maybeSingle();

    console.log("從資料庫抓到的排餐資料:", schedule, "錯誤訊息:", error);
    
    setTodayVendor((schedule as any)?.vendors || null);
  };

  const cancelOrder = async (studentId: string, name: string) => {
    if (!confirm(`確定取消 ${name} 今日訂餐？`)) return;
    await supabase.from("orders").delete().eq("student_id", studentId).eq("order_date", getToday());
    fetchData(); // 取消後只刷新這個組件的資料
  };

  // --- UI 渲染邏輯 ---
  const renderGradeStats = (orderList: Order[]) => (
    <div className="grid grid-cols-3 md:grid-cols-9 gap-3 mt-6">
      {grades.filter(g => g !== "高一").map((grade) => {
        const gradeOrders = orderList.filter((o) => o.grade === grade);
        const total = gradeOrders.length;
        const received = gradeOrders.filter((o) => o.received).length;
        return (
          <div key={grade} className="bg-white/10 rounded-2xl p-4 text-center border border-white/20 shadow-sm backdrop-blur-sm">
            <p className="text-sm text-blue-200 font-bold tracking-wider">{grade}</p>
            <p className="text-2xl font-black mt-1">{received} <span className="text-sm font-normal">/ {total}</span></p>
            <p className="text-xs text-yellow-300 mt-1 font-bold">未領 {total - received}</p>
          </div>
        );
      })}
    </div>
  );

  const renderOrdersByGrade = (orderList: Order[]) =>
    grades.map((grade) => {
      const gradeOrders = orderList.filter((o) => o.grade === grade).sort((a, b) => a.name.localeCompare(b.name));
      if (gradeOrders.length === 0) return null;
      return (
        <div key={grade} className="mb-6">
          <h3 className="text-xl font-bold mb-3 text-blue-300 border-b border-blue-800 pb-2 inline-block">{grade}（{gradeOrders.length}）</h3>
          <div className="space-y-2">
            {gradeOrders.map((order) => (
              <div key={order.id} className="flex justify-between items-center bg-white/5 text-white border border-white/10 p-4 rounded-xl hover:bg-white/10 transition">
                <span className="font-bold text-lg">{order.name}</span>
                <button onClick={() => cancelOrder(order.student_id, order.name)} className="bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-lg font-bold shadow-md transition">取消</button>
              </div>
            ))}
          </div>
        </div>
      );
    });

  return (
    <div className="bg-[#0f172a] text-white rounded-[2.5rem] p-8 md:p-12 shadow-2xl relative overflow-hidden animate-in fade-in duration-500">
      <h2 className="text-4xl font-black mb-2">今日訂餐</h2>
      <p className="text-slate-400 font-bold text-lg mb-8">總計 {orders.length} 份餐點</p>
      
      <div className="bg-blue-600/20 border border-blue-500/30 rounded-2xl p-6 flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <p className="text-blue-300 font-black text-sm uppercase tracking-widest mb-1">今日供餐資訊</p>
          <p className="text-3xl font-black text-white">{todayVendor?.name || "未設定排餐"}</p>
          <p className="text-blue-200 mt-1">{todayVendor?.phone || ""}</p>
        </div>
      </div>

      {renderGradeStats(orders)}

      {/* 未領名單黃色區塊 */}
      {orders.filter((o) => !o.received).length > 0 && (
        <div className="mt-8 bg-yellow-400 text-slate-900 rounded-2xl overflow-hidden shadow-lg border border-yellow-500">
          <button onClick={() => setShowUnreceived(!showUnreceived)} className="w-full px-6 py-5 flex justify-between items-center font-black text-xl hover:bg-yellow-300 transition">
            <span>⚠️ 尚未領餐名單（{orders.filter((o) => !o.received).length} 人）</span>
            <span>{showUnreceived ? "▲ 收起" : "▼ 展開"}</span>
          </button>
          {showUnreceived && (
            <div className="px-6 pb-6 pt-2">
              <div className="flex flex-wrap gap-3">
                {orders.filter((o) => !o.received).sort((a, b) => a.grade.localeCompare(b.grade)).map((order) => (
                  <div key={order.id} className="bg-white/90 px-4 py-2 rounded-xl font-bold shadow-sm">{order.grade}｜{order.name}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="mt-10">{renderOrdersByGrade(orders)}</div>
    </div>
  );
}