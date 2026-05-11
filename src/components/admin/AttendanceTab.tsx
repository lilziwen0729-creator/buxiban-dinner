"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

type Student = {
  id: string;
  name: string;
  grade: string;
  parents?: {
    phone: string;
    line_user_id?: string;
  };
  daily_attendance?: {
    pickup_status: number;
    hw_completed: boolean;
  }[];
};

export default function AttendanceTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const today = getToday();

  useEffect(() => {
    fetchAttendanceData();
  }, [today]);

  const fetchAttendanceData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("students")
      .select(`
        id, name, grade,
        parents ( phone, line_user_id ),
        daily_attendance ( pickup_status, hw_completed )
      `)
      // 注意：這裡如果 daily_attendance 沒資料，select 可能會抓不到今日預設值
      // 建議在 SQL 那邊確保有 upsert 邏輯
      .eq("daily_attendance.date", today);

    if (error) {
      console.error("讀取資料失敗:", error);
    } else {
      setStudents((data as unknown as Student[]) || []);
    }
    setLoading(false);
  };

  // 修正點：參數拿掉沒用到的 status，並確保傳入順序正確
  const handleUpdateStatus = async (
    studentId: string, 
    type: "pickup" | "hw", 
    studentName: string
  ) => {
    const isPickup = type === "pickup";
    
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

    alert(`${studentName} 的狀態已更新！`);
    fetchAttendanceData();
  };

  if (loading) return <div className="p-8 text-center text-gray-500">載入點名資料中...</div>;

  return (
    <div className="bg-white rounded-3xl p-6 shadow">
      <h2 className="text-3xl font-bold text-black mb-6">今日接送與作業確認</h2>
      
      <div className="grid gap-4">
        {students.map((student) => {
          // 取得狀態快照
          const status = student.daily_attendance?.[0] || { pickup_status: 0, hw_completed: false };
          const isPickedUp = status.pickup_status === 1;
          const isHwDone = status.hw_completed;

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
                  // 修正點：拿掉原本傳入的 status
                  onClick={() => handleUpdateStatus(student.id, "pickup", student.name)}
                  disabled={isPickedUp}
                  className={`px-5 py-3 rounded-xl font-bold transition ${
                    isPickedUp 
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed" 
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  {isPickedUp ? "✅ 已接到" : "🚙 學校接到"}
                </button>

                <button
                  // 修正點：拿掉原本傳入的 status
                  onClick={() => handleUpdateStatus(student.id, "hw", student.name)}
                  disabled={isHwDone}
                  className={`px-5 py-3 rounded-xl font-bold transition ${
                    isHwDone 
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed" 
                      : "bg-green-600 hover:bg-green-700 text-white"
                  }`}
                >
                  {isHwDone ? "✅ 作業完成" : "📝 確認作業"}
                </button>
              </div>
            </div>
          );
        })}
        {students.length === 0 && (
          <p className="text-gray-500 text-center py-4">今天尚無學生紀錄</p>
        )}
      </div>
    </div>
  );
}