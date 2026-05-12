"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

// --- 型別定義 ---
type HistoryOrder = {
  id: string;
  student_id: string;
  name: string;
  grade: string;
  received: boolean;
};

export default function HistoryTab() {
  const [historyOrders, setHistoryOrders] = useState<HistoryOrder[]>([]);
  const [historyDate, setHistoryDate] = useState(getToday());
  const [isLoading, setIsLoading] = useState(false);

  const grades = ["小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];

  // --- 當日期改變時，重新抓取歷史資料 ---
  useEffect(() => {
    fetchHistory();
  }, [historyDate]);

  const fetchHistory = async () => {
    setIsLoading(true);
    
    // 1. 同時抓取學生與選定日期的訂單
    const [studentRes, orderRes] = await Promise.all([
      supabase.from("students").select("id, name, grade"),
      supabase.from("orders").select("*").eq("order_date", historyDate)
    ]);

    if (orderRes.data && studentRes.data) {
      // 2. 組合資料 (把學生姓名和年級貼到訂單上)
      const merged = orderRes.data.map((order) => {
        const student = studentRes.data.find((s) => s.id === order.student_id);
        return {
          id: order.id,
          student_id: order.student_id,
          name: student?.name || "未知",
          grade: student?.grade || "未知",
          received: order.received || false,
        };
      });
      setHistoryOrders(merged);
    }
    
    setIsLoading(false);
  };

  // --- UI 渲染區塊 ---
  // 1. 統計方塊 (過濾掉高一)
  const renderGradeStats = () => (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
      {grades.filter(g => g !== "高一").map(g => {
        const gradeOrders = historyOrders.filter(o => o.grade === g);
        const count = gradeOrders.length;
        const received = gradeOrders.filter(o => o.received).length;
        
        if (count === 0) return null; // 該年級若無訂單則不顯示方塊
        
        return (
          <div key={g} className="bg-white/5 p-6 rounded-3xl border border-white/10 text-center shadow-inner">
            <p className="text-xs text-blue-300 font-black mb-2 uppercase tracking-widest">{g}</p>
            <p className="text-3xl font-black text-white">{received} <span className="text-sm font-normal opacity-40">/ {count}</span></p>
          </div>
        );
      })}
    </div>
  );

  // 2. 詳細名單列表
  const renderOrdersByGrade = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
      {grades.map((grade) => {
        const gradeOrders = historyOrders.filter((o) => o.grade === grade).sort((a, b) => a.name.localeCompare(b.name));
        if (gradeOrders.length === 0) return null;
        
        return (
          <div key={grade} className="bg-white/5 rounded-3xl p-6 border border-white/10">
            <h3 className="text-xl font-black text-blue-400 mb-4 border-b border-white/10 pb-2">{grade} <span className="text-sm text-slate-400">({gradeOrders.length} 人)</span></h3>
            <div className="space-y-2">
              {gradeOrders.map((order) => (
                <div key={order.id} className="flex justify-between items-center bg-black/20 p-4 rounded-xl">
                  <span className="font-bold text-slate-200">{order.name}</span>
                  <span className={`text-xs font-black px-3 py-1 rounded-lg ${order.received ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                    {order.received ? "✅ 已領取" : "⚠️ 未領取"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="bg-slate-900 text-white p-10 md:p-12 rounded-[3.5rem] shadow-2xl relative overflow-hidden border border-slate-800">
        
        {/* 頂部控制區 */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6 bg-white/5 p-6 rounded-[2rem] border border-white/10 backdrop-blur-md">
          <div>
            <h2 className="text-4xl font-black italic text-white">History.</h2>
            <p className="text-blue-300 font-bold mt-1 text-sm tracking-wide">查閱過往日期的訂單與領餐狀態</p>
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest hidden md:block">選擇日期</label>
            <input 
              type="date" 
              value={historyDate} 
              onChange={(e) => setHistoryDate(e.target.value)} 
              className="flex-1 bg-white text-slate-900 px-6 py-4 rounded-2xl font-black text-lg outline-none focus:ring-4 focus:ring-blue-500/50 transition shadow-inner" 
            />
          </div>
        </div>
        
        {/* 載入中狀態 */}
        {isLoading ? (
          <div className="text-center py-20">
            <p className="text-slate-400 font-bold animate-pulse">資料載入中...</p>
          </div>
        ) : (
          <>
            {/* 統計與名單區塊 */}
            {historyOrders.length > 0 ? (
              <>
                <p className="text-slate-400 font-bold mb-4 ml-2">當日總訂餐：<span className="text-white text-xl">{historyOrders.length}</span> 份</p>
                {renderGradeStats()}
                {renderOrdersByGrade()}
              </>
            ) : (
              <div className="text-center py-20 border-2 border-dashed border-white/10 rounded-3xl">
                <p className="text-slate-500 font-bold italic text-lg">該日期查無任何訂餐資料</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}