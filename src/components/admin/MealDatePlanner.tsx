"use client";

import { useEffect, useMemo, useState } from "react";
import { getToday } from "@/lib/date";
import { logOperation } from "@/lib/operationLog";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  grade: string | null;
  fixed_days_off: string[] | null;
  auto_order: boolean | null;
};
type Override = { order_date: string; should_order: boolean };
type Leave = { leave_date: string; kept_order: boolean };
type Order = { order_date: string; cancelled: boolean; received: boolean; charged: boolean };

const weekdayNames = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
const parseDate = (value: string) => new Date(`${value}T12:00:00Z`);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
};
const changeMonth = (value: string, offset: number) => {
  const date = parseDate(value);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return isoDate(date);
};
const monthStart = (value: string) => `${value.slice(0, 7)}-01`;

export default function MealDatePlanner({ students, loading: studentsLoading }: { students: Student[]; loading: boolean }) {
  const today = getToday();
  const lastDate = addDays(today, 180);
  const [month, setMonth] = useState(monthStart(today));
  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const student = students.find((item) => item.id === studentId);
  const matchingStudents = students.filter((item) =>
    `${item.grade || ""} ${item.name}`.toLocaleLowerCase("zh-TW").includes(studentSearch.trim().toLocaleLowerCase("zh-TW"))
  );

  useEffect(() => {
    if (!studentId) return;
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError("");
      const [overrideResult, leaveResult, orderResult] = await Promise.all([
        supabase.from("meal_order_overrides").select("order_date, should_order")
          .eq("student_id", studentId).gte("order_date", today).lte("order_date", lastDate),
        supabase.from("leave_records").select("leave_date, kept_order")
          .eq("student_id", studentId).gte("leave_date", today).lte("leave_date", lastDate),
        supabase.from("orders").select("order_date, cancelled, received, charged")
          .eq("student_id", studentId).gte("order_date", today).lte("order_date", lastDate),
      ]);
      if (!alive) return;
      const failed = overrideResult.error || leaveResult.error || orderResult.error;
      if (failed) setError(`日期設定載入失敗：${failed.message}`);
      else {
        setOverrides((overrideResult.data || []) as Override[]);
        setLeaves((leaveResult.data || []) as Leave[]);
        setOrders((orderResult.data || []) as Order[]);
      }
      setLoading(false);
    };
    void load();
    return () => { alive = false; };
  }, [studentId, today, lastDate]);

  const calendarDates = useMemo(() => {
    const first = parseDate(month);
    const offset = first.getUTCDay();
    const start = addDays(month, -offset);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [month]);
  const overrideMap = new Map(overrides.map((item) => [item.order_date, item.should_order]));
  const leaveDates = new Set(leaves.filter((item) => !item.kept_order).map((item) => item.leave_date));
  const orderMap = new Map(orders.map((item) => [item.order_date, item]));

  const toggleDate = (date: string) => {
    setNotice("");
    setSelectedDates((current) => current.includes(date)
      ? current.filter((item) => item !== date)
      : current.length >= 31 ? current : [...current, date].sort());
  };

  const save = async (decision: boolean | null) => {
    if (!student || selectedDates.length === 0 || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data, error: saveError } = await supabase.rpc("set_meal_order_dates", {
        p_student_id: student.id,
        p_dates: selectedDates,
        p_should_order: decision,
      });
      if (saveError) throw saveError;
      await logOperation({
        action: "meal_order_dates_update",
        targetType: "student",
        targetId: student.id,
        targetName: student.name,
        studentId: student.id,
        studentName: student.name,
        metadata: { dates: selectedDates, decision: decision === null ? "恢復每週" : decision ? "加訂" : "停訂", updated: data?.updated },
      });
      const [overrideResult, orderResult] = await Promise.all([
        supabase.from("meal_order_overrides").select("order_date, should_order")
          .eq("student_id", student.id).gte("order_date", today).lte("order_date", lastDate),
        supabase.from("orders").select("order_date, cancelled, received, charged")
          .eq("student_id", student.id).gte("order_date", today).lte("order_date", lastDate),
      ]);
      if (overrideResult.error || orderResult.error) throw overrideResult.error || orderResult.error;
      setOverrides((overrideResult.data || []) as Override[]);
      setOrders((orderResult.data || []) as Order[]);
      setNotice(`已更新 ${selectedDates.length} 個日期。`);
      setSelectedDates([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "儲存失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="app-card overflow-hidden">
      <header className="border-b border-slate-100 px-4 py-5 sm:px-6">
        <h2 className="text-xl font-black text-slate-950">指定日期訂餐</h2>
        <p className="mt-1 text-sm text-slate-500">臨時加訂或提前停訂，可一次選擇多天；未來日期有排餐時才會產生訂單。</p>
      </header>
      <div className="space-y-5 p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="text-sm font-bold text-slate-700">搜尋學生
            <input className="app-input mt-2 w-full px-3 py-3" value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)} placeholder="姓名或年級" />
          </label>
          <label className="text-sm font-bold text-slate-700">學生
            <select className="app-input mt-2 w-full px-3 py-3" value={studentId}
              disabled={studentsLoading || saving}
              onChange={(event) => { setStudentId(event.target.value); setSelectedDates([]); setNotice(""); }}>
              <option value="">選擇學生</option>
              {student && !matchingStudents.some((item) => item.id === student.id) &&
                <option value={student.id}>{student.grade} · {student.name}</option>}
              {matchingStudents.map((item) => <option value={item.id} key={item.id}>{item.grade || "未分級"} · {item.name}</option>)}
            </select>
          </label>
        </div>

        {student && <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-5">
            <div>
              <p className="font-black text-slate-900">{student.grade} · {student.name}</p>
              <p className="text-sm text-slate-500">每週固定：{student.auto_order && student.fixed_days_off?.length ? student.fixed_days_off.join("、") : "未設定"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="上個月" title="上個月" disabled={month <= monthStart(today)}
                onClick={() => setMonth(changeMonth(month, -1))}
                className="h-10 w-10 rounded border border-slate-200 font-bold disabled:opacity-30">‹</button>
              <strong className="min-w-24 text-center text-sm text-slate-800">{month.slice(0, 4)}年{Number(month.slice(5, 7))}月</strong>
              <button type="button" aria-label="下個月" title="下個月" disabled={changeMonth(month, 1) > lastDate}
                onClick={() => setMonth(changeMonth(month, 1))}
                className="h-10 w-10 rounded border border-slate-200 font-bold disabled:opacity-30">›</button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-500">
            {weekdayNames.map((day) => <span key={day} className="py-2">{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDates.map((date) => {
              const day = parseDate(date).getUTCDay();
              const inMonth = date.slice(0, 7) === month.slice(0, 7);
              const locked = date < today || date > lastDate || day === 0 || day === 6 || !inMonth;
              const order = orderMap.get(date);
              const processed = Boolean(order?.received || order?.charged);
              const absent = leaveDates.has(date);
              const fixed = Boolean(student.auto_order) && Boolean(student.fixed_days_off?.includes(weekdayNames[day]));
              const override = overrideMap.get(date);
              const label = absent ? "請假" : override === true ? "加訂" : override === false ? "停訂" : order && !order.cancelled ? "已訂" : fixed ? "固定" : "未訂";
              const selected = selectedDates.includes(date);
              return (
                <button key={date} type="button" aria-pressed={selected}
                  aria-label={`${date} ${label}${processed ? "，已處理" : ""}`}
                  disabled={locked || processed || loading || saving}
                  onClick={() => toggleDate(date)}
                  className={`min-h-16 min-w-0 rounded border px-0.5 py-1 text-center transition sm:min-h-20
                    ${selected ? "border-sky-600 bg-sky-600 text-white" : absent ? "border-amber-200 bg-amber-50 text-amber-800" : override === true ? "border-emerald-200 bg-emerald-50 text-emerald-800" : override === false ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-700"}
                    ${locked || processed ? "opacity-35" : "hover:border-sky-500"}`}>
                  <span className="block text-sm font-black">{Number(date.slice(-2))}</span>
                  <span className="mt-1 block text-[10px] font-bold leading-tight sm:text-xs">{processed ? "已處理" : label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">可設定今天起 180 天內的平日，每次最多 31 天。請假日期不會自動訂餐；已領餐或扣款請至今日訂餐處理。</p>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="mr-auto text-sm font-bold text-slate-700">已選 {selectedDates.length} 天</span>
            <button type="button" disabled={!selectedDates.length || selectedDates.some((date) => leaveDates.has(date)) || saving || loading} onClick={() => void save(true)}
              className="rounded bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">加訂</button>
            <button type="button" disabled={!selectedDates.length || saving || loading} onClick={() => void save(false)}
              className="rounded bg-rose-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">停訂</button>
            <button type="button" disabled={!selectedDates.length || saving || loading} onClick={() => void save(null)}
              className="rounded border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-40">恢復每週設定</button>
          </div>
        </>}
        {loading && <p role="status" className="text-sm text-slate-500">載入日期設定中...</p>}
        {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
        {notice && <p role="status" className="text-sm font-bold text-emerald-700">{notice}</p>}
      </div>
    </section>
  );
}
