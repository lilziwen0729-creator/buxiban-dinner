"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface AttendanceTabProps {
  teacherGrade: string; // 接收從外部傳進來的年級
}

export default function AttendanceTab({ teacherGrade }: AttendanceTabProps) {
  const [students, setStudents] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 防呆機制：追蹤正在處理中的學生 ID，防止連點
  const [processingIds, setProcessingIds] = useState<string[]>([]);
  
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    fetchData();
  }, [teacherGrade]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. 抓取學生 (包含家長 LINE ID，使用多對多關係表)
      const { data: studentData } = await supabase
        .from("students")
        .select(`
          id, 
          name, 
          grade, 
          student_parent_relations (
            parents ( phone, line_user_id )
          )
        `);
      
      // 2. 抓取今日點名紀錄
      const { data: attendanceData } = await supabase
        .from("daily_attendance")
        .select("*")
        .eq("date", today);

      // 3. 組合資料
      const formattedData = studentData?.map((s: any) => { // 加上 : any 讓 TypeScript 閉嘴
        const status = attendanceData?.find(a => a.student_id === s.id);
        
        // 這裡多做一個判斷來抓 LINE ID
        const relations = s.student_parent_relations?.[0];
        const parents = relations?.parents;
  
        // 處理 parents 可能是物件或陣列的情況
        const lineId = Array.isArray(parents) 
          ? parents[0]?.line_user_id 
          : (parents as any)?.line_user_id;

        return {
          ...s,
          lineUserId: lineId,
          today_status: status || { pickup_status: 0, hw_completed: false, left_at: null }
        };
      }) || [];

      // 4. 過濾年級並排序
      let filtered = formattedData;
      if (teacherGrade && teacherGrade !== "全部年級") {
        filtered = filtered.filter(s => s.grade === teacherGrade);
      }

      setStudents(filtered.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant")));
    } catch (err) {
      console.error("資料抓取失敗", err);
    } finally {
      setLoading(false);
    }
  };

  // --- 通用：進入/解除處理狀態 ---
  const startProcessing = (id: string) => setProcessingIds(prev => [...prev, id]);
  const endProcessing = (id: string) => setProcessingIds(prev => prev.filter(i => i !== id));

  // --- 1. 簽到邏輯 (分流通知) ---
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBatchPickup = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`確認這 ${selectedIds.length} 位學生已簽到並發送 LINE 通知？`)) return;

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
        if (student?.lineUserId) {
          const isJuniorHigh = student.grade.includes("國");
          const msg = isJuniorHigh 
            ? `【方華補習班】您的孩子 ${student.name} 已到班，開始今日課程。`
            : `【方華補習班】您的孩子 ${student.name} 已由老師接到，安全到達補習班。`;
          sendLineNotification(student.lineUserId, msg);
        }
      }
      setSelectedIds([]);
      fetchData();
    }
  };

  // --- 2. 作業完成邏輯 (含最強防呆) ---
  const handleHwToggle = async (student: any) => {
    const isCurrentlyDone = student.today_status.hw_completed;

    // 防呆：確認視窗
    if (isCurrentlyDone) {
      if (!window.confirm(`⚠️ ${student.name} 已標記完成。確定改回「未完成」？\n(此動作不會發送通知)`)) return;
    } else {
      if (!window.confirm(`確認通知 ${student.name} 家長「作業已完成」？`)) return;
    }

    if (processingIds.includes(student.id)) return;
    startProcessing(student.id);

    try {
      const newStatus = !isCurrentlyDone;
      const { error } = await supabase.from("daily_attendance").upsert({
        student_id: student.id,
        date: today,
        hw_completed: newStatus,
        hw_completed_time: newStatus ? new Date().toISOString() : null
      }, { onConflict: "student_id,date" });

      if (error) throw error;

      if (newStatus && student.lineUserId) {
        await sendLineNotification(student.lineUserId, `【方華補習班】${student.name} 今日作業已完成，可以準備來接小朋友囉！`);
      }
      await fetchData();
    } catch (err) {
      alert("系統繁忙，請稍後再試");
    } finally {
      endProcessing(student.id);
    }
  };

  // --- 3. 離班邏輯 (分流通知) ---
  const handleLeave = async (student: any) => {
    if (!window.confirm(`確定 ${student.name} 已離班？這將發送離班通知給家長。`)) return;

    if (processingIds.includes(student.id)) return;
    startProcessing(student.id);

    try {
      const { error } = await supabase.from("daily_attendance").upsert({
        student_id: student.id,
        date: today,
        left_at: new Date().toISOString()
      }, { onConflict: "student_id,date" });

      if (error) throw error;

      if (student.lineUserId) {
        const isJuniorHigh = student.grade.includes("國");
        const msg = isJuniorHigh
          ? `【方華補習班】${student.name} 今日課程結束，現已離班返家，請留意到家時間。`
          : `【方華補習班】${student.name} 已由家長接走離開補習班，祝您路途平安。`;
        await sendLineNotification(student.lineUserId, msg);
      }
      await fetchData();
    } catch (err) {
      alert("離班處理失敗");
    } finally {
      endProcessing(student.id);
    }
  };

  const sendLineNotification = async (token: string, message: string) => {
    try {
      await fetch("/api/line-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message })
      });
    } catch (e) {
      console.error("LINE 通知失敗");
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-400">載入中...</div>;

  return (
    <div className="space-y-8">
      
      {/* 1. 未簽到區 */}
      <section className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-blue-900">未簽到名單</h2>
          {selectedIds.length > 0 && (
            <button onClick={handleBatchPickup} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg animate-pulse">
              確認簽到 ({selectedIds.length} 人)
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {students.filter(s => s.today_status.pickup_status === 0).map(s => (
            <div 
              key={s.id} 
              onClick={() => toggleSelect(s.id)}
              className={`p-5 rounded-2xl border-2 transition text-center shadow-sm ${
                selectedIds.includes(s.id) ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-black border-transparent"
              }`}
            >
              <p className="font-bold text-lg">{s.name}</p>
            </div>
          ))}
          {students.filter(s => s.today_status.pickup_status === 0).length === 0 && (
            <p className="col-span-full text-center text-blue-300 py-4">全員到齊 🎉</p>
          )}
        </div>
      </section>

      {/* 2. 在班管理區 (含作業與離班) */}
      <section className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
        <h2 className="text-2xl font-bold text-black mb-6">在班管理</h2>
        <div className="space-y-4">
          {students.filter(s => s.today_status.pickup_status === 1 && !s.today_status.left_at).map(s => {
            const isStudentPrimary = s.grade.includes("小");
            const isProcessing = processingIds.includes(s.id);

            return (
              <div key={s.id} className="flex flex-col md:flex-row justify-between items-center p-5 border rounded-3xl bg-gray-50">
                <div className="text-center md:text-left mb-4 md:mb-0">
                  <span className="font-black text-black text-xl">{s.name}</span>
                  <p className="text-xs text-gray-400">到班: {new Date(s.today_status.pickup_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 justify-center">
                  {/* 作業按鈕 (僅限國小) */}
                  {isStudentPrimary && (
                    <button 
                      onClick={() => handleHwToggle(s)}
                      disabled={isProcessing}
                      className={`px-5 py-2.5 rounded-xl font-bold transition ${
                        isProcessing ? "bg-gray-200 text-gray-400" :
                        s.today_status.hw_completed ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700 shadow-sm"
                      }`}
                    >
                      {isProcessing ? "處理中..." : s.today_status.hw_completed ? "✅ 作業完成" : "📝 標記作業完成"}
                    </button>
                  )}

                  {/* 離班按鈕 (通用) */}
                  <button 
                    onClick={() => handleLeave(s)}
                    disabled={isProcessing}
                    className={`px-8 py-2.5 rounded-xl font-bold transition ${
                      isProcessing ? "bg-gray-200 text-gray-400" : "bg-slate-800 text-white hover:bg-black"
                    }`}
                  >
                    {isProcessing ? "..." : "離班"}
                  </button>
                </div>
              </div>
            );
          })}
          {students.filter(s => s.today_status.pickup_status === 1 && !s.today_status.left_at).length === 0 && (
            <p className="text-center text-gray-400 py-10">目前無人在班</p>
          )}
        </div>
      </section>

      {/* 3. 已離班區 */}
      <section className="bg-gray-50 p-6 rounded-3xl opacity-50">
        <h2 className="text-lg font-bold text-gray-400 mb-4">今日已離班</h2>
        <div className="flex flex-wrap gap-2">
          {students.filter(s => s.today_status.left_at).map(s => (
            <div key={s.id} className="bg-white px-4 py-2 rounded-full border border-gray-200 text-sm text-gray-400">
              {s.name} ({new Date(s.today_status.left_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}