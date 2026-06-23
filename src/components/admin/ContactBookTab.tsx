"use client";

import { useEffect, useMemo, useState } from "react";
import { getToday } from "@/lib/date";
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

type ContactBookRecord = {
  id: string;
  course_id: string;
  entry_date: string;
  lesson_content: string | null;
  homework: string | null;
  quiz_scope: string | null;
  created_at?: string;
  updated_at?: string;
};

const weekdays = ["", "週一", "週二", "週三", "週四", "週五", "週六", "週日"];

const emptyForm = {
  lesson_content: "",
  homework: "",
  quiz_scope: "",
};

export default function ContactBookTab() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [records, setRecords] = useState<ContactBookRecord[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [entryDate, setEntryDate] = useState(getToday());
  const [formData, setFormData] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [historyCourseFilter, setHistoryCourseFilter] = useState("all");

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);
  const courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const currentRecord = records.find((record) => record.course_id === selectedCourseId && record.entry_date === entryDate);
    setFormData({
      lesson_content: currentRecord?.lesson_content || "",
      homework: currentRecord?.homework || "",
      quiz_scope: currentRecord?.quiz_scope || "",
    });
  }, [selectedCourseId, entryDate, records]);

  const fetchData = async () => {
    setLoading(true);
    const [courseRes, recordRes] = await Promise.all([
      supabase.from("courses").select("*").order("day_of_week").order("start_time").order("name"),
      supabase.from("contact_books").select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(300),
    ]);

    if (courseRes.error) {
      alert("課程讀取失敗：" + courseRes.error.message);
    }

    if (recordRes.error) {
      console.warn("聯絡簿讀取失敗:", recordRes.error.message);
    }

    const courseList = (courseRes.data || []) as Course[];
    setCourses(courseList);
    setRecords((recordRes.data || []) as ContactBookRecord[]);
    setSelectedCourseId((current) => current || courseList[0]?.id || "");
    setLoading(false);
  };

  const saveContactBook = async () => {
    if (!selectedCourseId) return alert("請先選擇課程");
    if (!formData.lesson_content.trim() && !formData.homework.trim() && !formData.quiz_scope.trim()) {
      return alert("請至少填寫上課內容、今日作業或下次週考範圍其中一項。");
    }

    setSaving(true);
    try {
      const payload = {
        course_id: selectedCourseId,
        entry_date: entryDate,
        lesson_content: formData.lesson_content.trim() || null,
        homework: formData.homework.trim() || null,
        quiz_scope: formData.quiz_scope.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("contact_books")
        .upsert(payload, { onConflict: "course_id,entry_date" })
        .select("*")
        .single();

      if (error) throw error;

      setRecords((current) => {
        const keepOthers = current.filter((record) => !(record.course_id === selectedCourseId && record.entry_date === entryDate));
        return [data as ContactBookRecord, ...keepOthers].sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date)));
      });

      await logOperation({
        action: "contact_book_upsert",
        targetType: "course",
        targetId: selectedCourseId,
        targetName: selectedCourse?.name || "聯絡簿",
        metadata: { entry_date: entryDate },
      });

      alert("聯絡簿已儲存。");
    } catch (err: any) {
      alert("儲存失敗：" + (err?.message || "請確認是否已執行 database/contact_books.sql"));
    } finally {
      setSaving(false);
    }
  };

  const historyRecords = records.filter((record) => historyCourseFilter === "all" || record.course_id === historyCourseFilter);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.9fr)_1.1fr]">
      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <p className="text-xs font-black uppercase tracking-widest text-amber-500">Contact Book</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">聯絡簿</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">選課程後填寫上課內容、今日作業與下次週考範圍。</p>
        </div>

        <div className="space-y-5 p-6">
          {loading ? (
            <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center text-sm font-bold text-slate-400">聯絡簿資料讀取中...</div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400">日期</label>
                  <input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} className="app-input px-4 py-3 font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400">課程</label>
                  <select value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)} className="app-input px-4 py-3 font-bold">
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name} ({weekdays[course.day_of_week] || course.day_of_week})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400">上課內容</label>
                <textarea
                  value={formData.lesson_content}
                  onChange={(event) => setFormData({ ...formData, lesson_content: event.target.value })}
                  className="app-input min-h-28 resize-y px-4 py-3 font-bold"
                  placeholder="例如：一元一次方程式解題、課本 L2 單字與句型"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400">今日作業</label>
                <textarea
                  value={formData.homework}
                  onChange={(event) => setFormData({ ...formData, homework: event.target.value })}
                  className="app-input min-h-24 resize-y px-4 py-3 font-bold"
                  placeholder="例如：講義 p.12-p.15、英文單字 20 個"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400">下次週考範圍</label>
                <textarea
                  value={formData.quiz_scope}
                  onChange={(event) => setFormData({ ...formData, quiz_scope: event.target.value })}
                  className="app-input min-h-24 resize-y px-4 py-3 font-bold"
                  placeholder="例如：B2 U4、L1-L3、一次方程式"
                />
              </div>

              <button onClick={saveContactBook} disabled={saving || !selectedCourseId} className="w-full rounded-2xl bg-amber-500 py-4 font-black text-white shadow-lg shadow-amber-100 transition hover:bg-amber-600 disabled:bg-slate-300 disabled:shadow-none">
                {saving ? "儲存中..." : "儲存聯絡簿"}
              </button>
            </>
          )}
        </div>
      </section>

      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-blue-500">History</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">聯絡簿歷史紀錄</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">方便回顧各課程過去上課與作業內容。</p>
            </div>
            <select value={historyCourseFilter} onChange={(event) => setHistoryCourseFilter(event.target.value)} className="app-input w-full px-4 py-3 text-sm font-black md:w-72">
              <option value="all">全部課程</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="max-h-[680px] space-y-3 overflow-y-auto p-6">
          {historyRecords.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center text-sm font-bold text-slate-400">目前沒有聯絡簿紀錄。</div>
          ) : historyRecords.map((record) => {
            const course = courseMap.get(record.course_id);
            return (
              <article key={record.id} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{course?.name || "未知課程"}</h3>
                    <p className="mt-1 text-sm font-bold text-slate-400">{record.entry_date} · {course ? weekdays[course.day_of_week] : ""}</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedCourseId(record.course_id);
                      setEntryDate(record.entry_date);
                    }}
                    className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-black text-rose-600 transition hover:bg-rose-500 hover:text-white"
                  >
                    載入編輯
                  </button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-blue-50/70 p-4">
                    <p className="text-xs font-black text-blue-500">上課內容</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-relaxed text-slate-700">{record.lesson_content || "-"}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50/70 p-4">
                    <p className="text-xs font-black text-emerald-600">今日作業</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-relaxed text-slate-700">{record.homework || "-"}</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50/80 p-4">
                    <p className="text-xs font-black text-amber-600">下次週考範圍</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-relaxed text-slate-700">{record.quiz_scope || "-"}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
