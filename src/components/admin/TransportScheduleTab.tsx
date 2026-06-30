"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getTaipeiNow, getToday } from "@/lib/date";

type Student = {
  id: string;
  name: string;
  grade: string;
  student_phone?: string | null;
  enrollment_status?: string | null;
};

type TransportSchedule = {
  id: string;
  schedule_type?: "weekly" | "temporary" | null;
  schedule_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  weekday: number;
  transport_time: string;
  direction: "inbound" | "outbound";
  student_id: string | null;
  student_name: string;
  grade: string | null;
  contact_phone?: string | null;
  location: string | null;
  note: string | null;
  is_active: boolean;
};

const weekdays = [
  { value: 1, label: "週一" },
  { value: 2, label: "週二" },
  { value: 3, label: "週三" },
  { value: 4, label: "週四" },
  { value: 5, label: "週五" },
];

const directionLabels: Record<TransportSchedule["direction"], string> = {
  inbound: "搭車來",
  outbound: "搭車回去",
};

const gradeOrder = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];
const todayWeekday = getTaipeiNow().getDay();

const weekdayFromDate = (dateText: string) => {
  const date = new Date(`${dateText}T12:00:00+08:00`);
  const day = date.getDay();
  return day === 0 ? 7 : day;
};

export default function TransportScheduleTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [schedules, setSchedules] = useState<TransportSchedule[]>([]);
  const [scheduleMode, setScheduleMode] = useState<"weekly" | "temporary">("weekly");
  const [selectedWeekday, setSelectedWeekday] = useState(todayWeekday >= 1 && todayWeekday <= 5 ? todayWeekday : 1);
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [rangeStartDate, setRangeStartDate] = useState(getToday());
  const [rangeEndDate, setRangeEndDate] = useState(getToday());
  const [studentInput, setStudentInput] = useState("");
  const [transportTime, setTransportTime] = useState("16:00");
  const [direction, setDirection] = useState<TransportSchedule["direction"]>("inbound");
  const [contactPhone, setContactPhone] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [studentsRes, schedulesRes] = await Promise.all([
      supabase.from("students").select("id, name, grade, student_phone, enrollment_status").order("grade"),
      supabase.from("transport_schedules").select("*").order("weekday").order("transport_time"),
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

  const studentLabel = (student: Student) => `${student.grade || "未分級"} · ${student.name}`;
  const selectedStudent = students.find((student) => studentLabel(student) === studentInput.trim() || student.name === studentInput.trim());
  const editingSchedule = schedules.find((schedule) => schedule.id === editingId);

  useEffect(() => {
    if (editingId) return;
    if (!selectedStudent?.student_phone || contactPhone.trim()) return;
    setContactPhone(selectedStudent.student_phone.replace(/\D/g, "").slice(0, 10));
  }, [selectedStudent, contactPhone, editingId]);

  const visibleSchedules = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return schedules
      .filter((schedule) => {
        const type = schedule.schedule_type || "weekly";
        if (scheduleMode === "weekly") return type === "weekly" && schedule.weekday === selectedWeekday;
        return type === "temporary" && schedule.schedule_date === selectedDate;
      })
      .filter((schedule) => !keyword || `${schedule.student_name} ${schedule.grade || ""} ${schedule.location || ""} ${schedule.contact_phone || ""}`.toLowerCase().includes(keyword))
      .sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return a.transport_time.localeCompare(b.transport_time);
      });
  }, [schedules, scheduleMode, selectedWeekday, selectedDate, search]);

  const resetForm = () => {
    setEditingId(null);
    setStudentInput("");
    setTransportTime("16:00");
    setDirection("inbound");
    setContactPhone("");
    setLocation("");
    setNote("");
    setRangeStartDate(getToday());
    setRangeEndDate(getToday());
  };

  const editSchedule = (schedule: TransportSchedule) => {
    const type = schedule.schedule_type || "weekly";
    setScheduleMode(type);
    setEditingId(schedule.id);
    setSelectedWeekday(schedule.weekday);
    if (schedule.schedule_date) setSelectedDate(schedule.schedule_date);
    setRangeStartDate(schedule.start_date || getToday());
    setRangeEndDate(schedule.end_date || getToday());
    setTransportTime(schedule.transport_time.slice(0, 5));
    setDirection(schedule.direction);
    setStudentInput(schedule.grade ? `${schedule.grade} · ${schedule.student_name}` : schedule.student_name);
    setContactPhone(schedule.contact_phone || "");
    setLocation(schedule.location || "");
    setNote(schedule.note || "");
  };

  const saveSchedule = async () => {
    if (!studentInput.trim()) return alert("請輸入學生姓名。");
    if (!transportTime) return alert("請設定搭車時間。");
    if (scheduleMode === "temporary" && !selectedDate) return alert("請設定臨時排程日期。");
    if (scheduleMode === "weekly" && (!rangeStartDate || !rangeEndDate)) return alert("請設定固定排程的開始與結束日期。");
    if (scheduleMode === "weekly" && rangeStartDate > rangeEndDate) return alert("開始日期不能晚於結束日期。");
    if (contactPhone.trim() && !/^09\d{8}$/.test(contactPhone.replace(/\D/g, ""))) return alert("聯絡電話若有填寫，請輸入 09 開頭 10 碼手機。");
    if (saving) return;

    setSaving(true);
    const cleanPhone = contactPhone.replace(/\D/g, "");
    const payload = {
      schedule_type: scheduleMode,
      schedule_date: scheduleMode === "temporary" ? selectedDate : null,
      start_date: scheduleMode === "weekly" ? rangeStartDate : null,
      end_date: scheduleMode === "weekly" ? rangeEndDate : null,
      weekday: scheduleMode === "temporary" ? weekdayFromDate(selectedDate) : selectedWeekday,
      transport_time: transportTime,
      direction,
      student_id: selectedStudent?.id || null,
      student_name: selectedStudent?.name || studentInput.trim().replace(/^.+? · /, ""),
      grade: selectedStudent?.grade || (studentInput.includes(" · ") ? studentInput.split(" · ")[0] : null),
      contact_phone: cleanPhone || null,
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

  const listTitle = scheduleMode === "weekly"
    ? `${weekdays.find((day) => day.value === selectedWeekday)?.label} 固定交通車名單`
    : `${selectedDate} 臨時交通車名單`;

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <p className="text-xs font-black uppercase tracking-widest text-cyan-500">Transport</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">{editingId ? "編輯交通車排程" : "新增交通車排程"}</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">可設定每週固定名單，也可新增當天臨時接送提醒。</p>
        </div>

        <div className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
            <button
              onClick={() => setScheduleMode("weekly")}
              className={`rounded-xl py-3 text-sm font-black transition ${scheduleMode === "weekly" ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500"}`}
            >
              每週固定
            </button>
            <button
              onClick={() => setScheduleMode("temporary")}
              className={`rounded-xl py-3 text-sm font-black transition ${scheduleMode === "temporary" ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500"}`}
            >
              當天臨時
            </button>
          </div>

          {scheduleMode === "weekly" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-5 gap-2">
                {weekdays.map((day) => (
                  <button
                    key={day.value}
                    onClick={() => setSelectedWeekday(day.value)}
                    className={`rounded-2xl px-3 py-3 text-sm font-black transition ${selectedWeekday === day.value ? "bg-cyan-600 text-white shadow-lg shadow-cyan-100" : "bg-slate-50 text-slate-500 hover:bg-cyan-50 hover:text-cyan-700"}`}
                  >
                    {day.label}
                  </button>
                ))}
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
            </div>
          ) : (
            <label className="block space-y-2">
              <span className="text-xs font-black text-slate-400">臨時日期</span>
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="app-input px-4 py-3 font-black" />
            </label>
          )}

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

          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-400">聯絡電話（選填）</span>
            <input
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
              className="app-input px-4 py-3 font-bold"
              placeholder="例如：0912345678"
            />
          </label>

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
              {saving ? "儲存中..." : editingId ? "儲存修改" : scheduleMode === "weekly" ? "加入每週排程" : "加入臨時排程"}
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
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-blue-500">{scheduleMode === "weekly" ? "Weekly List" : "Temporary List"}</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">{listTitle}</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {scheduleMode === "weekly" ? "每週固定排程，停用後仍保留但不出現在首頁提醒。" : "只會在指定日期出現在首頁提醒。"}
              </p>
            </div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="app-input px-4 py-3 font-bold md:w-64" placeholder="搜尋姓名、年級、地點、電話" />
          </div>
        </div>

        <div className="space-y-3 p-6">
          {loading ? (
            <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center text-sm font-bold text-slate-400">交通車排程讀取中...</div>
          ) : visibleSchedules.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center text-sm font-bold text-slate-400">目前沒有符合條件的交通車排程。</div>
          ) : visibleSchedules.map((schedule) => (
            <div key={schedule.id} className={`rounded-3xl border p-4 transition ${schedule.is_active ? "border-cyan-100 bg-white shadow-sm" : "border-slate-100 bg-slate-50 opacity-60"}`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-2xl font-black text-slate-950">{schedule.transport_time.slice(0, 5)}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${schedule.direction === "inbound" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {directionLabels[schedule.direction]}
                    </span>
                    {(schedule.schedule_type || "weekly") === "temporary" && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">臨時</span>}
                    {!schedule.is_active && <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-black text-slate-500">已停用</span>}
                  </div>
                  <p className="mt-2 text-lg font-black text-slate-900">{schedule.grade || "未分級"} · {schedule.student_name}</p>
                  {schedule.contact_phone && <p className="mt-1 text-sm font-bold text-blue-700">電話：{schedule.contact_phone}</p>}
                  {schedule.location && <p className="mt-1 text-sm font-bold text-cyan-700">地點：{schedule.location}</p>}
                  {schedule.note && <p className="mt-1 text-sm font-bold text-slate-500">{schedule.note}</p>}
                  {(schedule.schedule_type || "weekly") === "weekly" && (schedule.start_date || schedule.end_date) && (
                    <p className="mt-1 text-xs font-black text-slate-400">
                      有效期間：{schedule.start_date || "不限"} 至 {schedule.end_date || "不限"}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => editSchedule(schedule)} className="rounded-2xl bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 transition hover:bg-blue-100">
                    編輯
                  </button>
                  <button onClick={() => toggleActive(schedule)} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-600 transition hover:bg-slate-200">
                    {schedule.is_active ? "停用" : "啟用"}
                  </button>
                  <button onClick={() => deleteSchedule(schedule)} className="rounded-2xl bg-red-50 px-4 py-2 text-sm font-black text-red-600 transition hover:bg-red-100">
                    刪除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
