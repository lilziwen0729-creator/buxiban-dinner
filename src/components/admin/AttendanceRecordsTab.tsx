"use client";

import { useEffect, useMemo, useState } from "react";
import { getToday } from "@/lib/date";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  grade: string | null;
  enrollment_status?: string | null;
};

type Course = {
  id: string;
  name: string;
  grade: string | null;
};

type AttendanceLog = {
  id: string;
  student_id: string;
  course_id: string | null;
  date: string;
  status: string;
  arrival_time?: string | null;
  homework_time?: string | null;
  leave_time?: string | null;
  created_at?: string | null;
};

type AttendanceRow = AttendanceLog & {
  student?: Student;
  course?: Course;
};

const gradeOrder = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三"];

const statusLabels: Record<string, string> = {
  pending: "未到",
  arrived: "到班",
  homework_done: "作業完成",
  left: "已離班",
  leave: "請假",
};

const statusTone: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  arrived: "bg-blue-50 text-blue-700",
  homework_done: "bg-emerald-50 text-emerald-700",
  left: "bg-indigo-50 text-indigo-700",
  leave: "bg-amber-50 text-amber-700",
};

const monthStart = (month: string) => `${month}-01`;

const monthEnd = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).toISOString().slice(0, 10);
};

const weekdayLabel = (date: string) => {
  const day = new Date(`${date}T00:00:00+08:00`).getDay();
  return ["週日", "週一", "週二", "週三", "週四", "週五", "週六"][day] || "";
};

const formatTime = (value?: string | null) => {
  if (!value) return "-";
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 5);
  return date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
};

const csvCell = (value: unknown) => {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};

