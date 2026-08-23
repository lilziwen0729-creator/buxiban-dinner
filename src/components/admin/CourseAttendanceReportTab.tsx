"use client";

import { useEffect, useMemo, useState } from "react";
import { getTaipeiNow, getToday } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import { isStudentExpectedOnDate, type AttendanceScheduleMode } from "@/lib/attendanceSchedule";

type Course = {
  id: string;
  name: string;
  grade: string | null;
  day_of_week: number;
  start_date?: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at?: string | null;
};

type Student = {
  id: string;
  name: string;
  grade: string;
  enrollment_status?: string | null;
  attendance_schedule_mode?: AttendanceScheduleMode | null;
  attendance_schedule_days?: number[] | null;
};

type StudentCourse = {
  student_id: string;
  course_id: string;
  start_date?: string | null;
  created_at?: string | null;
};

type AttendanceLog = {
  id: string;
  student_id: string;
  course_id: string | null;
  date: string;
  status: string;
};

const weekdays = [
  { value: 1, label: "週一" },
  { value: 2, label: "週二" },
  { value: 3, label: "週三" },
  { value: 4, label: "週四" },
  { value: 5, label: "週五" },
  { value: 6, label: "週六" },
  { value: 7, label: "週日" },
];

const presentStatuses = new Set(["arrived", "homework_done", "left"]);
const getWeekdayNumber = (date: Date) => {
  const day = date.getDay();
  return day === 0 ? 7 : day;
};
const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const normalizeTime = (time: string | null) => time ? time.slice(0, 5) : "";
const dateOnly = (value?: string | null) => value ? value.slice(0, 10) : "";

const maxDate = (...values: string[]) => {
  const sorted = values.filter(Boolean).sort();
  return sorted[sorted.length - 1] || "";
};

