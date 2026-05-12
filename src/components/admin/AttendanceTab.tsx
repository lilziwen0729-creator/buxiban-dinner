"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

export default function AttendanceTab({ teacherGrade = "全部" }) {
  const [students, setStudents] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedGrade, setSelectedGrade] = useState("全部");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const grades = ["全部", "大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一", "無"];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const today = getToday();
    
    const [stRes, odRes] = await Promise.all([
      supabase.from("students").select("*").order("name"),
      supabase.from("orders").select("*").eq("order_date", today)
    ]);

    setStudents(stRes.data || []);
    setOrders(odRes.data || []);
    setLoading(false);
  };

  // 💡 採用「樂觀更新 (Optimistic UI)」：點擊瞬間先改畫面，背景再慢慢存檔
  const toggleAttendance = async (student: any, currentStatus: boolean) => {
    const today = getToday();
    const newStatus = !currentStatus; // 反轉狀態：本來未簽到變已簽到，反之亦然

    // --- 1. 畫面瞬間更新 (不等資料庫) ---
    setOrders((prevOrders) => {
      const orderExists = prevOrders.find((o) => o.student_id === student.id);
      if (orderExists) {
        // 如果原本陣列裡有訂單，把它的狀態改掉
        return prevOrders.map((o) => o.student_id === student.id ? { ...o, received: newStatus } : o);
      } else {
        // 如果原本陣列裡沒訂單，塞一個假的進去讓畫面變色
        return [...prevOrders, { student_id: student.id, received: newStatus, order_date: today }];
      }
    });

    // --- 2. 背景默默寫入資料庫 (這裡不呼叫 fetchData，不卡畫面) ---
    try {
      if (currentStatus) {
        // 本來是 true，現在要取消
        await supabase.from("orders").update({ received: false }).eq("student_id", student.id).eq("order_date", today);
      } else {
        // 本來是 false，現在要簽到
        const { data: existingOrder } = await supabase.from("orders").select("id").eq("student_id", student.id).eq("order_date", today).maybeSingle();
        
        if (existingOrder) {
          await supabase.from("orders").update({ received: true }).eq("id", existingOrder.id);
        } else {
          await supabase.from("orders").insert([{
            student_id: student.id,
            name: student.name,
            grade: student.grade || "無",
            order_date: today,
            received: true
          }]);
        }
      }
    } catch (error) {
      console.error("更新資料庫失敗", error);
      // 如果真的存檔失敗，才重新抓取真實資料校正畫面
      fetchData(); 
    }
  };

  const filteredStudents = students.filter(s => {
    const matchGrade = selectedGrade === "全部" ? true : (s.grade === selectedGrade || (!s.grade && selectedGrade === "無"));
    const matchSearch = s.name.includes(search);
    return matchGrade && matchSearch;
  });

  const getStatus = (studentId: string) => {
    const order = orders.find(o => o.student_id === studentId);
    return order?.received || false;
  };

  const gradeStats = () => {
    const total = filteredStudents.length;
    const attended = filteredStudents.filter(s => getStatus(s.id)).length;
    return { total, attended };
  };

  return (
    <div className="bg-white min-h-[600px] flex flex-col animate-in fade-in duration-500 rounded-[2.5rem]">
      
      {/* 1. 年級切換與統計 */}
      <div className="p-8 border-b border-slate-100 bg-slate-50/50 rounded-t-[2.5rem]">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex flex-wrap gap-2">
            {grades.map(g => (
              <button
                key={g}
                onClick={() => setSelectedGrade(g)}
                className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
                  selectedGrade === g 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-200" 
                  : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-100"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto relative">
            <input 
              type="text" 
              placeholder="快速找人..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white border-2 border-slate-100 rounded-xl pl-10 pr-4 py-3 text-sm font-bold w-full md:w-56 outline-none focus:border-blue-500 shadow-sm"
            />
            <span className="absolute left-3 top-3.5 opacity-30">🔍</span>
          </div>
        </div>

        {/* 進度條統計 */}
        <div className="mt-8 flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 transition-all duration-500" 
              style={{ width: gradeStats().total === 0 ? "0%" : `${(gradeStats().attended / gradeStats().total) * 100}%` }}
            ></div>
          </div>
          <span className="text-sm font-black text-slate-600 w-32 text-right">
            簽到：<span className="text-blue-600 text-lg">{gradeStats().attended}</span> / {gradeStats().total} 人
          </span>
        </div>
      </div>

      {/* 2. 學生名單分區 */}
      <div className="flex-1 p-8 overflow-y-auto bg-slate-50/30">
        {loading ? (
          <div className="text-center py-20 text-slate-400 font-bold animate-pulse text-lg">載入名單中...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {filteredStudents.map(s => {
              const isAttended = getStatus(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleAttendance(s, isAttended)}
                  className={`relative p-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-3 group active:scale-95 ${
                    isAttended 
                    ? "bg-slate-100 border-transparent opacity-70 shadow-inner" 
                    : "bg-white border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md"
                  }`}
                >
                  {/* 年級小標籤 (只有在看"全部"時才顯示) */}
                  {selectedGrade === "全部" && (
                    <span className="absolute top-2 left-2 text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {s.grade || "無"}
                    </span>
                  )}

                  <span className={`text-xl font-black ${isAttended ? "text-slate-500" : "text-slate-800"}`}>
                    {s.name}
                  </span>
                  
                  {isAttended ? (
                    <span className="bg-green-500 text-white px-3 py-1 rounded-full font-bold text-xs flex items-center gap-1 shadow-sm">
                      ✓ 已簽到
                    </span>
                  ) : (
                    <span className="text-slate-400 font-bold text-xs group-hover:text-blue-500 transition">
                      點擊簽到
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {!loading && filteredStudents.length === 0 && (
          <div className="text-center py-32 border-2 border-dashed border-slate-200 rounded-3xl">
            <p className="text-slate-400 font-bold text-xl">此分類目前無學生資料</p>
          </div>
        )}
      </div>
    </div>
  );
}