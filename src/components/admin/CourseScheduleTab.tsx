"use client";

import { useEffect, useMemo, useState } from "react";
import { logOperation } from "@/lib/operationLog";
import { supabase } from "@/lib/supabase";

type Course = {
  id: string;
  name: string;
  grade: string | null;
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
};

type Student = {
  id: string;
  name: string;
  grade: string;
  enrollment_status?: string;
};

type StudentCourse = {
  id: string;
  student_id: string;
  course_id: string;
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

const gradeOrder = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];

const emptyForm = {
  name: "",
  grade: "國一",
  day_of_week: 1,
  start_time: "",
  end_time: "",
};

const normalizeTime = (time: string | null) => time ? time.slice(0, 5) : "";
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export default function CourseScheduleTab() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentCourses, setStudentCourses] = useState<StudentCourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [formData, setFormData] = useState(emptyForm);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studentGradeFilter, setStudentGradeFilter] = useState("all");
  const [studentKeyword, setStudentKeyword] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [courseRes, studentRes, relationRes] = await Promise.all([
      supabase.from("courses").select("*").order("day_of_week").order("start_time").order("name"),
      supabase.from("students").select("id, name, grade, enrollment_status").order("grade").order("name"),
      supabase.from("student_courses").select("*"),
    ]);

    const courseList = (courseRes.data || []) as Course[];
    const relationList = (relationRes.data || []) as StudentCourse[];

    setCourses(courseList);
    setStudents(((studentRes.data || []) as Student[]).filter((student) => (student.enrollment_status || "active") === "active").sort((a, b) => {
      const gradeA = gradeOrder.indexOf(a.grade);
      const gradeB = gradeOrder.indexOf(b.grade);
      return (gradeA === -1 ? 99 : gradeA) - (gradeB === -1 ? 99 : gradeB) || a.name.localeCompare(b.name, "zh-TW");
    }));
    setStudentCourses(relationList);

    const nextSelected = selectedCourseId || courseList[0]?.id || "";
    setSelectedCourseId(nextSelected);
    setSelectedStudentIds(relationList.filter((item) => item.course_id === nextSelected).map((item) => item.student_id));
    setLoading(false);
  };

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);

  useEffect(() => {
    setSelectedStudentIds(studentCourses.filter((item) => item.course_id === selectedCourseId).map((item) => item.student_id));
    const course = courses.find((item) => item.id === selectedCourseId);
    if (course?.grade) setStudentGradeFilter(course.grade);
  }, [selectedCourseId, studentCourses, courses]);

  const courseStats = useMemo(() => {
    return { total: courses.length };
  }, [courses]);

  const studentsInSelectedCourse = students.filter((student) => selectedStudentIds.includes(student.id));
  const visibleStudents = students.filter((student) => {
    const keyword = studentKeyword.trim().toLowerCase();
    if (studentGradeFilter !== "all" && student.grade !== studentGradeFilter) return false;
    if (!keyword) return true;
    return [student.name, student.grade].some((value) => (value || "").toLowerCase().includes(keyword));
  });

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingCourseId(null);
  };

  const editCourse = (course: Course) => {
    setEditingCourseId(course.id);
    setFormData({
      name: course.name || "",
      grade: course.grade || "國一",
      day_of_week: course.day_of_week || 1,
      start_time: normalizeTime(course.start_time),
      end_time: normalizeTime(course.end_time),
    });
  };

  const saveCourse = async () => {
    if (!formData.name.trim()) return alert("請輸入課程名稱。");
    if (saving) return;

    setSaving(true);
    const payload = {
      name: formData.name.trim(),
      grade: formData.grade || null,
      day_of_week: Number(formData.day_of_week),
      start_time: formData.start_time || null,
      end_time: formData.end_time || null,
    };

    try {
      if (editingCourseId) {
        const { error } = await supabase.from("courses").update(payload).eq("id", editingCourseId);
        if (error) throw error;
        await logOperation({
          action: "course_update",
          targetType: "course",
          targetId: editingCourseId,
          targetName: payload.name,
          metadata: payload,
        });
      } else {
        const { data, error } = await supabase.from("courses").insert([payload]).select("id").single();
        if (error) throw error;
        await logOperation({
          action: "course_create",
          targetType: "course",
          targetId: data?.id,
          targetName: payload.name,
          metadata: payload,
        });
        if (data?.id) setSelectedCourseId(data.id);
      }

      resetForm();
      await fetchData();
    } catch (err: any) {
      alert("儲存課程失敗：" + (err?.message || "請稍後再試"));
    } finally {
      setSaving(false);
    }
  };

  const deleteCourse = async (course: Course) => {
    if (!confirm(`確定刪除「${course.name}」？\n學生綁定也會一併移除。`)) return;
    const { error } = await supabase.from("courses").delete().eq("id", course.id);
    if (error) return alert("刪除課程失敗：" + error.message);

    await logOperation({
      action: "course_delete",
      targetType: "course",
      targetId: course.id,
      targetName: course.name,
    });
    if (selectedCourseId === course.id) setSelectedCourseId("");
    fetchData();
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    );
  };

  const saveCourseStudents = async () => {
    if (!selectedCourseId) return alert("請先選擇課程。");

    const { error: deleteError } = await supabase.from("student_courses").delete().eq("course_id", selectedCourseId);
    if (deleteError) return alert("更新學生名單失敗：" + deleteError.message);

    if (selectedStudentIds.length > 0) {
      const rows = selectedStudentIds.map((studentId) => ({ course_id: selectedCourseId, student_id: studentId }));
      const { error: insertError } = await supabase.from("student_courses").insert(rows);
      if (insertError) return alert("更新學生名單失敗：" + insertError.message);
    }

    await logOperation({
      action: "course_update",
      targetType: "course",
      targetId: selectedCourseId,
      targetName: selectedCourse?.name,
      metadata: { assigned_students: selectedStudentIds.length },
    });
    alert("課程學生名單已更新。");
    fetchData();
  };

  const getCourseLabel = (course?: Course) => {
    if (!course) return "未選擇課程";
    const weekday = weekdays.find((day) => day.value === course.day_of_week)?.label || `週${course.day_of_week}`;
    const timeRange = course.start_time
      ? `${normalizeTime(course.start_time)}${course.end_time ? `-${normalizeTime(course.end_time)}` : ""}`
      : "未設定時間";
    return `${course.name}｜${course.grade || "未分級"}｜${weekday}｜${timeRange}`;
  };

  const exportRosterCsv = async () => {
    if (!selectedCourse) return alert("請先選擇課程。");
    if (studentsInSelectedCourse.length === 0) return alert("這堂課目前沒有學生。");

    const header = ["序號", "年級", "學生姓名", "課程", "星期", "時間", "簽到", "備註"].map(csvCell).join(",");
    const weekday = weekdays.find((day) => day.value === selectedCourse.day_of_week)?.label || `週${selectedCourse.day_of_week}`;
    const timeRange = selectedCourse.start_time
      ? `${normalizeTime(selectedCourse.start_time)}${selectedCourse.end_time ? `-${normalizeTime(selectedCourse.end_time)}` : ""}`
      : "";
    const rows = studentsInSelectedCourse.map((student, index) => [
      index + 1,
      student.grade || "未分級",
      student.name,
      selectedCourse.name,
      weekday,
      timeRange,
      "",
      "",
    ].map(csvCell).join(","));
    const csv = `\uFEFF${header}\n${rows.join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedCourse.name}_學生名冊.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    await logOperation({
      action: "course_roster_export",
      targetType: "course",
      targetId: selectedCourse.id,
      targetName: selectedCourse.name,
      metadata: { students: studentsInSelectedCourse.length, format: "csv" },
    });
  };

  const printRoster = async () => {
    if (!selectedCourse) return alert("請先選擇課程。");
    if (studentsInSelectedCourse.length === 0) return alert("這堂課目前沒有學生。");

    const today = new Date().toLocaleDateString("zh-TW");
    const safeText = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char] || char));
    const rows = studentsInSelectedCourse.map((student, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${safeText(student.grade || "未分級")}</td>
        <td>${safeText(student.name)}</td>
        <td></td>
        <td></td>
      </tr>
    `).join("");
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return alert("瀏覽器阻擋了列印視窗，請允許彈出視窗後再試一次。");

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${safeText(selectedCourse.name)} 學生名冊</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 32px; color: #0f172a; font-family: "Microsoft JhengHei", Arial, sans-serif; }
            .meta { display: flex; justify-content: space-between; gap: 20px; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; }
            h1 { margin: 0 0 8px; font-size: 28px; }
            p { margin: 4px 0; font-weight: 700; color: #475569; }
            table { width: 100%; border-collapse: collapse; font-size: 16px; }
            th, td { border: 1px solid #cbd5e1; padding: 12px 10px; text-align: left; height: 48px; }
            th { background: #f1f5f9; font-weight: 900; }
            td:first-child, th:first-child { width: 64px; text-align: center; }
            td:nth-child(2), th:nth-child(2) { width: 100px; }
            td:nth-child(4), th:nth-child(4) { width: 130px; }
            td:nth-child(5), th:nth-child(5) { width: 220px; }
            .footer { margin-top: 18px; display: flex; justify-content: space-between; color: #64748b; font-size: 13px; font-weight: 700; }
            @media print {
              body { margin: 18mm; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <section class="meta">
            <div>
              <h1>${safeText(selectedCourse.name)} 學生名冊</h1>
              <p>${safeText(getCourseLabel(selectedCourse))}</p>
            </div>
            <div>
              <p>列印日期：${safeText(today)}</p>
              <p>學生人數：${studentsInSelectedCourse.length} 人</p>
            </div>
          </section>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>年級</th>
                <th>學生姓名</th>
                <th>簽到</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="footer">
            <span>方華補習班管理系統</span>
            <span>${safeText(selectedCourse.name)}</span>
          </div>
          <script>
            window.onload = () => {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();

    await logOperation({
      action: "course_roster_print",
      targetType: "course",
      targetId: selectedCourse.id,
      targetName: selectedCourse.name,
      metadata: { students: studentsInSelectedCourse.length },
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <p className="text-xs font-black uppercase tracking-widest text-amber-500">Course Schedule</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">課程排課</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">新增國中單科課程，設定星期與上課時間。</p>
        </div>

        <div className="space-y-4 p-6">
          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-400">課程名稱</span>
            <input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className="app-input px-4 py-3 font-black" placeholder="例如：國二英文班（週三）" />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">年級</span>
              <select value={formData.grade} onChange={(event) => setFormData({ ...formData, grade: event.target.value })} className="app-input px-4 py-3 font-black">
                {gradeOrder.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">上課星期</span>
              <select value={formData.day_of_week} onChange={(event) => setFormData({ ...formData, day_of_week: Number(event.target.value) })} className="app-input px-4 py-3 font-black">
                {weekdays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">開始時間</span>
              <input type="time" value={formData.start_time} onChange={(event) => setFormData({ ...formData, start_time: event.target.value })} className="app-input px-4 py-3 font-black" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">結束時間</span>
              <input type="time" value={formData.end_time} onChange={(event) => setFormData({ ...formData, end_time: event.target.value })} className="app-input px-4 py-3 font-black" />
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={saveCourse} disabled={saving} className="flex-1 rounded-2xl bg-amber-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-amber-100 transition hover:bg-amber-600 disabled:bg-slate-300">
              {saving ? "儲存中..." : editingCourseId ? "儲存修改" : "新增課程"}
            </button>
            {editingCourseId && (
              <button onClick={resetForm} className="rounded-2xl bg-slate-100 px-5 py-4 text-sm font-black text-slate-600 transition hover:bg-slate-200">
                取消
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-xs font-black text-blue-500">課程總數</p>
            <p className="mt-2 text-3xl font-black text-blue-700">{courseStats.total}</p>
          </div>
          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
            <p className="text-xs font-black text-emerald-600">目前課程學生</p>
            <p className="mt-2 text-3xl font-black text-emerald-700">{selectedStudentIds.length}</p>
          </div>
        </div>

        <div className="app-card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/70 p-5">
            <h3 className="text-xl font-black text-slate-950">課程清單</h3>
          </div>

          <div className="max-h-[360px] space-y-2 overflow-y-auto p-5">
            {loading ? (
              <div className="rounded-3xl border border-dashed border-slate-200 py-12 text-center text-sm font-bold text-slate-400">課程讀取中...</div>
            ) : courses.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 py-12 text-center text-sm font-bold text-slate-400">目前沒有課程，請先新增。</div>
            ) : (
              courses.map((course) => {
                const weekday = weekdays.find((day) => day.value === course.day_of_week)?.label || `週${course.day_of_week}`;
                const count = studentCourses.filter((item) => item.course_id === course.id).length;
                return (
                  <button
                    key={course.id}
                    onClick={() => {
                      setSelectedCourseId(course.id);
                      if (course.grade) setStudentGradeFilter(course.grade);
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedCourseId === course.id
                        ? "border-amber-300 bg-amber-50 shadow-sm"
                        : "border-slate-100 bg-white hover:border-amber-100 hover:bg-amber-50/40"
                    }`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-lg font-black text-slate-950">{course.name}</p>
                        <p className="mt-1 text-sm font-bold text-slate-500">
                          {course.grade || "未分級"} · {weekday}
                          {course.start_time && ` · ${normalizeTime(course.start_time)}${course.end_time ? `-${normalizeTime(course.end_time)}` : ""}`}
                        </p>
                        <p className="mt-1 text-xs font-black text-blue-600">{count} 位學生</p>
                      </div>
                      <div className="flex gap-2">
                        <span onClick={(event) => { event.stopPropagation(); editCourse(course); }} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-200">編輯</span>
                        <span onClick={(event) => { event.stopPropagation(); deleteCourse(course); }} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-100">刪除</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="app-card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/70 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-950">綁定學生</h3>
                <p className="mt-1 text-sm font-bold text-slate-500">{selectedCourse?.name || "請先選擇課程"}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button onClick={exportRosterCsv} disabled={!selectedCourseId || studentsInSelectedCourse.length === 0} className="rounded-2xl bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-500 hover:text-white disabled:bg-slate-100 disabled:text-slate-300">
                  匯出 CSV
                </button>
                <button onClick={printRoster} disabled={!selectedCourseId || studentsInSelectedCourse.length === 0} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:bg-slate-300">
                  列印名冊
                </button>
                <button onClick={saveCourseStudents} disabled={!selectedCourseId} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:bg-slate-300">
                  儲存名單 ({selectedStudentIds.length})
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-[220px_1fr_auto]">
              <select
                value={studentGradeFilter}
                onChange={(event) => setStudentGradeFilter(event.target.value)}
                className="app-input px-4 py-3 text-sm font-black"
              >
                <option value="all">全部年級</option>
                {gradeOrder.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
              </select>
              <input
                value={studentKeyword}
                onChange={(event) => setStudentKeyword(event.target.value)}
                className="app-input px-4 py-3 text-sm font-bold"
                placeholder="搜尋學生姓名"
              />
              <button
                onClick={() => {
                  setStudentGradeFilter("all");
                  setStudentKeyword("");
                }}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-500 transition hover:bg-slate-100"
              >
                清除篩選
              </button>
            </div>
          </div>

          <div className="grid max-h-[460px] gap-2 overflow-y-auto p-5 md:grid-cols-2">
            {!selectedCourseId ? (
              <div className="col-span-full rounded-3xl border border-dashed border-slate-200 py-12 text-center text-sm font-bold text-slate-400">請先選擇課程。</div>
            ) : visibleStudents.length === 0 ? (
              <div className="col-span-full rounded-3xl border border-dashed border-slate-200 py-12 text-center text-sm font-bold text-slate-400">沒有符合篩選的學生。</div>
            ) : (
              visibleStudents.map((student) => {
                const checked = selectedStudentIds.includes(student.id);
                return (
                  <label key={student.id} className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition ${checked ? "border-blue-300 bg-blue-50" : "border-slate-100 bg-white hover:border-blue-100 hover:bg-blue-50/40"}`}>
                    <span>
                      <span className="block font-black text-slate-800">{student.name}</span>
                      <span className="text-xs font-bold text-slate-400">{student.grade || "未分級"}</span>
                    </span>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-md border-2 text-sm font-black ${checked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                    <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleStudent(student.id)} />
                  </label>
                );
              })
            )}
          </div>

          {studentsInSelectedCourse.length > 0 && (
            <div className="border-t border-slate-100 bg-slate-50/70 p-5">
              <p className="mb-2 text-xs font-black text-slate-400">目前課程學生</p>
              <div className="flex flex-wrap gap-2">
                {studentsInSelectedCourse.map((student) => (
                  <span key={student.id} className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700 shadow-sm">{student.grade} · {student.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
