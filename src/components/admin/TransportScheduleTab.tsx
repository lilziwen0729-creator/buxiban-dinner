"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

type Student = {
  id: string;
  name: string;
  grade: string;
  student_phone?: string | null;
  enrollment_status?: string | null;
};

type TransportSchedule = {
  id: string;
  schedule_type?: "daily_range" | "weekly" | "temporary" | null;
  schedule_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  weekday: number;
  weekdays?: number[] | null;
  transport_time: string;
  direction: "inbound" | "outbound";
  student_id: string | null;
  student_name: string;
  grade: string | null;
  contact_phone?: string | null;
  contact_phone_2?: string | null;
  location: string | null;
  note: string | null;
  is_active: boolean;
};

type LeaveRecord = {
  student_id: string;
};

type TransportCancellation = {
  schedule_id: string;
};

const directionLabels: Record<TransportSchedule["direction"], string> = {
  inbound: "搭車來",
  outbound: "搭車回去",
};
const weekdayOptions = [
  { value: 1, label: "週一" },
  { value: 2, label: "週二" },
  { value: 3, label: "週三" },
  { value: 4, label: "週四" },
  { value: 5, label: "週五" },
];

const gradeOrder = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];
const weekdayFromDate = (dateText: string) => {
  const day = new Date(`${dateText}T12:00:00+08:00`).getDay();
  return day === 0 ? 7 : day;
};

