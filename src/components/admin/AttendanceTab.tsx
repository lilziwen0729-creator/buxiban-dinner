"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

export default function AttendanceTab() {
  const [systemMode, setSystemMode] = useState<"primary" | "junior">("primary");
  const [selectedGrade, setSelectedGrade] = useState("小一");
  
  // 資料狀態
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]); // 為了算「今日領餐」
  const [loading, setLoading] = useState(true);
  
  // 批次選取
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const primaryGrades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六"];

  useEffect(() => {
    fetchData();
  }, [selectedGrade, systemMode]); // 年級切換時也可重抓確保最新

  const fetchData = async () => {
    setLoading(true);
    const today = getToday();
    
    // 同時抓取學生、今日出缺勤、今日訂餐(算便當數)
    const [stRes, logRes, orderRes] = await Promise.all([
      supabase.from("students").select("*").order("name"),
      supabase.from("attendance_logs").select("*").eq("date", today),
      supabase.from("orders").select("*").eq("order_date", today)
    ]);

    setStudents(stRes.data || []);
    setAttendanceLogs(logRes.data || []);
    setOrders(orderRes.data || []);
    setLoading(false);
  };

  // --- 狀態更新 API (樂觀更新 + 寫入 DB) ---
  const updateStudentStatus = async (studentId: string, newStatus: string) => {
    const today = getToday();
    
    // 1. 畫面瞬間更新 (Optimistic UI)
    setAttendanceLogs(prev => {
      const exists = prev.find(l => l.student_id === studentId);
      if (exists) return prev.map(l => l.student_id === studentId ? { ...l, status: newStatus } : l);
      return [...prev, { student_id: studentId, date: today, status: newStatus }];
    });

    // 2. 背景寫入 DB
    await supabase.from("attendance_logs").upsert({
      student_id: studentId,
      date: today,
      status: newStatus,
      // 根據狀態記錄不同時間
      ...(newStatus === 'arrived' && { arrival_time: new Date().toISOString() }),
      ...(newStatus === 'homework_done' && { homework_time: new Date().toISOString() }),
      ...(newStatus === 'left' && { leave_time: new Date().toISOString() })
    }, { onConflict: "student_id, date, course_id" });
  };

  // --- 批次簽到 ---
  const handleBatchArrive = async () => {
    if (selectedIds.length === 0) return;
    
    // 瞬間更新畫面
    const today = getToday();
    setAttendanceLogs(prev => {
      let next = [...prev];
      selectedIds.forEach(id => {
        const exists = next.find(l => l.student_id === id);
        if (exists) {
          next = next.map(l => l.student_id === id ? { ...l, status: 'arrived' } : l);
        } else {
          next.push({ student_id: id, date: today, status: 'arrived' });
        }
      });
      return next;
    });

    // 背景寫入
    const newLogs = selectedIds.map(id => ({
      student_id: id,
      date: today,
      status: 'arrived',
      arrival_time: new Date().toISOString()
    }));

    await supabase.from("attendance_logs").upsert(newLogs, { onConflict: "student_id, date, course_id" });
    
    alert(`已發送 ${selectedIds.length} 位學生【到班通知】給家長！`);
    setSelectedIds([]); 
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  // --- 資料分類過濾 ---
  const filteredStudents = students.filter(s => s.grade === selectedGrade);
  
  // 1. 待簽到 (無紀錄 或 pending)
  const pendingStudents = filteredStudents.filter(s => {
    const log = attendanceLogs.find(l => l.student_id === s.id);
    return !log || log.status === 'pending';
  });

  // 2. 作業檢查區 (已到班 arrived 或 作業完成 homework_done)
  const workingStudents = filteredStudents.filter(s => {
    const log = attendanceLogs.find(l => l.student_id === s.id);
    return log && (log.status === 'arrived' || log.status === 'homework_done');
  });

  // 3. 已離班 (left)
  const leftStudents = filteredStudents.filter(s => {
    const log = attendanceLogs.find(l => l.student_id === s.id);
    return log && log.status === 'left';
  });

  // 4. 請假 (leave)
  const leaveStudents = filteredStudents.filter(s => {
    const log = attendanceLogs.find(l => l.student_id === s.id);
    return log && log.status === 'leave';
  });

  // --- 上方統計數據 ---
  const stats = {
    total: filteredStudents.length,
    signedIn: workingStudents.length + leftStudents.length, // 今日有來的總人數
    meals: orders.filter(o => filteredStudents.some(s => s.id === o.student_id)).length, // 這個年級今日訂餐數
    homeworkPending: workingStudents.filter(s => attendanceLogs.find(l => l.student_id === s.id)?.status === 'arrived').length // 狀態卡在 arrived 的人
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-24 font-sans animate-in fade-in">
      
      {/* 頂部雙模式切換 (完全照你的設計) */}
      <div className="bg-white p-4 shadow-sm flex gap-4 justify-center rounded-b-3xl mb-4">
        <button 
          onClick={() => setSystemMode("primary")}
          className={`flex-1 py-4 rounded-2xl font-black text-lg transition-all flex flex-col items-center gap-1 ${systemMode === "primary" ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "text-slate-400 bg-slate-50"}`}
        >
          <span>👶 國小課輔</span>
          <span className="text-sm opacity-80">點名作業</span>
        </button>
        <button 
          onClick={() => setSystemMode("junior")}
          className={`flex-1 py-4 rounded-2xl font-black text-lg transition-all flex flex-col items-center gap-1 ${systemMode === "junior" ? "bg-amber-500 text-white shadow-md shadow-amber-200" : "text-slate-400 bg-slate-50"}`}
        >
          <span>🧑‍🎓 國中單科</span>
          <span className="text-sm opacity-80">點名與成績</span>
        </button>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-4">
        
        {/* --- 國小系統 UI --- */}
        {systemMode === "primary" ? (
          <>
            {/* 統計卡片區塊 */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
              <div className="mb-4 text-slate-500 font-bold text-sm">負責年級：</div>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {primaryGrades.map(g => (
                  <button
                    key={g}
                    onClick={() => { setSelectedGrade(g); setSelectedIds([]); }}
                    className={`whitespace-nowrap px-5 py-2.5 rounded-xl font-black text-sm transition-all ${
                      selectedGrade === g 
                      ? "bg-blue-600 text-white shadow-md shadow-blue-200" 
                      : "bg-white text-slate-500 border border-slate-200"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 mt-4">
                <div className="flex-1 bg-blue-50 border border-blue-100 rounded-2xl p-3 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-blue-600 mb-1">今日簽到</span>
                  <div className="font-black text-blue-600"><span className="text-2xl">{stats.signedIn}</span><span className="text-sm opacity-50"> / {stats.total}</span></div>
                </div>
                <div className="flex-1 bg-green-50 border border-green-100 rounded-2xl p-3 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-green-600 mb-1">今日領餐</span>
                  <div className="font-black text-green-600"><span className="text-2xl">{stats.meals}</span></div>
                </div>
                <div className="flex-1 bg-red-50 border border-red-100 rounded-2xl p-3 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-red-500 mb-1">作業未完</span>
                  <div className="font-black text-red-500 text-2xl">{stats.homeworkPending}</div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-20 text-slate-400 font-bold animate-pulse">資料同步中...</div>
            ) : (
              <div className="space-y-4">
                
                {/* 1. 待簽到區 */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                  <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                    待簽到 <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md text-xs">{pendingStudents.length}</span>
                  </h3>
                  <div className="space-y-3">
                    {pendingStudents.map(s => {
                      const isChecked = selectedIds.includes(s.id);
                      return (
                        <label key={s.id} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${isChecked ? "border-blue-500 bg-blue-50/50" : "border-slate-100 hover:border-slate-200"}`}>
                          <span className="text-lg font-black text-slate-400">{s.name}</span>
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center border-2 transition-all ${isChecked ? "bg-blue-500 border-blue-500 text-white" : "border-slate-300"}`}>{isChecked && "✓"}</div>
                          <input type="checkbox" className="hidden" checked={isChecked} onChange={() => toggleSelection(s.id)}/>
                        </label>
                      );
                    })}
                    {pendingStudents.length === 0 && <div className="text-center py-4 text-sm text-slate-300 font-bold">無待簽到學生</div>}
                    
                    {/* 批次按鈕 */}
                    <button 
                      onClick={handleBatchArrive}
                      disabled={selectedIds.length === 0}
                      className={`w-full py-4 rounded-xl font-black text-white transition-all mt-2 ${selectedIds.length > 0 ? "bg-blue-600 shadow-lg shadow-blue-200 active:scale-95" : "bg-slate-300"}`}
                    >
                      批次確認到班 ({selectedIds.length})
                    </button>
                  </div>
                </div>

                {/* 2. 作業檢查區 */}
                <div className="bg-orange-50/50 p-5 rounded-3xl border border-orange-100">
                  <h3 className="text-lg font-black text-orange-700 mb-4 flex items-center gap-2">
                    作業檢查區 <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-md text-xs">{workingStudents.length}</span>
                  </h3>
                  <div className="space-y-3">
                    {workingStudents.map(s => {
                      const log = attendanceLogs.find(l => l.student_id === s.id);
                      const isHomeworkDone = log?.status === 'homework_done';
                      
                      return (
                        <div key={s.id} className="bg-white p-4 rounded-2xl border border-orange-100 shadow-sm flex flex-col gap-3">
                          <div className="flex justify-between items-center">
                            <span className="text-lg font-black text-slate-700">{s.name}</span>
                            {isHomeworkDone && <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded font-bold">作業✅</span>}
                          </div>
                          <div className="flex gap-2">
                            {/* 防呆：如果離班就不能按，如果作業完成就變色 */}
                            <button 
                              onClick={() => updateStudentStatus(s.id, 'homework_done')}
                              disabled={isHomeworkDone}
                              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${isHomeworkDone ? "bg-slate-100 text-slate-400" : "bg-orange-100 text-orange-600 hover:bg-orange-200"}`}
                            >
                              作業完成
                            </button>
                            {/* 離班按鈕隨時可按，按了就會跳去離班區 */}
                            <button 
                              onClick={() => {
                                if(window.confirm(`確定要將【${s.name}】設為已離班並通知家長嗎？`)) updateStudentStatus(s.id, 'left');
                              }}
                              className="flex-1 py-2 bg-slate-800 text-white rounded-xl text-sm font-bold shadow-md hover:bg-slate-700 active:scale-95 transition-all"
                            >
                              確認離班
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {workingStudents.length === 0 && <div className="text-center py-6 text-sm text-orange-300 font-bold">無人在班</div>}
                  </div>
                </div>

                {/* 3. 今日已離班 */}
                <div className="bg-slate-100 p-5 rounded-3xl border border-slate-200">
                  <h3 className="text-lg font-black text-slate-500 mb-2 flex items-center gap-2">
                    今日已離班 <span className="text-sm">({leftStudents.length})</span>
                  </h3>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {leftStudents.map(s => <span key={s.id} className="bg-white px-3 py-1.5 rounded-lg text-sm font-bold text-slate-400 shadow-sm">{s.name}</span>)}
                  </div>
                </div>

                {/* 4. 今日請假 */}
                <div className="bg-red-50 p-5 rounded-3xl border border-red-100">
                  <h3 className="text-lg font-black text-red-500 mb-2 flex items-center gap-2">
                    今日請假 <span className="text-sm">({leaveStudents.length})</span>
                  </h3>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {leaveStudents.map(s => <span key={s.id} className="bg-white px-3 py-1.5 rounded-lg text-sm font-bold text-red-400 shadow-sm">{s.name}</span>)}
                  </div>
                </div>

              </div>
            )}
          </>
        ) : (
          /* --- 國中系統 UI (預留區) --- */
          <div className="bg-white p-8 rounded-3xl border border-slate-100 text-center space-y-4 py-20 shadow-sm">
            <div className="text-5xl">🚧</div>
            <h3 className="text-xl font-black text-slate-800">國中課表與成績系統</h3>
            <p className="text-slate-500 font-bold text-sm">我們已經建立好資料庫了！<br/>下一階段將為您實裝「依課表點名」與「成績 Excel 匯出」功能。</p>
          </div>
        )}
      </div>
    </div>
  );
}