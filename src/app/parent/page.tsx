// 檔案路徑：src/app/parent/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "@/lib/supabase";
import { getTaipeiHour, getTaipeiShortWeekday, getTaipeiWeekday, getToday } from "@/lib/date";
import { logOperation } from "@/lib/operationLog";
import OrderSettings from "@/components/parent/OrderSettings"; // 👈 載入我們剛做好的積木

export type Student = {
  id: string;
  name: string;
  grade: string;
  fixed_days_off: string[];
  today_cancelled: boolean;
  today_leave?: boolean;
  auto_ordered?: boolean;
  enrollment_status?: string;
  balance: number;
};

type StudentSource = {
  id: string;
  name: string;
  grade: string;
  fixed_days_off?: string[] | null;
  enrollment_status?: string | null;
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
  
  const [bindCredential, setBindCredential] = useState("");
  const [isBinding, setIsBinding] = useState(false);
  const [savingFixedDays, setSavingFixedDays] = useState(false);
  const [taipeiHour, setTaipeiHour] = useState(getTaipeiHour());

  const isLocked = taipeiHour >= 12;

  const fetchTransactions = useCallback(async (studentId: string) => {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("讀取交易紀錄失敗", error);
      return;
    }
    setTransactions(data || []);
  }, []);

  const refreshStudentStatus = useCallback(async (
    studentList: StudentSource[],
    preferredStudentId = ""
  ) => {
    const today = getToday();
    const todayWeek = getTaipeiShortWeekday();

    const updatedStudents = await Promise.all(
      studentList.map(async (student): Promise<Student> => {
        const [orderResult, attendanceResult] = await Promise.all([
          supabase.from("orders").select("id").eq("student_id", student.id).eq("order_date", today).maybeSingle(),
          supabase.from("attendance_logs").select("status").eq("student_id", student.id).eq("date", today).is("course_id", null).maybeSingle(),
        ]);
        if (orderResult.error) throw orderResult.error;
        if (attendanceResult.error) throw attendanceResult.error;

        const fixedDays = Array.isArray(student.fixed_days_off) ? student.fixed_days_off : [];
        return {
          ...student,
          fixed_days_off: fixedDays,
          enrollment_status: student.enrollment_status || "active",
          today_cancelled: !orderResult.data,
          today_leave: attendanceResult.data?.status === "leave",
          auto_ordered: fixedDays.includes(todayWeek),
        };
      })
    );

    setStudents(updatedStudents);
    const nextStudentId = updatedStudents.some((student) => student.id === preferredStudentId)
      ? preferredStudentId
      : updatedStudents[0]?.id || "";
    setSelectedId(nextStudentId);
    if (nextStudentId) await fetchTransactions(nextStudentId);
    else setTransactions([]);
  }, [fetchTransactions]);

  const checkBinding = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const { data: parent, error: parentError } = await supabase
        .from("parents")
        .select("id")
        .eq("line_user_id", userId)
        .maybeSingle();
      if (parentError) throw parentError;

      setParentData(parent || null);
      if (!parent) {
        setStudents([]);
        setSelectedId("");
        return;
      }

      const { data: relations, error: relationError } = await supabase
        .from("student_parent_relations")
        .select(`students ( id, name, grade, balance, fixed_days_off, enrollment_status )`)
        .eq("parent_id", parent.id);
      if (relationError) throw relationError;

      const rawStudents = (relations || [])
        .map((relation: any) => relation.students)
        .filter((student: StudentSource | null) => student && (student.enrollment_status || "active") === "active") as StudentSource[];
      await refreshStudentStatus(rawStudents);
    } catch (err) {
      console.error("檢查綁定失敗", err);
    } finally {
      setLoading(false);
    }
  }, [refreshStudentStatus]);

  // --- 2. 初始化與資料抓取函數 ---
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    const credentialTimer = code
      ? window.setTimeout(() => setBindCredential(code.replace(/\D/g, "").slice(0, 6)), 0)
      : null;

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
    void initLiff();
    return () => {
      if (credentialTimer !== null) window.clearTimeout(credentialTimer);
    };
  }, [checkBinding]);

  useEffect(() => {
    const updateTaipeiHour = () => setTaipeiHour(getTaipeiHour());
    updateTaipeiHour();
    const interval = setInterval(updateTaipeiHour, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleLeaveToday = async () => {
    const selectedStudent = students.find(s => s.id === selectedId);
    if (!selectedStudent) return;
    const leaveMessage = isLocked
      ? `確定要為【${selectedStudent.name}】請假嗎？\n已超過中午 12:00，系統只會登記請假，不會取消今日訂餐。`
      : `確定要為【${selectedStudent.name}】請假嗎？\n中午 12:00 前請假會同步取消今日訂餐；若已扣款，會自動退費並留下交易紀錄。`;
    if (!confirm(leaveMessage)) return;

    const today = getToday();
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc("register_parent_leave_atomic", {
        p_student_id: selectedId,
        p_leave_date: today,
        p_before_cutoff: !isLocked,
        p_student_name: selectedStudent.name,
      });
      if (error) {
        if (error.message.includes("register_parent_leave_atomic")) {
          throw new Error("請先到 Supabase 執行 database/accounting_atomic.sql");
        }
        throw error;
      }

      const result = (data || {}) as {
        cancelled_order?: boolean;
        refunded?: boolean;
        refund_amount?: number;
        kept_order?: boolean;
      };
      const cancelledOrder = Boolean(result.cancelled_order);
      const refunded = Boolean(result.refunded);
      const refundAmount = Number(result.refund_amount || 0);
      const keptOrder = Boolean(result.kept_order);

      await logOperation({
        action: "leave_create",
        targetType: "leave_record",
        targetId: selectedId,
        targetName: selectedStudent.name,
        studentId: selectedId,
        studentName: selectedStudent.name,
        metadata: { source: "parent", cancelledOrder, refunded, refundAmount, keptOrder },
      });

      alert(isLocked ? "今日請假已完成。已超過中午 12:00，今日訂餐保留。" : "今日請假已完成，並已同步處理今日訂餐。");
      await refreshStudentStatus(students, selectedId);
    } catch (err: any) {
      console.error("請假處理失敗", err);
      alert("請假處理失敗：" + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBind = async () => {
    const credential = bindCredential.trim();
    if (!/^\d{6}$/.test(credential)) return alert("請輸入補習班提供的 6 位數綁定碼");
    setIsBinding(true);
    try {
      const { error } = await supabase.rpc("bind_parent_line_atomic", {
        p_reset_code: credential,
        p_line_user_id: lineUserId,
      });
      if (error) {
        if (error.message.includes("bind_parent_line_atomic")) {
          throw new Error("請補習班先完成家長安全綁定設定");
        }
        throw error;
      }
      alert("綁定成功！");
      await checkBinding(lineUserId);
    } catch (err: any) {
      alert("綁定失敗：" + err.message);
    } finally {
      setIsBinding(false);
    }
  };

  const toggleTodayOrder = async () => {
    const selectedStudent = students.find(s => s.id === selectedId);
    if (!selectedStudent || isLocked) return;
    const today = getToday();
    setLoading(true);
    try {
      if (selectedStudent.today_cancelled) {
        const { data: schedule, error: scheduleError } = await supabase
          .from("weekly_schedule")
          .select("menu_id")
          .eq("weekday", getTaipeiWeekday())
          .maybeSingle();
        if (scheduleError) throw scheduleError;

        if (!schedule?.menu_id) {
          alert("今日尚未設定排餐，請聯絡補習班確認。");
          return;
        }

        const { error: orderError } = await supabase.from("orders").upsert({
          student_id: selectedId,
          order_date: today,
          meal_id: schedule.menu_id,
          ordered: true,
          received: false,
          charged: false,
        }, { onConflict: "student_id,order_date" });
        if (orderError) throw orderError;
      } else {
        const { error: orderError } = await supabase
          .from("orders")
          .delete()
          .eq("student_id", selectedId)
          .eq("order_date", today);
        if (orderError) throw orderError;
      }
      await refreshStudentStatus(students, selectedId);
    } catch (err: any) {
      alert("更新今日訂餐失敗：" + err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- 3. 修復防當機的 每週固定天數切換邏輯 ---
  const toggleFixedDay = async (day: string) => {
    const selectedStudent = students.find(s => s.id === selectedId);
    if (!selectedStudent) return;

    const currentDays = selectedStudent.fixed_days_off || [];
    const updated = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day];
    const isAutoOrderEnabled = updated.length > 0;

    setSavingFixedDays(true);
    setStudents(prev => prev.map(s => 
      s.id === selectedId
        ? { ...s, fixed_days_off: updated, auto_ordered: isAutoOrderEnabled }
        : s
    ));

    try {
      const { error } = await supabase
        .from("students")
        .update({ 
          fixed_days_off: updated,
          auto_order: isAutoOrderEnabled 
        })
        .eq("id", selectedId);

      if (error) throw error;
    } catch (err) {
      console.error("更新自動訂餐失敗", err);
      setStudents(prev => prev.map(s => 
        s.id === selectedId
          ? { ...s, fixed_days_off: currentDays, auto_ordered: currentDays.length > 0 }
          : s
      ));
      alert("更新失敗，請重試");
    } finally {
      setSavingFixedDays(false);
    }
  };

  // --- 4. 畫面渲染 ---
  if (loading) return <div className="app-page flex min-h-screen flex-col items-center justify-center"><div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600"></div><p className="font-bold text-blue-700">驗證中，請稍候...</p></div>;

  if (!parentData) {
    return (
      <main className="app-page flex min-h-screen flex-col items-center justify-center p-5">
        <div className="app-card w-full max-w-md p-7 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-xl font-black text-white">方</div>
          <h1 className="mb-2 text-2xl font-black text-slate-950">家長綁定</h1>
          <p className="mb-6 text-sm font-bold text-slate-500">輸入補習班提供的 6 位數一次性綁定碼</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={bindCredential}
            onChange={(e) => setBindCredential(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="app-input mb-4 px-4 py-4 text-center text-2xl font-black"
          />
          <button onClick={handleBind} disabled={isBinding} className="app-button-primary w-full rounded-2xl py-4 text-lg font-black transition disabled:bg-slate-300 disabled:shadow-none">{isBinding ? "正在綁定..." : "確認綁定"}</button>
        </div>
      </main>
    );
  }

  const currentStudent = students.find(s => s.id === selectedId);
  if (!currentStudent) return <div className="p-10 text-center">查無學生資料，請洽管理員。</div>;

  return (
    <main className="app-page flex min-h-screen justify-center p-4">
      <div className="w-full max-w-xl space-y-4 pb-8">
        
        {/* 頂部標題 */}
        <div className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl shadow-slate-200">
          <div className="flex items-start justify-between gap-4">
          <div>
              <p className="text-sm font-bold text-blue-200">方華補習班 楊梅校</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">家長中心</h1>
              <p className="mt-3 text-sm font-bold text-slate-300">目前學生：{currentStudent.name} · 今日餐務小管家</p>
            </div>
            <div className="rounded-full bg-green-400/15 px-3 py-1 text-xs font-black text-green-200">LINE 已連線</div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs font-bold text-slate-300">餐費餘額</p>
              <p className={`mt-1 text-2xl font-black ${currentStudent.balance < 200 ? "text-rose-200" : "text-white"}`}>${currentStudent.balance || 0}</p>
              {currentStudent.balance < 200 && <p className="mt-1 text-[11px] font-black text-rose-200">餘額偏低</p>}
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs font-bold text-slate-300">今日狀態</p>
              <p className="mt-1 text-lg font-black">{currentStudent.today_leave ? "已請假" : currentStudent.today_cancelled ? "無訂餐" : "已訂餐"}</p>
            </div>
          </div>
        </div>

        {/* Tab 切換 */}
        <div className="app-card flex p-1">
          {["order", "wallet"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-[1.15rem] py-3 text-sm font-black transition ${tab === t ? "bg-blue-600 text-white shadow-md shadow-blue-100" : "text-slate-500 hover:bg-slate-50"}`}>
              {t === "order" ? "訂餐設定" : "儲值/紀錄"}
            </button>
          ))}
        </div>

        {/* 學生選擇條 */}
        <div className="app-card p-4">
          <p className="mb-2 ml-1 text-xs font-black text-slate-400">切換學生</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {students.map((s) => (
              <button key={s.id} onClick={() => { setSelectedId(s.id); fetchTransactions(s.id); }} className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-black transition ${selectedId === s.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500"}`}>
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
            onLeaveToday={handleLeaveToday}
            onToggleFixed={toggleFixedDay} 
            savingFixedDays={savingFixedDays}
          />
        ) : (
          <div className="app-card p-5">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black text-slate-400">交易紀錄</p>
                <h3 className="mt-1 text-xl font-black text-slate-950">{currentStudent.name}</h3>
              </div>
              <div className="rounded-2xl bg-blue-50 px-4 py-2 text-right">
                <p className="text-[11px] font-bold text-blue-500">餘額</p>
                <p className="font-black text-blue-700">${currentStudent.balance || 0}</p>
              </div>
            </div>
            <div className="space-y-4">
              {transactions.length === 0 ? (
                <p className="py-10 text-center text-sm font-bold text-slate-400">尚無紀錄</p>
              ) : (
                transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <div>
                      <p className="font-black text-slate-800">{tx.description || "餐費變動"}</p>
                      <p className="mt-1 text-xs font-bold text-slate-400">{new Date(tx.created_at).toLocaleString("zh-TW")}</p>
                    </div>
                    <p className={`shrink-0 text-lg font-black ${tx.amount > 0 ? "text-green-600" : "text-red-500"}`}>
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