export default function CourseAttendanceReportTab() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentCourses, setStudentCourses] = useState<StudentCourse[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [month, setMonth] = useState(getToday().slice(0, 7));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const monthStart = `${month}-01`;
  const monthEnd = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    return formatDate(new Date(year, monthNumber, 0));
  }, [month]);

  const fetchData = async () => {
    setLoading(true);
    const [courseRes, studentRes, relationResWithStartDate, logRes] = await Promise.all([
      supabase.from("courses").select("id, name, grade, day_of_week, start_date, start_time, end_time, created_at").order("day_of_week").order("start_time"),
      supabase.from("students").select("id, name, grade, enrollment_status, attendance_schedule_mode, attendance_schedule_days"),
      supabase.from("student_courses").select("student_id, course_id, start_date, created_at"),
      supabase
        .from("attendance_logs")
        .select("id, student_id, course_id, date, status")
        .not("course_id", "is", null)
        .gte("date", `${new Date().getFullYear() - 1}-01-01`),
    ]);
    const courseFallbackRes = courseRes.error
      ? await supabase.from("courses").select("id, name, grade, day_of_week, start_time, end_time, created_at").order("day_of_week").order("start_time")
      : courseRes;
    const relationRes = relationResWithStartDate.error
      ? await supabase.from("student_courses").select("student_id, course_id, created_at")
      : relationResWithStartDate;

    const courseList = (courseFallbackRes.data || []) as Course[];
    setCourses(courseList);
    setStudents(((studentRes.data || []) as Student[]).filter((student) => (student.enrollment_status || "active") === "active"));
    setStudentCourses((relationRes.data || []) as StudentCourse[]);
    setAttendanceLogs((logRes.data || []) as AttendanceLog[]);
    setSelectedCourseId((current) => current || courseList[0]?.id || "");
    setLoading(false);
  };

  const getCourseDates = (course: Course, targetMonth = month, fromDate = "") => {
    const [year, monthNumber] = targetMonth.split("-").map(Number);
    const firstDay = new Date(year, monthNumber - 1, 1);
    const lastDay = new Date(year, monthNumber, 0);
    const today = getTaipeiNow();
    const dates: string[] = [];

    for (let date = new Date(firstDay); date <= lastDay; date.setDate(date.getDate() + 1)) {
      if (date > today) break;
      if (getWeekdayNumber(date) === Number(course.day_of_week)) {
        const formatted = formatDate(date);
        if (!fromDate || formatted >= fromDate) dates.push(formatted);
      }
    }

    return dates;
  };

  const studentMap = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);
  const getStudentCourseStartDate = (course: Course, relation: StudentCourse) =>
    maxDate(monthStart, dateOnly(course.start_date), dateOnly(course.created_at), dateOnly(relation.start_date), dateOnly(relation.created_at));

  const courseReports = useMemo(() => courses.map((course) => {
    const enrolledRelations = studentCourses
      .filter((item) => item.course_id === course.id && studentMap.has(item.student_id));
    const enrolledIds = enrolledRelations.map((item) => item.student_id);
    const courseDates = getCourseDates(course);
    const expectedByStudent = new Map(
      enrolledRelations.map((item) => {
        const student = studentMap.get(item.student_id);
        const validDates = getCourseDates(course, month, getStudentCourseStartDate(course, item))
          .filter((date) => !student || isStudentExpectedOnDate(student, date));
        return [item.student_id, validDates];
      })
    );
    const logs = attendanceLogs.filter((log) =>
      log.course_id === course.id &&
      log.date >= monthStart &&
      log.date <= monthEnd &&
      enrolledIds.includes(log.student_id)
    );
    const validLogs = logs.filter((log) => (expectedByStudent.get(log.student_id) || []).includes(log.date));
    const present = validLogs.filter((log) => presentStatuses.has(log.status)).length;
    const leave = validLogs.filter((log) => log.status === "leave").length;
    const expected = Array.from(expectedByStudent.values()).reduce((sum, dates) => sum + dates.length, 0);
    const missing = Math.max(expected - present - leave, 0);
    const rate = expected > 0 ? Math.round((present / expected) * 100) : 0;

    return { course, courseDates, enrolledIds, enrolledRelations, expectedByStudent, present, leave, expected, missing, rate };
  }), [attendanceLogs, courses, monthEnd, monthStart, studentCourses, studentMap]);

  const selectedReport = courseReports.find((report) => report.course.id === selectedCourseId) || courseReports[0];

  const studentReports = useMemo(() => {
    if (!selectedReport) return [];
    const { course, enrolledIds, expectedByStudent } = selectedReport;

    return enrolledIds.map((studentId) => {
      const student = studentMap.get(studentId);
      const courseDates = expectedByStudent.get(studentId) || [];
      const logs = attendanceLogs.filter((log) =>
        log.course_id === course.id &&
        log.student_id === studentId &&
        log.date >= monthStart &&
        log.date <= monthEnd &&
        courseDates.includes(log.date)
      );
      const logByDate = new Map(logs.map((log) => [log.date, log]));
      const present = logs.filter((log) => presentStatuses.has(log.status)).length;
      const leave = logs.filter((log) => log.status === "leave").length;
      const missingDates = courseDates.filter((date) => {
        const log = logByDate.get(date);
        return !log || (!presentStatuses.has(log.status) && log.status !== "leave");
      });
      const unstableDates = courseDates.filter((date) => {
        const log = logByDate.get(date);
        return !log || !presentStatuses.has(log.status);
      });
      const expected = courseDates.length;
      const rate = expected > 0 ? Math.round((present / expected) * 100) : 0;

      return {
        student,
        present,
        leave,
        expected,
        missing: missingDates.length,
        recentUnstable: unstableDates.slice(-4).reverse(),
        rate,
      };
    }).filter((report) => report.student)
      .sort((a, b) => a.rate - b.rate || b.missing - a.missing || (a.student?.name || "").localeCompare(b.student?.name || "", "zh-TW"));
  }, [attendanceLogs, monthEnd, monthStart, selectedReport, studentMap]);

  const unstableStudents = studentReports.filter((report) => report.missing > 0 || report.leave > 0).slice(0, 12);
  const totalExpected = courseReports.reduce((sum, report) => sum + report.expected, 0);
  const totalPresent = courseReports.reduce((sum, report) => sum + report.present, 0);
  const overallRate = totalExpected > 0 ? Math.round((totalPresent / totalExpected) * 100) : 0;
  const selectedCourse = selectedReport?.course;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-blue-500">Course Attendance</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">課程點名報表</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">追蹤每個國中課程的出席率、到課人數與學生穩定度。</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="app-input px-5 py-3 font-black" />
              <button onClick={fetchData} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-600">
                {loading ? "同步中..." : "重新整理"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-4">
          {[
            { label: "課程數", value: courses.length, tone: "border-blue-100 bg-blue-50 text-blue-700" },
            { label: "本月實到", value: totalPresent, tone: "border-emerald-100 bg-emerald-50 text-emerald-700" },
            { label: "整體出席率", value: `${overallRate}%`, tone: "border-amber-100 bg-amber-50 text-amber-700" },
            { label: "需關注學生", value: unstableStudents.length, tone: "border-red-100 bg-red-50 text-red-700" },
          ].map((item) => (
            <div key={item.label} className={`rounded-2xl border p-4 ${item.tone}`}>
              <p className="text-sm font-black opacity-75">{item.label}</p>
              <p className="mt-2 text-3xl font-black">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="app-card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/70 p-5">
            <h3 className="text-xl font-black text-slate-950">課程總表</h3>
            <p className="mt-1 text-sm font-bold text-slate-500">依本月已發生課程日計算。</p>
          </div>
          <div className="space-y-2 p-4 sm:p-5 lg:max-h-[620px] lg:overflow-y-auto">
            {courseReports.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center text-sm font-bold text-slate-400">目前沒有課程資料。</div>
            ) : (
              courseReports.map((report) => {
                const weekday = weekdays.find((day) => day.value === report.course.day_of_week)?.label || `週${report.course.day_of_week}`;
                return (
                  <button
                    key={report.course.id}
                    onClick={() => setSelectedCourseId(report.course.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedCourseId === report.course.id
                        ? "border-blue-300 bg-blue-50 shadow-sm"
                        : "border-slate-100 bg-white hover:border-blue-100 hover:bg-blue-50/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-black text-slate-950">{report.course.name}</p>
                        <p className="mt-1 text-sm font-bold text-slate-500">
                          {report.course.grade || "未分級"} · {weekday}
                          {report.course.start_time && ` · ${normalizeTime(report.course.start_time)}${report.course.end_time ? `-${normalizeTime(report.course.end_time)}` : ""}`}
                        </p>
                        <p className="mt-2 text-xs font-black text-slate-400">
                          學生 {report.enrolledIds.length} · 本月 {report.courseDates.length} 次課
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-3xl font-black ${report.rate >= 85 ? "text-emerald-600" : report.rate >= 70 ? "text-amber-600" : "text-red-600"}`}>{report.rate}%</p>
                        <p className="mt-1 text-xs font-black text-slate-400">{report.present}/{report.expected}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-black">
                      <span className="rounded-xl bg-emerald-50 px-2 py-2 text-emerald-700">實到 {report.present}</span>
                      <span className="rounded-xl bg-amber-50 px-2 py-2 text-amber-700">請假 {report.leave}</span>
                      <span className="rounded-xl bg-red-50 px-2 py-2 text-red-700">缺席 {report.missing}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="space-y-5">
          <div className="app-card overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/70 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-950">{selectedCourse?.name || "選擇課程"}</h3>
                  <p className="mt-1 text-sm font-bold text-slate-500">學生出席穩定度，低出席率會排在前面。</p>
                </div>
                {selectedReport && (
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                    本月到課 {selectedReport.present} 人次
                  </span>
                )}
              </div>
            </div>

            <div className="lg:max-h-[430px] lg:overflow-y-auto">
              {studentReports.length === 0 ? (
                <div className="p-16 text-center text-sm font-bold text-slate-400">此課程尚未綁定學生。</div>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white text-xs font-black uppercase tracking-widest text-slate-400">
                    <tr className="border-b border-slate-100">
                      <th className="px-5 py-4">學生</th>
                      <th className="px-5 py-4">出席率</th>
                      <th className="px-5 py-4">實到</th>
                      <th className="px-5 py-4">請假</th>
                      <th className="px-5 py-4">缺席</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentReports.map((report) => (
                      <tr key={report.student?.id} className="hover:bg-blue-50/40">
                        <td className="px-5 py-4">
                          <p className="font-black text-slate-900">{report.student?.name}</p>
                          <p className="mt-1 text-xs font-bold text-slate-400">{report.student?.grade}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full px-3 py-1 text-sm font-black ${report.rate >= 85 ? "bg-emerald-50 text-emerald-700" : report.rate >= 70 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                            {report.rate}%
                          </span>
                        </td>
                        <td className="px-5 py-4 font-black text-emerald-700">{report.present}/{report.expected}</td>
                        <td className="px-5 py-4 font-black text-amber-700">{report.leave}</td>
                        <td className="px-5 py-4 font-black text-red-600">{report.missing}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="app-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-red-500">Attention</p>
                <h3 className="mt-1 text-xl font-black text-slate-950">最近需關注學生</h3>
              </div>
              <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600">{unstableStudents.length} 人</span>
            </div>
            {unstableStudents.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 py-10 text-center text-sm font-bold text-slate-400">目前沒有缺席或請假紀錄。</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {unstableStudents.map((report) => (
                  <div key={report.student?.id} className="rounded-2xl border border-red-100 bg-red-50/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-950">{report.student?.grade} · {report.student?.name}</p>
                        <p className="mt-1 text-sm font-bold text-red-600">缺席 {report.missing} 次 · 請假 {report.leave} 次</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-red-600">{report.rate}%</span>
                    </div>
                    <p className="mt-3 text-xs font-black text-slate-400">最近未穩定日期</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {report.recentUnstable.length === 0 ? (
                        <span className="rounded-xl bg-white px-3 py-1 text-xs font-black text-slate-400">無</span>
                      ) : report.recentUnstable.map((date) => (
                        <span key={date} className="rounded-xl bg-white px-3 py-1 text-xs font-black text-red-600">{date.slice(5)}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