export default function TransportScheduleTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [schedules, setSchedules] = useState<TransportSchedule[]>([]);
  const [rangeStartDate, setRangeStartDate] = useState(getToday());
  const [rangeEndDate, setRangeEndDate] = useState(getToday());
  const [scheduleMode, setScheduleMode] = useState<"daily_range" | "weekly">("daily_range");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [studentInput, setStudentInput] = useState("");
  const [transportTime, setTransportTime] = useState("16:00");
  const [direction, setDirection] = useState<TransportSchedule["direction"]>("inbound");
  const [contactPhone, setContactPhone] = useState("");
  const [contactPhone2, setContactPhone2] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [listDate, setListDate] = useState(getToday());
  const [listMode, setListMode] = useState<"daily" | "all">("daily");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dailyLeaveStudentIds, setDailyLeaveStudentIds] = useState<Set<string>>(new Set());
  const [dailyCancelledScheduleIds, setDailyCancelledScheduleIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [studentsRes, schedulesRes] = await Promise.all([
      supabase.from("students").select("id, name, grade, student_phone, enrollment_status").order("grade"),
      supabase.from("transport_schedules").select("*").order("start_date").order("transport_time"),
    ]);

    if (studentsRes.data) {
      const activeStudents = (studentsRes.data as Student[])
        .filter((student) => (student.enrollment_status || "active") === "active")
        .sort((a, b) => {
          const gradeA = gradeOrder.indexOf(a.grade);
          const gradeB = gradeOrder.indexOf(b.grade);
          return (gradeA === -1 ? 99 : gradeA) - (gradeB === -1 ? 99 : gradeB) || a.name.localeCompare(b.name, "zh-Hant");
        });
      setStudents(activeStudents);
    }

    if (schedulesRes.error) {
      console.warn("交通車排程讀取失敗:", schedulesRes.error.message);
      setSchedules([]);
    } else {
      setSchedules((schedulesRes.data || []) as TransportSchedule[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  const fetchDailyContext = useCallback(async () => {
    const [leaveRes, cancelRes] = await Promise.all([
      supabase.from("leave_records").select("student_id").eq("leave_date", listDate),
      supabase.from("transport_cancellations").select("schedule_id").eq("cancel_date", listDate),
    ]);

    if (leaveRes.error) {
      console.warn("交通車請假排除資料讀取失敗:", leaveRes.error.message);
      setDailyLeaveStudentIds(new Set());
    } else {
      setDailyLeaveStudentIds(new Set(((leaveRes.data || []) as LeaveRecord[]).map((record) => record.student_id)));
    }

    if (cancelRes.error) {
      console.warn("交通車當日取消資料讀取失敗:", cancelRes.error.message);
      setDailyCancelledScheduleIds(new Set());
    } else {
      setDailyCancelledScheduleIds(new Set(((cancelRes.data || []) as TransportCancellation[]).map((item) => item.schedule_id)));
    }
  }, [listDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchDailyContext(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchDailyContext]);

  const studentLabel = (student: Student) => `${student.grade || "未分級"} · ${student.name}`;
  const selectedStudent = students.find((student) => studentLabel(student) === studentInput.trim() || student.name === studentInput.trim());
  const editingSchedule = schedules.find((schedule) => schedule.id === editingId);

  useEffect(() => {
    if (editingId) return;
    if (!selectedStudent?.student_phone || contactPhone.trim()) return;
    setContactPhone(selectedStudent.student_phone.trim());
  }, [selectedStudent, contactPhone, editingId]);

  const scheduleMatchesDate = useCallback((schedule: TransportSchedule, date: string) => {
    if (schedule.start_date && date < schedule.start_date) return false;
    if (schedule.end_date && date > schedule.end_date) return false;
    if (schedule.schedule_type === "temporary") return schedule.schedule_date === date;
    if (schedule.schedule_type === "weekly") {
      const selectedWeekdays = schedule.weekdays?.length ? schedule.weekdays : [schedule.weekday];
      return selectedWeekdays.includes(weekdayFromDate(date));
    }
    if (schedule.start_date || schedule.end_date) return true;
    return true;
  }, []);

  const dailySchedules = useMemo(
    () => schedules
      .filter((schedule) => schedule.is_active && scheduleMatchesDate(schedule, listDate))
      .filter((schedule) => !dailyCancelledScheduleIds.has(schedule.id))
      .filter((schedule) => !schedule.student_id || !dailyLeaveStudentIds.has(schedule.student_id))
      .sort((a, b) => a.transport_time.localeCompare(b.transport_time) || (a.grade || "").localeCompare(b.grade || "", "zh-Hant") || a.student_name.localeCompare(b.student_name, "zh-Hant")),
    [dailyCancelledScheduleIds, dailyLeaveStudentIds, listDate, scheduleMatchesDate, schedules]
  );

  const visibleSchedules = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const source = listMode === "daily"
      ? dailySchedules
      : schedules;
    return source
      .filter((schedule) => !keyword || `${schedule.student_name} ${schedule.grade || ""} ${schedule.location || ""} ${schedule.contact_phone || ""} ${schedule.contact_phone_2 || ""}`.toLowerCase().includes(keyword))
      .sort((a, b) => {
        if (listMode === "daily") return a.transport_time.localeCompare(b.transport_time) || a.student_name.localeCompare(b.student_name, "zh-Hant");
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        const dateCompare = (a.start_date || a.schedule_date || "9999-12-31").localeCompare(b.start_date || b.schedule_date || "9999-12-31");
        return dateCompare || a.transport_time.localeCompare(b.transport_time);
      });
  }, [dailySchedules, listMode, schedules, search]);

  const escapeHtml = (value: string | null | undefined) => String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const manifestRows = () => dailySchedules.map((schedule, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(schedule.transport_time.slice(0, 5))}</td>
      <td>${escapeHtml(directionLabels[schedule.direction])}</td>
      <td>${escapeHtml(schedule.grade || "未分級")}</td>
      <td>${escapeHtml(schedule.student_name)}</td>
      <td>${escapeHtml([schedule.contact_phone, schedule.contact_phone_2].filter(Boolean).join(" / "))}</td>
      <td>${escapeHtml(schedule.location)}</td>
      <td>${escapeHtml(schedule.note)}</td>
    </tr>`).join("");

  const manifestTable = () => `
    <table>
      <thead><tr><th>序號</th><th>時間</th><th>方向</th><th>年級</th><th>學生</th><th>聯絡電話</th><th>地點</th><th>備註</th></tr></thead>
      <tbody>${manifestRows()}</tbody>
    </table>`;

  const exportDailyExcel = () => {
    if (dailySchedules.length === 0) return alert("這一天沒有交通車名單可以匯出。");
    const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body><h2>方華補習班交通車名單</h2><p>日期：${escapeHtml(listDate)}</p>${manifestTable()}</body></html>`;
    const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `交通車名單_${listDate}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printDailyManifest = () => {
    if (dailySchedules.length === 0) return alert("這一天沒有交通車名單可以列印。");
    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) return alert("瀏覽器阻擋了列印視窗，請允許彈出式視窗後再試一次。");
    printWindow.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>交通車名單 ${escapeHtml(listDate)}</title><style>
      body{font-family:Arial,'Microsoft JhengHei',sans-serif;padding:24px;color:#111827}h1{margin:0 0 8px;font-size:24px}p{margin:0 0 18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #94a3b8;padding:9px;text-align:left;font-size:13px}th{background:#f1f5f9}@page{size:A4 landscape;margin:12mm}
    </style></head><body><h1>方華補習班交通車名單</h1><p>日期：${escapeHtml(listDate)}　共 ${dailySchedules.length} 人</p>${manifestTable()}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const resetForm = () => {
    setEditingId(null);
    setStudentInput("");
    setTransportTime("16:00");
    setDirection("inbound");
    setContactPhone("");
    setContactPhone2("");
    setLocation("");
    setNote("");
    setRangeStartDate(getToday());
    setRangeEndDate(getToday());
    setScheduleMode("daily_range");
    setWeekdays([]);
  };

  const toggleWeekday = (weekday: number) => {
    setWeekdays((current) => current.includes(weekday)
      ? current.filter((item) => item !== weekday)
      : [...current, weekday].sort((a, b) => a - b));
  };

  const editSchedule = (schedule: TransportSchedule) => {
    setEditingId(schedule.id);
    setRangeStartDate(schedule.start_date || schedule.schedule_date || getToday());
    setRangeEndDate(schedule.end_date || schedule.schedule_date || getToday());
    setScheduleMode(schedule.schedule_type === "weekly" ? "weekly" : "daily_range");
    setWeekdays(schedule.schedule_type === "weekly"
      ? (schedule.weekdays?.length ? schedule.weekdays : [schedule.weekday])
      : []);
    setTransportTime(schedule.transport_time.slice(0, 5));
    setDirection(schedule.direction);
    setStudentInput(schedule.grade ? `${schedule.grade} · ${schedule.student_name}` : schedule.student_name);
    setContactPhone(schedule.contact_phone || "");
    setContactPhone2(schedule.contact_phone_2 || "");
    setLocation(schedule.location || "");
    setNote(schedule.note || "");
  };

  const saveSchedule = async () => {
    if (!studentInput.trim()) return alert("請輸入學生姓名。");
    if (!transportTime) return alert("請設定搭車時間。");
    if (!rangeStartDate || !rangeEndDate) return alert("請設定排程的開始與結束日期。");
    if (rangeStartDate > rangeEndDate) return alert("開始日期不能晚於結束日期。");
    if (scheduleMode === "weekly" && weekdays.length === 0) return alert("請至少選擇一個固定搭車星期。");
    if (saving) return;

    setSaving(true);
    const payload = {
      schedule_type: scheduleMode,
      schedule_date: null,
      start_date: rangeStartDate,
      end_date: rangeEndDate,
      weekday: scheduleMode === "weekly" ? weekdays[0] : weekdayFromDate(rangeStartDate),
      weekdays: scheduleMode === "weekly" ? weekdays : [],
      transport_time: transportTime,
      direction,
      student_id: selectedStudent?.id || null,
      student_name: selectedStudent?.name || studentInput.trim().replace(/^.+? · /, ""),
      grade: selectedStudent?.grade || (studentInput.includes(" · ") ? studentInput.split(" · ")[0] : null),
      contact_phone: contactPhone.trim() || null,
      contact_phone_2: contactPhone2.trim() || null,
      location: location.trim() || null,
      note: note.trim() || null,
      is_active: editingSchedule?.is_active ?? true,
      updated_at: new Date().toISOString(),
    };

    const result = editingId
      ? await supabase.from("transport_schedules").update(payload).eq("id", editingId)
      : await supabase.from("transport_schedules").insert([payload]);

    setSaving(false);
    if (result.error) return alert(`${editingId ? "更新" : "新增"}交通車排程失敗：${result.error.message}`);
    setListMode("all");
    resetForm();
    await fetchData();
  };

  const toggleActive = async (schedule: TransportSchedule) => {
    const { error } = await supabase
      .from("transport_schedules")
      .update({ is_active: !schedule.is_active, updated_at: new Date().toISOString() })
      .eq("id", schedule.id);
    if (error) return alert(`更新失敗：${error.message}`);
    fetchData();
  };

  const deleteSchedule = async (schedule: TransportSchedule) => {
    if (!confirm(`確定刪除 ${schedule.student_name} 的交通車排程？`)) return;
    const { error } = await supabase.from("transport_schedules").delete().eq("id", schedule.id);
    if (error) return alert(`刪除失敗：${error.message}`);
    if (editingId === schedule.id) resetForm();
    fetchData();
  };

  const cancelDailySchedule = async (schedule: TransportSchedule) => {
    if (!confirm(`確定取消 ${schedule.student_name} ${listDate} ${schedule.transport_time.slice(0, 5)} 的交通車？`)) return;
    const { error } = await supabase.from("transport_cancellations").upsert({
      schedule_id: schedule.id,
      cancel_date: listDate,
      student_id: schedule.student_id || null,
      student_name: schedule.student_name,
      grade: schedule.grade || null,
      transport_time: schedule.transport_time,
      direction: schedule.direction,
      reason: "當日取消",
    }, { onConflict: "schedule_id,cancel_date" });
    if (error) return alert(`取消交通車失敗：${error.message}\n請確認已在 Supabase 執行 database/transport_cancellations.sql`);
    await fetchDailyContext();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <p className="text-xs font-black uppercase tracking-widest text-cyan-500">Transport</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">{editingId ? "編輯交通車排程" : "新增交通車排程"}</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">日期區間與固定星期都在這裡建立及管理。</p>
        </div>

        <div className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
            <button type="button" onClick={() => setScheduleMode("daily_range")} className={`rounded-xl px-3 py-3 text-sm font-black transition ${scheduleMode === "daily_range" ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500"}`}>日期區間每天</button>
            <button type="button" onClick={() => setScheduleMode("weekly")} className={`rounded-xl px-3 py-3 text-sm font-black transition ${scheduleMode === "weekly" ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500"}`}>每週固定星期</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">開始日期</span>
              <input type="date" value={rangeStartDate} onChange={(event) => setRangeStartDate(event.target.value)} className="app-input px-4 py-3 font-black" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">結束日期</span>
              <input type="date" min={rangeStartDate} value={rangeEndDate} onChange={(event) => setRangeEndDate(event.target.value)} className="app-input px-4 py-3 font-black" />
            </label>
          </div>

          {scheduleMode === "weekly" && <div className="space-y-2">
            <span className="text-xs font-black text-slate-400">固定搭車星期（可複選）</span>
            <div className="grid grid-cols-5 gap-2">
              {weekdayOptions.map((option) => <button key={option.value} type="button" onClick={() => toggleWeekday(option.value)} className={`rounded-xl px-2 py-3 text-sm font-black transition ${weekdays.includes(option.value) ? "bg-cyan-600 text-white shadow-md shadow-cyan-100" : "bg-slate-50 text-slate-500 hover:bg-cyan-50"}`}>{option.label}</button>)}
            </div>
          </div>}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">時間</span>
              <input type="time" value={transportTime} onChange={(event) => setTransportTime(event.target.value)} className="app-input px-4 py-3 font-black" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">方向</span>
              <select value={direction} onChange={(event) => setDirection(event.target.value as TransportSchedule["direction"])} className="app-input px-4 py-3 font-black">
                <option value="inbound">搭車來</option>
                <option value="outbound">搭車回去</option>
              </select>
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-400">學生</span>
            <input
              list="transport-students"
              value={studentInput}
              onChange={(event) => setStudentInput(event.target.value)}
              className="app-input px-4 py-3 font-black"
              placeholder="直接輸入學生姓名"
            />
            <datalist id="transport-students">
              {students.map((student) => (
                <option key={student.id} value={studentLabel(student)} />
              ))}
            </datalist>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">聯絡電話 1（選填）</span>
              <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} maxLength={40} className="app-input px-4 py-3 font-bold" placeholder="手機或市話，可含分機" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">聯絡電話 2（選填）</span>
              <input value={contactPhone2} onChange={(event) => setContactPhone2(event.target.value)} maxLength={40} className="app-input px-4 py-3 font-bold" placeholder="例如：03-1234567 分機 123" />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-400">地點</span>
            <input value={location} onChange={(event) => setLocation(event.target.value)} className="app-input px-4 py-3 font-bold" placeholder="例如：本棟、分校門口、家門口" />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-400">備註</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} className="app-input min-h-24 px-4 py-3 font-bold" placeholder="例如：週三先到本棟接、家長會在門口等" />
          </label>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <button onClick={saveSchedule} disabled={saving || students.length === 0} className="w-full rounded-2xl bg-cyan-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-cyan-100 transition hover:bg-cyan-700 disabled:bg-slate-300">
              {saving ? "儲存中..." : editingId ? "儲存修改" : scheduleMode === "weekly" ? "加入固定交通車" : "加入交通車排程"}
            </button>
            {editingId && (
              <button onClick={resetForm} className="rounded-2xl bg-slate-100 px-5 py-4 text-sm font-black text-slate-600 transition hover:bg-slate-200">
                取消編輯
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-blue-500">Transport List</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">{listMode === "daily" ? "當日交通車名單" : "全部交通車排程"}</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">{listMode === "daily" ? "選擇日期後依搭車時間排序，可匯出或列印。" : "所有日期區間與固定星期排程集中在此管理。"}</p>
            </div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="app-input px-4 py-3 font-bold md:w-64" placeholder="搜尋姓名、年級、地點、電話" />
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
              <button onClick={() => setListMode("daily")} className={`rounded-xl px-4 py-3 text-sm font-black transition ${listMode === "daily" ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500"}`}>當日名單</button>
              <button onClick={() => setListMode("all")} className={`rounded-xl px-4 py-3 text-sm font-black transition ${listMode === "all" ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500"}`}>全部排程</button>
            </div>
            {listMode === "daily" && (
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <label className="flex-1 space-y-2">
                  <span className="text-xs font-black text-slate-400">名單日期</span>
                  <input type="date" value={listDate} onChange={(event) => setListDate(event.target.value)} className="app-input px-4 py-3 font-black" />
                </label>
                <button onClick={exportDailyExcel} className="rounded-2xl bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-100">匯出 Excel</button>
                <button onClick={printDailyManifest} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800">列印名單</button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 p-6">
          {loading ? (
            <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center text-sm font-bold text-slate-400">交通車排程讀取中...</div>
          ) : visibleSchedules.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center text-sm font-bold text-slate-400">{listMode === "daily" ? "這一天沒有交通車接送。" : "目前沒有符合條件的交通車排程。"}</div>
          ) : visibleSchedules.map((schedule) => (
            <div key={schedule.id} className={`rounded-3xl border p-4 transition ${schedule.is_active ? "border-cyan-100 bg-white shadow-sm" : "border-slate-100 bg-slate-50 opacity-60"}`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-2xl font-black text-slate-950">{schedule.transport_time.slice(0, 5)}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${schedule.direction === "inbound" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {directionLabels[schedule.direction]}
                    </span>
                    {!schedule.is_active && <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-black text-slate-500">已停用</span>}
                    {listMode === "all" && <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700">{schedule.schedule_type === "weekly" ? "固定排程" : "日期區間"}</span>}
                  </div>
                  <p className="mt-2 text-lg font-black text-slate-900">{schedule.grade || "未分級"} · {schedule.student_name}</p>
                  {(schedule.contact_phone || schedule.contact_phone_2) && <p className="mt-1 text-sm font-bold text-blue-700">電話：{[schedule.contact_phone, schedule.contact_phone_2].filter(Boolean).join(" / ")}</p>}
                  {schedule.location && <p className="mt-1 text-sm font-bold text-cyan-700">地點：{schedule.location}</p>}
                  {schedule.note && <p className="mt-1 text-sm font-bold text-slate-500">{schedule.note}</p>}
                  {(schedule.start_date || schedule.end_date || schedule.schedule_date) && (
                    <p className="mt-1 text-xs font-black text-slate-400">
                      搭車期間：{schedule.start_date || schedule.schedule_date || "不限"} 至 {schedule.end_date || schedule.schedule_date || "不限"}
                    </p>
                  )}
                  {schedule.schedule_type === "weekly" && <p className="mt-1 text-sm font-black text-cyan-700">固定星期：{(schedule.weekdays?.length ? schedule.weekdays : [schedule.weekday]).map((weekday) => weekdayOptions.find((option) => option.value === weekday)?.label).filter(Boolean).join("、")}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {listMode === "daily" && <button onClick={() => void cancelDailySchedule(schedule)} className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-black text-rose-600 transition hover:bg-rose-100">
                    取消當日搭車
                  </button>}
                  {listMode === "all" && <>
                  <button onClick={() => editSchedule(schedule)} className="rounded-2xl bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 transition hover:bg-blue-100">
                    編輯
                  </button>
                  <button onClick={() => toggleActive(schedule)} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-600 transition hover:bg-slate-200">
                    {schedule.is_active ? "停用" : "啟用"}
                  </button>
                  <button onClick={() => deleteSchedule(schedule)} className="rounded-2xl bg-red-50 px-4 py-2 text-sm font-black text-red-600 transition hover:bg-red-100">
                    刪除
                  </button>
                  </>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
