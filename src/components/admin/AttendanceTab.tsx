"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface AttendanceTabProps {
  teacherGrade: string; 
}

export default function AttendanceTab({ teacherGrade }: AttendanceTabProps) {
  const [students, setStudents] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().split("T")[0];

  // 判斷年級屬性
  const isPrimary = teacherGrade.includes("小"); // 小一 ~ 小六
  const isJuniorHigh = teacherGrade.includes("國"); // 國一 ~ 國三

  useEffect(() => {
    fetchData();
  }, [teacherGrade]);

  const fetchData = async () => {
    setLoading(true);
    
    // 1. 抓取學生 (包含家長 LINE ID)
    const { data: studentData } = await supabase
      .from("students")
      .select(`id, name, grade, parents ( phone, line_user_id )`);
    
    // 2. 抓取今日點名紀錄 (包含作業、離班時間)
    const { data: attendanceData } = await supabase
      .from("daily_attendance")
      .select("*")
      .eq("date", today);

    // 3. 組合資料
    const formattedData = studentData?.map(s => {
      const status = attendanceData?.find(a => a.student_id === s.id);
      return {
        ...s,
        today_status: status || { pickup_status: 0, hw_completed: false, left_at: null }
      };
    }) || [];

    // 4. 過濾年級
    let filtered = formattedData;
    if (teacherGrade && teacherGrade !== "全部年級") {
      filtered = filtered.filter(s => s.grade === teacherGrade);
    }

    setStudents(filtered.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant")));
    setLoading(false);
  };

  // --- 1. 簽到邏輯 ---
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBatchPickup = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`確定這 ${selectedIds.length} 位學生已簽到？`)) return;

    const updates = selectedIds.map(id => ({
      student_id: id,
      date: today,
      pickup_status: 1,
      pickup_time: new Date().toISOString()
    }));

    const { error } = await supabase.from("daily_attendance").upsert(updates, { onConflict: "student_id,date" });

    if (!error) {
      // 發送 LINE 通知
      for (const id of selectedIds) {
        const student = students.find(s => s.id === id);
        if (student?.parents?.line_user_id) {
          sendLineNotification(student.parents.line_user_id, `【方華補習班】您的孩子 ${student.name} 已安全到達補習班。`);
        }
      }
      setSelectedIds([]);
      fetchData();
    }
  };

  // --- 2. 作業完成邏輯 (僅限國小) ---
  const handleHwToggle = async (student: any) => {
    const newStatus = !student.today_status.hw_completed;
    
    const { error } = await supabase.from("daily_attendance").upsert({
      student_id: student.id,
      date: today,
      hw_completed: newStatus,
      hw_completed_time: newStatus ? new Date().toISOString() : null
    }, { onConflict: "student_id,date" });

    if (!error) {
      if (newStatus && student.parents?.line_user_id) {
        sendLineNotification(student.parents.line_user_id, `【方華補習班】${student.name} 今日作業已完成，可以準備接送囉！`);
      }
      fetchData();
    }
  };

  // --- 3. 離班邏輯 ---
  const handleLeave = async (student: any) => {
    if (!window.confirm(`確定 ${student.name} 已離班？`)) return;

    const { error } = await supabase.from("daily_attendance").upsert({
      student_id: student.id,
      date: today,
      left_at: new Date().toISOString()
    }, { onConflict: "student_id,date" });

    if (!error) {
      if (student.parents?.line_user_id) {
        sendLineNotification(student.parents.line_user_id, `【方華補習班】${student.name} 已離開補習班，返家途中請注意安全。`);
      }
      fetchData();
    }
  };

  // 通用 LINE 通知函式
  const sendLineNotification = async (token: string, message: string) => {
    try {
      await fetch("/api/line-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message })
      });
    } catch (e) {
      console.error("LINE Notify 失敗", e);
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-500">載入中...</div>;

  return (
    <div className="space-y-8 p-2">
      
      {/* 第一區：尚未簽到 (簽到區) */}
      <section className="bg-blue-50 p-6 rounded-3xl border border-blue-100 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-blue-900">未簽到名單</h2>
            <p className="text-sm text-blue-500">點擊姓名進行批次簽到</p>
          </div>
          {selectedIds.length > 0 && (
            <button onClick={handleBatchPickup} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg animate-bounce">
              確認簽到 ({selectedIds.length} 人)
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {students.filter(s => s.today_status.pickup_status === 0).map(s => (
            <div 
              key={s.id} 
              onClick={() => toggleSelect(s.id)}
              className={`p-4 rounded-2xl border-2 transition text-center ${
                selectedIds.includes(s.id) ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-black border-transparent shadow-sm"
              }`}
            >
              <p className="font-bold text-lg">{s.name}</p>
            </div>
          ))}
          {students.filter(s => s.today_status.pickup_status === 0).length === 0 && (
            <p className="col-span-full text-center text-blue-400 py-4 italic">所有學生皆已簽到 ✨</p>
          )}
        </div>
      </section>

      {/* 第二區：已在班 (管理區) */}
      <section className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
        <h2 className="text-2xl font-bold text-black mb-6">在班學生管理</h2>
        <div className="space-y-4">
          {students.filter(s => s.today_status.pickup_status === 1 && !s.today_status.left_at).map(s => (
            <div key={s.id} className="flex flex-col md:flex-row justify-between items-center p-5 border rounded-3xl bg-gray-50 gap-4">
              <div className="flex flex-col items-center md:items-start">
                <span className="font-black text-black text-xl">{s.name}</span>
                <span className="text-xs text-gray-400">到班時間: {new Date(s.today_status.pickup_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto justify-center">
                {/* 國小部顯示作業勾選 */}
                {isPrimary && (
                  <button 
                    onClick={() => handleHwToggle(s)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition ${
                      s.today_status.hw_completed ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    {s.today_status.hw_completed ? "✅ 作業已完成" : "📝 標記作業完成"}
                  </button>
                )}

                {/* 離班按鈕 */}
                <button 
                  onClick={() => handleLeave(s)}
                  className="bg-slate-800 text-white px-6 py-2 rounded-xl font-bold hover:bg-black transition"
                >
                  離班
                </button>
              </div>
            </div>
          ))}
          {students.filter(s => s.today_status.pickup_status === 1 && !s.today_status.left_at).length === 0 && (
            <p className="text-center text-gray-400 py-10 italic">目前無人在班</p>
          )}
        </div>
      </section>

      {/* 第三區：已離班 (紀錄區) */}
      <section className="bg-gray-100 p-6 rounded-3xl opacity-60">
        <h2 className="text-xl font-bold text-gray-500 mb-4">今日已離班紀錄</h2>
        <div className="flex flex-wrap gap-2">
          {students.filter(s => s.today_status.left_at).map(s => (
            <div key={s.id} className="bg-white px-4 py-2 rounded-full border border-gray-300 text-sm font-medium text-gray-600">
              {s.name} <span className="text-xs ml-1 text-gray-400">({new Date(s.today_status.left_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}