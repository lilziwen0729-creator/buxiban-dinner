"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getToday } from "@/lib/date";
import { logOperation } from "@/lib/operationLog";
import { supabase } from "@/lib/supabase";
import { courseCategoryOptions, getCourseCategoryLabel, resolveCourseCategory } from "@/lib/courseCategory";
import { courseSeriesKey } from "@/lib/courseSeries";
import {
  availableContactCourses, entryWeekday, groupContactCourses, matchesContactSearch,
  pickContactCourse, recordContents, weekdayLabels,
  type ContactBookCourse, type ContactBookRecord,
} from "@/lib/contactBook";

const emptyForm = { lesson_content: "", homework: "", quiz_scope: "" };
type FormData = typeof emptyForm;
const toForm = (record: ContactBookRecord | null): FormData => ({
  lesson_content: record?.lesson_content || "", homework: record?.homework || "", quiz_scope: record?.quiz_scope || "",
});
const errorMessage = (error: unknown) => error && typeof error === "object" && "message" in error
  ? String(error.message) : "連線異常，請稍後再試。";
const timeLabel = (course: ContactBookCourse) => [course.start_time?.slice(0, 5), course.end_time?.slice(0, 5)].filter(Boolean).join("-");
const dateLabel = (date: string) => `${date} ${weekdayLabels[entryWeekday(date)] || ""}`;

