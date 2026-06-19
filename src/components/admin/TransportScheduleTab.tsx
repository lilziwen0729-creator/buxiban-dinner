"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getTaipeiNow } from "@/lib/date";

type Student = {
  id: string;
  name: string;
  grade: string;
  enrollment_status?: string | null;
};

type TransportSchedule = {
  id: string;
  weekday: number;
  transport_time: string;
  direction: "inbound" | "outbound";
  student_id: string | null;
  student_name: string;
  grade: string | null;
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

export default function TransportScheduleTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [schedules, setSchedules] = useState<TransportSchedule[]>([]);
  const [selectedWeekday, setSelectedWeekday] = useState(todayWeekday >= 1 && todayWeekday <= 5 ? todayWeekday : 1);
  const [studentInput, setStudentInput] = useState("");
  const [transportTime, setTransportTime] = useState("16:00");
  const [direction, setDirection] = useState<TransportSchedule["direction"]>("inbound");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [studentsRes, schedulesRes] = await Promise.all([
      supabase.from("students").select("id, name, grade, enrollment_status").order("grade"),
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
  const visibleSchedules = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return schedules
      .filter((schedule) => schedule.weekday === selectedWeekday)
      .filter((schedule) => !keyword || `${schedule.student_name} ${schedule.grade || ""} ${schedule.location || ""}`.toLowerCase().includes(keyword))
      .sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return a.transport_time.localeCompare(b.transport_time);
      });
  }, [schedules, selectedWeekday, search]);

  const addSchedule = async () => {
    if (!studentInput.trim()) return alert("請輸入學生姓名。");
    if (!transportTime) return alert("請設定搭車時間。");
    if (saving) return;

    setSaving(true);
    const { error } = await supabase.from("transport_schedules").insert([{
      weekday: selectedWeekday,
      transport_time: transportTime,
      direction,
      student_id: selectedStudent?.id || null,
      student_name: selectedStudent?.name || studentInput.trim(),
      grade: selectedStudent?.grade || null,
      location: location.trim() || null,
      note: note.trim() || null,
      is_active: true,
    }]);

    setSaving(false);
    if (error) return alert(`新增交通車排程失敗：${error.message}`);
    setStudentInput("");
    setLocation("");
    setNote("");
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
    fetchData();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <p className="text-xs font-black uppercase tracking-widest text-cyan-500">Transport</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">新增交通車排程</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">設定每週固定搭車名單，首頁會自動顯示今日提醒。</p>
        </div>

        <div className="space-y-4 p-6">
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
            <span className="text-xs font-black text-slate-400">地點</span>
            <input value={location} onChange={(event) => setLocation(event.target.value)} className="app-input px-4 py-3 font-bold" placeholder="例如：本棟、分校門口、家門口" />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-400">備註</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} className="app-input min-h-24 px-4 py-3 font-bold" placeholder="例如：週三先到本棟接、家長會在門口等" />
          </label>

          <button onClick={addSchedule} disabled={saving || students.length === 0} className="w-full rounded-2xl bg-cyan-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-cyan-100 transition hover:bg-cyan-700 disabled:bg-slate-300">
            {saving ? "新增中..." : "加入每週排程"}
          </button>
        </div>
      </section>

      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-blue-500">Weekly List</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">{weekdays.find((day) => day.value === selectedWeekday)?.label} 交通車名單</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">依時間排序，停用的排程會保留但不出現在首頁提醒。</p>
            </div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="app-input px-4 py-3 font-bold md:w-64" placeholder="搜尋姓名、年級、地點" />
          </div>
        </div>

        <div className="space-y-3 p-6">
          {loading ? (
            <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center text-sm font-bold text-slate-400">交通車排程讀取中...</div>
          ) : visibleSchedules.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center text-sm font-bold text-slate-400">這天還沒有交通車排程。</div>
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
                  </div>
                  <p className="mt-2 text-lg font-black text-slate-900">{schedule.grade || "未分級"} · {schedule.student_name}</p>
                  {schedule.location && <p className="mt-1 text-sm font-bold text-cyan-700">地點：{schedule.location}</p>}
                  {schedule.note && <p className="mt-1 text-sm font-bold text-slate-500">{schedule.note}</p>}
                </div>
                <div className="flex gap-2">
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
