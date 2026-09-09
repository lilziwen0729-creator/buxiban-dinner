import React from "react";
import CourseProgressPanel from "@/components/admin/CourseProgressPanel";
import type { CourseCategory } from "@/lib/courseCategory";
import {
  formatTeacherGrade,
  formatTeacherStudentName,
  formatTeacherWeekday,
  teacherText,
  type TeacherLanguage,
} from "@/lib/teacherLanguage";

const englishCategoryLabels: Record<CourseCategory, string> = {
  primary_tutoring: "Primary Tutoring",
  primary_math: "Primary Math",
  primary_english: "Primary English",
  primary_talent: "Primary Enrichment",
  junior: "Junior High",
};

export default function PrimaryAttendance({
  primaryGrades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六"],
  selectedGrade = "小一",
  setSelectedGrade,
  primaryCourses = [],
  selectedPrimaryCourseId = "",
  setSelectedPrimaryCourseId,
  sectionTitle = "國小課輔",
  courseCategory = "primary_tutoring",
  language = "zh",
  setSelectedIds,
  p_stats = { total: 0, expected: 0, signedIn: 0, meals: 0, homeworkPending: 0 },
  loading = false,
  p_pending = [],
  p_working = [],
  p_left = [],
  p_leave = [],
  p_pre_leave = [],
  selectedIds = [],
  toggleSelection,
  handleBatchArrive,
  handleBatchLeave,
  cancelLeave,
  cancelArrive,
  updateStudentStatus,
  attendanceLogs = [],
}: any) {
  void primaryGrades;
  void setSelectedGrade;
  const teacherLanguage = language as TeacherLanguage;
  const category = courseCategory as CourseCategory;
  const compactActions = category === "primary_math" || category === "primary_talent";
  const alwaysShowEnglishName = category === "primary_english";
  const selectedCourse = primaryCourses.find((course: any) => course.id === selectedPrimaryCourseId);
  const tx = (zh: string, en: string) => teacherText(teacherLanguage, zh, en);
  const displayName = (student: any) => formatTeacherStudentName(student, teacherLanguage, alwaysShowEnglishName);
  const sectionName = teacherLanguage === "en" ? englishCategoryLabels[category] : sectionTitle;

  return (
    <>
      <div className="app-card p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-blue-500">Primary</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">
              {sectionName} {tx("點名", "Attendance")}
            </h3>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
            {formatTeacherGrade(selectedCourse?.grade || selectedGrade, teacherLanguage)}
          </span>
        </div>
        <label className="block">
          <span className="mb-2 block text-xs font-black text-slate-400">{tx("今日課程", "Today's Class")}</span>
          <select
            value={selectedPrimaryCourseId}
            onChange={(event) => {
              setSelectedPrimaryCourseId?.(event.target.value);
              setSelectedIds?.([]);
            }}
            className="app-input px-4 py-3 text-lg font-black focus:border-rose-400"
          >
            {primaryCourses.length > 0 ? (
              primaryCourses.map((course: any) => (
                <option key={course.id} value={course.id}>
                  {formatTeacherGrade(course.grade || tx("未分級", "Not set"), teacherLanguage)} · {course.name} ({formatTeacherWeekday(course.day_of_week, teacherLanguage)})
                </option>
              ))
            ) : (
              <option value="">{tx(`今日沒有排定的${sectionTitle}課程`, `No ${sectionName} class scheduled today`)}</option>
            )}
          </select>
        </label>

        <div className={`mt-4 grid gap-3 ${compactActions ? "grid-cols-2" : "grid-cols-3"}`}>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 p-3">
            <span className="mb-1 text-[10px] font-bold text-blue-600">{tx("今日到班", "Checked In")}</span>
            <div className="font-black text-blue-600">
              <span className="text-2xl">{p_stats?.signedIn || 0}</span>
              <span className="text-sm opacity-50"> / {p_stats?.expected ?? p_stats?.total ?? 0}</span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-green-100 bg-green-50 p-3">
            <span className="mb-1 text-[10px] font-bold text-green-600">{tx("今日領餐", "Meals Collected")}</span>
            <div className="font-black text-green-600"><span className="text-2xl">{p_stats?.meals || 0}</span></div>
          </div>
          {!compactActions && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-red-50 p-3">
              <span className="mb-1 text-[10px] font-bold text-red-500">{tx("作業未完", "Homework Pending")}</span>
              <div className="text-2xl font-black text-red-500">{p_stats?.homeworkPending || 0}</div>
            </div>
          )}
        </div>
      </div>

      {selectedPrimaryCourseId && (
        <CourseProgressPanel
          key={selectedPrimaryCourseId}
          courseId={selectedPrimaryCourseId}
          courseName={selectedCourse?.name || sectionTitle}
          language={teacherLanguage}
        />
      )}

      {loading ? (
        <div className="animate-pulse py-20 text-center font-bold text-slate-400">{tx("資料同步中...", "Syncing data...")}</div>
      ) : !selectedPrimaryCourseId ? (
        <div className="rounded-3xl border-2 border-dashed border-rose-100 bg-white/70 py-16 text-center font-bold text-slate-400">
          {tx("今日沒有可點名的國小課程。", "No primary class is available for attendance today.")}
          <br />
          <span className="text-xs">{tx("請先到「課程排課」新增課程，並綁定學生名冊。", "Add the class and student roster in Course Schedule first.")}</span>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(24rem,0.85fr)]">
          <div className="app-card p-5">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-800">
              {tx("待簽到", "Waiting")}
              <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-600">{p_pending.length}</span>
            </h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {p_pending.map((student: any) => {
                const isChecked = selectedIds.includes(student.id);
                return (
                  <label key={student.id} className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all ${isChecked ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"}`}>
                    <span className="text-lg font-black text-slate-700">{displayName(student)}</span>
                    <div className={`flex h-6 w-6 items-center justify-center rounded-md border-2 transition-all ${isChecked ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300"}`}>{isChecked && "✓"}</div>
                    <input type="checkbox" className="hidden" checked={isChecked} onChange={() => toggleSelection?.(student.id)} />
                  </label>
                );
              })}
              {p_pending.length === 0 && (
                <div className="py-4 text-center text-sm font-bold text-slate-300 md:col-span-2 xl:col-span-1 2xl:col-span-2">
                  {tx("無待簽到學生", "No students waiting")}
                </div>
              )}
              <div className={`mt-2 grid gap-2 md:col-span-2 xl:col-span-1 2xl:col-span-2 ${handleBatchLeave ? "md:grid-cols-2" : ""}`}>
                <button onClick={() => handleBatchArrive?.(selectedPrimaryCourseId)} disabled={selectedIds.length === 0} className={`w-full rounded-2xl py-4 font-black text-white transition-all ${selectedIds.length > 0 ? "bg-rose-500 shadow-lg shadow-rose-100 active:scale-95" : "bg-slate-300"}`}>
                  {tx("批次確認到班", "Confirm Check-in")} ({selectedIds.length})
                </button>
                {handleBatchLeave && (
                  <button onClick={() => handleBatchLeave?.(selectedPrimaryCourseId)} disabled={selectedIds.length === 0} className={`w-full rounded-2xl py-4 font-black transition-all ${selectedIds.length > 0 ? "bg-amber-100 text-amber-700 hover:bg-amber-200 active:scale-95" : "bg-slate-100 text-slate-300"}`}>
                    {tx("登記請假", "Mark Absent")} ({selectedIds.length})
                  </button>
                )}
              </div>
            </div>
          </div>

          {compactActions ? (
            <div className="rounded-3xl border border-teal-100 bg-teal-50/70 p-5">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-teal-700">
                {tx("已到班", "Checked In")}
                <span className="rounded-md bg-white px-2 py-0.5 text-xs text-teal-700">{p_working.length}</span>
              </h3>
              <div className="space-y-3">
                {p_working.map((student: any) => (
                  <div key={student.id} className="flex items-center justify-between gap-3 rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
                    <span className="text-lg font-black text-slate-700">{displayName(student)}</span>
                    <button onClick={() => cancelArrive?.(student.id, selectedPrimaryCourseId)} className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-200">
                      {tx("取消簽到", "Undo")}
                    </button>
                  </div>
                ))}
                {p_working.length === 0 && <div className="py-6 text-center text-sm font-bold text-teal-300">{tx("尚無人到班", "No one has checked in")}</div>}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-orange-100 bg-orange-50/80 p-5">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-orange-700">
                {tx("作業檢查區", "Homework Check")}
                <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs text-orange-700">{p_working.length}</span>
              </h3>
              <div className="space-y-3">
                {p_working.map((student: any) => {
                  const isHomeworkDone = attendanceLogs.find((log: any) => log.student_id === student.id && log.course_id === selectedPrimaryCourseId)?.status === "homework_done";
                  return (
                    <div key={student.id} className="flex flex-col gap-3 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-black text-slate-700">{displayName(student)}</span>
                        {isHomeworkDone && <span className="rounded bg-green-100 px-2 py-1 text-xs font-bold text-green-600">{tx("作業完成", "Homework Done")}</span>}
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <button onClick={() => updateStudentStatus?.(student.id, "homework_done", selectedPrimaryCourseId)} disabled={isHomeworkDone} className={`rounded-xl py-2 text-sm font-black transition-all ${isHomeworkDone ? "bg-slate-100 text-slate-400" : "bg-orange-100 text-orange-700 hover:bg-orange-200"}`}>
                          {tx("作業完成", "Homework Done")}
                        </button>
                        <button onClick={() => cancelArrive?.(student.id, selectedPrimaryCourseId)} className="rounded-xl bg-white py-2 text-sm font-black text-slate-500 ring-1 ring-slate-200 transition-all hover:bg-slate-50 active:scale-95">
                          {tx("取消簽到", "Undo Check-in")}
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(tx(`確定要將【${student.name}】設為已離班並通知家長嗎？`, `Mark ${displayName(student)} as left and notify the family?`))) {
                              updateStudentStatus?.(student.id, "left", selectedPrimaryCourseId);
                            }
                          }}
                          className="rounded-xl bg-slate-900 py-2 text-sm font-black text-white shadow-md transition-all hover:bg-slate-800 active:scale-95"
                        >
                          {tx("確認離班", "Confirm Departure")}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {p_working.length === 0 && <div className="py-6 text-center text-sm font-bold text-orange-300">{tx("無人在班", "No one is in class")}</div>}
              </div>
            </div>
          )}

          {(p_left.length > 0 || p_leave.length > 0 || p_pre_leave.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2 xl:col-span-2">
              {p_left.length > 0 && (
                <div className="rounded-3xl border border-slate-200 bg-slate-100 p-5">
                  <h3 className="mb-2 flex items-center gap-2 text-lg font-black text-slate-500">{tx("今日已離班", "Left Today")} <span className="text-sm">({p_left.length})</span></h3>
                  <div className="mt-3 flex flex-wrap gap-2">{p_left.map((student: any) => <span key={student.id} className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-slate-400 shadow-sm">{displayName(student)}</span>)}</div>
                </div>
              )}
              {p_leave.length > 0 && (
                <div className="rounded-3xl border border-red-100 bg-red-50 p-5">
                  <h3 className="mb-2 flex items-center gap-2 text-lg font-black text-red-500">{tx("今日請假", "Absent Today")} <span className="text-sm">({p_leave.length})</span></h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p_leave.map((student: any) => (
                      <span key={student.id} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-red-400 shadow-sm">
                        {displayName(student)}
                        {cancelLeave && <button type="button" onClick={() => cancelLeave?.(student.id, selectedPrimaryCourseId)} className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-black text-red-500 hover:bg-red-100">{tx("取消", "Cancel")}</button>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {p_pre_leave.length > 0 && (
                <div className="rounded-3xl border border-violet-100 bg-violet-50 p-5">
                  <h3 className="mb-2 flex items-center gap-2 text-lg font-black text-violet-600">{tx("已預先請假", "Scheduled Absence")} <span className="text-sm">({p_pre_leave.length})</span></h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p_pre_leave.map((student: any) => (
                      <span key={student.id} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-violet-600 shadow-sm">
                        {displayName(student)}
                        {cancelLeave && <button type="button" onClick={() => cancelLeave?.(student.id, selectedPrimaryCourseId)} className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-black text-violet-600 hover:bg-violet-100">{tx("取消", "Cancel")}</button>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
