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
  };
};

// 新增 Props 讓老師端可以傳入「目前選擇的年級」
interface AttendanceTabProps {
  teacherGrade?: string; 
}

export default function AttendanceTab({ teacherGrade }: AttendanceTabProps) {
  const [students, setStudents] = useState<StudentWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [localGrade, setLocalGrade] = useState("all"); // 供 Admin 使用的本地篩選
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
        .select("student_id, pickup_status, hw_completed")
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
            hw_completed: record.hw_completed 
          } : { pickup_status: 0, hw_completed: false }
        };
      });

      setStudents(mergedData as any);
    } catch (error) {
      console.error("讀取資料失敗:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (studentId: string, type: "pickup" | "hw") => {
    const isPickup = type === "pickup";
    
    // 樂觀更新
    setStudents((prev) => prev.map((s) => {
      if (s.id === studentId) {
        return {
          ...s,
          today_status: {
            ...s.today_status,
            [isPickup ? "pickup_status" : "hw_completed"]: isPickup ? 1 : true
          }
        };
      }
      return s;
    }));

    const { error } = await supabase
      .from("daily_attendance")
      .upsert({
        student_id: studentId,
        date: today,
        [isPickup ? "pickup_status" : "hw_completed"]: isPickup ? 1 : true,
      }, { onConflict: "student_id,date" });

    if (error) {
      alert("更新失敗：" + error.message);
      fetchAttendanceData();
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 font-bold animate-pulse">載入點名資料中...</div>;

  // --- 判斷目前要顯示的年級 (Teacher 端傳入優先，否則用 Admin 的 localGrade) ---
  const activeGrade = teacherGrade || localGrade;
  
  // 只顯示符合目前選擇年級的學生
  const displayStudents = activeGrade === "all" 
    ? students 
    : students.filter(s => s.grade === activeGrade);

  // --- 資料運算 (只針對目前顯示的學生) ---
  const totalStudents = displayStudents.length;
  const totalNotPickedUp = displayStudents.filter(s => s.today_status.pickup_status === 0).length;
  // 作業未完人數 (國中生不計入)
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
      {/* 只有在 Admin 後台 (沒有傳入 teacherGrade) 時，才顯示獨立篩選器 */}
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
            const isJuniorHigh = grade.includes("國"); // 判斷是否為國中
            
            // 缺漏名單 (國中生不檢查作業)
            const missingPickup = gradeStudents.filter(s => s.today_status.pickup_status === 0);
            const missingHw = isJuniorHigh ? [] : gradeStudents.filter(s => !s.today_status.hw_completed);

            const isAllClear = missingPickup.length === 0 && missingHw.length === 0;

            return (
              <div key={grade} className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4 border-b pb-3">
                  <h3 className="text-xl font-bold text-black flex items-center gap-2">
                    {grade}
                  </h3>
                  {isAllClear && (
                    <span className="bg-green-100 text-green-700 font-bold px-3 py-1 rounded-xl text-sm flex items-center gap-1">
                      ✅ 本年級已完成
                    </span>
                  )}
                </div>

                {/* 缺漏名單警示區塊 */}
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

                {/* 學生操作清單 */}
                <div className="grid gap-3">
                  {gradeStudents.map((student) => {
                    const isPickedUp = student.today_status.pickup_status === 1;
                    const isHwDone = student.today_status.hw_completed;
                    
                    // 國中生只要到了就算完成；國小生要兩者皆完
                    const isFullyDone = isJuniorHigh ? isPickedUp : (isPickedUp && isHwDone);

                    return (
                      <div key={student.id} className="flex flex-col md:flex-row justify-between md:items-center border p-4 rounded-2xl bg-gray-50 gap-4">
                        <div>
                          <p className="font-bold text-lg text-black flex items-center gap-2">
                            {student.name}
                            {isFullyDone && <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-md">完成</span>}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateStatus(student.id, "pickup")}
                            disabled={isPickedUp}
                            className={`flex-1 md:flex-none px-4 py-3 rounded-xl font-bold transition-all ${
                              isPickedUp 
                                ? "bg-gray-200 text-gray-500 cursor-not-allowed shadow-inner" 
                                : "bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95"
                            }`}
                          >
                            {isJuniorHigh 
                              ? (isPickedUp ? "✅ 已到班" : "📍 到班點名") 
                              : (isPickedUp ? "✅ 已接到" : "🚙 學校接到")}
                          </button>

                          {/* 只有非國中生 (國小) 才顯示確認作業按鈕 */}
                          {!isJuniorHigh && (
                            <button
                              onClick={() => handleUpdateStatus(student.id, "hw")}
                              disabled={isHwDone}
                              className={`flex-1 md:flex-none px-4 py-3 rounded-xl font-bold transition-all ${
                                isHwDone 
                                  ? "bg-gray-200 text-gray-500 cursor-not-allowed shadow-inner" 
                                  : "bg-green-600 hover:bg-green-700 text-white shadow-md active:scale-95"
                              }`}
                            >
                              {isHwDone ? "✅ 作業完成" : "📝 確認作業"}
                            </button>
                          )}
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