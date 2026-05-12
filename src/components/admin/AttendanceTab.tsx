"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

export default function AttendanceTab({ teacherGrade = "全部" }) {
  const [students, setStudents] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedGrade, setSelectedGrade] = useState(teacherGrade === "全部" ? "小一" : teacherGrade);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const grades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const today = getToday();
    
    // 同時抓取學生與今日訂單狀態
    const [stRes, odRes] = await Promise.all([
      supabase.from("students").select("*").order("name"),
      supabase.from("orders").select("*").eq("order_date", today)
    ]);

    setStudents(stRes.data || []);
    setOrders(odRes.data || []);
    setLoading(false);
  };

  // 簽到/取消簽到切換
  const toggleAttendance = async (studentId: string, currentStatus: boolean) => {
    const today = getToday();
    if (currentStatus) {
      // 取消簽到
      await supabase.from("orders").update({ received: false }).eq("student_id", studentId).eq("order_date", today);
    } else {
      // 標記簽到 (received = true)
      // 注意：這裡假設學生今天必須有訂餐紀錄才能簽到。如果沒訂餐也要能簽到，邏輯需改為 upsert
      await supabase.from("orders").update({ received: true }).eq("student_id", studentId).eq("order_date", today);
    }
    fetchData(); // 刷新
  };

  // 篩選邏輯
  const filteredStudents = students.filter(s => {
    const matchGrade = selectedGrade === "全部" ? true : s.grade === selectedGrade;
    const matchSearch = s.name.includes(search);
    return matchGrade && matchSearch;
  });

  const getStatus = (studentId: string) => {
    const order = orders.find(o => o.student_id === studentId);
    return order?.received || false;
  };

  const gradeStats = () => {
    const total = students.filter(s => s.grade === selectedGrade).length;
    const attended = students.filter(s => s.grade === selectedGrade && getStatus(s.id)).length;
    return { total, attended };
  };

  return (
    <div className="bg-white min-h-[600px] flex flex-col animate-in fade-in duration-500">
      
      {/* 1. 年級切換與統計 */}
      <div className="p-6 border-b border-slate-100">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-wrap gap-2">
            {grades.map(g => (
              <button
                key={g}
                onClick={() => setSelectedGrade(g)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  selectedGrade === g 
                  ? "bg-blue-600 text-white shadow-md shadow-blue-200" 
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto">
            <input 
              type="text" 
              placeholder="快速找人..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-50 border-none rounded-xl px-4 py-2 text-sm w-full md:w-40 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* 進度條統計 */}
        {selectedGrade !== "全部" && (
          <div className="mt-6 flex items-center gap-4">
            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 transition-all duration-500" 
                style={{ width: `${(gradeStats().attended / gradeStats().total) * 100}%` }}
              ></div>
            </div>
            <span className="text-sm font-bold text-slate-500">
              簽到進度：{gradeStats().attended} / {gradeStats().total}
            </span>
          </div>
        )}
      </div>

      {/* 2. 學生名單分區 */}
      <div className="flex-1 p-6 overflow-y-auto">
        {loading ? (
          <div className="text-center py-20 text-slate-400 font-bold animate-pulse">載入名單中...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredStudents.map(s => {
              const isAttended = getStatus(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleAttendance(s.id, isAttended)}
                  className={`relative p-5 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2 group ${
                    isAttended 
                    ? "bg-slate-50 border-transparent opacity-60" 
                    : "bg-white border-slate-100 shadow-sm hover:border-blue-300 hover:shadow-md"
                  }`}
                >
                  <span className={`text-lg font-black ${isAttended ? "text-slate-400" : "text-slate-800"}`}>
                    {s.name}
                  </span>
                  
                  {isAttended ? (
                    <span className="text-green-500 font-bold text-xs flex items-center gap-1">
                      <span className="text-lg">✓</span> 已簽到
                    </span>
                  ) : (
                    <span className="text-slate-300 font-bold text-xs group-hover:text-blue-400 transition">
                      未簽到
                    </span>
                  )}

                  {/* 標籤小裝飾 (如有訂餐才顯示，可依需求調整) */}
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-400 opacity-40"></div>
                </button>
              );
            })}
          </div>
        )}

        {!loading && filteredStudents.length === 0 && (
          <div className="text-center py-20 text-slate-300 italic font-bold">
            此年級目前無學生資料
          </div>
        )}
      </div>
    </div>
  );
}