"use client";

import { isCourseActive } from "@/lib/courseActivity";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

type LeaveRecord = {
  id: string;
  created_at: string;
  leave_date: string;
  student_id: string;
  student_name: string | null;
  source: string;
  reason: string | null;
  cancelled_order: boolean;
  refunded: boolean;
  refund_amount: number;
  kept_order: boolean;
  metadata: Record<string, unknown> | null;
};

type VisibleLeaveRecord = LeaveRecord & {
  start_date: string;
  end_date: string;
  day_count: number;
  record_count: number;
  group_key: string;
};

const sourceLabels: Record<string, string> = {
  parent: "家長",
  admin: "管理員",
  teacher: "老師",
  system: "系統",
};

const getMonthStart = (monthOffset = 0) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00+08:00`);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
};

const isPreLeave = (record: LeaveRecord) => record.metadata?.source === "admin_pre_leave" || record.reason === "預先請假";
const gradeOptions = ["小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三"];
const getLeaveGroupKey = (record: LeaveRecord) => [
  record.student_id,
  record.student_name || "",
  record.source,
  record.reason || "",
  record.cancelled_order ? "cancelled" : "not_cancelled",
  record.refunded ? "refunded" : "not_refunded",
  record.refund_amount || 0,
  record.kept_order ? "kept" : "not_kept",
].join("|");

const formatDateRange = (record: VisibleLeaveRecord) => (
  record.start_date === record.end_date ? record.start_date : `${record.start_date} ~ ${record.end_date}`
);

export default function LeaveRecordsTab() {
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [fromDate, setFromDate] = useState(toDateInputValue(getMonthStart(0)));
  const [toDate, setToDate] = useState(toDateInputValue(new Date()));
  const [viewMode, setViewMode] = useState<"all" | "preleave">("all");
  const [editingRecord, setEditingRecord] = useState<LeaveRecord | null>(null);
  const [editLeaveDate, setEditLeaveDate] = useState("");
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [studentGrades, setStudentGrades] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchStudentGrades = async () => {
      const { data, error } = await supabase.from("students").select("id, grade");
      if (error) return console.warn("讀取學生年級失敗:", error.message);
      setStudentGrades(Object.fromEntries((data || []).map((student: any) => [student.id, student.grade || ""])));
    };
    void fetchStudentGrades();
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [sourceFilter, fromDate, toDate]);

  const fetchRecords = async () => {
    setLoading(true);

    let query = supabase
      .from("leave_records")
      .select("*")
      .gte("leave_date", fromDate)
      .lte("leave_date", toDate)
      .order("leave_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (sourceFilter !== "all") {
      query = query.eq("source", sourceFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.warn("讀取請假紀錄失敗:", error.message);
      setLoadError(error.message);
      setRecords([]);
    } else {
      setLoadError(null);
      setRecords((data || []) as LeaveRecord[]);
    }

    setLoading(false);
  };

  const stats = useMemo(() => {
    const cancelled = records.filter((record) => record.cancelled_order).length;
    const kept = records.filter((record) => record.kept_order).length;
    const refunded = records.filter((record) => record.refunded).length;
    const refundAmount = records.reduce((sum, record) => sum + Number(record.refund_amount || 0), 0);

    return { total: records.length, cancelled, kept, refunded, refundAmount };
  }, [records]);

  const visibleRecords = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const filtered = records.filter((record) => {
      if (viewMode === "preleave" && !isPreLeave(record)) return false;
      if (gradeFilter !== "all" && studentGrades[record.student_id] !== gradeFilter) return false;
      if (!normalizedKeyword) return true;
      return [record.student_name, record.reason, record.leave_date]
        .some((value) => String(value || "").toLowerCase().includes(normalizedKeyword));
    });

    if (viewMode === "preleave") {
      return filtered.map((record) => ({
        ...record,
        start_date: record.leave_date,
        end_date: record.leave_date,
        day_count: 1,
        record_count: 1,
        group_key: record.id,
      }));
    }

    const sorted = [...filtered].sort((a, b) => {
      const studentCompare = (a.student_name || "").localeCompare(b.student_name || "", "zh-Hant");
      if (studentCompare !== 0) return studentCompare;
      return a.leave_date.localeCompare(b.leave_date);
    });
    const groups: VisibleLeaveRecord[] = [];

    sorted.forEach((record) => {
      const groupKey = getLeaveGroupKey(record);
      const last = groups[groups.length - 1];
      if (last && last.group_key === groupKey && addDays(last.end_date, 1) === record.leave_date) {
        last.end_date = record.leave_date;
        last.day_count += 1;
        last.record_count += 1;
        if (record.created_at > last.created_at) last.created_at = record.created_at;
        return;
      }

      groups.push({
        ...record,
        start_date: record.leave_date,
        end_date: record.leave_date,
        day_count: 1,
        record_count: 1,
        group_key: groupKey,
      });
    });

    return groups.sort((a, b) => {
      const dateCompare = b.start_date.localeCompare(a.start_date);
      if (dateCompare !== 0) return dateCompare;
      return (a.student_name || "").localeCompare(b.student_name || "", "zh-Hant");
    });
  }, [gradeFilter, keyword, records, studentGrades, viewMode]);

  const openPreLeaveManager = () => {
    const today = getToday();
    setViewMode("preleave");
    setSourceFilter("all");
    setKeyword("");
    setGradeFilter("all");
    setFromDate(today);
    setToDate(addDays(today, 90));
  };

  const startEditing = (record: LeaveRecord) => {
    setEditingRecord(record);
    setEditLeaveDate(record.leave_date);
    setEditReason(record.reason || "");
  };

  const getCourseIdsForDate = async (studentId: string, leaveDate: string) => {
    const day = new Date(`${leaveDate}T12:00:00+08:00`).getDay();
    const weekday = day === 0 ? 7 : day;
    const [relationsRes, coursesRes] = await Promise.all([
      supabase.from("student_courses").select("course_id, start_date").eq("student_id", studentId),
      supabase.from("courses").select("*"),
    ]);
    if (relationsRes.error) throw relationsRes.error;
    if (coursesRes.error) throw coursesRes.error;
    const courses = new Map((coursesRes.data || []).map((course: any) => [course.id, course]));
    return Array.from(new Set((relationsRes.data || []).filter((relation: any) => {
      const course: any = courses.get(relation.course_id);
      if (!course || !isCourseActive(course) || course.day_of_week !== weekday || course.attendance_section === "hidden") return false;
      if (relation.start_date && relation.start_date > leaveDate) return false;
      if (course.start_date && course.start_date > leaveDate) return false;
      return true;
    }).map((relation: any) => relation.course_id))) as string[];
  };

  const savePreLeaveEdit = async () => {
    if (!editingRecord || saving) return;
    if (!editLeaveDate || editLeaveDate < getToday()) return alert("預先請假日期不能早於今天。");
    setSaving(true);
    try {
      if (editLeaveDate !== editingRecord.leave_date) {
        const { data: duplicate, error } = await supabase.from("leave_records").select("id")
          .eq("student_id", editingRecord.student_id).eq("leave_date", editLeaveDate).neq("id", editingRecord.id).maybeSingle();
        if (error) throw error;
        if (duplicate) throw new Error("這位學生在新日期已經有請假紀錄。");
      }
      const courseIds = await getCourseIdsForDate(editingRecord.student_id, editLeaveDate);
      const metadata = { ...(editingRecord.metadata || {}), source: "admin_pre_leave", course_ids: courseIds };
      const { error: recordError } = await supabase.from("leave_records")
        .update({ leave_date: editLeaveDate, reason: editReason.trim() || "預先請假", metadata }).eq("id", editingRecord.id);
      if (recordError) throw recordError;
      const { error: deleteError } = await supabase.from("attendance_logs").delete()
        .eq("student_id", editingRecord.student_id).eq("date", editingRecord.leave_date).eq("status", "leave");
      if (deleteError) throw deleteError;
      const targets = courseIds.length > 0 ? courseIds : [null];
      const { data: existingLogs, error: existingError } = await supabase.from("attendance_logs")
        .select("id, course_id").eq("student_id", editingRecord.student_id).eq("date", editLeaveDate);
      if (existingError) throw existingError;
      const updateIds = (existingLogs || [])
        .filter((log: any) => targets.some((courseId) => (log.course_id || null) === courseId))
        .map((log: any) => log.id);
      if (updateIds.length > 0) {
        const { error } = await supabase.from("attendance_logs")
          .update({ status: "leave", arrival_time: null, homework_time: null, leave_time: null }).in("id", updateIds);
        if (error) throw error;
      }
      const existingCourseIds = new Set((existingLogs || []).map((log: any) => log.course_id || null));
      const missingTargets = targets.filter((courseId) => !existingCourseIds.has(courseId));
      const { error: insertError } = missingTargets.length > 0 ? await supabase.from("attendance_logs").insert(missingTargets.map((courseId) => ({
        student_id: editingRecord.student_id, date: editLeaveDate, course_id: courseId, status: "leave",
      }))) : { error: null };
      if (insertError) throw insertError;
      setEditingRecord(null);
      await fetchRecords();
    } catch (error: any) {
      alert(`修改預先請假失敗：${error?.message || "請稍後再試"}`);
    } finally {
      setSaving(false);
    }
  };

  const cancelPreLeave = async (record: LeaveRecord) => {
    if (!confirm(`確定取消 ${record.student_name || "此學生"} ${record.leave_date} 的預先請假？`)) return;
    try {
      const { error: logError } = await supabase.from("attendance_logs").delete()
        .eq("student_id", record.student_id).eq("date", record.leave_date).eq("status", "leave");
      if (logError) throw logError;
      const { error: recordError } = await supabase.from("leave_records").delete().eq("id", record.id);
      if (recordError) throw recordError;
      await fetchRecords();
    } catch (error: any) {
      alert(`取消預先請假失敗：${error?.message || "請稍後再試"}`);
    }
  };

  return (
    <div className="space-y-5">
      <div className="brand-panel rounded-[2rem] p-7 shadow-xl shadow-rose-100">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold text-amber-200">Leave Records</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight">請假紀錄</h2>
            <p className="mt-2 text-sm font-bold text-slate-300">追蹤請假來源、取消餐與退款狀態</p>
          </div>
          <button onClick={fetchRecords} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15">
            重新整理
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
        <button type="button" onClick={() => setViewMode("all")} className={`rounded-xl px-4 py-3 text-sm font-black transition ${viewMode === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>全部請假紀錄</button>
        <button type="button" onClick={openPreLeaveManager} className={`rounded-xl px-4 py-3 text-sm font-black transition ${viewMode === "preleave" ? "bg-white text-rose-600 shadow-sm" : "text-slate-500"}`}>預先請假管理</button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
          <p className="text-xs font-black text-blue-500">請假筆數</p>
          <p className="mt-2 text-3xl font-black text-blue-700">{stats.total}</p>
        </div>
        <div className="rounded-3xl border border-green-100 bg-green-50 p-5">
          <p className="text-xs font-black text-green-500">已取消餐</p>
          <p className="mt-2 text-3xl font-black text-green-700">{stats.cancelled}</p>
        </div>
        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
          <p className="text-xs font-black text-amber-600">保留餐</p>
          <p className="mt-2 text-3xl font-black text-amber-700">{stats.kept}</p>
        </div>
        <div className="rounded-3xl border border-purple-100 bg-purple-50 p-5">
          <p className="text-xs font-black text-purple-500">退款筆數</p>
          <p className="mt-2 text-3xl font-black text-purple-700">{stats.refunded}</p>
        </div>
        <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5">
          <p className="text-xs font-black text-rose-500">退款總額</p>
          <p className="mt-2 text-3xl font-black text-rose-700">${stats.refundAmount}</p>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.3fr_.7fr_1fr_1fr_.8fr_auto] xl:items-end">
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">搜尋</span>
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="app-input px-4 py-3 font-bold" placeholder="搜尋學生、原因或日期" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">年級</span>
              <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} className="app-input px-4 py-3 font-bold">
                <option value="all">全部年級</option>
                {gradeOptions.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">起始日期</span>
              <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="app-input px-4 py-3 font-bold" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">結束日期</span>
              <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="app-input px-4 py-3 font-bold" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">來源</span>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="app-input px-4 py-3 font-bold">
                <option value="all">全部</option>
                <option value="parent">家長</option>
                <option value="admin">管理員</option>
                <option value="teacher">老師</option>
                <option value="system">系統</option>
              </select>
            </label>
            <button onClick={() => {
              setKeyword("");
              setGradeFilter("all");
              setSourceFilter("all");
              if (viewMode === "preleave") {
                setFromDate(getToday());
                setToDate(addDays(getToday(), 90));
              } else {
                setFromDate(toDateInputValue(getMonthStart(0)));
                setToDate(toDateInputValue(new Date()));
              }
            }} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">
              清除篩選
            </button>
          </div>
        </div>

        <div className="min-h-[420px] overflow-x-auto">
          {loading ? (
            <div className="p-20 text-center font-bold text-slate-400">請假紀錄載入中...</div>
          ) : loadError ? (
            <div className="p-20 text-center font-bold text-red-500">
              請假紀錄讀取失敗：{loadError}
            </div>
          ) : visibleRecords.length === 0 ? (
            <div className="p-20 text-center font-bold text-slate-400">
              目前沒有請假紀錄。之後家長或後台登記請假時，紀錄會出現在這裡。
            </div>
          ) : (
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-xs uppercase tracking-widest text-slate-400">
                  <th className="px-6 py-4 font-black">請假日</th>
                  <th className="px-6 py-4 font-black">學生</th>
                  <th className="px-6 py-4 font-black">來源</th>
                  <th className="px-6 py-4 font-black">餐務</th>
                  <th className="px-6 py-4 font-black">退款</th>
                  <th className="px-6 py-4 font-black">原因/備註</th>
                  <th className="px-6 py-4 font-black">建立時間</th>
                  {viewMode === "preleave" && <th className="px-6 py-4 font-black">管理</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRecords.map((record) => (
                  <tr key={`${record.group_key}-${record.start_date}-${record.end_date}`} className="transition hover:bg-amber-50/50">
                    <td className="px-6 py-4 font-black text-slate-800">
                      <p>{formatDateRange(record)}</p>
                      {record.day_count > 1 && <p className="mt-1 text-xs font-black text-rose-500">{record.day_count} 天連續請假</p>}
                    </td>
                    <td className="px-6 py-4 font-black text-slate-800">
                      <p>{record.student_name || "未知學生"}</p>
                      {studentGrades[record.student_id] && <p className="mt-1 text-xs font-bold text-slate-400">{studentGrades[record.student_id]}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                        {sourceLabels[record.source] || record.source}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {record.cancelled_order ? (
                        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-600">已取消餐</span>
                      ) : record.kept_order ? (
                        <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-600">保留餐</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">無訂餐</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-600">
                      {record.refunded ? `$${record.refund_amount || 0}` : "-"}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-500">{record.reason || "-"}</td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-400">
                      {new Date(record.created_at).toLocaleString("zh-TW")}
                    </td>
                    {viewMode === "preleave" && <td className="px-6 py-4">
                      {record.leave_date >= getToday() ? <div className="flex gap-2">
                        <button type="button" onClick={() => startEditing(record)} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-600">修改</button>
                        <button type="button" onClick={() => void cancelPreLeave(record)} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600">取消請假</button>
                      </div> : <span className="text-xs font-bold text-slate-400">已過期</span>}
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editingRecord && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
        <section className="w-full max-w-lg rounded-[1.75rem] bg-white p-6 shadow-2xl">
          <h3 className="text-xl font-black text-slate-950">修改預先請假</h3>
          <p className="mt-1 text-sm font-bold text-slate-500">{editingRecord.student_name || "未知學生"}</p>
          <div className="mt-5 space-y-4">
            <label className="block space-y-2">
              <span className="text-xs font-black text-slate-400">請假日期</span>
              <input type="date" min={getToday()} value={editLeaveDate} onChange={(event) => setEditLeaveDate(event.target.value)} className="app-input px-4 py-3 font-bold" />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-black text-slate-400">原因／備註</span>
              <input value={editReason} onChange={(event) => setEditReason(event.target.value)} className="app-input px-4 py-3 font-bold" placeholder="例如：出國、病假、家中有事" />
            </label>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setEditingRecord(null)} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-600">關閉</button>
            <button type="button" onClick={() => void savePreLeaveEdit()} disabled={saving} className="rounded-2xl bg-rose-500 px-4 py-3 text-sm font-black text-white disabled:bg-slate-300">{saving ? "儲存中..." : "儲存修改"}</button>
          </div>
        </section>
      </div>}
    </div>
  );
}
