"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

type StudentWithStatus = {
  id: string;
  name: string;
  grade: string;
  parents?: {
    phone: string;
    line_user_id?: string;
  };
  today_status: {
    pickup_status: number;
    hw_completed: boolean;
    leave_status: number;
  };
};

interface AttendanceTabProps {
  teacherGrade?: string; 
}

export default function AttendanceTab({ teacherGrade }: AttendanceTabProps) {
  const [students, setStudents] = useState<StudentWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [localGrade, setLocalGrade] = useState("all");
  const today = getToday();

  const gradeOrder = ["小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三"];

  useEffect(() => {
    fetchAttendanceData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const fetchAttendanceData = async () => {
    setLoading(true);
    try {
      const { data: studentsData, error: studentError } = await supabase
        .from("students")
        .select(`id, name, grade, parents ( phone, line_user_id )`);

      if (studentError) throw studentError;

      const { data: attendanceData, error: attendanceError } = await supabase
        .from("daily_attendance")
        .select("student_id, pickup_status, hw_completed, leave_status")
        .eq("date", today);

      if (attendanceError) throw attendanceError;

      const mergedData = (studentsData || []).map((student) => {
        const record = (attendanceData || []).find((a) => a.student_id === student.id);
        const parentData = Array.isArray(student.parents) ? student.parents[0] : student.parents;

        return {
          ...student,
          parents: parentData,
          today_status: record ? { 
            pickup_status: record.pickup_status, 
            hw_completed: record.hw_completed,
            leave_status: record.leave_status || 0 
          } : { pickup_status: 0, hw_completed: false, leave_status: 0 }
        };
      });

      setStudents(mergedData as any);
    } catch (error) {
      console.error("讀取資料失敗:", error);
    } finally {
      setLoading(false);
    }
  };

  // 加上了防呆機制與學生姓名的更新函數
  const handleUpdateStatus = async (
    studentId: string, 
    type: "pickup" | "hw" | "leave", 
    studentName: string,
    isJuniorHigh: boolean
  ) => {
    // 1. 防呆確認視窗 (設定對應的提示文案)
    let actionName = "";
    if (type === "pickup") actionName = isJuniorHigh ? "已到班" : "已從學校接到";
    if (type === "hw") actionName = "作業已完成";
    if (type === "leave") actionName = "已下課離開";

    const confirmMessage = `確定要標記 ${studentName} 「${actionName}」嗎？\n⚠️ 點擊確定後將會發送 LINE 通知給家長！`;
    
    // 如果老師按了「取消」，就直接中斷函數，什麼事都不會發生
    if (!window.confirm(confirmMessage)) {
      return; 
    }

    // 2. 老師確認後，進行樂觀 UI 更新
    const isPickup = type === "pickup";
    setStudents((prev) => prev.map((s) => {
      if (s.id === studentId) {
        return {
          ...s,
          today_status: {
            ...s.today_status,
            pickup_status: type === "pickup" ? 1 : s.today_status.pickup_status,
            hw_completed: type === "hw" ? true : s.today_status.hw_completed,
            leave_status: type === "leave" ? 1 : s.today_status.leave_status,
          }
        };
      }
      return s;
    }));

    // 3. 更新資料庫
    const updateData: any = { student_id: studentId, date: today };
    if (type === "pickup") updateData.pickup_status = 1;
    if (type === "hw") updateData.hw_completed = true;
    if (type === "leave") updateData.leave_status = 1;

    const { error } = await supabase
      .from("daily_attendance")
      .upsert(updateData, { onConflict: "student_id,date" });

    if (error) {
      alert("更新失敗：" + error.message);
      fetchAttendanceData(); // 失敗則還原畫面
    } else {
      // TODO: 這裡之後會放呼叫發送 LINE API 的程式碼
      console.log(`即將發送 LINE 給 ${studentName} 的家長: ${actionName}`);
    }
  };

  // 國中一鍵下課功能 (原本就已經有防呆確認了)
  const handleBatchLeave = async (gradeStudents: StudentWithStatus[], gradeName: string) => {
    if (!confirm(`⚠️ 確定要將【${gradeName}】全班設為「已下課」嗎？\n這將會瞬間發送大量 LINE 通知給所有家長！`)) return;

    setStudents((prev) => prev.map((s) => {
      if (s.grade === gradeName) {
        return { ...s, today_status: { ...s.today_status, leave_status: 1 } };
      }
      return s;
    }));

    const rows = gradeStudents.map((s) => ({
      student_id: s.id,
      date: today,
      pickup_status: s.today_status.pickup_status,
      hw_completed: s.today_status.hw_completed,
      leave_status: 1 
    }));

    const { error } = await supabase
      .from("daily_attendance")
      .upsert(rows, { onConflict: "student_id,date" });

    if (error) {
      alert("一鍵下課失敗：" + error.message);
      fetchAttendanceData();
    } else {
      alert(`【${gradeName}】已全數下課！(準備發送批次 LINE 通知)`);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 font-bold animate-pulse">載入點名資料中...</div>;

  const activeGrade = teacherGrade || localGrade;
  
  const displayStudents = activeGrade === "all" 
    ? students 
    : students.filter(s => s.grade === activeGrade);

  const totalStudents = displayStudents.length;
  const totalNotPickedUp = displayStudents.filter(s => s.today_status.pickup_status === 0).length;
  const totalHwNotDone = displayStudents.filter(s => !s.grade.includes("國") && !s.today_status.hw_completed).length;

  const studentsByGrade = displayStudents.reduce((acc, student) => {
    if (!acc[student.grade]) acc[student.grade] = [];
    acc[student.grade].push(student);
    return acc;
  }, {} as Record<string, StudentWithStatus[]>);

  const sortedGrades = Object.keys(studentsByGrade).sort(
    (a, b) => gradeOrder.indexOf(a) - gradeOrder.indexOf(b)
  );

  return (
    <div className="space-y-6">
      {!teacherGrade && (
        <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <label className="font-bold text-gray-700">檢視年級：</label>
          <select 
            value={localGrade} 
            onChange={(e) => setLocalGrade(e.target.value)}
            className="border-2 border-gray-200 rounded-xl px-4 py-2 text-black font-semibold focus:border-blue-500 outline-none"
          >
            <option value="all">全校總覽</option>
            {gradeOrder.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      )}

      {/* 頂部數據看板 */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="bg-white rounded-2xl p-3 md:p-4 shadow-sm border-l-4 border-blue-500">
          <p className="text-gray-500 text-xs md:text-sm font-bold">{activeGrade === "all" ? "全校" : activeGrade}應到</p>
          <p className="text-xl md:text-2xl font-black text-black mt-1">{totalStudents} <span className="text-sm font-normal text-gray-500">人</span></p>
        </div>
        <div className="bg-red-50 rounded-2xl p-3 md:p-4 shadow-sm border-l-4 border-red-500">
          <p className="text-red-700 text-xs md:text-sm font-bold">尚未到班</p>
          <p className="text-xl md:text-2xl font-black text-red-600 mt-1">{totalNotPickedUp} <span className="text-sm font-normal text-red-400">人</span></p>
        </div>
        <div className="bg-yellow-50 rounded-2xl p-3 md:p-4 shadow-sm border-l-4 border-yellow-500 relative overflow-hidden">
          <p className="text-yellow-700 text-xs md:text-sm font-bold">作業未完</p>
          {activeGrade.includes("國") ? (
            <p className="text-sm font-bold text-gray-400 mt-2">免確認</p>
          ) : (
            <p className="text-xl md:text-2xl font-black text-yellow-600 mt-1">{totalHwNotDone} <span className="text-sm font-normal text-yellow-500">人</span></p>
          )}
        </div>
      </div>

      {totalStudents === 0 ? (
        <div className="bg-white rounded-3xl p-8 shadow text-center">
          <p className="text-gray-500 text-lg">目前尚無學生資料</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedGrades.map((grade) => {
            const gradeStudents = studentsByGrade[grade];
            const isJuniorHigh = grade.includes("國"); 
            
            const missingPickup = gradeStudents.filter(s => s.today_status.pickup_status === 0);
            const missingHw = isJuniorHigh ? [] : gradeStudents.filter(s => !s.today_status.hw_completed);
            
            const isAllLeft = gradeStudents.every(s => s.today_status.leave_status === 1);
            const isAllClear = missingPickup.length === 0 && missingHw.length === 0 && isAllLeft;

            return (
              <div key={grade} className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
                <div className="flex flex-wrap justify-between items-center gap-3 mb-4 border-b pb-3">
                  <h3 className="text-xl font-bold text-black flex items-center gap-2">
                    {grade}
                  </h3>
                  
                  <div className="flex items-center gap-2">
                    {isAllClear && (
                      <span className="bg-green-100 text-green-700 font-bold px-3 py-1 rounded-xl text-sm flex items-center gap-1">
                        ✅ 全數離班
                      </span>
                    )}
                    
                    {isJuniorHigh && !isAllLeft && (
                      <button 
                        onClick={() => handleBatchLeave(gradeStudents, grade)}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-xl text-sm shadow-md transition-transform active:scale-95 flex items-center gap-1"
                      >
                        ⚡ 一鍵全班下課
                      </button>
                    )}
                  </div>
                </div>

                {!isAllClear && (
                  <div className="flex flex-col md:flex-row gap-2 mb-5">
                    {missingPickup.length > 0 && (
                      <div className="flex-1 bg-red-50 text-red-700 px-3 py-2 rounded-xl text-sm font-medium border border-red-100">
                        <span className="font-bold flex items-center gap-1 mb-1">
                          {isJuniorHigh ? "📍 尚未到班" : "🚙 尚未接到"} ({missingPickup.length})
                        </span>
                        {missingPickup.map(s => s.name).join("、")}
                      </div>
                    )}
                    {missingHw.length > 0 && (
                      <div className="flex-1 bg-yellow-50 text-yellow-800 px-3 py-2 rounded-xl text-sm font-medium border border-yellow-100">
                        <span className="font-bold flex items-center gap-1 mb-1">📝 作業未完 ({missingHw.length})</span>
                        {missingHw.map(s => s.name).join("、")}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-4">
                  {gradeStudents.map((student) => {
                    const isPickedUp = student.today_status.pickup_status === 1;
                    const isHwDone = student.today_status.hw_completed;
                    const isLeft = student.today_status.leave_status === 1;
                    
                    const isFullyDone = isJuniorHigh ? isLeft : (isPickedUp && isHwDone && isLeft);

                    return (
                      <div key={student.id} className="flex flex-col xl:flex-row justify-between xl:items-center border p-4 rounded-2xl bg-gray-50 gap-4">
                        <div>
                          <p className="font-bold text-lg text-black flex items-center gap-2">
                            {student.name}
                            {isFullyDone && <span className="text-xs bg-gray-600 text-white px-2 py-0.5 rounded-md">已離班</span>}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleUpdateStatus(student.id, "pickup", student.name, isJuniorHigh)}
                            disabled={isPickedUp}
                            className={`flex-1 min-w-[100px] px-3 py-3 rounded-xl font-bold text-sm transition-all ${
                              isPickedUp 
                                ? "bg-gray-200 text-gray-500 cursor-not-allowed shadow-inner" 
                                : "bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95"
                            }`}
                          >
                            {isJuniorHigh 
                              ? (isPickedUp ? "✅ 已到班" : "📍 到班點名") 
                              : (isPickedUp ? "✅ 已接到" : "🚙 學校接到")}
                          </button>

                          {!isJuniorHigh && (
                            <button
                              onClick={() => handleUpdateStatus(student.id, "hw", student.name, isJuniorHigh)}
                              disabled={isHwDone}
                              className={`flex-1 min-w-[100px] px-3 py-3 rounded-xl font-bold text-sm transition-all ${
                                isHwDone 
                                  ? "bg-gray-200 text-gray-500 cursor-not-allowed shadow-inner" 
                                  : "bg-green-600 hover:bg-green-700 text-white shadow-md active:scale-95"
                              }`}
                            >
                              {isHwDone ? "✅ 作業完成" : "📝 確認作業"}
                            </button>
                          )}

                          <button
                            onClick={() => handleUpdateStatus(student.id, "leave", student.name, isJuniorHigh)}
                            disabled={isLeft}
                            className={`flex-1 min-w-[100px] px-3 py-3 rounded-xl font-bold text-sm transition-all ${
                              isLeft 
                                ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-inner" 
                                : "bg-orange-500 hover:bg-orange-600 text-white shadow-md active:scale-95"
                            }`}
                          >
                            {isLeft ? "✅ 已下課" : "👋 確認離開"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}