const downloadCsv = (filename: string, headers: string[], rows: unknown[][]) => {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const sortGrades = (grades: string[]) =>
  [...grades].sort((a, b) => {
    const aIndex = gradeOrder.indexOf(a);
    const bIndex = gradeOrder.indexOf(b);
    if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    return a.localeCompare(b, "zh-TW");
  });

export default function AttendanceRecordsTab() {
  const today = getToday();
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState(today.slice(0, 7));
  const [dateFilter, setDateFilter] = useState("");
  const [exportStart, setExportStart] = useState(monthStart(today.slice(0, 7)));
  const [exportEnd, setExportEnd] = useState(today);
  const [exportGrades, setExportGrades] = useState<string[]>([]);

  useEffect(() => {
    void fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [studentRes, courseRes, logRes] = await Promise.all([
      supabase.from("students").select("id, name, grade, enrollment_status").order("grade").order("name"),
      supabase.from("courses").select("id, name, grade"),
      supabase
        .from("attendance_logs")
        .select("id, student_id, course_id, date, status, arrival_time, homework_time, leave_time, created_at")
        .gte("date", `${new Date().getFullYear() - 1}-01-01`)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    if (studentRes.error || courseRes.error || logRes.error) {
      alert(`讀取出缺席紀錄失敗：${studentRes.error?.message || courseRes.error?.message || logRes.error?.message}`);
    }

    const studentList = (studentRes.data || []) as Student[];
    setStudents(studentList);
    setCourses((courseRes.data || []) as Course[]);
    setLogs((logRes.data || []) as AttendanceLog[]);
    setExportGrades((current) => current.length ? current : sortGrades(Array.from(new Set(studentList.map((student) => student.grade || "未分級")))));
    setLoading(false);
  };

  const studentMap = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);
  const grades = useMemo(() => sortGrades(Array.from(new Set(students.map((student) => student.grade || "未分級")))), [students]);

  const rows = useMemo<AttendanceRow[]>(() => logs.map((log) => ({
    ...log,
    student: studentMap.get(log.student_id),
    course: log.course_id ? courseMap.get(log.course_id) : undefined,
  })), [courseMap, logs, studentMap]);

  const availableStudents = useMemo(() => students
    .filter((student) => gradeFilter === "all" || (student.grade || "未分級") === gradeFilter)
    .sort((a, b) => (a.grade || "").localeCompare(b.grade || "", "zh-TW") || a.name.localeCompare(b.name, "zh-TW")),
  [gradeFilter, students]);

  const filteredRows = useMemo(() => {
    const start = dateFilter || monthStart(monthFilter);
    const end = dateFilter || monthEnd(monthFilter);

    return rows.filter((row) => {
      const grade = row.student?.grade || "未分級";
      if (row.date < start || row.date > end) return false;
      if (gradeFilter !== "all" && grade !== gradeFilter) return false;
      if (studentFilter !== "all" && row.student_id !== studentFilter) return false;
      return true;
    });
  }, [dateFilter, gradeFilter, monthFilter, rows, studentFilter]);

  const exportRows = useMemo(() => rows.filter((row) => {
    const grade = row.student?.grade || "未分級";
    return row.date >= exportStart && row.date <= exportEnd && exportGrades.includes(grade);
  }), [exportEnd, exportGrades, exportStart, rows]);

  const stats = useMemo(() => {
    const leave = filteredRows.filter((row) => row.status === "leave").length;
    const present = filteredRows.filter((row) => ["arrived", "homework_done", "left"].includes(row.status)).length;
    const left = filteredRows.filter((row) => row.status === "left").length;
    const pending = filteredRows.filter((row) => row.status === "pending").length;
    return { total: filteredRows.length, present, leave, left, pending };
  }, [filteredRows]);

  const exportDetail = () => {
    if (!exportRows.length) {
      alert("目前匯出條件沒有資料。");
      return;
    }

    downloadCsv(
      `出缺席明細_${exportStart}_${exportEnd}.csv`,
      ["日期", "星期", "年級", "學生姓名", "課程", "狀態", "到班時間", "作業完成時間", "離班時間"],
      exportRows.map((row) => [
        row.date,
        weekdayLabel(row.date),
        row.student?.grade || "未分級",
        row.student?.name || "未知學生",
        row.course?.name || "國小課輔",
        statusLabels[row.status] || row.status,
        formatTime(row.arrival_time),
        formatTime(row.homework_time),
        formatTime(row.leave_time),
      ]),
    );
  };

  const exportCountSummary = () => {
    if (!exportRows.length) {
      alert("目前匯出條件沒有資料。");
      return;
    }

    const summary = new Map<string, { date: string; grade: string; total: number; present: number; leave: number; pending: number; left: number }>();
    exportRows.forEach((row) => {
      const grade = row.student?.grade || "未分級";
      const key = `${row.date}__${grade}`;
      const item = summary.get(key) || { date: row.date, grade, total: 0, present: 0, leave: 0, pending: 0, left: 0 };
      item.total += 1;
      if (["arrived", "homework_done", "left"].includes(row.status)) item.present += 1;
      if (row.status === "leave") item.leave += 1;
      if (row.status === "pending") item.pending += 1;
      if (row.status === "left") item.left += 1;
      summary.set(key, item);
    });

    const rowsToExport = Array.from(summary.values()).sort((a, b) =>
      a.date.localeCompare(b.date) || gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade)
    );

    downloadCsv(
      `點名人數彙總_${exportStart}_${exportEnd}.csv`,
      ["日期", "星期", "年級", "紀錄筆數", "到班人數", "請假人數", "未到筆數", "已離班人數"],
      rowsToExport.map((row) => [row.date, weekdayLabel(row.date), row.grade, row.total, row.present, row.leave, row.pending, row.left]),
    );
  };

  const toggleExportGrade = (grade: string) => {
    setExportGrades((current) =>
      current.includes(grade) ? current.filter((item) => item !== grade) : [...current, grade]
    );
  };

  return (
    <div className="space-y-5">
      <section className="app-card overflow-hidden">
        <div className="border-b border-rose-100 bg-white/70 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-rose-500">Attendance Records</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">出缺席紀錄</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">查詢學生歷史到班、請假、離班紀錄，並匯出 Excel 可開啟的 CSV。</p>
            </div>
            <button onClick={fetchData} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-rose-500">
              {loading ? "同步中..." : "重新整理"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-5">
          {[
            { label: "紀錄筆數", value: stats.total, tone: "border-blue-100 bg-blue-50 text-blue-700" },
            { label: "到班", value: stats.present, tone: "border-emerald-100 bg-emerald-50 text-emerald-700" },
            { label: "請假", value: stats.leave, tone: "border-amber-100 bg-amber-50 text-amber-700" },
            { label: "未到", value: stats.pending, tone: "border-slate-100 bg-slate-50 text-slate-700" },
            { label: "已離班", value: stats.left, tone: "border-indigo-100 bg-indigo-50 text-indigo-700" },
          ].map((item) => (
            <div key={item.label} className={`rounded-3xl border p-4 ${item.tone}`}>
              <p className="text-sm font-black opacity-75">{item.label}</p>
              <p className="mt-2 text-3xl font-black">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="app-card overflow-hidden">
        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/70 p-5 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto] lg:items-end">
          <label className="space-y-2">
            <span className="text-xs font-black text-slate-400">年級</span>
            <select value={gradeFilter} onChange={(event) => { setGradeFilter(event.target.value); setStudentFilter("all"); }} className="app-input px-4 py-3 font-bold">
              <option value="all">全部年級</option>
              {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black text-slate-400">月份</span>
            <input type="month" value={monthFilter} onChange={(event) => { setMonthFilter(event.target.value); setDateFilter(""); }} className="app-input px-4 py-3 font-bold" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black text-slate-400">單日</span>
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="app-input px-4 py-3 font-bold" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black text-slate-400">學生</span>
            <select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)} className="app-input px-4 py-3 font-bold">
              <option value="all">全部學生</option>
              {availableStudents.map((student) => (
                <option key={student.id} value={student.id}>{student.grade || "未分級"} · {student.name}</option>
              ))}
            </select>
          </label>
          <button onClick={() => { setGradeFilter("all"); setStudentFilter("all"); setDateFilter(""); setMonthFilter(today.slice(0, 7)); }} className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-600">
            清除篩選
          </button>
        </div>

        <div className="border-b border-slate-100 bg-white p-5">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-orange-500">Export</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">匯出出缺席 Excel</h3>
              <p className="mt-1 text-sm font-bold text-slate-500">選擇日期區間與年級，可匯出逐筆明細或點名人數彙總。</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button onClick={exportCountSummary} className="rounded-2xl bg-orange-50 px-5 py-3 text-sm font-black text-orange-700 transition hover:bg-orange-500 hover:text-white">
                匯出點名人數
              </button>
              <button onClick={exportDetail} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-rose-500">
                匯出明細
              </button>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_2fr]">
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">起始日期</span>
              <input type="date" value={exportStart} onChange={(event) => setExportStart(event.target.value)} className="app-input px-4 py-3 font-bold" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">結束日期</span>
              <input type="date" value={exportEnd} onChange={(event) => setExportEnd(event.target.value)} className="app-input px-4 py-3 font-bold" />
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black text-slate-400">匯出年級</span>
                <div className="flex gap-2">
                  <button onClick={() => setExportGrades(grades)} className="text-xs font-black text-blue-600">全選</button>
                  <button onClick={() => setExportGrades([])} className="text-xs font-black text-slate-400">清空</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {grades.map((grade) => (
                  <button
                    key={grade}
                    onClick={() => toggleExportGrade(grade)}
                    className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                      exportGrades.includes(grade)
                        ? "bg-rose-500 text-white shadow-sm shadow-rose-100"
                        : "bg-rose-50 text-slate-500 hover:bg-rose-100"
                    }`}
                  >
                    {grade}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-[420px] overflow-x-auto">
          {loading ? (
            <div className="p-20 text-center font-bold text-slate-400">出缺席紀錄載入中...</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-20 text-center font-bold text-slate-400">目前沒有符合條件的出缺席紀錄。</div>
          ) : (
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-xs uppercase tracking-widest text-slate-400">
                  <th className="px-5 py-4 font-black">日期</th>
                  <th className="px-5 py-4 font-black">學生</th>
                  <th className="px-5 py-4 font-black">課程</th>
                  <th className="px-5 py-4 font-black">狀態</th>
                  <th className="px-5 py-4 font-black">到班</th>
                  <th className="px-5 py-4 font-black">作業</th>
                  <th className="px-5 py-4 font-black">離班</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr key={row.id} className="transition hover:bg-rose-50/50">
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-900">{row.date}</p>
                      <p className="mt-1 text-xs font-bold text-slate-400">{weekdayLabel(row.date)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-900">{row.student?.name || "未知學生"}</p>
                      <p className="mt-1 text-xs font-bold text-slate-400">{row.student?.grade || "未分級"}</p>
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-600">{row.course?.name || "國小課輔"}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${statusTone[row.status] || "bg-slate-100 text-slate-600"}`}>
                        {statusLabels[row.status] || row.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-500">{formatTime(row.arrival_time)}</td>
                    <td className="px-5 py-4 font-bold text-slate-500">{formatTime(row.homework_time)}</td>
                    <td className="px-5 py-4 font-bold text-slate-500">{formatTime(row.leave_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
