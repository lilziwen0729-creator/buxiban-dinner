"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { logOperation } from "@/lib/operationLog";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  grade: string | null;
  enrollment_status: string | null;
};

const gradeOrder = ["幼兒", "大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三"];

export default function GradeManagementTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedGrade, setSelectedGrade] = useState("小一");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resultMessage, setResultMessage] = useState("");

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("students")
      .select("id, name, grade, enrollment_status");

    if (error) {
      alert(`讀取學生年級失敗：${error.message}`);
      setStudents([]);
    } else {
      setStudents(
        ((data || []) as Student[]).filter(
          (student) => (student.enrollment_status || "active") === "active"
        )
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchStudents();
  }, [fetchStudents]);

  const gradeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    students.forEach((student) => {
      const grade = student.grade || "未設定";
      counts.set(grade, (counts.get(grade) || 0) + 1);
    });
    return counts;
  }, [students]);

  const promotableCount = useMemo(
    () => gradeOrder.slice(0, -1).reduce((total, grade) => total + (gradeCounts.get(grade) || 0), 0),
    [gradeCounts]
  );

  const updateOneGrade = async (sourceGrade: string, targetGrade: string) => {
    const { data, error } = await supabase
      .from("students")
      .update({ grade: targetGrade })
      .eq("grade", sourceGrade)
      .or("enrollment_status.eq.active,enrollment_status.is.null")
      .select("id");

    if (error) throw error;
    return data?.length || 0;
  };

  const adjustSelectedGrade = async (direction: "up" | "down") => {
    const currentIndex = gradeOrder.indexOf(selectedGrade);
    const targetIndex = direction === "up" ? currentIndex + 1 : currentIndex - 1;
    const targetGrade = gradeOrder[targetIndex];
    const affectedCount = gradeCounts.get(selectedGrade) || 0;

    if (!targetGrade) return alert(`「${selectedGrade}」已經無法再${direction === "up" ? "升" : "降"}級。`);
    if (affectedCount === 0) return alert(`目前沒有在班的${selectedGrade}學生。`);
    if (!confirm(`確定將 ${affectedCount} 位${selectedGrade}學生調整為${targetGrade}？`)) return;

    setBusy(true);
    setResultMessage("");
    try {
      const updatedCount = await updateOneGrade(selectedGrade, targetGrade);
      await logOperation({
        action: direction === "up" ? "grade_promote_selected" : "grade_demote_selected",
        targetType: "students",
        targetName: `${selectedGrade} → ${targetGrade}`,
        metadata: { source_grade: selectedGrade, target_grade: targetGrade, updated_count: updatedCount },
      });
      setResultMessage(`已將 ${updatedCount} 位${selectedGrade}學生調整為${targetGrade}。`);
      await fetchStudents();
    } catch (error) {
      alert(`年級調整失敗：${error instanceof Error ? error.message : "未知錯誤"}`);
    } finally {
      setBusy(false);
    }
  };

  const promoteAllGrades = async () => {
    if (promotableCount === 0) return alert("目前沒有可升級的在班學生。");
    if (!confirm(`確定一鍵升級全部年級？\n預計調整 ${promotableCount} 位學生，國三維持不變。`)) return;

    setBusy(true);
    setResultMessage("");
    let updatedCount = 0;
    try {
      // 從高年級往低年級更新，避免同一位學生在本次操作中連升多級。
      for (let index = gradeOrder.length - 2; index >= 0; index -= 1) {
        updatedCount += await updateOneGrade(gradeOrder[index], gradeOrder[index + 1]);
      }
      await logOperation({
        action: "annual_grade_promotion",
        targetType: "system",
        targetName: "手動一鍵升級全部年級",
        metadata: { promoted_count: updatedCount, trigger: "manual", top_grade_unchanged: "國三" },
      });
      setResultMessage(`全校年級升級完成，共調整 ${updatedCount} 位學生；國三維持不變。`);
      await fetchStudents();
    } catch (error) {
      alert(`全校年級升級未完成：${error instanceof Error ? error.message : "未知錯誤"}`);
      await fetchStudents();
    } finally {
      setBusy(false);
    }
  };

  const selectedIndex = gradeOrder.indexOf(selectedGrade);
  const lowerGrade = selectedIndex > 0 ? gradeOrder[selectedIndex - 1] : null;
  const upperGrade = selectedIndex < gradeOrder.length - 1 ? gradeOrder[selectedIndex + 1] : null;

  return (
    <div className="space-y-5">
      <section className="app-card overflow-hidden">
        <div className="border-b border-rose-100 bg-rose-50/60 p-6">
          <p className="text-xs font-black uppercase tracking-widest text-fuchsia-500">Grade Management</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">年級調整</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">年級只會在管理員按下按鈕後變更，不再於 7 月 1 日自動升級。</p>
        </div>

        <div className="grid gap-5 p-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-rose-100 bg-white p-5">
            <p className="text-sm font-black text-rose-500">全校調整</p>
            <h3 className="mt-2 text-xl font-black text-slate-950">一鍵升級全部年級</h3>
            <p className="mt-2 text-sm font-bold leading-relaxed text-slate-500">
              幼兒升大班、大班升小一，依序升到國三；國三學生維持原年級。
            </p>
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-rose-50 px-4 py-3">
              <span className="text-sm font-black text-rose-700">預計調整</span>
              <span className="text-2xl font-black text-rose-600">{loading ? "—" : promotableCount} 人</span>
            </div>
            <button
              onClick={promoteAllGrades}
              disabled={busy || loading || promotableCount === 0}
              className="mt-4 w-full rounded-2xl bg-rose-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-rose-100 transition hover:bg-rose-600 disabled:bg-slate-300"
            >
              {busy ? "處理中..." : "一鍵升級全部年級"}
            </button>
          </div>

          <div className="rounded-3xl border border-fuchsia-100 bg-white p-5">
            <p className="text-sm font-black text-fuchsia-500">指定年級</p>
            <h3 className="mt-2 text-xl font-black text-slate-950">升一級或降一級</h3>
            <label className="mt-4 block space-y-2">
              <span className="text-xs font-black text-slate-400">選擇目前年級</span>
              <select
                value={selectedGrade}
                onChange={(event) => setSelectedGrade(event.target.value)}
                className="app-input px-4 py-3 font-black"
              >
                {gradeOrder.map((grade) => (
                  <option key={grade} value={grade}>{grade}（{gradeCounts.get(grade) || 0} 人）</option>
                ))}
              </select>
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => void adjustSelectedGrade("down")}
                disabled={busy || loading || !lowerGrade || (gradeCounts.get(selectedGrade) || 0) === 0}
                className="rounded-2xl bg-blue-50 px-4 py-4 text-sm font-black text-blue-700 transition hover:bg-blue-100 disabled:text-slate-300"
              >
                {lowerGrade ? `降為${lowerGrade}` : "無法再降級"}
              </button>
              <button
                onClick={() => void adjustSelectedGrade("up")}
                disabled={busy || loading || !upperGrade || (gradeCounts.get(selectedGrade) || 0) === 0}
                className="rounded-2xl bg-fuchsia-500 px-4 py-4 text-sm font-black text-white transition hover:bg-fuchsia-600 disabled:bg-slate-300"
              >
                {upperGrade ? `升為${upperGrade}` : "無法再升級"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {resultMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-800">
          {resultMessage}
        </div>
      )}

      <section className="app-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-950">目前在班年級人數</h3>
            <p className="mt-1 text-sm font-bold text-slate-500">操作前可先核對各年級人數。</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">共 {students.length} 人</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {gradeOrder.map((grade) => (
            <div key={grade} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-center">
              <p className="text-sm font-black text-slate-500">{grade}</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{gradeCounts.get(grade) || 0}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
