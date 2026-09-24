"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Student = { id: string; name: string; grade: string | null };
type Submission = {
  response_id: string;
  student_name: string;
  grade_group: "middle" | "upper";
  selected_dates: string[];
  applied_dates: string[];
  skipped_dates: string[];
  student_id: string | null;
  status: "received" | "unmatched" | "applied" | "review" | "error";
  note: string | null;
  submitted_at: string | null;
};

const statusLabels: Record<Submission["status"], string> = {
  received: "處理中", unmatched: "待核對", applied: "已同步", review: "部分未套用", error: "處理失敗",
};

const fetchResponses = () => supabase.from("form_meal_submissions")
  .select("response_id, student_name, grade_group, selected_dates, applied_dates, skipped_dates, student_id, status, note, submitted_at")
  .order("created_at", { ascending: false }).limit(100);

export default function FormMealResponses({ students }: { students: Student[] }) {
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "review">("review");

  const load = async () => {
    const { data, error: loadError } = await fetchResponses();
    if (loadError) setError(loadError.message);
    else { setRows((data || []) as Submission[]); setError(""); }
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void fetchResponses().then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) setError(loadError.message);
      else setRows((data || []) as Submission[]);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const visibleRows = useMemo(() => rows.filter((row) => filter === "all"
    || ["unmatched", "review", "error", "received"].includes(row.status)), [rows, filter]);
  const reviewCount = rows.filter((row) => row.status !== "applied").length;

  const resolve = async (row: Submission) => {
    const studentId = selectedStudents[row.response_id];
    if (!studentId || savingId) return;
    setSavingId(row.response_id);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("請重新登入管理員帳號");
      const response = await fetch("/api/integrations/form-meals/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ responseId: row.response_id, studentId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "核對失敗");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "核對失敗");
    } finally {
      setSavingId(null);
    }
  };

  return <section className="app-card overflow-hidden">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-5 sm:px-6">
      <div>
        <h2 className="text-xl font-black text-slate-950">表單訂餐回覆</h2>
        <p className="mt-1 text-sm text-slate-500">只加訂勾選日期；固定訂餐、請假和手動停訂設定不會被取消或覆蓋。</p>
      </div>
      <div className="flex items-center gap-2">
        <select aria-label="回覆篩選" value={filter} onChange={(event) => setFilter(event.target.value as "all" | "review")}
          className="app-input px-3 py-2 text-sm">
          <option value="review">待處理 {reviewCount}</option><option value="all">全部回覆</option>
        </select>
        <button type="button" onClick={() => { setLoading(true); void load(); }} className="rounded border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">重新整理</button>
      </div>
    </header>
    <div className="space-y-2 p-4 sm:p-6">
      {loading && <p className="text-sm text-slate-500">載入中...</p>}
      {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
      {!loading && !error && visibleRows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">
        {rows.length === 0 ? "尚未同步任何表單回覆。" : "沒有需要處理的回覆。"}
      </p>}
      {visibleRows.map((row) => {
        const groupGrades = row.grade_group === "middle" ? ["小三", "小四"] : ["小五", "小六"];
        const choices = students.filter((student) => groupGrades.includes(student.grade || ""));
        return <div key={row.response_id} className="border-b border-slate-100 py-3 last:border-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <strong className="text-sm text-slate-900">{row.student_name}</strong>
            <span className="text-xs text-slate-500">{row.grade_group === "middle" ? "三、四年級" : "五、六年級"}</span>
            <span className={`text-xs font-bold ${row.status === "applied" ? "text-emerald-700" : "text-amber-700"}`}>{statusLabels[row.status]}</span>
            <span className="text-xs text-slate-400">{row.submitted_at ? new Date(row.submitted_at).toLocaleString("zh-TW") : ""}</span>
          </div>
          <p className="mt-1 text-xs text-slate-600">勾選 {row.selected_dates.length} 天：{row.selected_dates.join("、") || "無"}</p>
          {row.applied_dates.length > 0 && <p className="mt-1 text-xs text-emerald-700">已加入：{row.applied_dates.join("、")}</p>}
          {row.skipped_dates.length > 0 && <p className="mt-1 text-xs text-amber-700">未套用：{row.skipped_dates.join("、")}</p>}
          {row.note && <p className="mt-1 text-xs text-amber-700">{row.note}</p>}
          {row.status === "unmatched" && <div className="mt-3 flex flex-wrap gap-2">
            <select aria-label={`核對 ${row.student_name} 對應學生`} value={selectedStudents[row.response_id] || ""}
              onChange={(event) => setSelectedStudents((current) => ({ ...current, [row.response_id]: event.target.value }))}
              className="app-input min-w-44 px-3 py-2 text-sm">
              <option value="">選擇正確學生</option>
              {choices.map((student) => <option key={student.id} value={student.id}>{student.grade} · {student.name}</option>)}
            </select>
            <button type="button" disabled={!selectedStudents[row.response_id] || Boolean(savingId)}
              onClick={() => void resolve(row)} className="rounded bg-sky-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">確認並加訂</button>
          </div>}
        </div>;
      })}
    </div>
  </section>;
}
