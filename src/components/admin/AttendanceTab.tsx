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

export default function AttendanceTab() {
  const [students, setStudents] = useState<StudentWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const today = getToday();

  // 定義年級排序邏輯
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

  const handleUpdateStatus = async (
    studentId: string, 
    type: "pickup" | "hw"
  ) => {
    const isPickup = type === "pickup";
    
    // 1. 樂觀 UI 更新：讓畫面「瞬間」改變，不用等資料庫回應，手感更好
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

    // 2. 背景更新資料庫
    const { error } = await supabase
      .from("daily_attendance")
      .upsert({
        student_id: studentId,
        date: today,
        [isPickup ? "pickup_status" : "hw_completed"]: isPickup ? 1 : true,
      }, { onConflict: "student_id,date" });

    // 如果網路斷線或資料庫報錯，才重新抓取舊資料還原
    if (error) {
      alert("更新失敗：" + error.message);
      fetchAttendanceData();
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 font-bold animate-pulse">載入點名資料中...</div>;

  // --- 資料運算與分組 ---
  const totalStudents = students.length;
  const totalNotPickedUp = students.filter(s => s.today_status.pickup_status === 0).length;
  const totalHwNotDone = students.filter(s => !s.today_status.hw_completed).length;

  // 將學生按年級分組
  const studentsByGrade = students.reduce((acc, student) => {
    if (!acc[student.grade]) acc[student.grade] = [];
    acc[student.grade].push(student);
    return acc;
  }, {} as Record<string, StudentWithStatus[]>);

  // 照年級順序排序取出
  const sortedGrades = Object.keys(studentsByGrade).sort(
    (a, b) => gradeOrder.indexOf(a) - gradeOrder.indexOf(b)
  );

  return (
    <div className="space-y-6">
      {/* 頂部全校總覽看板 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-blue-500">
          <p className="text-gray-500 text-sm font-bold">今日應到</p>
          <p className="text-2xl font-black text-black mt-1">{totalStudents} <span className="text-sm font-normal text-gray-500">人</span></p>
        </div>
        <div className="bg-red-50 rounded-2xl p-4 shadow-sm border-l-4 border-red-500">
          <p className="text-red-700 text-sm font-bold">尚未接到</p>
          <p className="text-2xl font-black text-red-600 mt-1">{totalNotPickedUp} <span className="text-sm font-normal text-red-400">人</span></p>
        </div>
        <div className="bg-yellow-50 rounded-2xl p-4 shadow-sm border-l-4 border-yellow-500">
          <p className="text-yellow-700 text-sm font-bold">作業未完</p>
          <p className="text-2xl font-black text-yellow-600 mt-1">{totalHwNotDone} <span className="text-sm font-normal text-yellow-500">人</span></p>
        </div>
      </div>

      {totalStudents === 0 ? (
        <div className="bg-white rounded-3xl p-8 shadow text-center">
          <p className="text-gray-500 text-lg">目前還沒有新增任何學生資料</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedGrades.map((grade) => {
            const gradeStudents = studentsByGrade[grade];
            
            // 找出這個年級未完成的學生名單
            const missingPickup = gradeStudents.filter(s => s.today_status.pickup_status === 0);
            const missingHw = gradeStudents.filter(s => !s.today_status.hw_completed);

            // 如果這個年級大家都接到了且作業都寫完了，給個綠色打勾標示
            const isAllClear = missingPickup.length === 0 && missingHw.length === 0;

            return (
              <div key={grade} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                {/* 年級標題與狀態 */}
                <div className="flex justify-between items-center mb-4 border-b pb-3">
                  <h3 className="text-2xl font-bold text-black flex items-center gap-2">
                    {grade}
                    <span className="text-sm bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-medium">
                      共 {gradeStudents.length} 人
                    </span>
                  </h3>
                  {isAllClear && (
                    <span className="bg-green-100 text-green-700 font-bold px-3 py-1 rounded-xl flex items-center gap-1">
                      ✅ 本年級已全數完成
                    </span>
                  )}
                </div>

                {/* 缺漏名單警示區塊 (超實用功能) */}
                {!isAllClear && (
                  <div className="flex flex-col md:flex-row gap-3 mb-6">
                    {missingPickup.length > 0 && (
                      <div className="flex-1 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm font-medium border border-red-100">
                        <span className="font-bold flex items-center gap-1 mb-1">🚙 尚未接到 ({missingPickup.length})</span>
                        {missingPickup.map(s => s.name).join("、")}
                      </div>
                    )}
                    {missingHw.length > 0 && (
                      <div className="flex-1 bg-yellow-50 text-yellow-800 px-4 py-3 rounded-xl text-sm font-medium border border-yellow-100">
                        <span className="font-bold flex items-center gap-1 mb-1">📝 作業未完 ({missingHw.length})</span>
                        {missingHw.map(s => s.name).join("、")}
                      </div>
                    )}
                  </div>
                )}

                {/* 學生操作卡片清單 */}
                <div className="grid gap-3">
                  {gradeStudents.map((student) => {
                    const isPickedUp = student.today_status.pickup_status === 1;
                    const isHwDone = student.today_status.hw_completed;

                    return (
                      <div key={student.id} className="flex flex-col md:flex-row justify-between md:items-center border p-4 rounded-2xl bg-gray-50 hover:bg-white transition-colors gap-4">
                        <div>
                          <p className="font-bold text-xl text-black flex items-center gap-2">
                            {student.name}
                            {/* 學生個人狀態小標籤 */}
                            {isPickedUp && isHwDone && <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-md">完成</span>}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">家長電話: {student.parents?.phone || "無紀錄"}</p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateStatus(student.id, "pickup")}
                            disabled={isPickedUp}
                            className={`flex-1 md:flex-none px-4 py-3 rounded-xl font-bold transition-all ${
                              isPickedUp 
                                ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-inner" 
                                : "bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95"
                            }`}
                          >
                            {isPickedUp ? "已接到" : "🚙 學校接到"}
                          </button>

                          <button
                            onClick={() => handleUpdateStatus(student.id, "hw")}
                            disabled={isHwDone}
                            className={`flex-1 md:flex-none px-4 py-3 rounded-xl font-bold transition-all ${
                              isHwDone 
                                ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-inner" 
                                : "bg-green-600 hover:bg-green-700 text-white shadow-md active:scale-95"
                            }`}
                          >
                            {isHwDone ? "作業完成" : "📝 確認作業"}
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