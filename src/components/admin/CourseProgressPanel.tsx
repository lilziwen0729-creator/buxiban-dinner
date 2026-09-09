"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getToday } from "@/lib/date";
import { logOperation } from "@/lib/operationLog";
import { supabase } from "@/lib/supabase";
import { teacherText, type TeacherLanguage } from "@/lib/teacherLanguage";

type ContactBookRecord = {
  id: string;
  course_id: string;
  entry_date: string;
  lesson_content: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CourseProgressPanelProps = {
  courseId: string;
  courseName?: string;
  language?: TeacherLanguage;
};

export default function CourseProgressPanel({
  courseId,
  courseName = "",
  language = "zh",
}: CourseProgressPanelProps) {
  const today = getToday();
  const [records, setRecords] = useState<ContactBookRecord[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const loadRecords = useCallback(async () => {
    setMessage("");
    if (!courseId) {
      setRecords([]);
      setContent("");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("contact_books")
      .select("id, course_id, entry_date, lesson_content, created_at, updated_at")
      .eq("course_id", courseId)
      .order("entry_date", { ascending: false })
      .limit(180);

    if (error) {
      console.error("課程進度讀取失敗:", error);
      setRecords([]);
      setContent("");
      setMessage(teacherText(language, "課程進度讀取失敗，請稍後再試。", "Unable to load course progress. Please try again."));
    } else {
      const nextRecords = (data || []) as ContactBookRecord[];
      setRecords(nextRecords);
      setContent(nextRecords.find((record) => record.entry_date === today)?.lesson_content || "");
    }
    setLoading(false);
  }, [courseId, language, today]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRecords(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRecords]);

  const saveProgress = async () => {
    if (!courseId || saving) return;
    const trimmedContent = content.trim();
    const existing = records.find((record) => record.entry_date === today);
    if (!trimmedContent && !existing) {
      setMessage(teacherText(language, "請先填寫今日課程進度。", "Enter today's course progress first."));
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const updatedAt = new Date().toISOString();
      const result = existing
        ? await supabase
            .from("contact_books")
            .update({ lesson_content: trimmedContent || null, updated_at: updatedAt })
            .eq("id", existing.id)
            .select("id, course_id, entry_date, lesson_content, created_at, updated_at")
            .single()
        : await supabase
            .from("contact_books")
            .insert({
              course_id: courseId,
              entry_date: today,
              lesson_content: trimmedContent,
              updated_at: updatedAt,
            })
            .select("id, course_id, entry_date, lesson_content, created_at, updated_at")
            .single();

      if (result.error) throw result.error;

      const savedRecord = result.data as ContactBookRecord;
      setRecords((current) => [
        savedRecord,
        ...current.filter((record) => record.id !== savedRecord.id),
      ].sort((a, b) => b.entry_date.localeCompare(a.entry_date)));
      setContent(savedRecord.lesson_content || "");
      setMessage(teacherText(language, "今日課程進度已儲存。", "Today's course progress has been saved."));

      await logOperation({
        action: "contact_book_upsert",
        targetType: "course",
        targetId: courseId,
        targetName: courseName || "課程進度",
        metadata: { entry_date: today, source: "attendance_progress" },
      });
    } catch (error: unknown) {
      console.error("課程進度儲存失敗:", error);
      const detail = error instanceof Error ? error.message : "";
      setMessage(teacherText(language, `儲存失敗：${detail || "請稍後再試"}`, `Save failed: ${detail || "Please try again."}`));
    } finally {
      setSaving(false);
    }
  };

  const historyRecords = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return records.filter((record) => {
      const progress = String(record.lesson_content || "").trim();
      if (!progress) return false;
      if (fromDate && record.entry_date < fromDate) return false;
      if (toDate && record.entry_date > toDate) return false;
      return !normalizedKeyword || progress.toLowerCase().includes(normalizedKeyword);
    });
  }, [fromDate, keyword, records, toDate]);

  return (
    <section className="app-card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-teal-600">Course Progress</p>
          <h3 className="mt-1 text-lg font-black text-slate-900">
            {teacherText(language, "今日課程進度", "Today's Course Progress")}
          </h3>
          <p className="mt-1 text-xs font-bold text-slate-400">
            {today}{courseName ? ` · ${courseName}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHistoryOpen((current) => !current)}
          className="rounded-lg bg-white px-4 py-2.5 text-sm font-black text-teal-700 shadow-sm ring-1 ring-teal-100 transition hover:bg-teal-50"
        >
          {historyOpen
            ? teacherText(language, "收起歷史紀錄", "Hide History")
            : teacherText(language, "查詢歷史紀錄", "View History")}
        </button>
      </div>

      <div className="p-5">
        <label className="block space-y-2">
          <span className="text-xs font-black text-slate-500">
            {teacherText(language, "今天教到哪裡", "What was covered today?")}
          </span>
          <textarea
            value={content}
            onChange={(event) => { setContent(event.target.value); setMessage(""); }}
            disabled={loading || !courseId}
            className="app-input min-h-28 resize-y px-4 py-3 font-bold"
            placeholder={teacherText(language, "例如：課本第 3 課、分數加減與習題 1-8", "Example: Lesson 3, adding fractions, exercises 1-8")}
          />
        </label>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className={`min-h-5 text-xs font-bold ${message.includes("失敗") || message.includes("failed") || message.includes("Unable") ? "text-red-500" : "text-teal-600"}`} aria-live="polite">
            {loading ? teacherText(language, "讀取中...", "Loading...") : message}
          </p>
          <button
            type="button"
            onClick={saveProgress}
            disabled={loading || saving || !courseId}
            className="rounded-lg bg-teal-600 px-6 py-3 text-sm font-black text-white shadow-md shadow-teal-100 transition hover:bg-teal-700 disabled:bg-slate-300 disabled:shadow-none"
          >
            {saving
              ? teacherText(language, "儲存中...", "Saving...")
              : teacherText(language, "儲存今日進度", "Save Today's Progress")}
          </button>
        </div>

        {historyOpen && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <div className="grid gap-3 md:grid-cols-[1fr_170px_170px]">
              <label className="space-y-2">
                <span className="text-xs font-black text-slate-400">{teacherText(language, "搜尋內容", "Search")}</span>
                <input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="app-input px-4 py-3 text-sm font-bold" placeholder={teacherText(language, "輸入課程內容關鍵字", "Search progress notes")}/>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black text-slate-400">{teacherText(language, "起始日期", "From")}</span>
                <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="app-input px-4 py-3 text-sm font-bold" />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black text-slate-400">{teacherText(language, "結束日期", "To")}</span>
                <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="app-input px-4 py-3 text-sm font-bold" />
              </label>
            </div>
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {historyRecords.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm font-bold text-slate-400">
                  {teacherText(language, "目前沒有符合條件的課程進度。", "No matching course progress records.")}
                </p>
              ) : historyRecords.map((record) => (
                <article key={record.id} className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
                  <p className="text-xs font-black text-teal-700">{record.entry_date}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-slate-700">{record.lesson_content}</p>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
