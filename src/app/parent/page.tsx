"use client";

import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

// --- 型別定義 ---
type Student = {
  id: string;
  name: string;
  grade: string;
  fixed_days: string[];
  today_cancelled: boolean;
  auto_ordered?: boolean;
  balance: number;
};

export default function ParentPage() {
  // --- 狀態管理 ---
  const [loading, setLoading] = useState(true);
  const [lineUserId, setLineUserId] = useState("");
  const [parentData, setParentData] = useState<any>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState("order");
  const [transactions, setTransactions] = useState<any[]>([]);
  
  // 綁定用狀態
  const [bindPhone, setBindPhone] = useState("");
  const [isBinding, setIsBinding] = useState(false);

  // 鎖定時間判斷 (中午 12:00)
  const taipeiHour = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Taipei",
    hour: "numeric",
    hour12: false,
  });
  const isLocked = Number(taipeiHour) >= 12;

  // --- 1. 初始化 LIFF 與 登入檢查 ---
    const initLiff = async () => {
  try {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      throw new Error("找不到 LIFF ID，請檢查環境變數設定");
    }

    await liff.init({ liffId });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    const profile = await liff.getProfile();
    setLineUserId(profile.userId);
    await checkBinding(profile.userId);
  } catch (err: any) {
    console.error("LIFF Init Failed", err);
    // 把錯誤印在畫面上，不然我們看不到手機的 console
    alert("系統啟動失敗: " + err.message);
    setLoading(false); 
  }
};

  // --- 2. 檢查資料庫是否已綁定 LINE ---
  const checkBinding = async (userId: string) => {
    setLoading(true);
    const { data: parent, error } = await supabase
      .from("parents")
      .select(`*, students (*)`)
      .eq("line_user_id", userId)
      .maybeSingle();

    if (parent) {
      setParentData(parent);
      await processStudentData(parent.students);
    }
    setLoading(false);
  };

  // --- 3. 手機號碼綁定邏輯 ---
  const handleBind = async () => {
    if (!/^09\d{8}$/.test(bindPhone)) {
      alert("請輸入正確的手機號碼 (09開頭共10碼)");
      return;
    }
    setIsBinding(true);

    // 檢查手機號碼是否存在於後台家長名單
    const { data: existingParent } = await supabase
      .from("parents")
      .select("id")
      .eq("phone", bindPhone)
      .maybeSingle();

    if (!existingParent) {
      alert("此手機號碼尚未在補習班後台註冊，請聯繫老師");
      setIsBinding(false);
      return;
    }

    // 進行綁定：將 line_user_id 寫入
    const { error: updateError } = await supabase
      .from("parents")
      .update({ line_user_id: lineUserId })
      .eq("phone", bindPhone);

    if (updateError) {
      alert("綁定失敗，請重試");
    } else {
      alert("🎉 綁定成功！");
      await checkBinding(lineUserId);
    }
    setIsBinding(false);
  };

  // --- 4. 處理學生與訂餐數據 (移植自你原本的邏輯) ---
  const processStudentData = async (studentData: any[]) => {
    const today = getToday();
    const weekMap: any = { 1: "週一", 2: "週二", 3: "週三", 4: "週四", 5: "週五" };
    const todayWeek = weekMap[new Date().getDay()];

    const updatedStudents = await Promise.all(
      studentData.map(async (student) => {
        // 自動產生今日訂單 (如果你原本有這段)
        if (todayWeek && student.fixed_days?.includes(todayWeek)) {
          await supabase.from("orders").upsert(
            { student_id: student.id, order_date: today, received: false },
            { onConflict: "student_id,order_date" }
          );
        }

        const { data: order } = await supabase
          .from("orders")
          .select("*")
          .eq("student_id", student.id)
          .eq("order_date", today)
          .maybeSingle();

        return {
          ...student,
          today_cancelled: !order,
          auto_ordered: student.fixed_days?.includes(todayWeek),
        };
      })
    );

    setStudents(updatedStudents);
    if (updatedStudents.length > 0) {
      const defaultId = updatedStudents[0].id;
      setSelectedId(defaultId);
      fetchTransactions(defaultId);
    }
  };

  const fetchTransactions = async (studentId: string) => {
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });
    setTransactions(data || []);
  };

  // --- 5. 訂餐操作邏輯 (移植自你原本的邏輯) ---
  const toggleTodayOrder = async () => {
    const selectedStudent = students.find(s => s.id === selectedId);
    if (!selectedStudent || isLocked) return;
    const today = getToday();

    if (selectedStudent.today_cancelled) {
      await supabase.from("orders").upsert(
        { student_id: selectedId, order_date: today, received: false },
        { onConflict: "student_id,order_date" }
      );
    } else {
      await supabase.from("orders").delete().eq("student_id", selectedId).eq("order_date", today);
    }
    await checkBinding(lineUserId); // 重新刷新
  };

  const toggleFixedDay = async (day: string) => {
    const selectedStudent = students.find(s => s.id === selectedId);
    if (!selectedStudent) return;

    const updated = selectedStudent.fixed_days.includes(day)
      ? selectedStudent.fixed_days.filter(d => d !== day)
      : [...selectedStudent.fixed_days, day];

    await supabase.from("students").update({ fixed_days: updated }).eq("id", selectedId);
    await checkBinding(lineUserId);
  };

  // --- 渲染判斷 ---

  if (loading) return <div className="min-h-screen flex items-center justify-center text-blue-600 font-bold">驗證 LINE 中...</div>;

  // 情境 A：尚未綁定手機號碼
  if (!parentData) {
    return (
      <main className="min-h-screen bg-blue-50 p-6 flex flex-col justify-center items-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-blue-900 mb-2">第一次登入</h1>
          <p className="text-gray-500 mb-6">請輸入您在補習班留的手機號碼以完成 LINE 帳號綁定</p>
          <input
            type="tel"
            value={bindPhone}
            onChange={(e) => setBindPhone(e.target.value)}
            placeholder="0912345678"
            className="w-full border-2 border-blue-100 px-4 py-4 rounded-2xl mb-4 text-center text-2xl focus:border-blue-500 outline-none text-black"
          />
          <button
            onClick={handleBind}
            disabled={isBinding}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-blue-700 transition"
          >
            {isBinding ? "正在綁定..." : "確認綁定"}
          </button>
        </div>
      </main>
    );
  }

  const currentStudent = students.find(s => s.id === selectedId);
  if (!currentStudent) return <div className="p-10 text-center">查無學生資料</div>;

  // 情境 B：已登入，顯示你原本的 UI
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
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 rounded-xl font-bold transition ${tab === t ? "bg-blue-600 text-white" : "text-gray-500"}`}
            >
              {t === "order" ? "訂餐設定" : "儲值/紀錄"}
            </button>
          ))}
        </div>

        {/* 學生選擇 (處理多小孩情況) */}
        <div className="bg-white rounded-3xl shadow p-4">
          <p className="text-xs text-gray-400 mb-2 ml-1">切換學生：</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {students.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelectedId(s.id); fetchTransactions(s.id); }}
                className={`px-4 py-2 rounded-full whitespace-nowrap font-bold border-2 transition ${selectedId === s.id ? "bg-blue-100 border-blue-600 text-blue-700" : "bg-white border-gray-100 text-gray-400"}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {tab === "order" ? (
          <>
            {/* 使用說明 */}
            <div className="bg-amber-50 border-l-4 border-amber-400 rounded-2xl p-4 shadow-sm text-sm text-amber-900 space-y-1">
              <p>① 每週固定設定會自動套用到未來</p>
              <p>② 每日 <span className="font-bold text-red-600">中午 12:00</span> 後停止當日修改</p>
            </div>

            {/* 今日狀態 */}
            <div className="bg-white rounded-3xl shadow p-6 text-center">
              <h2 className="text-2xl font-bold text-black">{currentStudent.name} ({currentStudent.grade})</h2>
              
              <div className="mt-4 bg-blue-50 rounded-2xl p-4">
                <p className="text-gray-500 text-sm">餐費餘額</p>
                <p className={`text-3xl font-bold ${currentStudent.balance < 200 ? "text-red-500" : "text-blue-600"}`}>
                  ${currentStudent.balance || 0}
                </p>
              </div>

              <div className={`mt-6 p-4 rounded-2xl font-bold text-xl ${currentStudent.today_cancelled ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"}`}>
                {currentStudent.today_cancelled ? "今日目前：無訂餐" : "今日目前：已訂餐 ✅"}
              </div>

              <button
                onClick={toggleTodayOrder}
                disabled={isLocked}
                className={`w-full mt-4 py-4 rounded-2xl text-lg font-bold shadow-lg transition ${
                  isLocked ? "bg-gray-300 text-gray-500 cursor-not-allowed" 
                  : currentStudent.today_cancelled ? "bg-green-600 text-white" : "bg-red-500 text-white"
                }`}
              >
                {isLocked ? "今日已截止修改" : currentStudent.today_cancelled ? "我要點今天的餐" : "取消今日訂餐"}
              </button>
            </div>

            {/* 每週固定設定 */}
            <div className="bg-white rounded-3xl shadow p-6">
              <h3 className="font-bold text-black mb-4">每週固定訂餐天數</h3>
              <div className="grid grid-cols-5 gap-2">
                {["週一", "週二", "週三", "週四", "週五"].map((day) => {
                  const active = currentStudent.fixed_days.includes(day);
                  return (
                    <button
                      key={day}
                      onClick={() => toggleFixedDay(day)}
                      className={`py-3 rounded-xl font-bold text-sm transition ${active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"}`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          /* 儲值紀錄分頁 */
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