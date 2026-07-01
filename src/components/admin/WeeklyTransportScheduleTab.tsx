"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getToday } from "@/lib/date";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  grade: string;
  student_phone?: string | null;
  enrollment_status?: string | null;
};

type WeeklySchedule = {
  id: string;
  schedule_type: "weekly";
  start_date: string | null;
  end_date: string | null;
  weekday: number;
  weekdays: number[] | null;
  transport_time: string;
  direction: "inbound" | "outbound";
  student_id: string | null;
  student_name: string;
  grade: string | null;
  contact_phone: string | null;
  contact_phone_2: string | null;
  location: string | null;
  note: string | null;
  is_active: boolean;
};

const weekdayOptions = [
  { value: 1, label: "週一" },
  { value: 2, label: "週二" },
  { value: 3, label: "週三" },
  { value: 4, label: "週四" },
  { value: 5, label: "週五" },
];
const gradeOrder = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];
const directionLabels = { inbound: "搭車來", outbound: "搭車回去" } as const;

export default function WeeklyTransportScheduleTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [schedules, setSchedules] = useState<WeeklySchedule[]>([]);
  const [startDate, setStartDate] = useState(getToday());
  const [endDate, setEndDate] = useState(getToday());
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [transportTime, setTransportTime] = useState("16:00");
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");
  const [studentInput, setStudentInput] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactPhone2, setContactPhone2] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [studentsRes, schedulesRes] = await Promise.all([
      supabase.from("students").select("id, name, grade, student_phone, enrollment_status"),
      supabase.from("transport_schedules").select("*").eq("schedule_type", "weekly").order("start_date").order("transport_time"),
    ]);

    if (studentsRes.error) {
      console.warn("學生資料讀取失敗:", studentsRes.error.message);
      setStudents([]);
    } else {
      setStudents(((studentsRes.data || []) as Student[])
        .filter((student) => (student.enrollment_status || "active") === "active")
        .sort((a, b) => {
          const aRank = gradeOrder.indexOf(a.grade);
          const bRank = gradeOrder.indexOf(b.grade);
          return (aRank === -1 ? 99 : aRank) - (bRank === -1 ? 99 : bRank) || a.name.localeCompare(b.name, "zh-Hant");
        }));
    }

    if (schedulesRes.error) {
      console.warn("固定交通車資料讀取失敗:", schedulesRes.error.message);
      setSchedules([]);
    } else {
      setSchedules((schedulesRes.data || []) as WeeklySchedule[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const studentLabel = (student: Student) => `${student.grade || "未分級"} · ${student.name}`;
  const selectedStudent = students.find((student) => studentLabel(student) === studentInput.trim() || student.name === studentInput.trim());
  const editingSchedule = schedules.find((schedule) => schedule.id === editingId);

  useEffect(() => {
    if (editingId || !selectedStudent?.student_phone || contactPhone.trim()) return;
    setContactPhone(selectedStudent.student_phone.trim());
  }, [contactPhone, editingId, selectedStudent]);

  const visibleSchedules = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return schedules
      .filter((schedule) => !keyword || `${schedule.student_name} ${schedule.grade || ""} ${schedule.location || ""} ${schedule.contact_phone || ""} ${schedule.contact_phone_2 || ""}`.toLowerCase().includes(keyword))
      .sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return (a.start_date || "9999-12-31").localeCompare(b.start_date || "9999-12-31") || a.transport_time.localeCompare(b.transport_time);
      });
  }, [schedules, search]);

  const resetForm = () => {
    setEditingId(null);
    setStartDate(getToday());
    setEndDate(getToday());
    setWeekdays([]);
    setTransportTime("16:00");
    setDirection("inbound");
    setStudentInput("");
    setContactPhone("");
    setContactPhone2("");
    setLocation("");
    setNote("");
  };

  const toggleWeekday = (weekday: number) => {
    setWeekdays((current) => current.includes(weekday)
      ? current.filter((item) => item !== weekday)
      : [...current, weekday].sort((a, b) => a - b));
  };

  const editSchedule = (schedule: WeeklySchedule) => {
    setEditingId(schedule.id);
    setStartDate(schedule.start_date || getToday());
    setEndDate(schedule.end_date || schedule.start_date || getToday());
    setWeekdays(schedule.weekdays?.length ? schedule.weekdays : [schedule.weekday]);
    setTransportTime(schedule.transport_time.slice(0, 5));
    setDirection(schedule.direction);
    setStudentInput(schedule.grade ? `${schedule.grade} · ${schedule.student_name}` : schedule.student_name);
    setContactPhone(schedule.contact_phone || "");
    setContactPhone2(schedule.contact_phone_2 || "");
    setLocation(schedule.location || "");
    setNote(schedule.note || "");
  };

  const saveSchedule = async () => {
    if (!startDate || !endDate) return alert("請設定開始與結束日期。");
    if (startDate > endDate) return alert("開始日期不能晚於結束日期。");
    if (weekdays.length === 0) return alert("請至少選擇一個固定搭車星期。");
    if (!studentInput.trim()) return alert("請輸入學生姓名。");
    if (!transportTime) return alert("請設定搭車時間。");
    if (saving) return;

    setSaving(true);
    const payload = {
      schedule_type: "weekly" as const,
      schedule_date: null,
      start_date: startDate,
      end_date: endDate,
      weekday: weekdays[0],
      weekdays,
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

    if (result.error) return alert(`${editingId ? "更新" : "新增"}固定交通車失敗：${result.error.message}`);
    resetForm();
    await fetchData();
  };

  const toggleActive = async (schedule: WeeklySchedule) => {
    const { error } = await supabase.from("transport_schedules")
      .update({ is_active: !schedule.is_active, updated_at: new Date().toISOString() })
      .eq("id", schedule.id);
    if (error) return alert(`更新失敗：${error.message}`);
    await fetchData();
  };

  const deleteSchedule = async (schedule: WeeklySchedule) => {
    if (!confirm(`確定刪除 ${schedule.student_name} 的固定交通車排程？`)) return;
    const { error } = await supabase.from("transport_schedules").delete().eq("id", schedule.id);
    if (error) return alert(`刪除失敗：${error.message}`);
    if (editingId === schedule.id) resetForm();
    await fetchData();
  };

  const weekdayText = (schedule: WeeklySchedule) => (schedule.weekdays?.length ? schedule.weekdays : [schedule.weekday])
    .sort((a, b) => a - b)
    .map((weekday) => weekdayOptions.find((option) => option.value === weekday)?.label)
    .filter(Boolean)
    .join("、");

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="app-card overflow-hidden">
        <div className="border-b border-cyan-100 bg-cyan-50/60 p-6">
          <p className="text-xs font-black uppercase tracking-widest text-cyan-600">Recurring Transport</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">{editingId ? "編輯固定交通車" : "新增固定交通車"}</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">設定有效日期與每週固定搭車日，可一次複選星期。</p>
        </div>

        <div className="space-y-4 p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2"><span className="text-xs font-black text-slate-400">開始日期</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="app-input px-4 py-3 font-black" /></label>
            <label className="space-y-2"><span className="text-xs font-black text-slate-400">結束日期</span><input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="app-input px-4 py-3 font-black" /></label>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-black text-slate-400">每週固定搭車日（可複選）</span>
            <div className="grid grid-cols-5 gap-2">
              {weekdayOptions.map((option) => (
                <button key={option.value} type="button" onClick={() => toggleWeekday(option.value)} className={`rounded-2xl px-2 py-3 text-sm font-black transition ${weekdays.includes(option.value) ? "bg-cyan-600 text-white shadow-md shadow-cyan-100" : "bg-slate-50 text-slate-500 hover:bg-cyan-50"}`}>{option.label}</button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2"><span className="text-xs font-black text-slate-400">時間</span><input type="time" value={transportTime} onChange={(event) => setTransportTime(event.target.value)} className="app-input px-4 py-3 font-black" /></label>
            <label className="space-y-2"><span className="text-xs font-black text-slate-400">方向</span><select value={direction} onChange={(event) => setDirection(event.target.value as "inbound" | "outbound")} className="app-input px-4 py-3 font-black"><option value="inbound">搭車來</option><option value="outbound">搭車回去</option></select></label>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-400">學生</span>
            <input list="weekly-transport-students" value={studentInput} onChange={(event) => setStudentInput(event.target.value)} className="app-input px-4 py-3 font-black" placeholder="直接輸入學生姓名" />
            <datalist id="weekly-transport-students">{students.map((student) => <option key={student.id} value={studentLabel(student)} />)}</datalist>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2"><span className="text-xs font-black text-slate-400">聯絡電話 1（選填）</span><input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} maxLength={40} className="app-input px-4 py-3 font-bold" placeholder="手機或市話，可含分機" /></label>
            <label className="space-y-2"><span className="text-xs font-black text-slate-400">聯絡電話 2（選填）</span><input value={contactPhone2} onChange={(event) => setContactPhone2(event.target.value)} maxLength={40} className="app-input px-4 py-3 font-bold" placeholder="例如：03-1234567 分機 123" /></label>
          </div>
          <label className="block space-y-2"><span className="text-xs font-black text-slate-400">地點（選填）</span><input value={location} onChange={(event) => setLocation(event.target.value)} className="app-input px-4 py-3 font-bold" placeholder="例如：本棟、分校門口、家門口" /></label>
          <label className="block space-y-2"><span className="text-xs font-black text-slate-400">備註（選填）</span><textarea value={note} onChange={(event) => setNote(event.target.value)} className="app-input min-h-24 px-4 py-3 font-bold" /></label>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <button onClick={() => void saveSchedule()} disabled={saving || students.length === 0} className="rounded-2xl bg-cyan-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-cyan-100 transition hover:bg-cyan-700 disabled:bg-slate-300">{saving ? "儲存中..." : editingId ? "儲存修改" : "加入固定排程"}</button>
            {editingId && <button onClick={resetForm} className="rounded-2xl bg-slate-100 px-5 py-4 text-sm font-black text-slate-600">取消編輯</button>}
          </div>
        </div>
      </section>

      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div><p className="text-xs font-black uppercase tracking-widest text-blue-500">Recurring List</p><h2 className="mt-1 text-2xl font-black text-slate-950">固定交通車排程</h2><p className="mt-1 text-sm font-bold text-slate-500">每位學生只需一筆資料，即可包含多個星期。</p></div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="app-input px-4 py-3 font-bold md:w-64" placeholder="搜尋姓名、年級、地點、電話" />
          </div>
        </div>
        <div className="space-y-3 p-6">
          {loading ? <div className="py-16 text-center text-sm font-bold text-slate-400">固定交通車資料讀取中...</div> : visibleSchedules.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center text-sm font-bold text-slate-400">目前沒有固定交通車排程。</div> : visibleSchedules.map((schedule) => (
            <div key={schedule.id} className={`rounded-3xl border p-4 ${schedule.is_active ? "border-cyan-100 bg-white shadow-sm" : "border-slate-100 bg-slate-50 opacity-60"}`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><span className="text-2xl font-black text-slate-950">{schedule.transport_time.slice(0, 5)}</span><span className={`rounded-full px-3 py-1 text-xs font-black ${schedule.direction === "inbound" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>{directionLabels[schedule.direction]}</span>{!schedule.is_active && <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-black text-slate-500">已停用</span>}</div>
                  <p className="mt-2 text-lg font-black text-slate-900">{schedule.grade || "未分級"} · {schedule.student_name}</p>
                  <p className="mt-1 text-sm font-black text-cyan-700">{weekdayText(schedule)}</p>
                  <p className="mt-1 text-xs font-black text-slate-400">有效期間：{schedule.start_date || "不限"} 至 {schedule.end_date || "不限"}</p>
                  {(schedule.contact_phone || schedule.contact_phone_2) && <p className="mt-1 text-sm font-bold text-blue-700">電話：{[schedule.contact_phone, schedule.contact_phone_2].filter(Boolean).join(" / ")}</p>}
                  {schedule.location && <p className="mt-1 text-sm font-bold text-cyan-700">地點：{schedule.location}</p>}
                  {schedule.note && <p className="mt-1 text-sm font-bold text-slate-500">{schedule.note}</p>}
                </div>
                <div className="flex flex-wrap gap-2"><button onClick={() => editSchedule(schedule)} className="rounded-2xl bg-blue-50 px-4 py-2 text-sm font-black text-blue-700">編輯</button><button onClick={() => void toggleActive(schedule)} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-600">{schedule.is_active ? "停用" : "啟用"}</button><button onClick={() => void deleteSchedule(schedule)} className="rounded-2xl bg-red-50 px-4 py-2 text-sm font-black text-red-600">刪除</button></div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
