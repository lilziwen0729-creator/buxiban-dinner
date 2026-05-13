"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

export default function AttendanceTab() {
  const [mounted, setMounted] = useState(false); // 徹底解決 Next.js 時間報錯
  const [systemMode, setSystemMode] = useState<"primary" | "junior">("primary");
  const [selectedGrade, setSelectedGrade] = useState("小一");
  
  // --- 國中專用狀態 ---
  const [juniorTab, setJuniorTab] = useState<"attendance" | "grading">("attendance");
  const [courses, setCourses] = useState<any[]>([]);
  const [studentCourses, setStudentCourses] = useState<any[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [currentScores, setCurrentScores] = useState<Record<string, { score_1: string, score_2: string }>>({});
  const [dayOfWeek, setDayOfWeek] = useState(0); 

  // --- 共用資料狀態 ---
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const primaryGrades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六"];

  useEffect(() => {
    setMounted(true);
    // 獲取今天是禮拜幾 (1=週一, 7=週日)
    const d = new Date().getDay() === 0 ? 7 : new Date().getDay();
    setDayOfWeek(d);
    fetchData(d);
  }, [selectedGrade, systemMode]);

  const fetchData = async (d: number) => {
    setLoading(true);
    const today = getToday();
    
    try {
      const [stRes, logRes, orderRes, courseRes, scRes, scoreRes] = await Promise.all([
        supabase.from("students").select("*").order("name"),
        supabase.from("attendance_logs").select("*").eq("date", today),
        supabase.from("orders").select("*").eq("order_date", today),
        supabase.from("courses").select("*"),
        supabase.from("student_courses").select("*"),
        supabase.from("exam_scores").select("*").eq("exam_date", today)
      ]);

      setStudents(stRes.data || []);
      setAttendanceLogs(logRes.data || []);
      setOrders(orderRes.data || []);
      setCourses(courseRes.data || []);
      setStudentCourses(scRes.data || []);

      // 國中：自動選擇今日課程
      if (courseRes.data && courseRes.data.length > 0) {
        const todays = courseRes.data.filter(c => c.day_of_week === d);
        if (todays.length > 0) {
          setSelectedCourseId(prev => prev || todays[0].id);
        } else if (!selectedCourseId) {
          setSelectedCourseId(courseRes.data[0].id);
        }
      }

      // 成績對照表還原
      const scoreMap: Record<string, { score_1: string, score_2: string }> = {};
      if (scoreRes.data) {
        scoreRes.data.forEach(score => {
          scoreMap[score.student_id] = { 
            score_1: score.score_1 !== null ? String(score.score_1) : "", 
            score_2: score.score_2 !== null ? String(score.score_2) : "" 
          };
        });
      }
      setCurrentScores(scoreMap);
    } catch (err) {
      console.error("資料抓取失敗:", err);
    }
    setLoading(false);
  };

  // 避免 Server Side Rendering (SSR) 造成的報錯
  if (!mounted) return null; 

  // ==================== 核心邏輯 API ====================

  // 1. 單一狀態更新 (作業完成 / 離班)
  const updateStudentStatus = async (studentId: string, newStatus: string, courseId: string | null = null) => {
    const today = getToday();
    
    // 畫面瞬間更新 (樂觀更新)
    setAttendanceLogs(prev => {
      const exists = prev.find(l => l.student_id === studentId);
      if (exists) return prev.map(l => l.student_id === studentId ? { ...l, status: newStatus } : l);
      return [...prev, { student_id: studentId, date: today, course_id: courseId, status: newStatus }];
    });

    // 背景寫入 DB
    await supabase.from("attendance_logs").upsert({
      student_id: studentId, date: today, course_id: courseId, status: newStatus,
      ...(newStatus === 'arrived' && { arrival_time: new Date().toISOString() }),
      ...(newStatus === 'homework_done' && { homework_time: new Date().toISOString() }),
      ...(newStatus === 'left' && { leave_time: new Date().toISOString() })
    }, { onConflict: "student_id, date, course_id" });
  };

  // 2. 批次簽到
  const handleBatchArrive = async (courseId: string | null = null) => {
    if (selectedIds.length === 0) return;
    const today = getToday();
    
    // 畫面瞬間更新
    setAttendanceLogs(prev => {
      let next = [...prev];
      selectedIds.forEach(id => {
        const exists = next.find(l => l.student_id === id);
        if (exists) next = next.map(l => l.student_id === id ? { ...l, status: 'arrived' } : l);
        else next.push({ student_id: id, date: today, course_id: courseId, status: 'arrived' });
      });
      return next;
    });

    const newLogs = selectedIds.map(id => ({ student_id: id, date: today, course_id: courseId, status: 'arrived', arrival_time: new Date().toISOString() }));
    await supabase.from("attendance_logs").upsert(newLogs, { onConflict: "student_id, date, course_id" });
    alert(`已成功發送 ${selectedIds.length} 位學生【到班通知】！`);
    setSelectedIds([]); 
  };

  // 3. 國中：🔥全班統一離班下課
  const handleBulkLeaveJunior = async () => {
    const arrivedIds = j_arrived.map(s => s.id);
    if (arrivedIds.length === 0) return alert("目前沒有已到班的學生可下課！");
    if (!confirm(`確定要將這 ${arrivedIds.length} 位學生設為「已離班」並發送通知嗎？`)) return;

    const today = getToday();
    setAttendanceLogs(prev => prev.map(l => arrivedIds.includes(l.student_id) ? { ...l, status: 'left' } : l));

    const newLogs = arrivedIds.map(id => ({
      student_id: id, date: today, course_id: selectedCourseId, status: 'left', leave_time: new Date().toISOString()
    }));
    await supabase.from("attendance_logs").upsert(newLogs, { onConflict: "student_id, date, course_id" });
    alert("全班已下課！離班通知已發送。");
  };

  // 4. 國中：成績儲存與 Excel 匯出
  const handleScoreChange = (studentId: string, field: "score_1" | "score_2", value: string) => {
    setCurrentScores(prev => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }));
  };

  const saveScores = async () => {
    const today = getToday();
    const upsertData = courseStudents.map(s => ({
      course_id: selectedCourseId, student_id: s.id, exam_date: today,
      score_1: currentScores[s.id]?.score_1 ? Number(currentScores[s.id].score_1) : null,
      score_2: currentScores[s.id]?.score_2 ? Number(currentScores[s.id].score_2) : null,
    }));
    const { error } = await supabase.from("exam_scores").upsert(upsertData, { onConflict: "course_id, student_id, exam_date" });
    if (error) alert("儲存失敗：" + error.message);
    else alert("今日成績已成功儲存！");
  };

  const exportToCSV = () => {
    let csv = "\uFEFF學生姓名,成績一,成績二\n"; // \uFEFF 保證 Excel 開啟中文不亂碼
    courseStudents.forEach(s => {
      const s1 = currentScores[s.id]?.score_1 || "";
      const s2 = currentScores[s.id]?.score_2 || "";
      csv += `${s.name},${s1},${s2}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `成績匯出_${getToday()}.csv`;
    link.click();
  };

  const toggleSelection = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);

  // ==================== 資料過濾邏輯 ====================
  
  // 國小部資料分類
  const primaryStudents = students.filter(s => s.grade === selectedGrade);
  const p_pending = primaryStudents.filter(s => !attendanceLogs.find(l => l.student_id === s.id) || attendanceLogs.find(l => l.student_id === s.id)?.status === 'pending');
  const p_working = primaryStudents.filter(s => attendanceLogs.find(l => l.student_id === s.id)?.status === 'arrived' || attendanceLogs.find(l => l.student_id === s.id)?.status === 'homework_done');
  const p_left = primaryStudents.filter(s => attendanceLogs.find(l => l.student_id === s.id)?.status === 'left');
  const p_leave = primaryStudents.filter(s => attendanceLogs.find(l => l.student_id === s.id)?.status === 'leave');

  const p_stats = {
    total: primaryStudents.length,
    signedIn: p_working.length + p_left.length,
    meals: orders.filter(o => primaryStudents.some(s => s.id === o.student_id)).length,
    homeworkPending: p_working.filter(s => attendanceLogs.find(l => l.student_id === s.id)?.status === 'arrived').length
  };

  // 國中部資料分類
  const courseStudentIds = studentCourses.filter(sc => sc.course_id === selectedCourseId).map(sc => sc.student_id);
  const courseStudents = students.filter(s => courseStudentIds.includes(s.id));
  const j_pending = courseStudents.filter(s => !attendanceLogs.find(l => l.student_id === s.id) || attendanceLogs.find(l => l.student_id === s.id)?.status === 'pending');
  const j_arrived = courseStudents.filter(s => attendanceLogs.find(l => l.student_id === s.id)?.status === 'arrived');
  const j_left = courseStudents.filter(s => attendanceLogs.find(l => l.student_id === s.id)?.status === 'left');
  const j_leave = courseStudents.filter(s => attendanceLogs.find(l => l.student_id === s.id)?.status === 'leave');

  return (
    <div className="bg-slate-50 min-h-screen pb-24 font-sans animate-in fade-in">
      
      {/* 頂部雙系統切換 */}
      <div className="bg-white p-4 shadow-sm flex gap-4 justify-center rounded-b-3xl mb-4">
        <button onClick={() => {setSystemMode("primary"); setSelectedIds([]);}} className={`flex-1 py-4 rounded-2xl font-black text-lg transition-all flex flex-col items-center gap-1 ${systemMode === "primary" ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "text-slate-400 bg-slate-50"}`}>
          <span>👶 國小課輔</span><span className="text-sm opacity-80">點名作業</span>
        </button>
        <button onClick={() => {setSystemMode("junior"); setSelectedIds([]);}} className={`flex-1 py-4 rounded-2xl font-black text-lg transition-all flex flex-col items-center gap-1 ${systemMode === "junior" ? "bg-amber-500 text-white shadow-md shadow-amber-200" : "text-slate-400 bg-slate-50"}`}>
          <span>🧑‍🎓 國中單科</span><span className="text-sm opacity-80">點名與成績</span>
        </button>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-4">
        
        {/* ==================== 👶 國小系統 UI ==================== */}
        {systemMode === "primary" && (
          <>
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
              <div className="mb-4 text-slate-500 font-bold text-sm">負責年級：</div>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {primaryGrades.map(g => (
                  <button key={g} onClick={() => { setSelectedGrade(g); setSelectedIds([]); }} className={`whitespace-nowrap px-5 py-2.5 rounded-xl font-black text-sm transition-all ${selectedGrade === g ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-500 border border-slate-200"}`}>{g}</button>
                ))}
              </div>
              <div className="flex gap-3 mt-4">
                <div className="flex-1 bg-blue-50 border border-blue-100 rounded-2xl p-3 flex flex-col items-center justify-center"><span className="text-[10px] font-bold text-blue-600 mb-1">今日簽到</span><div className="font-black text-blue-600"><span className="text-2xl">{p_stats.signedIn}</span><span className="text-sm opacity-50"> / {p_stats.total}</span></div></div>
                <div className="flex-1 bg-green-50 border border-green-100 rounded-2xl p-3 flex flex-col items-center justify-center"><span className="text-[10px] font-bold text-green-600 mb-1">今日領餐</span><div className="font-black text-green-600"><span className="text-2xl">{p_stats.meals}</span></div></div>
                <div className="flex-1 bg-red-50 border border-red-100 rounded-2xl p-3 flex flex-col items-center justify-center"><span className="text-[10px] font-bold text-red-500 mb-1">作業未完</span><div className="font-black text-red-500 text-2xl">{p_stats.homeworkPending}</div></div>
              </div>
            </div>

            {loading ? <div className="text-center py-20 text-slate-400 font-bold animate-pulse">資料同步中...</div> : (
              <div className="space-y-4">
                {/* 1. 待簽到區 */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                  <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">待簽到 <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md text-xs">{p_pending.length}</span></h3>
                  <div className="space-y-3">
                    {p_pending.map(s => {
                      const isChecked = selectedIds.includes(s.id);
                      return (
                        <label key={s.id} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${isChecked ? "border-blue-500 bg-blue-50/50" : "border-slate-100 hover:border-slate-200"}`}>
                          <span className="text-lg font-black text-slate-700">{s.name}</span>
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center border-2 transition-all ${isChecked ? "bg-blue-500 border-blue-500 text-white" : "border-slate-300"}`}>{isChecked && "✓"}</div>
                          <input type="checkbox" className="hidden" checked={isChecked} onChange={() => toggleSelection(s.id)}/>
                        </label>
                      );
                    })}
                    {p_pending.length === 0 && <div className="text-center py-4 text-sm text-slate-300 font-bold">無待簽到學生</div>}
                    <button onClick={() => handleBatchArrive(null)} disabled={selectedIds.length === 0} className={`w-full py-4 rounded-xl font-black text-white transition-all mt-2 ${selectedIds.length > 0 ? "bg-blue-600 shadow-lg active:scale-95" : "bg-slate-300"}`}>批次確認到班 ({selectedIds.length})</button>
                  </div>
                </div>

                {/* 2. 作業檢查區 */}
                <div className="bg-orange-50/50 p-5 rounded-3xl border border-orange-100">
                  <h3 className="text-lg font-black text-orange-700 mb-4 flex items-center gap-2">作業檢查區 <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-md text-xs">{p_working.length}</span></h3>
                  <div className="space-y-3">
                    {p_working.map(s => {
                      const isHomeworkDone = attendanceLogs.find(l => l.student_id === s.id)?.status === 'homework_done';
                      return (
                        <div key={s.id} className="bg-white p-4 rounded-2xl border border-orange-100 shadow-sm flex flex-col gap-3">
                          <div className="flex justify-between items-center"><span className="text-lg font-black text-slate-700">{s.name}</span>{isHomeworkDone && <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded font-bold">作業✅</span>}</div>
                          <div className="flex gap-2">
                            <button onClick={() => updateStudentStatus(s.id, 'homework_done')} disabled={isHomeworkDone} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${isHomeworkDone ? "bg-slate-100 text-slate-400" : "bg-orange-100 text-orange-600 hover:bg-orange-200"}`}>作業完成</button>
                            <button onClick={() => { if(window.confirm(`確定要將【${s.name}】設為已離班並通知家長嗎？`)) updateStudentStatus(s.id, 'left'); }} className="flex-1 py-2 bg-slate-800 text-white rounded-xl text-sm font-bold shadow-md hover:bg-slate-700 active:scale-95 transition-all">確認離班</button>
                          </div>
                        </div>
                      );
                    })}
                    {p_working.length === 0 && <div className="text-center py-6 text-sm text-orange-300 font-bold">無人在班</div>}
                  </div>
                </div>

                {/* 3. 今日已離班 */}
                <div className="bg-slate-100 p-5 rounded-3xl border border-slate-200">
                  <h3 className="text-lg font-black text-slate-500 mb-2 flex items-center gap-2">今日已離班 <span className="text-sm">({p_left.length})</span></h3>
                  <div className="flex flex-wrap gap-2 mt-3">{p_left.map(s => <span key={s.id} className="bg-white px-3 py-1.5 rounded-lg text-sm font-bold text-slate-400 shadow-sm">{s.name}</span>)}</div>
                </div>

                {/* 4. 今日請假 */}
                <div className="bg-red-50 p-5 rounded-3xl border border-red-100">
                  <h3 className="text-lg font-black text-red-500 mb-2 flex items-center gap-2">今日請假 <span className="text-sm">({p_leave.length})</span></h3>
                  <div className="flex flex-wrap gap-2 mt-3">{p_leave.map(s => <span key={s.id} className="bg-white px-3 py-1.5 rounded-lg text-sm font-bold text-red-400 shadow-sm">{s.name}</span>)}</div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ==================== 🧑‍🎓 國中系統 UI ==================== */}
        {systemMode === "junior" && (
          <>
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
              <div>
                <label className="block text-slate-500 font-bold mb-2 text-sm">今日課程 (星期{["無","一","二","三","四","五","六","日"][dayOfWeek]})：</label>
                <select 
                  value={selectedCourseId} 
                  onChange={(e) => { setSelectedCourseId(e.target.value); setSelectedIds([]); }} 
                  className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-slate-800 font-black text-lg outline-none bg-slate-50 focus:border-amber-400"
                >
                  {courses.filter(c => c.day_of_week === dayOfWeek).length > 0 ? (
                    courses.filter(c => c.day_of_week === dayOfWeek).map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                  ) : (
                    <option value="">今日無排定課程</option>
                  )}
                  {courses.filter(c => c.day_of_week !== dayOfWeek).length > 0 && (
                    <optgroup label="--- 其他天課程 ---">
                      {courses.filter(c => c.day_of_week !== dayOfWeek).map(c => <option key={c.id} value={c.id}>{c.name} (週{c.day_of_week})</option>)}
                    </optgroup>
                  )}
                </select>
              </div>

              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                <button onClick={() => setJuniorTab("attendance")} className={`flex-1 py-2.5 rounded-lg font-black text-sm transition-all ${juniorTab === "attendance" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"}`}>點名清單</button>
                <button onClick={() => setJuniorTab("grading")} className={`flex-1 py-2.5 rounded-lg font-black text-sm transition-all ${juniorTab === "grading" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"}`}>成績登錄</button>
              </div>
            </div>

            {loading ? <div className="text-center py-20 text-slate-400 font-bold animate-pulse">資料同步中...</div> : (
              <>
                {/* 國中 - 點名模式 */}
                {juniorTab === "attendance" && (
                  <div className="space-y-4">
                    {courseStudents.length === 0 ? (
                      <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 font-bold">此課程目前無綁定學生<br/><span className="text-xs">請至資料庫新增</span></div>
                    ) : (
                      <>
                        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                          <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">待簽到 <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md text-xs">{j_pending.length}</span></h3>
                          <div className="space-y-3">
                            {j_pending.map(s => {
                              const isChecked = selectedIds.includes(s.id);
                              return (
                                <label key={s.id} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${isChecked ? "border-amber-500 bg-amber-50/50" : "border-slate-100 hover:border-slate-200"}`}>
                                  <span className="text-lg font-black text-slate-700">{s.name}</span>
                                  <div className={`w-6 h-6 rounded-md flex items-center justify-center border-2 transition-all ${isChecked ? "bg-amber-500 border-amber-500 text-white" : "border-slate-300"}`}>{isChecked && "✓"}</div>
                                  <input type="checkbox" className="hidden" checked={isChecked} onChange={() => toggleSelection(s.id)}/>
                                </label>
                              );
                            })}
                            <button onClick={() => handleBatchArrive(selectedCourseId)} disabled={selectedIds.length === 0} className={`w-full py-4 rounded-xl font-black text-white transition-all mt-2 ${selectedIds.length > 0 ? "bg-amber-500 shadow-lg active:scale-95" : "bg-slate-300"}`}>批次確認到班 ({selectedIds.length})</button>
                          </div>
                        </div>

                        <div className="bg-slate-100 p-5 rounded-3xl border border-slate-200">
                          <h3 className="text-lg font-black text-slate-500 mb-4 flex items-center gap-2">上課中 (已到班) <span className="bg-white text-slate-600 px-2 py-0.5 rounded-md text-xs">{j_arrived.length}</span></h3>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {j_arrived.map(s => <span key={s.id} className="bg-white px-4 py-2 rounded-xl text-sm font-bold text-slate-600 shadow-sm">{s.name}</span>)}
                            {j_arrived.length === 0 && <span className="text-sm text-slate-400">尚無人到班</span>}
                          </div>
                          
                          {/* 🔥 全班統一離班下課按鈕 */}
                          <button onClick={handleBulkLeaveJunior} disabled={j_arrived.length === 0} className={`w-full py-4 rounded-2xl font-black text-white transition-all mt-2 ${j_arrived.length > 0 ? "bg-slate-800 shadow-lg hover:bg-slate-900 active:scale-95" : "bg-slate-300"}`}>
                            🔥 全班統一離班下課
                          </button>
                        </div>
                        
                        {(j_left.length > 0 || j_leave.length > 0) && (
                          <div className="flex gap-2">
                            <div className="flex-1 bg-white p-4 rounded-2xl border border-slate-100"><p className="text-xs font-bold text-slate-400 mb-2">已離班</p><p className="font-black text-slate-600">{j_left.length} 人</p></div>
                            <div className="flex-1 bg-white p-4 rounded-2xl border border-slate-100"><p className="text-xs font-bold text-red-400 mb-2">今日請假</p><p className="font-black text-red-500">{j_leave.length} 人</p></div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* 國中 - 成績登錄模式 */}
                {juniorTab === "grading" && (
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-black text-slate-800">成績登錄 (今日)</h3>
                      {/* 📥 匯出 Excel 按鈕 */}
                      <button onClick={exportToCSV} className="bg-green-100 text-green-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-200 transition">📥 匯出 Excel</button>
                    </div>

                    <div className="space-y-4 mb-6">
                      {courseStudents.map(s => (
                        <div key={s.id} className="flex items-center justify-between border-b border-slate-50 pb-4">
                          <span className="font-black text-slate-700 w-20">{s.name}</span>
                          <div className="flex gap-2 flex-1">
                            <input type="number" placeholder="成績一" value={currentScores[s.id]?.score_1 || ""} onChange={(e) => handleScoreChange(s.id, "score_1", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-amber-400 font-bold text-center" />
                            <input type="number" placeholder="成績二" value={currentScores[s.id]?.score_2 || ""} onChange={(e) => handleScoreChange(s.id, "score_2", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-amber-400 font-bold text-center" />
                          </div>
                        </div>
                      ))}
                      {courseStudents.length === 0 && <p className="text-center text-slate-400 py-4 font-bold">此課程無學生</p>}
                    </div>

                    <button onClick={saveScores} disabled={courseStudents.length === 0} className="w-full bg-amber-500 text-white py-4 rounded-xl font-black shadow-lg shadow-amber-200 active:scale-95 transition-all">
                      💾 儲存今日成績
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}