"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function AttendanceSystem() {
  const [students, setStudents] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]); // 批次點名用的選擇清單
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    // 抓取學生、家長資訊以及今日狀態
    const { data } = await supabase
      .from("students")
      .select(`
        id, name, grade,
        parents ( phone, line_user_id ),
        daily_attendance ( pickup_status, hw_completed )
      `);
    
    // 過濾出「今日」的點名狀態 (如果有)
    const formattedData = data?.map(s => ({
      ...s,
      today_status: s.daily_attendance?.find((a: any) => a.date === today) || { pickup_status: 0, hw_completed: false }
    }));

    setStudents(formattedData || []);
    setLoading(false);
  };

  // --- 批次點名邏輯 ---
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBatchPickup = async () => {
    if (selectedIds.length === 0) return;
    
    const confirmMsg = `確定已接到這 ${selectedIds.length} 位學生並發送 LINE 通知？`;
    if (!window.confirm(confirmMsg)) return;

    // 1. 更新資料庫 (Upsert)
    const updates = selectedIds.map(id => ({
      student_id: id,
      date: today,
      pickup_status: 1, // 已接到
      pickup_time: new Date().toISOString()
    }));

    const { error } = await supabase.from("daily_attendance").upsert(updates, { onConflict: "student_id,date" });

    if (!error) {
      // 2. 批次發送 LINE 通知 (呼叫我們之前建立的 API)
      for (const id of selectedIds) {
        const student = students.find(s => s.id === id);
        if (student?.parents?.line_user_id) {
          await fetch("/api/line-notify", {
            method: "POST",
            body: JSON.stringify({
              token: student.parents.line_user_id,
              message: `【方華補習班】您的孩子 ${student.name} 已由老師接到，正前往補習班。`
            })
          });
        }
      }
      alert("批次點名完成！家長已收到通知。");
      setSelectedIds([]);
      fetchData();
    }
  };

  // --- 個別作業通知邏輯 ---
  const handleHwComplete = async (student: any) => {
    if (!window.confirm(`確定通知 ${student.name} 的家長作業已完成？`)) return;

    const { error } = await supabase
      .from("daily_attendance")
      .upsert({
        student_id: student.id,
        date: today,
        hw_completed: true,
        hw_completed_time: new Date().toISOString()
      }, { onConflict: "student_id,date" });

    if (!error && student.parents?.line_user_id) {
      await fetch("/api/line-notify", {
        method: "POST",
        body: JSON.stringify({
          token: student.parents.line_user_id,
          message: `【方華補習班】${student.name} 今日作業已完成，您可以來接小孩囉！`
        })
      });
      alert("已通知家長！");
      fetchData();
    }
  };

  if (loading) return <div className="p-10 text-center">載入中...</div>;

  return (
    <div className="space-y-10">
      {/* 1. 批次點名區 (去學校接人用) */}
      <section className="bg-blue-50 p-6 rounded-3xl shadow-sm border border-blue-100">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-blue-900">去學校接人點名</h2>
            <p className="text-blue-600 text-sm">點選下方小朋友，集合完畢後統一發送</p>
          </div>
          {selectedIds.length > 0 && (
            <button 
              onClick={handleBatchPickup}
              className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg animate-bounce"
            >
              確認接回 ({selectedIds.length} 人)
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {students.filter(s => s.today_status.pickup_status === 0).map(s => (
            <div 
              key={s.id}
              onClick={() => toggleSelect(s.id)}
              className={`cursor-pointer p-4 rounded-2xl border-2 transition-all text-center ${
                selectedIds.includes(s.id) 
                ? "border-blue-600 bg-blue-600 text-white shadow-md scale-95" 
                : "border-white bg-white text-gray-800 shadow-sm"
              }`}
            >
              <p className="font-bold text-lg">{s.name}</p>
              <p className={`text-xs ${selectedIds.includes(s.id) ? "text-blue-100" : "text-gray-400"}`}>{s.grade}</p>
            </div>
          ))}
        </div>
        {students.filter(s => s.today_status.pickup_status === 0).length === 0 && (
          <p className="text-center text-gray-400 py-10">今日學生已全數接到 ✅</p>
        )}
      </section>

      {/* 2. 個別作業完成區 (在補習班用) */}
      <section className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">今日作業狀態清單</h2>
        <div className="space-y-3">
          {students.filter(s => s.today_status.pickup_status === 1).map(s => (
            <div key={s.id} className="flex justify-between items-center p-4 border rounded-2xl hover:bg-gray-50 transition">
              <div>
                <span className="font-bold text-lg mr-2">{s.name}</span>
                <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-md">{s.grade}</span>
              </div>
              
              {s.today_status.hw_completed ? (
                <span className="text-green-600 font-bold bg-green-50 px-4 py-2 rounded-xl border border-green-200">
                  ✅ 作業已完成
                </span>
              ) : (
                <button 
                  onClick={() => handleHwComplete(s)}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-xl font-bold text-sm transition shadow-sm"
                >
                  點擊：作業完成通知
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}