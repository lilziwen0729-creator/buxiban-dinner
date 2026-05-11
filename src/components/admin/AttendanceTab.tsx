"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

// 定義清楚資料格式，避免紅字
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

  useEffect(() => {
    fetchAttendanceData();
  }, [today]);

  const fetchAttendanceData = async () => {
    setLoading(true);

    try {
      // 1. 抓取「所有學生」與他們的家長聯絡資料 (不受今天有沒有點名影響)
      const { data: studentsData, error: studentError } = await supabase
        .from("students")
        .select(`
          id, name, grade,
          parents ( phone, line_user_id )
        `);

      if (studentError) throw studentError;

      // 2. 單獨抓取「今天的」點名紀錄
      const { data: attendanceData, error: attendanceError } = await supabase
        .from("daily_attendance")
        .select("student_id, pickup_status, hw_completed")
        .eq("date", today);

      if (attendanceError) throw attendanceError;

      // 3. 把學生資料跟點名紀錄組合起來
      const mergedData = (studentsData || []).map((student) => {
        // 找找看這個學生今天有沒有紀錄
        const record = (attendanceData || []).find((a) => a.student_id === student.id);
        
        // Supabase 的關聯資料有時候會回傳陣列，我們處理一下
        const parentData = Array.isArray(student.parents) ? student.parents[0] : student.parents;

        return {
          ...student,
          parents: parentData,
          today_status: record ? { 
            pickup_status: record.pickup_status, 
            hw_completed: record.hw_completed 
          } : { 
            pickup_status: 0, 
            hw_completed: false 
          } // 如果今天還沒點名，就給預設值
        };
      });

      // 更新到畫面上
      setStudents(mergedData as any);
    } catch (error) {
      console.error("讀取資料失敗:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (
    studentId: string, 
    type: "pickup" | "hw", 
    studentName: string
  ) => {
    const isPickup = type === "pickup";
    
    // 寫入資料庫
    const { error } = await supabase
      .from("daily_attendance")
      .upsert({
        student_id: studentId,
        date: today,
        [isPickup ? "pickup_status" : "hw_completed"]: isPickup ? 1 : true,
      }, { onConflict: "student_id,date" });

    if (error) {
      alert("更新失敗：" + error.message);
      return;
    }

    // 成功後提示並重新整理畫面資料
    alert(`${studentName} 的狀態已更新！`);
    fetchAttendanceData(); 
  };

  if (loading) return <div className="p-8 text-center text-gray-500">載入點名資料中...</div>;

  return (
    <div className="bg-white rounded-3xl p-6 shadow">
      <h2 className="text-3xl font-bold text-black mb-6">今日接送與作業確認</h2>
      
      <div className="grid gap-4">
        {students.map((student) => {
          // 直接讀取我們剛剛組合好的狀態
          const isPickedUp = student.today_status.pickup_status === 1;
          const isHwDone = student.today_status.hw_completed;

          return (
            <div key={student.id} className="flex justify-between items-center border p-5 rounded-2xl bg-gray-50">
              <div>
                <p className="font-bold text-xl text-black">
                  {student.name} <span className="text-sm font-normal text-gray-500 ml-2">{student.grade}</span>
                </p>
                <p className="text-sm text-gray-500 mt-1">家長電話: {student.parents?.phone || "無紀錄"}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleUpdateStatus(student.id, "pickup", student.name)}
                  disabled={isPickedUp}
                  className={`px-5 py-3 rounded-xl font-bold transition ${
                    isPickedUp 
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed" 
                      : "bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                  }`}
                >
                  {isPickedUp ? "✅ 已接到" : "🚙 學校接到"}
                </button>

                <button
                  onClick={() => handleUpdateStatus(student.id, "hw", student.name)}
                  disabled={isHwDone}
                  className={`px-5 py-3 rounded-xl font-bold transition ${
                    isHwDone 
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed" 
                      : "bg-green-600 hover:bg-green-700 text-white shadow-md"
                  }`}
                >
                  {isHwDone ? "✅ 作業完成" : "📝 確認作業"}
                </button>
              </div>
            </div>
          );
        })}
        {students.length === 0 && (
          <p className="text-gray-500 text-center py-4">目前還沒有新增任何學生資料</p>
        )}
      </div>
    </div>
  );
}