"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// 定義參數型別
interface AttendanceTabProps {
  teacherGrade: string; // 接收從外部傳進來的年級
}

export default function AttendanceTab({ teacherGrade }: AttendanceTabProps) {
  const [students, setStudents] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    fetchData();
  }, [teacherGrade]); // 當年級切換時，重新抓取或過濾資料

  const fetchData = async () => {
    setLoading(true);
    
    // 1. 先抓所有學生
    const { data: studentData } = await supabase
      .from("students")
      .select(`id, name, grade, parents ( phone, line_user_id )`);
    
    // 2. 再抓今日的點名紀錄
    const { data: attendanceData } = await supabase
      .from("daily_attendance")
      .select("*")
      .eq("date", today);

    // 3. 把兩者組合起來
    const formattedData = studentData?.map(s => {
      const status = attendanceData?.find(a => a.student_id === s.id);
      return {
        ...s,
        today_status: status || { pickup_status: 0, hw_completed: false }
      };
    });

    // 4. 根據年級過濾
    let filtered = formattedData || [];
    if (teacherGrade && teacherGrade !== "全部年級") {
      filtered = filtered.filter(s => s.grade === teacherGrade);
    }

    setStudents(filtered);
    setLoading(false);
  };

  // --- 批次點名邏輯 (保持不變) ---
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBatchPickup = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`確定已到這 ${selectedIds.length} 位學生並發送通知？`)) return;

    const updates = selectedIds.map(id => ({
      student_id: id,
      date: today,
      pickup_status: 1,
      pickup_time: new Date().toISOString()
    }));

    const { error } = await supabase.from("daily_attendance").upsert(updates, { onConflict: "student_id,date" });

    if (!error) {
      for (const id of selectedIds) {
        const student = students.find(s => s.id === id);
        if (student?.parents?.line_user_id) {
          await fetch("/api/line-notify", {
            method: "POST",
            body: JSON.stringify({
              token: student.parents.line_user_id,
              message: `【方華補習班】您的孩子 ${student.name} 已由老師接到。`
            })
          });
        }
      }
      alert("批次點名成功！");
      setSelectedIds([]);
      fetchData();
    }
  };

const handleHwComplete = async (student: any) => {
    // 1. 彈出確認視窗
    if (!window.confirm(`確認通知 ${student.name} 家長作業已完成？`)) return;

    // 2. 更新資料庫
    const { error } = await supabase
      .from("daily_attendance")
      .upsert({
        student_id: student.id,
        date: today,
        hw_completed: true, // 標記為完成
        hw_completed_time: new Date().toISOString()
      }, { onConflict: "student_id,date" });

    if (error) {
      alert("資料庫更新失敗：" + error.message);
      return;
    }

    // 3. 嘗試發送 LINE (但不論有沒有發送成功，後面都要更新介面)
    const lineToken = student.parents?.line_user_id;
    if (lineToken) {
      try {
        await fetch("/api/line-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: lineToken,
            message: `【方華補習班】${student.name} 今日作業已完成，您可以來接小朋友囉！`
          })
        });
      } catch (e) {
        console.error("LINE 發送出錯，但狀態已存檔", e);
      }
    }

    // 4. 無論 LINE 有沒有送出，都刷新畫面並提示
    alert(lineToken ? "🎉 已通知家長並更新狀態！" : "✅ 狀態已更新（此家長未連動 LINE）");
    await fetchData(); 
  };

  if (loading) return <div className="p-10 text-center text-black">載入中...</div>;

  return (
    <div className="space-y-8">
      {/* 介面渲染部分與之前相同... */}
      <section className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-blue-900">{teacherGrade} 點名</h2>
          {selectedIds.length > 0 && (
            <button onClick={handleBatchPickup} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold">
              確認已到 ({selectedIds.length} 人)
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {students.filter(s => s.today_status.pickup_status === 0).map(s => (
            <div 
              key={s.id} 
              onClick={() => toggleSelect(s.id)}
              className={`p-4 rounded-2xl border-2 cursor-pointer transition ${
                selectedIds.includes(s.id) ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-black border-transparent"
              }`}
            >
              <p className="font-bold">{s.name}</p>
              <p className="text-xs opacity-70">{s.grade}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white p-6 rounded-3xl border border-gray-200">
        <h2 className="text-2xl font-bold text-black mb-6">作業完成通知</h2>
        <div className="space-y-3">
          {students.filter(s => s.today_status.pickup_status === 1).map(s => (
            <div key={s.id} className="flex justify-between items-center p-4 border rounded-2xl">
              <span className="font-bold text-black text-lg">{s.name} ({s.grade})</span>
              {s.today_status.hw_completed ? (
                <span className="text-green-600 font-bold bg-green-50 px-4 py-2 rounded-lg">✅ 已通知</span>
              ) : (
                <button onClick={() => handleHwComplete(s)} className="bg-orange-500 text-white px-4 py-2 rounded-lg font-bold">
                  作業完成通知
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}