export default function ContactBookTab() {
  const [courses, setCourses] = useState<ContactBookCourse[]>([]);
  const [courseLoading, setCourseLoading] = useState(true);
  const [courseError, setCourseError] = useState("");
  const [selection, setSelection] = useState({ courseId: "", date: getToday(), scope: "scheduled" as "scheduled" | "all" });
  const [editor, setEditor] = useState({ key: "", form: emptyForm, saved: emptyForm, recordId: "", previous: null as ContactBookRecord | null, error: "" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [historyFilter, setHistoryFilter] = useState("follow");
  const [historyMonth, setHistoryMonth] = useState(getToday().slice(0, 7));
  const [allDates, setAllDates] = useState(false);
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState({ key: "", records: [] as ContactBookRecord[], error: "" });
  const editorRef = useRef<HTMLElement>(null);

  const selectedCourse = courses.find((course) => course.id === selection.courseId);
  const courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);
  const series = useMemo(() => groupContactCourses(courses), [courses]);
  const selectedSeriesKey = selectedCourse ? courseSeriesKey(selectedCourse) : "";
  const selectedSeriesIds = series.find((group) => group.key === selectedSeriesKey)?.courses.map((course) => course.id) || [];
  const editorKey = `${selection.courseId}/${selection.date}/${reload}`;
  const editorLoading = Boolean(selection.courseId) && editor.key !== editorKey;
  const dirty = editor.key === editorKey && JSON.stringify(editor.form) !== JSON.stringify(editor.saved);
  const choices = availableContactCourses(courses, selection.date, selection.scope);
  const scheduledCount = availableContactCourses(courses, selection.date, "scheduled").length;
  const historySeries = historyFilter === "follow" ? selectedSeriesKey : historyFilter === "all" ? "" : historyFilter;
  const historyIds = series.find((group) => group.key === historySeries)?.courses.map((course) => course.id) || [];
  const historyIdsKey = JSON.stringify(historyIds);
  const selectedSeriesIdsKey = JSON.stringify(selectedSeriesIds);
  const historyKey = `${historyIdsKey}/${allDates ? "all" : historyMonth}/${reload}`;
  const historyLoading = courseLoading || history.key !== historyKey;
  const historyRecords = historyLoading ? [] : history.records.filter((record) => matchesContactSearch(record, courseMap.get(record.course_id), search));

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const { data, error } = await supabase.from("courses").select("*").order("day_of_week").order("start_time").order("name");
        if (error) throw error;
        if (ignore) return;
        const rows = (data || []) as ContactBookCourse[];
        setCourses(rows);
        setSelection((current) => ({ ...current, courseId: pickContactCourse(rows, current.date, current.scope) }));
        setCourseError("");
      } catch (error) {
        if (!ignore) setCourseError(errorMessage(error));
      } finally {
        if (!ignore) setCourseLoading(false);
      }
    };
    void load();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!selection.courseId) return;
    let ignore = false;
    const load = async () => {
      try {
        // Read the exact entry independently of history filters before allowing edits.
        const [current, previous] = await Promise.all([
          supabase.from("contact_books").select("*").eq("course_id", selection.courseId).eq("entry_date", selection.date).maybeSingle(),
          supabase.from("contact_books").select("*").in("course_id", JSON.parse(selectedSeriesIdsKey))
            .lt("entry_date", selection.date).order("entry_date", { ascending: false }).order("id", { ascending: false }).limit(1),
        ]);
        if (current.error) throw current.error;
        if (previous.error) throw previous.error;
        if (ignore) return;
        const form = toForm(current.data);
        setEditor({ key: editorKey, form, saved: form, recordId: current.data?.id || "", previous: previous.data?.[0] || null, error: "" });
      } catch (error) {
        if (!ignore) setEditor({ key: editorKey, form: emptyForm, saved: emptyForm, recordId: "", previous: null, error: errorMessage(error) });
      }
    };
    void load();
    return () => { ignore = true; };
  }, [selection.courseId, selection.date, selectedSeriesIdsKey, editorKey]);

  useEffect(() => {
    if (courseLoading || courseError) return;
    let ignore = false;
    const load = async () => {
      try {
        const records: ContactBookRecord[] = [];
        const ids = JSON.parse(historyIdsKey) as string[];
        // Paginate instead of silently dropping older entries at the API row limit.
        for (let offset = 0; ; offset += 500) {
          let query = supabase.from("contact_books").select("*").order("entry_date", { ascending: false }).order("id", { ascending: false });
          if (ids.length) query = query.in("course_id", ids);
          if (!allDates) {
            const [year, month] = historyMonth.split("-").map(Number);
            const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
            query = query.gte("entry_date", `${historyMonth}-01`).lt("entry_date", nextMonth);
          }
          const { data, error } = await query.range(offset, offset + 499);
          if (error) throw error;
          if (ignore) return;
          records.push(...(data || []));
          if (!data || data.length < 500) break;
        }
        if (!ignore) setHistory({ key: historyKey, records, error: "" });
      } catch (error) {
        if (!ignore) setHistory({ key: historyKey, records: [], error: errorMessage(error) });
      }
    };
    void load();
    return () => { ignore = true; };
  }, [courseLoading, courseError, historyIdsKey, historyMonth, allDates, historyKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const canSwitch = () => !saving && (!dirty || window.confirm("目前有尚未儲存的內容，確定放棄並切換嗎？"));
  const changeDate = (date: string) => {
    if (!entryWeekday(date) || !canSwitch()) return;
    setSelection((current) => ({ ...current, date, courseId: pickContactCourse(courses, date, current.scope, current.courseId) }));
    if (historyFilter === "follow") setHistoryMonth(date.slice(0, 7));
    setNotice("");
  };
  const loadRecord = (record: ContactBookRecord) => {
    if (!canSwitch()) return;
    const course = courseMap.get(record.course_id);
    if (!course) return;
    setSelection({ courseId: course.id, date: record.entry_date, scope: course.day_of_week === entryWeekday(record.entry_date) ? "scheduled" : "all" });
    setNotice("");
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const setField = (key: keyof FormData, value: string) => {
    setEditor((current) => ({ ...current, form: { ...current.form, [key]: value } }));
    setNotice("");
  };

  const saveContactBook = async () => {
    if (saving || editorLoading || editor.error || !selection.courseId) return;
    if (!Object.values(editor.form).some((value) => value.trim())) {
      setNotice("請至少填寫一項內容。");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const payload = {
        course_id: selection.courseId, entry_date: selection.date,
        lesson_content: editor.form.lesson_content.trim() || null,
        homework: editor.form.homework.trim() || null,
        quiz_scope: editor.form.quiz_scope.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("contact_books")
        .upsert(payload, { onConflict: "course_id,entry_date" }).select("*").single();
      if (error) throw error;
      const form = toForm(data);
      setEditor((current) => ({ ...current, form, saved: form, recordId: data.id }));
      setHistoryFilter("follow");
      setHistoryMonth(selection.date.slice(0, 7));
      setSearch("");
      setReload((current) => current + 1);
      setNotice("聯絡簿已儲存。");
      await logOperation({ action: "contact_book_upsert", targetType: "course", targetId: selection.courseId,
        targetName: selectedCourse?.name || "聯絡簿", metadata: { entry_date: selection.date } });
    } catch (error) {
      setNotice(`儲存失敗：${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
        <h2 className="text-xl font-black text-slate-950">聯絡簿</h2>
        <span className="text-sm font-bold text-slate-500">{dateLabel(selection.date)} · 當日 {scheduledCount} 堂課</span>
      </header>
      {courseLoading ? <p role="status" className="p-10 text-center text-slate-500">課程讀取中...</p>
        : courseError ? <p role="alert" className="p-6 text-red-600">課程讀取失敗：{courseError}，請重新整理頁面。</p>
        : <div className="grid min-w-0 xl:grid-cols-[minmax(340px,0.85fr)_minmax(0,1.15fr)]">
          <section ref={editorRef} aria-label="撰寫聯絡簿" className="min-w-0 scroll-mt-28 border-b border-slate-200 p-5 sm:p-6 xl:border-r xl:border-b-0">
            <div className="mb-5 flex items-center justify-between gap-2">
              <h3 className="font-black text-slate-900">撰寫紀錄</h3>
              <span className={`text-xs font-bold ${dirty ? "text-amber-700" : "text-slate-500"}`}>
                {editorLoading ? "讀取中..." : dirty ? "尚未儲存" : selection.courseId && !editor.error ? editor.recordId ? "已儲存紀錄" : "新增紀錄" : ""}
              </span>
            </div>
            <div className="space-y-4">
              <div className="flex items-end gap-2">
                <label className="min-w-0 flex-1 text-xs font-bold text-slate-600">日期
                  <input type="date" aria-label="聯絡簿日期" value={selection.date} disabled={saving} onChange={(event) => changeDate(event.target.value)} className="app-input mt-2 px-3 py-2.5 text-sm" />
                </label>
                <button type="button" disabled={saving || selection.date === getToday()} onClick={() => changeDate(getToday())} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-40">今天</button>
              </div>
              <div role="group" aria-label="課程範圍" className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
                {([{ value: "scheduled", label: "當日課程" }, { value: "all", label: "全部啟用課程" }] as const).map((scope) => (
                  <button key={scope.value} type="button" aria-pressed={selection.scope === scope.value} disabled={saving} onClick={() => {
                    if (scope.value === selection.scope || !canSwitch()) return;
                    setSelection((current) => ({ ...current, scope: scope.value, courseId: pickContactCourse(courses, current.date, scope.value, current.courseId) }));
                    setNotice("");
                  }} className={`rounded-md px-2 py-2 text-sm font-bold ${selection.scope === scope.value ? "bg-white text-rose-600 shadow-sm" : "text-slate-500"}`}>{scope.label}</button>
                ))}
              </div>
              <label className="block text-xs font-bold text-slate-600">課程
                <select aria-label="聯絡簿課程" value={selection.courseId} disabled={saving} onChange={(event) => {
                  if (!canSwitch()) return;
                  setSelection((current) => ({ ...current, courseId: event.target.value })); setNotice("");
                }} className="app-input mt-2 w-full min-w-0 px-3 py-3 text-sm">
                  {!selection.courseId && <option value="">{choices.length ? "請選擇課程" : selection.scope === "scheduled" ? "當日沒有已排定的課程" : "沒有已開課的啟用課程"}</option>}
                  {courseCategoryOptions.map((category) => {
                    const rows = choices.filter((course) => resolveCourseCategory(course) === category.value);
                    return rows.length ? <optgroup key={category.value} label={category.label}>{rows.map((course) => <option key={course.id} value={course.id}>
                      {course.grade ? `${course.grade} · ` : ""}{course.name} · {weekdayLabels[course.day_of_week]} {timeLabel(course)}
                    </option>)}</optgroup> : null;
                  })}
                  {selectedCourse && !choices.some((course) => course.id === selectedCourse.id) && <optgroup label="歷史紀錄課程"><option value={selectedCourse.id}>{selectedCourse.name}（{selectedCourse.is_active === false ? "已停用" : "非當日排課"}）</option></optgroup>}
                </select>
              </label>
              {selectedCourse && <p className="text-xs leading-relaxed text-slate-500">{getCourseCategoryLabel(selectedCourse)} · {selectedCourse.grade || "未分年級"} · {weekdayLabels[selectedCourse.day_of_week]} {timeLabel(selectedCourse)}
                {selectedCourse.is_active === false && <span className="ml-2 font-bold text-amber-700">已停用</span>}
                {selectedCourse.day_of_week !== entryWeekday(selection.date) && <span className="ml-2 font-bold text-amber-700">非原排課日</span>}
              </p>}
            </div>

            {!selection.courseId ? <p className="py-12 text-center text-sm text-slate-500">{selection.scope === "scheduled" ? "當日沒有排課" : "尚未選擇課程"}</p>
              : editorLoading ? <p role="status" className="py-12 text-center text-sm text-slate-500">紀錄讀取中...</p>
              : editor.error ? <div role="alert" className="mt-6 text-sm text-red-600">紀錄讀取失敗：{editor.error}<button onClick={() => setReload((current) => current + 1)} className="ml-2 underline">重試</button></div>
              : <div className="mt-5 space-y-5">
                {editor.previous && <details className="border-y border-slate-200 py-3">
                  <summary className="cursor-pointer text-sm font-bold text-slate-600">上次紀錄 · {dateLabel(editor.previous.entry_date)}</summary>
                  <dl className="mt-3 space-y-3 text-sm">{recordContents(editor.previous).map((field) => <div key={field.key}><dt className="text-xs text-slate-500">{field.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-700">{field.text}</dd></div>)}</dl>
                  <button type="button" disabled={saving} onClick={() => {
                    if (dirty && !window.confirm("確定用上次紀錄取代目前尚未儲存的內容嗎？")) return;
                    setEditor((current) => ({ ...current, form: toForm(current.previous) })); setNotice("");
                  }} className="mt-3 text-sm font-bold text-blue-600 hover:underline disabled:opacity-40">沿用上次內容</button>
                </details>}
                <label className="block text-sm font-bold text-slate-700">上課內容
                  <textarea aria-label="上課內容" value={editor.form.lesson_content} disabled={saving} onChange={(event) => setField("lesson_content", event.target.value)} rows={6} className="app-input mt-2 resize-y px-3 py-3 text-sm font-normal leading-relaxed" placeholder="課本頁數、課程進度、上課內容" />
                </label>
                <details key={editorKey} open={Boolean(editor.saved.homework || editor.saved.quiz_scope)} className="border-t border-slate-100 pt-4">
                  <summary className="cursor-pointer text-sm font-bold text-slate-600">作業與下次考試（選填）</summary>
                  <div className="mt-4 space-y-4">
                    <label className="block text-xs font-bold text-slate-600">今日作業<textarea aria-label="今日作業" value={editor.form.homework} disabled={saving} onChange={(event) => setField("homework", event.target.value)} rows={3} className="app-input mt-2 resize-y px-3 py-2 text-sm font-normal" /></label>
                    <label className="block text-xs font-bold text-slate-600">下次週考範圍<textarea aria-label="下次週考範圍" value={editor.form.quiz_scope} disabled={saving} onChange={(event) => setField("quiz_scope", event.target.value)} rows={3} className="app-input mt-2 resize-y px-3 py-2 text-sm font-normal" /></label>
                  </div>
                </details>
                <button type="button" onClick={saveContactBook} disabled={saving || (!dirty && Boolean(editor.recordId))} className="w-full rounded-lg bg-rose-500 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-600 disabled:bg-slate-200 disabled:text-slate-500">{saving ? "儲存中..." : editor.recordId ? "儲存修改" : "儲存聯絡簿"}</button>
                {notice && <p role="status" className={`text-sm font-bold ${notice.includes("失敗") ? "text-red-600" : "text-emerald-700"}`}>{notice}</p>}
              </div>}
          </section>

          <section aria-label="聯絡簿歷史紀錄" className="min-w-0">
            <div className="space-y-4 border-b border-slate-200 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-slate-900">歷史紀錄</h3><span aria-live="polite" className="text-xs text-slate-500">{historyLoading ? "讀取中..." : history.error ? "讀取失敗" : `${historyRecords.length} 筆紀錄`}</span></div>
              <label className="block text-xs font-bold text-slate-600">課程
                <select aria-label="歷史課程篩選" value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)} className="app-input mt-2 min-w-0 px-3 py-2.5 text-sm">
                  <option value="follow">{selectedCourse ? `目前課程：${selectedCourse.name}（全部上課日）` : "全部課程（尚未選課）"}</option>
                  <option value="all">全部課程</option>
                  {[true, false].map((active) => <optgroup key={String(active)} label={active ? "啟用課程" : "已停用課程"}>{series.filter((group) => group.courses.some((course) => course.is_active !== false) === active).map((group) => <option key={group.key} value={group.key}>{group.representative.grade ? `${group.representative.grade} · ` : ""}{group.representative.name} · {timeLabel(group.representative)}</option>)}</optgroup>)}
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-0 flex-1 text-xs font-bold text-slate-600">月份<input aria-label="歷史月份" type="month" disabled={allDates} value={historyMonth} onChange={(event) => { if (/^\d{4}-\d{2}$/.test(event.target.value)) setHistoryMonth(event.target.value); }} className="app-input mt-2 px-3 py-2.5 text-sm disabled:opacity-40" /></label>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 py-3 text-sm text-slate-600"><input type="checkbox" checked={allDates} onChange={(event) => setAllDates(event.target.checked)} className="h-4 w-4 accent-rose-500" />全部日期</label>
              </div>
              <input aria-label="搜尋聯絡簿" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋課程、年級、日期或內容" className="app-input px-3 py-2.5 text-sm" />
            </div>
            <div className="divide-y divide-slate-100 xl:max-h-[750px] xl:overflow-y-auto" aria-busy={historyLoading}>
              {historyLoading ? <p role="status" className="px-5 py-12 text-center text-sm text-slate-500">歷史紀錄讀取中...</p>
                : history.error ? <p role="alert" className="p-6 text-sm text-red-600">歷史紀錄讀取失敗：{history.error}<button onClick={() => { if (canSwitch()) setReload((current) => current + 1); }} className="ml-2 underline">重試</button></p>
                : historyRecords.length === 0 ? <div className="px-5 py-12 text-center text-sm text-slate-500"><p>{search ? "沒有符合搜尋的紀錄" : "此範圍沒有聯絡簿紀錄"}</p>{!allDates && <button onClick={() => setAllDates(true)} className="mt-3 font-bold text-blue-600 hover:underline">查看全部日期</button>}</div>
                : historyRecords.map((record) => {
                  const course = courseMap.get(record.course_id);
                  const selected = record.course_id === selection.courseId && record.entry_date === selection.date;
                  const contents = recordContents(record);
                  return <article key={record.id} className={`min-w-0 border-l-4 px-4 py-5 sm:px-5 ${selected ? "border-l-rose-400 bg-rose-50/40" : "border-l-transparent"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="text-xs font-bold text-slate-500">{dateLabel(record.entry_date)}{selected && <span className="ml-2 text-rose-600">目前編輯</span>}</p><h4 className="mt-1 break-words text-base font-bold text-slate-900">{course?.name || "已刪除課程"}</h4><p className="mt-1 text-xs text-slate-500">{course ? `${getCourseCategoryLabel(course)} · ${course.grade || "未分年級"}` : ""}{course?.is_active === false ? " · 已停用" : ""}</p></div>
                      <button type="button" onClick={() => loadRecord(record)} disabled={saving || !course || selected} className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40">編輯</button>
                    </div>
                    <dl className="mt-4 space-y-3">{contents.map((field) => <div key={field.key} className="grid min-w-0 gap-1 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-3"><dt className={`text-xs font-bold leading-6 ${field.key === "homework" ? "text-emerald-700" : field.key === "quiz_scope" ? "text-amber-700" : "text-blue-600"}`}>{field.label}</dt><dd className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{field.text}</dd></div>)}</dl>
                    {!contents.length && <p className="mt-3 text-sm text-slate-400">未填寫內容</p>}
                  </article>;
                })}
            </div>
          </section>
        </div>}
    </div>
  );
}
