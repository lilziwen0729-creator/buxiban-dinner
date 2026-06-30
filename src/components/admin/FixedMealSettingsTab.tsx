"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { logOperation } from "@/lib/operationLog";

type Student = {
  id: string;
  name: string;
  grade: string | null;
  fixed_days_off: string[] | null;
  auto_order: boolean | null;
};

const weekdays = ["週一", "週二", "週三", "週四", "週五"];
const gradeOrder = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];

const normalizeDays = (days: string[] | null | undefined) =>
  weekdays.filter((day) => Array.isArray(days) && days.includes(day));

const sameDays = (left: string[], right: string[]) =>
  left.length === right.length && left.every((day, index) => day === right[index]);

export default function FixedMealSettingsTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchStudents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("students")
      .select("id, name, grade, fixed_days_off, auto_order")
      .eq("enrollment_status", "active");

    if (error) {
      alert("固定訂餐名單載入失敗：" + error.message);
      setLoading(false);
      return;
    }

    const sorted = ((data || []) as Student[]).sort((a, b) => {
      const gradeA = gradeOrder.indexOf(a.grade || "");
      const gradeB = gradeOrder.indexOf(b.grade || "");
      return (gradeA === -1 ? 99 : gradeA) - (gradeB === -1 ? 99 : gradeB) || a.name.localeCompare(b.name, "zh-TW");
    });

    setStudents(sorted);
    setDrafts(Object.fromEntries(sorted.map((student) => [student.id, normalizeDays(student.fixed_days_off)])));
    setLoading(false);
  };

  useEffect(() => {
    void fetchStudents();
  }, []);

  const filteredStudents = useMemo(() => students.filter((student) => {
    if (gradeFilter !== "all" && (student.grade || "無") !== gradeFilter) return false;
    const days = drafts[student.id] || [];
    if (planFilter === "enabled" && days.length === 0) return false;
    if (planFilter === "disabled" && days.length > 0) return false;
    const keyword = search.trim().toLocaleLowerCase("zh-TW");
    return !keyword || student.name.toLocaleLowerCase("zh-TW").includes(keyword);
  }), [drafts, gradeFilter, planFilter, search, students]);

  const enabledCount = students.filter((student) => (drafts[student.id] || []).length > 0).length;

  const toggleDay = (studentId: string, day: string) => {
    setDrafts((current) => {
      const currentDays = current[studentId] || [];
      const nextDays = currentDays.includes(day)
        ? currentDays.filter((item) => item !== day)
        : weekdays.filter((item) => [...currentDays, day].includes(item));
      return { ...current, [studentId]: nextDays };
    });
  };

  const saveStudent = async (student: Student) => {
    if (savingId) return;
    const nextDays = drafts[student.id] || [];
    setSavingId(student.id);

    try {
      const { error } = await supabase
        .from("students")
        .update({ fixed_days_off: nextDays, auto_order: nextDays.length > 0 })
        .eq("id", student.id);
      if (error) throw error;

      setStudents((current) => current.map((item) => item.id === student.id
        ? { ...item, fixed_days_off: nextDays, auto_order: nextDays.length > 0 }
        : item));

      await logOperation({
        action: "student_update",
        targetType: "student",
        targetId: student.id,
        targetName: student.name,
        studentId: student.id,
        studentName: student.name,
        metadata: { fixed_days_off: nextDays, auto_order: nextDays.length > 0, source: "fixed_meal_settings" },
      });
    } catch (error: any) {
      alert("固定訂餐儲存失敗：" + (error?.message || "請稍後再試"));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="app-card overflow-hidden">
      <div className="border-b border-rose-100 bg-white/80 p-6 md:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-sky-600">Fixed Meal Plan</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">每週固定訂餐設定</h2>
            <p className="mt-2 text-sm font-bold text-slate-500">替在班學生設定每週訂餐日；當天有排餐時，系統才會自動建立訂單。</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-[320px]">
            <div className="rounded-2xl bg-sky-50 p-4 text-sky-700">
              <p className="text-xs font-black">在班學生</p>
              <p className="mt-1 text-2xl font-black">{students.length}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-700">
              <p className="text-xs font-black">已設定</p>
              <p className="mt-1 text-2xl font-black">{enabledCount}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_180px_240px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜尋學生姓名"
            className="app-input px-5 py-3.5 text-sm font-bold"
          />
          <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} className="app-input px-4 py-3.5 text-sm font-black text-slate-600">
            <option value="all">全年級</option>
            <option value="無">未設定年級</option>
            {gradeOrder.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1">
            {([
              ["all", "全部"],
              ["enabled", "已設定"],
              ["disabled", "未設定"],
            ] as const).map(([value, label]) => (
              <button key={value} onClick={() => setPlanFilter(value)} className={`rounded-xl px-2 py-3 text-xs font-black transition ${planFilter === value ? "bg-white text-sky-700 shadow-sm" : "text-slate-500"}`}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6">
        {loading ? (
          <div className="py-20 text-center font-bold text-slate-400">固定訂餐名單載入中...</div>
        ) : filteredStudents.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center font-bold text-slate-400">沒有符合條件的學生。</div>
        ) : (
          <div className="space-y-3">
            {filteredStudents.map((student) => {
              const currentDays = normalizeDays(student.fixed_days_off);
              const draftDays = drafts[student.id] || [];
              const changed = !sameDays(currentDays, draftDays);
              const isSaving = savingId === student.id;

              return (
                <div key={student.id} className={`grid gap-4 rounded-3xl border p-4 transition lg:grid-cols-[220px_1fr_120px] lg:items-center ${changed ? "border-sky-300 bg-sky-50/50" : "border-slate-100 bg-white"}`}>
                  <div className="flex items-center justify-between gap-3 lg:block">
                    <div>
                      <p className="text-lg font-black text-slate-900">{student.name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-400">{student.grade || "未設定年級"}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black lg:mt-2 lg:inline-block ${draftDays.length > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {draftDays.length > 0 ? `${draftDays.length} 天` : "未設定"}
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-2">
                    {weekdays.map((day) => {
                      const selected = draftDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={selected}
                          disabled={isSaving}
                          onClick={() => toggleDay(student.id, day)}
                          className={`min-w-0 rounded-2xl px-1 py-3 text-sm font-black transition active:scale-95 disabled:opacity-50 ${selected ? "bg-sky-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:bg-sky-50"}`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => void saveStudent(student)}
                    disabled={!changed || Boolean(savingId)}
                    className={`rounded-2xl px-4 py-3 text-sm font-black transition ${changed ? "bg-sky-600 text-white shadow-md hover:bg-sky-700" : "bg-slate-100 text-slate-400"}`}
                  >
                    {isSaving ? "儲存中" : changed ? "儲存" : "已儲存"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
