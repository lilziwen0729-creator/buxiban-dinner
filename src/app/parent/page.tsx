// 檔案路徑：src/app/parent/page.tsx
"use client";

import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import OrderSettings from "@/components/parent/OrderSettings"; // 👈 載入我們剛做好的積木

export type Student = {
  id: string;
  name: string;
  grade: string;
  fixed_days_off: string[];
  today_cancelled: boolean;
  auto_ordered?: boolean;
  balance: number;
};

export default function ParentPage() {
  // --- 1. 狀態變數 (你剛剛不小心覆蓋掉的都在這！) ---
  const [loading, setLoading] = useState(true);
  const [lineUserId, setLineUserId] = useState("");
  const [parentData, setParentData] = useState<any>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState("order");
  const [transactions, setTransactions] = useState<any[]>([]);
  
  const [bindPhone, setBindPhone] = useState("");
  const [isBinding, setIsBinding] = useState(false);

  const taipeiHour = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Taipei",
    hour: "numeric",
    hour12: false,
  });
  const isLocked = Number(taipeiHour) >= 12;

  // --- 2. 初始化與資料抓取函數 ---
  useEffect(() => {
    const initLiff = async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) throw new Error("環境變數 NEXT_PUBLIC_LIFF_ID 缺失");
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) { liff.login(); return; }
        const profile = await liff.getProfile();
        setLineUserId(profile.userId);
        await checkBinding(profile.userId);
      } catch (err: any) {
        console.error(err);
        setLoading(false);
      }
    };
    initLiff();
  }, []);

  const checkBinding = async (userId: string) => {
    setLoading(true);
    try {
      const { data: parent } = await supabase.from("parents").select("id").eq("line_user_id", userId).maybeSingle();
      if (parent) {
        setParentData(parent);
        const { data: relations } = await supabase
          .from("student_parent_relations")
          .select(`students ( id, name, grade, balance, fixed_days_off )`)
          .eq("parent_id", parent.id);

        if (relations && relations.length > 0) {
          const rawStudents = relations.map((r: any) => r.students);
          await refreshStudentStatus(rawStudents);
        }
      }
    } catch (err) {
      console.error("檢查綁定失敗", err);
    } finally {
      setLoading(false);
    }
  };

  const refreshStudentStatus = async (studentList: any[]) => {
    const today = getToday();
    const weekMap: any = { 1: "週一", 2: "週二", 3: "週三", 4: "週四", 5: "週五" };
    const todayWeek = weekMap[new Date().getDay()];

    const updatedStudents = await Promise.all(
      studentList.map(async (student) => {
        const { data: order } = await supabase.from("orders").select("*").eq("student_id", student.id).eq("order_date", today).maybeSingle();
        return {
          ...student,
          today_cancelled: !order,
          auto_ordered: student.fixed_days_off?.includes(todayWeek),
        };
      })
    );

    setStudents(updatedStudents);
    if (updatedStudents.length > 0) {
      if (!selectedId) {
        setSelectedId(updatedStudents[0].id);
        fetchTransactions(updatedStudents[0].id);
      } else {
        fetchTransactions(selectedId);
      }
    }
  };

  const handleBind = async () => {
    if (!/^09\d{8}$/.test(bindPhone)) return alert("請輸入正確的手機號碼 (09xxxxxxxx)");
    setIsBinding(true);
    try {
      const { data: parentRecord } = await supabase.from("parents").select("id, line_user_id").eq("phone", bindPhone).maybeSingle();
      if (!parentRecord) return alert("❌ 找不到此手機號碼！請先聯絡補習班老師。");
      if (parentRecord.line_user_id && parentRecord.line_user_id !== lineUserId) return alert("⚠️ 此手機號碼已被綁定。");
      const { error: updateError } = await supabase.from("parents").update({ line_user_id: lineUserId }).eq("id", parentRecord.id);
      if (updateError) throw updateError;
      alert("🎉 綁定成功！");
      await checkBinding(lineUserId);
    } catch (err: any) {
      alert("綁定失敗：" + err.message);
    } finally {
      setIsBinding(false);
    }
  };

  const fetchTransactions = async (studentId: string) => {
    const { data } = await supabase.from("transactions").select("*").eq("student_id", studentId).order("created_at", { ascending: false });
    setTransactions(data || []);
  };

  const toggleTodayOrder = async () => {
    const selectedStudent = students.find(s => s.id === selectedId);
    if (!selectedStudent || isLocked) return;
    const today = getToday();
    setLoading(true);
    try {
      if (selectedStudent.today_cancelled) {
        await supabase.from("orders").upsert({ student_id: selectedId, order_date: today, received: false }, { onConflict: "student_id,order_date" });
      } else {
        await supabase.from("orders").delete().eq("student_id", selectedId).eq("order_date", today);
      }
      await refreshStudentStatus(students);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // --- 3. 修復防當機的 每週固定天數切換邏輯 ---
  const toggleFixedDay = async (day: string) => {
    const selectedStudent = students.find(s => s.id === selectedId);
    if (!selectedStudent) return;

    // 🔴 關鍵修復：防止 fixed_days_off 是 null
    const currentDays = selectedStudent.fixed_days_off || []; 

    // 計算新的勾選陣列
    const updated = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day];

    // 核心邏輯：只要家長有勾選任何一天，auto_order 就要變 true
    const isAutoOrderEnabled = updated.length > 0;

    try {
      const { error } = await supabase
        .from("students")
        .update({ 
          fixed_days_off: updated,
          auto_order: isAutoOrderEnabled 
        })
        .eq("id", selectedId);

      if (error) throw error;

      // 更新畫面
      setStudents(prev => prev.map(s => 
        s.id === selectedId 
          ? { ...s, fixed_days_off: updated, auto_ordered: isAutoOrderEnabled } 
          : s
      ));
    } catch (err) {
      console.error("更新自動訂餐失敗", err);
      alert("更新失敗，請重試");
    }
  };

  // --- 4. 畫面渲染 ---
  if (loading) return <div className="min-h-screen flex flex-col items-center justify-center bg-white"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div><p className="text-blue-600 font-bold">驗證中，請稍候...</p></div>;

  if (!parentData) {
    return (
      <main className="min-h-screen bg-blue-50 p-6 flex flex-col justify-center items-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-blue-900 mb-2">家長綁定</h1>
          <p className="text-gray-500 mb-6">請輸入您在補習班留的手機號碼</p>
          <input type="tel" value={bindPhone} onChange={(e) => setBindPhone(e.target.value)} placeholder="0912345678" className="w-full border-2 border-blue-100 px-4 py-4 rounded-2xl mb-4 text-center text-2xl focus:border-blue-500 outline-none text-black" />
          <button onClick={handleBind} disabled={isBinding} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-blue-700 transition">{isBinding ? "正在綁定..." : "確認綁定"}</button>
        </div>
      </main>
    );
  }

  const currentStudent = students.find(s => s.id === selectedId);
  if (!currentStudent) return <div className="p-10 text-center">查無學生資料，請洽管理員。</div>;

  return (
    <main className="min-h-screen bg-gray-100 p-4 flex justify-center">
      <div className="w-full max-w-xl space-y-5">
        
        {/* 頂部標題 */}
        <div className="bg-blue-600 rounded-3xl shadow p-6 text-white flex justify-between items-start">
          <div>
            <p className="font-bold opacity-80 text-sm">方華補習班 楊梅校</p>
            <h1 className="text-3xl font-bold mt-1">家長中心</h1>
          </div>
          <div className="bg-white/20 px-3 py-1 rounded-full text-xs">LINE 已連線</div>
        </div>

        {/* Tab 切換 */}
        <div className="flex bg-white rounded-2xl p-1 shadow">
          {["order", "wallet"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 py-3 rounded-xl font-bold transition ${tab === t ? "bg-blue-600 text-white" : "text-gray-500"}`}>
              {t === "order" ? "訂餐設定" : "儲值/紀錄"}
            </button>
          ))}
        </div>

        {/* 學生選擇條 */}
        <div className="bg-white rounded-3xl shadow p-4">
          <p className="text-xs text-gray-400 mb-2 ml-1">切換學生：</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {students.map((s) => (
              <button key={s.id} onClick={() => { setSelectedId(s.id); fetchTransactions(s.id); }} className={`px-4 py-2 rounded-full whitespace-nowrap font-bold border-2 transition ${selectedId === s.id ? "bg-blue-100 border-blue-600 text-blue-700" : "bg-white border-gray-100 text-gray-400"}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* 核心組件：訂餐設定 OR 錢包紀錄 */}
        {tab === "order" ? (
          <OrderSettings 
            student={currentStudent} 
            isLocked={isLocked} 
            onToggleToday={toggleTodayOrder} 
            onToggleFixed={toggleFixedDay} 
          />
        ) : (
          <div className="bg-white rounded-3xl shadow p-6">
            <h3 className="font-bold text-black mb-5">交易紀錄 ({currentStudent.name})</h3>
            <div className="space-y-4">
              {transactions.length === 0 ? (
                <p className="text-gray-400 text-center py-10">尚無紀錄</p>
              ) : (
                transactions.map((tx) => (
                  <div key={tx.id} className="flex justify-between items-center border-b pb-3">
                    <div>
                      <p className="font-bold text-gray-800">{tx.description || "餐費變動"}</p>
                      <p className="text-xs text-gray-400">{new Date(tx.created_at).toLocaleString("zh-TW")}</p>
                    </div>
                    <p className={`font-bold ${tx.amount > 0 ? "text-green-600" : "text-red-500"}`}>
                      {tx.amount > 0 ? "+" : ""}{tx.amount}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="text-center text-gray-300 text-xs py-4">
          方華管理系統 V2.0 - LINE LIFF 連線中
        </div>
      </div>
    </main>
  );
}