"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

export default function ElementaryAttendance() {
  const [students, setStudents] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  
  const [selectedGrade, setSelectedGrade] = useState("小一");
  const [selectedIds, setSelectedIds] = useState<string[]>([]); // 批次選取的學生 ID
  const [loading, setLoading] = useState(true);

  const grades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六"];

  useEffect(() => {
    fetchData();
  }, [selectedGrade]);

  const fetchData = async () => {
    setLoading(true);
    const today = getToday();
    const currentWeekday = new Date().getDay().toString(); // 0(週日) ~ 6(週六)

    // 1. 抓取該年級學生
    const { data: stData } = await supabase
      .from("students")
      .select("*")
      .eq("grade", selectedGrade)
      .order("name");

    // 2. 抓取今日出缺勤紀錄
    const { data: logData } = await supabase
      .from("attendance_logs")
      .select("*")
      .eq("date", today)
      .is("course_id", null); // 國小的 course_id 為 null

    // 3. 抓取今日請假單
    const { data: leaveData } = await supabase
      .from("leave_records")
      .select("*")
      .eq("leave_date", today);

    // 4. 過濾掉「固定不排課」的學生
    const activeStudents = (stData || []).filter(s => {
      const fixedDays = s.fixed_days_off || [];
      return !fixedDays.includes(currentWeekday);
    });

    setStudents(activeStudents);
    setLogs(logData || []);
    setLeaves(leaveData || []);
    setSelectedIds([]); // 切換年級時清空選取
    setLoading(false);
  };

  // 取得學生目前狀態
  const getStudentStatus = (studentId: string) => {
    const isLeave = leaves.find(l => l.student_id === studentId);
    if (isLeave) return "leave"; // 請假
    const log = logs.find(l => l.student_id === studentId);
    return log ? log.status : "pending"; // pending, arrived, homework_done, left
  };

  // 點擊卡片選取/取消選取 (僅限未到班)
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // 批次確認到班
  const handleBatchArrive = async () => {
    if (selectedIds.length === 0) return alert("請先選取學生！");
    if (!confirm(`確定要將選取的 ${selectedIds.length} 位學生標記為「已到班」並發送通知嗎？`)) return;

    const today = getToday();
    const newLogs = selectedIds.map(id => ({
      student_id: id,
      date: today,
      status: "arrived",
      arrival_time: new Date().toISOString()
    }));

    await supabase.from("attendance_logs").upsert(newLogs, { onConflict: "student_id, date, course_id" });
    
    // TODO: 呼叫 LINE API 發送到班通知
    alert(`已成功發送到班通知給 ${selectedIds.length} 位家長！`);
    fetchData();
  };

  // 單一學生狀態變更 (作業完成 / 離班)
  const updateStatus = async (studentId: string, newStatus: "homework_done" | "left") => {
    const today = getToday();
    const log = logs.find(l => l.student_id === studentId);
    if (!log) return;

    const updateData: any = { status: newStatus };
    if (newStatus === "homework_done") updateData.homework_time = new Date().toISOString();
    if (newStatus === "left") updateData.leave_time = new Date().toISOString();

    await supabase.from("attendance_logs").update(updateData).eq("id", log.id);
    
    // TODO: 呼叫 LINE API 發送通知
    const actionName = newStatus === "homework_done" ? "作業完成" : "離班";
    alert(`已發送【${actionName}】通知！`);
    fetchData();
  };

  // 分類學生
  const pendingStudents = students.filter(s => getStudentStatus(s.id) === "pending");
  const arrivedStudents = students.filter(s => ["arrived", "homework_done"].includes(getStudentStatus(s.id)));
  const leftStudents = students.filter(s => getStudentStatus(s.id) === "left");
  const leaveStudents = students.filter(s => getStudentStatus(s.id) === "leave");

  return (
    <div className="space-y-8">
      {/* 年級切換 */}
      <div className="flex flex-wrap gap-2">
        {grades.map(g => (
          <button
            key={g}
            onClick={() => setSelectedGrade(g)}
            className={`px-5 py-2.5 rounded-xl font-black text-sm transition-all ${
              selectedGrade === g ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "bg-white text-slate-500 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400 font-bold animate-pulse">載入名單中...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          {/* 左欄：未到班 (可批次選取) */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col">
            <h3 className="text-xl font-black text-slate-800 mb-4 border-b border-slate-100 pb-2">
              待簽到 <span className="text-blue-500 bg-blue-50 px-2 py-0.5 rounded-lg text-sm ml-2">{pendingStudents.length}</span>
            </h3>
            <div className="flex-1 overflow-y-auto space-y-3 mb-6">
              {pendingStudents.length === 0 && <p className="text-slate-400 font-bold text-center py-10">皆已簽到</p>}
              {pendingStudents.map(s => (
                <button
                  key={s.id}
                  onClick={() => toggleSelection(s.id)}
                  className={`w-full flex justify-between items-center p-4 rounded-2xl border-2 transition-all active:scale-95 ${
                    selectedIds.includes(s.id) ? "bg-blue-50 border-blue-500 text-blue-700" : "bg-white border-slate-100 hover:border-blue-200"
                  }`}
                >
                  <span className="text-lg font-black">{s.name}</span>
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center border-2 ${selectedIds.includes(s.id) ? "bg-blue-500 border-blue-500 text-white" : "border-slate-300"}`}>
                    {selectedIds.includes(s.id) && "✓"}
                  </div>
                </button>
              ))}
            </div>
            {pendingStudents.length > 0 && (
              <button 
                onClick={handleBatchArrive}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-200 transition-all active:scale-95"
              >
                批次確認到班 ({selectedIds.length})
              </button>
            )}
          </div>

          {/* 中欄：已到班 / 作業檢查區 */}
          <div className="bg-orange-50/50 rounded-3xl p-6 border border-orange-100 flex flex-col">
            <h3 className="text-xl font-black text-orange-800 mb-4 border-b border-orange-200 pb-2">
              作業檢查區 <span className="text-orange-600 bg-orange-100 px-2 py-0.5 rounded-lg text-sm ml-2">{arrivedStudents.length}</span>
            </h3>
            <div className="flex-1 overflow-y-auto space-y-4">
              {arrivedStudents.length === 0 && <p className="text-orange-300 font-bold text-center py-10">無人在班</p>}
              {arrivedStudents.map(s => {
                const status = getStudentStatus(s.id);
                return (
                  <div key={s.id} className="bg-white p-4 rounded-2xl border border-orange-200 shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-lg font-black text-slate-800">{s.name}</span>
                      {status === "homework_done" && <span className="text-xs font-black text-green-600 bg-green-50 px-2 py-1 rounded-md">✓ 作業完成</span>}
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => updateStatus(s.id, "homework_done")}
                        disabled={status === "homework_done"}
                        className="flex-1 py-2.5 rounded-xl font-black text-sm transition-all disabled:opacity-50 disabled:bg-slate-100 disabled:text-slate-400 bg-green-50 text-green-600 hover:bg-green-100"
                      >
                        作業完成
                      </button>
                      <button 
                        onClick={() => updateStatus(s.id, "left")}
                        className="flex-1 py-2.5 rounded-xl font-black text-sm transition-all bg-slate-800 text-white hover:bg-black shadow-md"
                      >
                        已離班
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右欄：已離班 & 請假 */}
          <div className="space-y-6">
            <div className="bg-slate-100 rounded-3xl p-6 border border-slate-200">
              <h3 className="text-xl font-black text-slate-500 mb-4 border-b border-slate-200 pb-2">今日已離班 ({leftStudents.length})</h3>
              <div className="flex flex-wrap gap-2">
                {leftStudents.map(s => <span key={s.id} className="bg-white px-3 py-1.5 rounded-lg text-slate-400 font-bold shadow-sm">{s.name}</span>)}
              </div>
            </div>
            
            <div className="bg-red-50 rounded-3xl p-6 border border-red-100">
              <h3 className="text-xl font-black text-red-500 mb-4 border-b border-red-200 pb-2">今日請假 ({leaveStudents.length})</h3>
              <div className="flex flex-wrap gap-2">
                {leaveStudents.map(s => <span key={s.id} className="bg-white px-3 py-1.5 rounded-lg text-red-400 font-bold shadow-sm">{s.name}</span>)}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}