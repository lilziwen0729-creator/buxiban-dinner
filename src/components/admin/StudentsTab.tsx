"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { logOperation } from "@/lib/operationLog";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import {
  attendanceWeekdays,
  getAttendanceScheduleLabel,
  normalizeAttendanceDays,
  normalizeAttendanceScheduleMode,
  type AttendanceScheduleMode,
} from "@/lib/attendanceSchedule";

// --- 🎯 型別定義 ---
export type Student = {
  id: string;
  name: string;
  grade: string;
  student_code?: string;
  gender?: string;
  birthday?: string;
  student_phone?: string;
  school_name?: string;
  dietary_restrictions?: string;
  meal_preference?: string;
  enrollment_status?: "active" | "withdrawn";
  fixed_days_off?: string[] | number[] | null;
  auto_order?: boolean;
  attendance_schedule_mode?: AttendanceScheduleMode | null;
  attendance_schedule_days?: number[] | string[] | null;
  balance: number;
  student_parent_relations?: {
    id: string; 
    relationship: string; 
    parents: { id: string; phone: string; name?: string; };
  }[];
};

type ParentFormRelation = {
  relation_id?: string;
  parent_id?: string;
  relationship: string;
  parent_name?: string;
  phone: string;
};

type LowBalancePreviewRow = {
  student_id: string;
  student_name: string;
  balance: number;
  parent_count: number;
  sent: number;
  status: "sent" | "skipped" | "failed";
  reason?: string;
};

const gradeOrder = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];
const hasFixedMealPlan = (student: Student) => student.auto_order === true || (Array.isArray(student.fixed_days_off) && student.fixed_days_off.length > 0);

// ==========================================
// 1️⃣ 主頁面 (只保留大表單與搜尋邏輯，超級乾淨！)
// ==========================================
export default function StudentsTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "withdrawn" | "all">("active");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [notifyingLowBalance, setNotifyingLowBalance] = useState(false);
  const [lowBalancePreviewOpen, setLowBalancePreviewOpen] = useState(false);
  const [lowBalancePreviewRows, setLowBalancePreviewRows] = useState<LowBalancePreviewRow[]>([]);
  const [lowBalanceSelectedIds, setLowBalanceSelectedIds] = useState<string[]>([]);
  const [ignoredNoFixedMeal, setIgnoredNoFixedMeal] = useState(0);
  const [attendanceRuleOpen, setAttendanceRuleOpen] = useState(false);

  // 彈窗控制與選取的學生
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [modalState, setModalState] = useState<"none" | "add" | "edit" | "logs" | "adjust">("none");

  useEffect(() => { fetchStudents(); }, []);

  const fetchStudents = async () => {
    setLoading(true);
    const { data } = await supabase.from("students").select(`*, student_parent_relations ( id, relationship, parents ( id, phone, name ) )`);
    if (data) {
      const sortedData = (data as any[]).sort((a, b) => {
        const indexA = gradeOrder.indexOf(a.grade);
        const indexB = gradeOrder.indexOf(b.grade);
        return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB) || (a.name || "").localeCompare(b.name || "", "zh-TW");
      });
      setStudents(sortedData);
    }
    setLoading(false);
  };

  const handleTopup = async (s: Student) => {
    const amount = parseInt(prompt(`請輸入要為【${s.name}】儲值的金額：`) || "0");
    if (isNaN(amount) || amount <= 0) return;

    try {
      const { data, error } = await supabase.rpc("adjust_student_balance_atomic", {
        p_student_id: s.id,
        p_amount: amount,
        p_type: "topup",
        p_description: "管理員手動儲值",
      });
      if (error) {
        if (error.message.includes("adjust_student_balance_atomic")) {
          throw new Error("請先到 Supabase 執行 database/accounting_atomic.sql");
        }
        throw error;
      }

      const result = (data || {}) as { balance_before?: number; balance_after?: number };
      const balanceBefore = Number(result.balance_before ?? s.balance ?? 0);
      const balanceAfter = Number(result.balance_after ?? balanceBefore + amount);

      await logOperation({
        action: "student_topup",
        targetType: "student",
        targetId: s.id,
        targetName: s.name,
        studentId: s.id,
        studentName: s.name,
        metadata: { amount, balance_before: balanceBefore, balance_after: balanceAfter },
      });

      alert(`儲值成功！目前餘額已更新為 $${balanceAfter}`);
      await fetchStudents();
    } catch (err: any) {
      alert("儲值失敗：" + err.message);
    }
  };

  const previewLowBalance = async () => {
    const threshold = 200;
    const lowBalanceCount = students.filter((student) =>
      (student.enrollment_status || "active") === "active" &&
      Number(student.balance || 0) < threshold &&
      hasFixedMealPlan(student)
    ).length;

    if (lowBalanceCount === 0) {
      alert("目前沒有需要通知的固定訂餐低餘額學生。");
      return;
    }

    setNotifyingLowBalance(true);

    try {
      const response = await authenticatedFetch("/api/low-balance-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold, dryRun: true }),
      });

      const result = await response.json();

      if (!response.ok && !result.results) {
        throw new Error(result.error || "發送失敗");
      }

      const rows = (result.results || []) as LowBalancePreviewRow[];
      const selectableIds = rows
        .filter((row) => row.parent_count > 0 && row.reason === "dryRun 未發送")
        .map((row) => row.student_id);

      setLowBalancePreviewRows(rows);
      setLowBalanceSelectedIds(selectableIds);
      setIgnoredNoFixedMeal(result.ignoredNoFixedMeal || 0);
      setLowBalancePreviewOpen(true);
    } catch (err: any) {
      alert("低餘額通知預覽失敗：" + err.message);
    } finally {
      setNotifyingLowBalance(false);
    }
  };

  const sendSelectedLowBalance = async () => {
    const threshold = 200;

    if (lowBalanceSelectedIds.length === 0) {
      alert("請至少勾選一位學生。");
      return;
    }

    if (!confirm(`確定發送 ${lowBalanceSelectedIds.length} 位學生的餐費低餘額通知嗎？`)) return;

    setNotifyingLowBalance(true);

    try {
      const response = await authenticatedFetch("/api/low-balance-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold, studentIds: lowBalanceSelectedIds }),
      });

      const result = await response.json();

      if (!response.ok && !result.results) {
        throw new Error(result.error || "發送失敗");
      }

      alert(`低餘額通知完成：成功 ${result.sentStudents || 0} 位，略過 ${result.skipped || 0} 位，失敗 ${result.failed || 0} 位。未固定訂餐略過 ${result.ignoredNoFixedMeal || 0} 位。`);
      await logOperation({
        action: "low_balance_notify",
        targetType: "students",
        targetName: "低餘額學生",
        metadata: {
          threshold,
          total: result.total || 0,
          sentStudents: result.sentStudents || 0,
          skipped: result.skipped || 0,
          failed: result.failed || 0,
          ignoredNoFixedMeal: result.ignoredNoFixedMeal || 0,
          target: "fixed_meal_students_only",
          selectedStudents: lowBalanceSelectedIds.length,
        },
      });
      setLowBalancePreviewOpen(false);
      setLowBalancePreviewRows([]);
      setLowBalanceSelectedIds([]);
    } catch (err: any) {
      alert("低餘額通知失敗：" + err.message);
    } finally {
      setNotifyingLowBalance(false);
    }
  };

  const counts = {
    active: students.filter((student) => (student.enrollment_status || "active") === "active").length,
    withdrawn: students.filter((student) => student.enrollment_status === "withdrawn").length,
  };

  const filteredStudents = students.filter(s => {
    const currentStatus = s.enrollment_status || "active";
    if (statusFilter !== "all" && currentStatus !== statusFilter) return false;
    if (gradeFilter !== "all" && (s.grade || "無") !== gradeFilter) return false;
    if (!search.trim()) return true;
    return s.name.includes(search) || s.student_code?.includes(search) ||
      s.dietary_restrictions?.includes(search) ||
      s.meal_preference?.includes(search) ||
      s.student_parent_relations?.some(r => r.parents.phone.includes(search) || (r.relationship && r.relationship.includes(search)));
  });

  return (
    <div className="app-card relative overflow-hidden text-base">
      {/* 頂部操作列 */}
      <div className="border-b border-slate-100 bg-slate-50/70 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-blue-500">Students</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">學生資料管理</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">管理學籍、家長聯絡人與餐費餘額</p>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <button onClick={() => setAttendanceRuleOpen(true)} className="app-button w-full bg-blue-50 px-6 text-blue-700 hover:bg-blue-100 md:w-auto">
              固定到班設定
            </button>
            <button onClick={previewLowBalance} disabled={notifyingLowBalance} className="app-button app-button-danger w-full md:w-auto">
              {notifyingLowBalance ? "名單整理中..." : "固定訂餐低餘額通知"}
            </button>
            <button onClick={() => { setSelectedStudent(null); setModalState("add"); }} className="app-button w-full bg-green-600 px-6 text-white shadow-lg shadow-green-100 hover:bg-green-700 md:w-auto">
              新增學生
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_auto_auto]">
          <div className="relative w-full">
            <input type="text" placeholder="搜尋姓名、聯絡人、電話、代碼..." value={search} onChange={(e) => setSearch(e.target.value)} className="app-input px-5 py-4 pl-12 font-bold" />
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-300">⌕</span>
          </div>
          <select
            value={gradeFilter}
            onChange={(event) => setGradeFilter(event.target.value)}
            className="app-input min-w-[160px] px-4 py-4 text-sm font-black text-slate-600"
          >
            <option value="all">全年級</option>
            <option value="無">未設定年級</option>
            {gradeOrder.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
            {[
              { value: "active", label: `在班 ${counts.active}` },
              { value: "withdrawn", label: `退班 ${counts.withdrawn}` },
              { value: "all", label: "全部" },
            ].map((item) => (
              <button
                key={item.value}
                onClick={() => setStatusFilter(item.value as "active" | "withdrawn" | "all")}
                className={`rounded-xl px-4 py-3 text-sm font-black transition ${statusFilter === item.value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:bg-white/70"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 學生列表表格 */}
      <div className="min-h-[500px] overflow-x-auto">
        {loading ? <div className="p-20 text-center text-slate-400 font-bold animate-pulse">資料載入中...</div> : (
          <table className="min-w-[900px] w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-white text-sm uppercase tracking-widest text-slate-400">
                <th className="px-6 py-4 font-black">#</th>
                <th className="w-48 px-6 py-4 font-black">姓名（年級）</th>
                <th className="px-6 py-4 font-black">聯絡方式</th>
                <th className="px-6 py-4 font-black">餘額</th>
                <th className="px-6 py-4 text-center font-black">管理</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((s, index) => (
                <tr key={s.id} className={`transition-colors hover:bg-rose-50/60 ${s.enrollment_status === "withdrawn" ? "bg-slate-50/70 opacity-70" : ""}`}>
                  <td className="px-6 py-5 font-mono text-slate-300">{index + 1}</td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-800 text-xl">{s.name}</span>
                      {s.gender && <span className="text-xs text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded">{s.gender}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className={`text-sm font-bold w-fit px-2 py-0.5 rounded-md ${s.grade === '無' || !s.grade ? 'bg-slate-100 text-slate-500' : 'bg-rose-50 text-rose-500'}`}>{s.grade || "無"}</span>
                      <span className={`text-sm font-black w-fit px-2 py-0.5 rounded-md ${s.enrollment_status === "withdrawn" ? "bg-slate-200 text-slate-500" : "bg-emerald-50 text-emerald-600"}`}>
                        {s.enrollment_status === "withdrawn" ? "退班" : "在班"}
                      </span>
                      {getAttendanceScheduleLabel(s) && (
                        <span className="w-fit rounded-md bg-blue-50 px-2 py-0.5 text-xs font-black text-blue-600">
                          {getAttendanceScheduleLabel(s)}
                        </span>
                      )}
                    </div>
                    {(s.meal_preference || s.dietary_restrictions) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {s.meal_preference && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-600">偏好：{s.meal_preference}</span>}
                        {s.dietary_restrictions && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-black text-orange-600">禁忌：{s.dietary_restrictions}</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    {s.student_parent_relations?.map((rel, i) => (
                      <div key={i} className="font-bold text-slate-600 mb-1">{rel.relationship || "聯絡人"}: <span className="font-mono text-slate-500 ml-2">{rel.parents?.phone}</span></div>
                    ))}
                    {(!s.student_parent_relations || s.student_parent_relations.length === 0) && <span className="text-slate-300 text-sm">未綁定</span>}
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-1">
                      <span className={`text-xl font-black ${s.balance < 200 ? "text-red-500" : "text-green-600"}`}>${s.balance}</span>
                      {s.balance < 200 && <span className="w-fit rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-black text-red-600">低餘額</span>}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => { setSelectedStudent(s); setModalState("edit"); }} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 transition-all hover:bg-slate-300" title="編輯資料">編輯</button>
                      <button onClick={() => { setSelectedStudent(s); setModalState("logs"); }} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-600 transition-all hover:bg-rose-500 hover:text-white" title="查看明細">明細</button>
                      <button onClick={() => { setSelectedStudent(s); setModalState("adjust"); }} className="rounded-xl bg-orange-50 px-3 py-2 text-xs font-black text-orange-600 transition-all hover:bg-orange-600 hover:text-white" title="手動調帳">調帳</button>
                      <button onClick={() => handleTopup(s)} className="rounded-xl bg-green-50 px-3 py-2 text-xs font-black text-green-600 shadow-sm transition-all hover:bg-green-600 hover:text-white" title="儲值">儲值</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {filteredStudents.length === 0 && !loading && <div className="p-20 text-center text-slate-400 font-bold italic">查無符合條件的學生資料</div>}
      </div>

      {/* 呼叫子組件 (彈窗) */}
      {(modalState === "add" || modalState === "edit") && <StudentFormModal student={selectedStudent} onClose={() => setModalState("none")} onRefresh={fetchStudents} gradeOrder={gradeOrder} />}
      {modalState === "logs" && selectedStudent && <TransactionLogsModal student={selectedStudent} onClose={() => setModalState("none")} />}
      {modalState === "adjust" && selectedStudent && <AdjustBalanceModal student={selectedStudent} onClose={() => setModalState("none")} onRefresh={fetchStudents} />}
      {attendanceRuleOpen && (
        <AttendanceRuleModal
          students={students}
          gradeOrder={gradeOrder}
          onClose={() => setAttendanceRuleOpen(false)}
          onRefresh={fetchStudents}
        />
      )}
      {lowBalancePreviewOpen && (
        <LowBalancePreviewModal
          rows={lowBalancePreviewRows}
          selectedIds={lowBalanceSelectedIds}
          ignoredNoFixedMeal={ignoredNoFixedMeal}
          sending={notifyingLowBalance}
          onToggle={(studentId: string) => setLowBalanceSelectedIds((current) => current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId])}
          onSelectAll={() => setLowBalanceSelectedIds(lowBalancePreviewRows.filter((row) => row.parent_count > 0 && row.reason === "dryRun 未發送").map((row) => row.student_id))}
          onClear={() => setLowBalanceSelectedIds([])}
          onClose={() => setLowBalancePreviewOpen(false)}
          onSend={sendSelectedLowBalance}
        />
      )}
    </div>
  );
}

function AttendanceRuleModal({
  students,
  gradeOrder,
  onClose,
  onRefresh,
}: {
  students: Student[];
  gradeOrder: string[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const activeStudents = students.filter((student) => (student.enrollment_status || "active") === "active");
  const initialStudent = activeStudents[0] || null;
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("all");
  const [selectedId, setSelectedId] = useState(initialStudent?.id || "");
  const [mode, setMode] = useState<AttendanceScheduleMode>(() => normalizeAttendanceScheduleMode(initialStudent?.attendance_schedule_mode));
  const [days, setDays] = useState<number[]>(() => normalizeAttendanceDays(initialStudent?.attendance_schedule_days));
  const [saving, setSaving] = useState(false);

  const filterStudents = (nextSearch: string, nextGrade: string) => activeStudents.filter((student) => {
    if (nextGrade !== "all" && (student.grade || "無") !== nextGrade) return false;
    return !nextSearch.trim() || student.name.includes(nextSearch.trim()) || student.student_code?.includes(nextSearch.trim());
  });
  const filteredStudents = filterStudents(search, grade);
  const selectedStudent = activeStudents.find((student) => student.id === selectedId) || null;

  const selectStudent = (student: Student | null) => {
    setSelectedId(student?.id || "");
    setMode(normalizeAttendanceScheduleMode(student?.attendance_schedule_mode));
    setDays(normalizeAttendanceDays(student?.attendance_schedule_days));
  };

  const ensureVisibleSelection = (nextSearch: string, nextGrade: string) => {
    const nextStudents = filterStudents(nextSearch, nextGrade);
    if (nextStudents.some((student) => student.id === selectedId)) return;
    selectStudent(nextStudents[0] || null);
  };

  const originalMode = selectedStudent ? normalizeAttendanceScheduleMode(selectedStudent.attendance_schedule_mode) : "all";
  const originalDays = selectedStudent ? normalizeAttendanceDays(selectedStudent.attendance_schedule_days) : [];
  const savedDays = mode === "all" ? [] : days;
  const isDirty = !!selectedStudent && (mode !== originalMode || savedDays.join(",") !== originalDays.join(","));

  const saveRule = async () => {
    if (!selectedStudent || saving) return;
    if (mode !== "all" && days.length === 0) {
      alert("請至少選擇一個星期，或改選「依課程正常點名」。");
      return;
    }

    setSaving(true);
    try {
      const attendanceDays = mode === "all" ? [] : normalizeAttendanceDays(days);
      const { error } = await supabase
        .from("students")
        .update({ attendance_schedule_mode: mode, attendance_schedule_days: attendanceDays })
        .eq("id", selectedStudent.id);
      if (error) {
        if (error.message.includes("attendance_schedule")) {
          throw new Error("請先到 Supabase 執行 database/student_attendance_schedule.sql");
        }
        throw error;
      }

      await logOperation({
        action: "student_update",
        targetType: "student",
        targetId: selectedStudent.id,
        targetName: selectedStudent.name,
        studentId: selectedStudent.id,
        studentName: selectedStudent.name,
        metadata: { attendance_schedule_mode: mode, attendance_schedule_days: attendanceDays },
      });
      await onRefresh();
      alert(`「${selectedStudent.name}」的固定到班規則已儲存。`);
    } catch (err: unknown) {
      alert("儲存失敗：" + (err instanceof Error ? err.message : "請稍後再試"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-5">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 p-5 sm:p-7">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-blue-500">Attendance schedule</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950">固定到班設定</h3>
            <p className="mt-2 text-sm font-bold text-slate-500">設定學生每週固定會到或不需到班的星期，點名名單會自動套用。</p>
          </div>
          <button onClick={onClose} className="text-3xl font-bold text-slate-300 transition hover:text-slate-800" aria-label="關閉">&times;</button>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[320px_1fr]">
          <aside className="flex min-h-[280px] flex-col border-b border-slate-100 bg-slate-50/70 p-4 md:min-h-0 md:border-b-0 md:border-r">
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1">
              <input value={search} onChange={(event) => { const value = event.target.value; setSearch(value); ensureVisibleSelection(value, grade); }} className="app-input px-4 py-3 text-sm font-bold" placeholder="搜尋學生姓名或代碼" />
              <select value={grade} onChange={(event) => { const value = event.target.value; setGrade(value); ensureVisibleSelection(search, value); }} className="app-input px-4 py-3 text-sm font-black text-slate-600">
                <option value="all">全年級</option>
                <option value="無">未設定年級</option>
                {gradeOrder.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {filteredStudents.map((student) => {
                const active = student.id === selectedId;
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => selectStudent(student)}
                    className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-blue-500 bg-blue-600 text-white shadow-sm" : "border-slate-100 bg-white text-slate-700 hover:border-blue-200"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-black">{student.name}</span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-black ${active ? "bg-white/20 text-white" : "bg-rose-50 text-rose-500"}`}>{student.grade || "無"}</span>
                    </div>
                    <p className={`mt-1 text-xs font-bold ${active ? "text-blue-100" : "text-slate-400"}`}>{getAttendanceScheduleLabel(student) || "依課程正常點名"}</p>
                  </button>
                );
              })}
              {filteredStudents.length === 0 && <p className="py-10 text-center text-sm font-bold text-slate-400">沒有符合條件的在班學生</p>}
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto p-5 sm:p-8">
            {!selectedStudent ? (
              <div className="flex min-h-[320px] items-center justify-center text-sm font-bold text-slate-400">請先選擇學生</div>
            ) : (
              <div className="mx-auto max-w-2xl">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-blue-600">{selectedStudent.grade || "無"}</p>
                    <h4 className="mt-1 text-3xl font-black text-slate-950">{selectedStudent.name}</h4>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-500">目前：{getAttendanceScheduleLabel(selectedStudent) || "依課程"}</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {([[
                    "all", "依課程正常點名", "所有排課日都應到",
                  ], [
                    "attend", "固定會到班", "只在所選星期點名",
                  ], [
                    "absent", "固定不到班", "所選星期不需點名",
                  ]] as const).map(([value, label, note]) => {
                    const active = mode === value;
                    return (
                      <button key={value} type="button" onClick={() => setMode(value)} className={`min-h-[92px] rounded-2xl border p-4 text-left transition ${active ? "border-blue-600 bg-blue-600 text-white shadow-md" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}>
                        <span className="block font-black">{label}</span>
                        <span className={`mt-2 block text-xs font-bold ${active ? "text-blue-100" : "text-slate-400"}`}>{note}</span>
                      </button>
                    );
                  })}
                </div>

                {mode !== "all" && (
                  <div className="mt-7 rounded-2xl bg-blue-50/70 p-5">
                    <p className="font-black text-slate-800">{mode === "attend" ? "固定會到班的星期" : "固定不到班的星期"}</p>
                    <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
                      {attendanceWeekdays.map((weekday) => {
                        const active = days.includes(weekday.value);
                        return (
                          <button key={weekday.value} type="button" aria-pressed={active} onClick={() => setDays(active ? days.filter((day) => day !== weekday.value) : [...days, weekday.value].sort((a, b) => a - b))} className={`h-12 rounded-xl border text-sm font-black transition ${active ? "border-blue-600 bg-blue-600 text-white" : "border-blue-100 bg-white text-slate-500 hover:border-blue-300"}`}>
                            {weekday.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-4 text-xs font-bold leading-5 text-slate-500">這項設定只調整應到名單，不會修改學生已綁定的課程。</p>
                  </div>
                )}

                <div className="mt-8 flex justify-end gap-3 border-t border-slate-100 pt-5">
                  <button onClick={onClose} className="rounded-xl bg-slate-100 px-6 py-3 font-black text-slate-500 transition hover:bg-slate-200">關閉</button>
                  <button onClick={saveRule} disabled={saving || !isDirty || (mode !== "all" && days.length === 0)} className="rounded-xl bg-blue-600 px-7 py-3 font-black text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:bg-slate-300 disabled:shadow-none">
                    {saving ? "儲存中..." : "儲存規則"}
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function LowBalancePreviewModal({
  rows,
  selectedIds,
  ignoredNoFixedMeal,
  sending,
  onToggle,
  onSelectAll,
  onClear,
  onClose,
  onSend,
}: {
  rows: LowBalancePreviewRow[];
  selectedIds: string[];
  ignoredNoFixedMeal: number;
  sending: boolean;
  onToggle: (studentId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onClose: () => void;
  onSend: () => void;
}) {
  const selectableRows = rows.filter((row) => row.parent_count > 0 && row.reason === "dryRun 未發送");
  const skippedRows = rows.filter((row) => row.parent_count === 0 || row.reason !== "dryRun 未發送");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2.5rem] bg-white shadow-2xl">
        <div className="border-b border-slate-100 bg-slate-50 p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-red-500">Preview</p>
              <h3 className="mt-1 text-2xl font-black text-slate-950">固定訂餐低餘額通知預覽</h3>
              <p className="mt-2 text-sm font-bold text-slate-500">
                只列出固定訂餐且餘額低於 $200 的學生，可自行取消勾選。
              </p>
            </div>
            <button onClick={onClose} className="text-3xl font-bold text-slate-300 hover:text-slate-800">&times;</button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-red-50 p-4 text-red-700">
              <p className="text-xs font-black">可發送</p>
              <p className="mt-1 text-2xl font-black">{selectableRows.length}</p>
            </div>
            <div className="rounded-2xl bg-blue-50 p-4 text-blue-700">
              <p className="text-xs font-black">已勾選</p>
              <p className="mt-1 text-2xl font-black">{selectedIds.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-4 text-slate-600">
              <p className="text-xs font-black">未固定訂餐略過</p>
              <p className="mt-1 text-2xl font-black">{ignoredNoFixedMeal}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-wrap gap-2">
            <button onClick={onSelectAll} className="rounded-xl bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 hover:bg-blue-100">全選可發送</button>
            <button onClick={onClear} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-600 hover:bg-slate-200">全部取消</button>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 py-12 text-center text-sm font-bold text-slate-400">目前沒有符合條件的學生。</div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const selectable = row.parent_count > 0 && row.reason === "dryRun 未發送";
                const checked = selectedIds.includes(row.student_id);
                return (
                  <label key={row.student_id} className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${selectable ? "border-red-100 bg-red-50/50" : "border-slate-100 bg-slate-50 opacity-70"}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!selectable || sending}
                        onChange={() => onToggle(row.student_id)}
                        className="h-5 w-5"
                      />
                      <div>
                        <p className="font-black text-slate-900">{row.student_name}</p>
                        <p className="mt-1 text-sm font-bold text-slate-500">餘額 ${row.balance} · LINE 家長 {row.parent_count} 位</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${selectable ? "bg-white text-red-600" : "bg-slate-200 text-slate-500"}`}>
                      {selectable ? "可發送" : row.reason || "略過"}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {skippedRows.length > 0 && (
            <p className="mt-4 text-xs font-bold text-slate-400">
              有 {skippedRows.length} 位固定訂餐低餘額學生因未綁 LINE 或其他原因不會發送。
            </p>
          )}
        </div>

        <div className="flex gap-3 border-t border-slate-100 bg-slate-50 p-6">
          <button onClick={onClose} disabled={sending} className="flex-1 rounded-2xl bg-white py-4 font-black text-slate-500 transition hover:bg-slate-100 disabled:opacity-60">取消</button>
          <button onClick={onSend} disabled={sending || selectedIds.length === 0} className="flex-1 rounded-2xl bg-red-600 py-4 font-black text-white shadow-lg shadow-red-100 transition hover:bg-red-700 disabled:bg-slate-300 disabled:shadow-none">
            {sending ? "發送中..." : `發送勾選名單 (${selectedIds.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2️⃣ 子組件：新增 / 編輯表單 (狀態獨立，打字不卡頓)
// ==========================================
function StudentFormModal({ student, onClose, onRefresh, gradeOrder }: any) {
  const isEdit = !!student;
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ 
    name: "", grade: "小一", student_code: "", gender: "男", birthday: "", 
    student_phone: "", school: "", dietary_restrictions: "", meal_preference: "",
    enrollment_status: "active",
    attendance_schedule_mode: "all" as AttendanceScheduleMode,
    attendance_schedule_days: [] as number[],
    parent_relations: [{ relationship: "", parent_name: "", phone: "" }] as ParentFormRelation[],
  });

  useEffect(() => {
    if (isEdit && student) {
      setFormData({
        name: student.name, grade: student.grade || "無", student_code: student.student_code || "", gender: student.gender || "男",
        birthday: student.birthday || "", student_phone: student.student_phone || "", school: student.school_name || "",
        dietary_restrictions: student.dietary_restrictions || "", meal_preference: student.meal_preference || "",
        enrollment_status: student.enrollment_status || "active",
        attendance_schedule_mode: normalizeAttendanceScheduleMode(student.attendance_schedule_mode),
        attendance_schedule_days: normalizeAttendanceDays(student.attendance_schedule_days),
        parent_relations: (student.student_parent_relations || []).map((relation: any) => ({
          relation_id: relation.id,
          parent_id: relation.parents?.id || "",
          relationship: relation.relationship || "",
          parent_name: relation.parents?.name || "",
          phone: relation.parents?.phone || "",
        })),
      });
    }
  }, [student]);

  const upsertParentRelation = async (studentId: string) => {
    const cleanRelations = formData.parent_relations
      .map((relation) => ({
        ...relation,
        relationship: relation.relationship.trim(),
        parent_name: relation.parent_name?.trim() || "",
        phone: relation.phone.replace(/\D/g, "").slice(0, 10),
      }))
      .filter((relation) => relation.phone);

    await supabase.from("student_parent_relations").delete().eq("student_id", studentId);

    if (cleanRelations.length === 0) return;

    for (const relation of cleanRelations) {
      if (!/^09\d{8}$/.test(relation.phone)) {
        throw new Error(`家長手機格式不正確：${relation.phone}`);
      }
    }

    const finalRelations: { student_id: string; parent_id: string; relationship: string }[] = [];
    const usedParentIds = new Set<string>();

    for (const relation of cleanRelations) {
      let parentId = relation.parent_id || "";
      const parentPayload = {
        phone: relation.phone,
        name: relation.parent_name || relation.relationship || null,
      };

      if (parentId) {
        const { data: existingParent, error: findError } = await supabase
          .from("parents")
          .select("id")
          .eq("phone", relation.phone)
          .maybeSingle();
        if (findError) throw findError;

        if (existingParent?.id && existingParent.id !== parentId) {
          parentId = existingParent.id;
        } else {
          const { error: updateError } = await supabase
            .from("parents")
            .update(parentPayload)
            .eq("id", parentId);

          if (updateError) throw updateError;
        }
      } else {
        const { data: existingParent, error: findError } = await supabase
          .from("parents")
          .select("id")
          .eq("phone", relation.phone)
          .maybeSingle();
        if (findError) throw findError;

        if (existingParent?.id) {
          parentId = existingParent.id;
        } else {
          const { data: newParent, error: parentError } = await supabase
            .from("parents")
            .insert([parentPayload])
            .select("id")
            .single();

          if (parentError) throw parentError;
          parentId = newParent?.id || "";
        }
      }

      if (!parentId) throw new Error("無法建立家長資料");
      if (usedParentIds.has(parentId)) continue;
      usedParentIds.add(parentId);
      finalRelations.push({
        student_id: studentId,
        parent_id: parentId,
        relationship: relation.relationship || relation.parent_name || "家長",
      });
    }

    if (finalRelations.length === 0) return;

    const { error: relationError } = await supabase
      .from("student_parent_relations")
      .insert(finalRelations);

    if (relationError) throw relationError;
  };

  const handleSubmit = async () => {
    if (!formData.name) return alert("請填寫學生姓名");
    if (formData.attendance_schedule_mode !== "all" && formData.attendance_schedule_days.length === 0) {
      return alert("請至少選擇一個星期，或改用「依課程正常點名」。");
    }
    if (isSaving) return;

    const studentPayload = {
      name: formData.name.trim(),
      grade: formData.grade,
      student_code: formData.student_code.trim() || null,
      gender: formData.gender,
      birthday: formData.birthday || null,
      student_phone: formData.student_phone.trim() || null,
      school_name: formData.school.trim() || null,
      dietary_restrictions: formData.dietary_restrictions.trim() || null,
      meal_preference: formData.meal_preference.trim() || null,
      enrollment_status: formData.enrollment_status,
      attendance_schedule_mode: formData.attendance_schedule_mode,
      attendance_schedule_days: normalizeAttendanceDays(formData.attendance_schedule_days),
    };

    setIsSaving(true);

    try {
      if (isEdit) {
        // 更新邏輯
        const { error: studentError } = await supabase.from("students").update(studentPayload).eq("id", student.id);

        if (studentError) throw studentError;
        await upsertParentRelation(student.id);
        await logOperation({
          action: "student_update",
          targetType: "student",
          targetId: student.id,
          targetName: studentPayload.name,
          studentId: student.id,
          studentName: studentPayload.name,
          metadata: { grade: studentPayload.grade, enrollment_status: studentPayload.enrollment_status, dietary_restrictions: studentPayload.dietary_restrictions, meal_preference: studentPayload.meal_preference, attendance_schedule_mode: studentPayload.attendance_schedule_mode, attendance_schedule_days: studentPayload.attendance_schedule_days },
        });
      } else {
        // 新增邏輯
        const { data: newStudent, error: studentError } = await supabase.from("students").insert([{ 
          ...studentPayload,
          balance: 0 
        }]).select().single();

        if (studentError) throw studentError;
        if (!newStudent?.id) throw new Error("新增學生失敗");
        await upsertParentRelation(newStudent.id);
        await logOperation({
          action: "student_create",
          targetType: "student",
          targetId: newStudent.id,
          targetName: studentPayload.name,
          studentId: newStudent.id,
          studentName: studentPayload.name,
          metadata: { grade: studentPayload.grade, enrollment_status: studentPayload.enrollment_status, dietary_restrictions: studentPayload.dietary_restrictions, meal_preference: studentPayload.meal_preference, attendance_schedule_mode: studentPayload.attendance_schedule_mode, attendance_schedule_days: studentPayload.attendance_schedule_days },
        });
      }
      alert(isEdit ? "資料已更新" : "新增成功！");
      onRefresh();
      onClose();
    } catch (err: any) {
      const message = String(err?.message || "");
      if (message.includes("students_student_code_key")) {
        alert("儲存失敗：人員代碼已被其他學生使用，請更換代碼或留空。");
      } else if (message.includes("parents_phone_key")) {
        alert("儲存失敗：家長手機資料重複，請確認電話是否正確。");
      } else {
        alert("儲存失敗：" + (message || "請稍後再試"));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!isEdit || !student?.id || isSaving) return;
    const ok = window.confirm(`確定要刪除「${student.name}」嗎？\n\n如果學生已經有訂餐、扣款、點名或成績紀錄，資料庫可能會拒絕刪除。正式營運時通常建議改成「退班」來保留歷史資料。`);
    if (!ok) return;

    setIsSaving(true);
    try {
      const { error } = await supabase.from("students").delete().eq("id", student.id);
      if (error) throw error;

      await logOperation({
        action: "student_update",
        targetType: "student",
        targetId: student.id,
        targetName: student.name,
        studentId: student.id,
        studentName: student.name,
        metadata: { deleted: true },
      });

      alert("學生已刪除。");
      onRefresh();
      onClose();
    } catch (err: any) {
      alert("刪除失敗：" + (err?.message || "請稍後再試") + "\n\n若此學生已有歷史紀錄，請先改成「退班」保留資料。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-2xl font-black text-slate-900">{isEdit ? "編輯學生資料" : "建立新學籍"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 text-3xl transition">&times;</button>
        </div>
        <div className="p-8 space-y-6 bg-white max-h-[70vh] overflow-y-auto">
          {/* 這裡保留了你原本優美的 UI 設計，沒有做任何刪減 */}
          <h4 className="border-l-4 border-rose-500 pl-3 text-lg font-black text-rose-600">基本資料</h4>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2"><label className="text-xs font-black text-slate-400">學生姓名</label><input value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg" /></div>
            <div className="space-y-2"><label className="text-xs font-black text-slate-400">性別</label><select value={formData.gender} onChange={e=>setFormData({...formData, gender: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg"><option value="男">男</option><option value="女">女</option></select></div>
            <div className="space-y-2"><label className="text-xs font-black text-slate-400">年級</label><select value={formData.grade} onChange={e=>setFormData({...formData, grade: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg"><option value="無">無 / 未設定</option>{gradeOrder.map((g:string) => <option key={g} value={g}>{g}</option>)}</select></div>
            <div className="space-y-2"><label className="text-xs font-black text-slate-400">學籍狀態</label><select value={formData.enrollment_status} onChange={e=>setFormData({...formData, enrollment_status: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg"><option value="active">在班</option><option value="withdrawn">退班</option></select></div>
            <div className="space-y-2"><label className="text-xs font-black text-slate-400">人員代碼 (選填)</label><input value={formData.student_code} onChange={e=>setFormData({...formData, student_code: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-mono text-lg" placeholder="C560-S..." /></div>
          </div>
          <h4 className="border-l-4 border-blue-500 pl-3 pt-4 text-lg font-black text-blue-600">固定到班規則</h4>
          <div className="space-y-4 rounded-2xl bg-blue-50/60 p-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                ["all", "依課程正常點名", "每次排課都應到"],
                ["attend", "固定到班", "只有指定星期應到"],
                ["absent", "固定不到班", "指定星期不需點名"],
              ] as const).map(([value, label, note]) => {
                const active = formData.attendance_schedule_mode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFormData({ ...formData, attendance_schedule_mode: value })}
                    className={`min-h-[68px] rounded-xl border px-4 py-3 text-left transition ${active ? "border-blue-500 bg-blue-600 text-white shadow-sm" : "border-blue-100 bg-white text-slate-600 hover:border-blue-300"}`}
                  >
                    <span className="block text-sm font-black">{label}</span>
                    <span className={`mt-1 block text-xs font-bold ${active ? "text-blue-100" : "text-slate-400"}`}>{note}</span>
                  </button>
                );
              })}
            </div>
            {formData.attendance_schedule_mode !== "all" && (
              <div className="space-y-3">
                <p className="text-sm font-black text-slate-700">
                  {formData.attendance_schedule_mode === "attend" ? "選擇固定會到班的星期" : "選擇固定不到班的星期"}
                </p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {attendanceWeekdays.map((weekday) => {
                    const active = formData.attendance_schedule_days.includes(weekday.value);
                    return (
                      <button
                        key={weekday.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setFormData({
                          ...formData,
                          attendance_schedule_days: active
                            ? formData.attendance_schedule_days.filter((day) => day !== weekday.value)
                            : [...formData.attendance_schedule_days, weekday.value].sort((a, b) => a - b),
                        })}
                        className={`h-12 rounded-xl border text-sm font-black transition ${active ? "border-blue-500 bg-blue-600 text-white" : "border-blue-100 bg-white text-slate-500 hover:border-blue-300"}`}
                      >
                        {weekday.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs font-bold leading-5 text-slate-500">
                  {formData.attendance_schedule_mode === "attend"
                    ? "例如選週一、週三：其他星期即使課程有排課，也不會出現在待點名名單。"
                    : "例如選週一、週五：這兩天不會出現在待點名名單，其餘排課日照常顯示。"}
                </p>
              </div>
            )}
          </div>
          <h4 className="border-l-4 border-rose-500 pl-3 pt-4 text-lg font-black text-rose-600">詳細資訊</h4>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2"><label className="text-xs font-black text-slate-400">生日 (選填)</label><input type="date" value={formData.birthday} onChange={e=>setFormData({...formData, birthday: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg" /></div>
            <div className="space-y-2"><label className="text-xs font-black text-slate-400">就讀學校 (選填)</label><input value={formData.school} onChange={e=>setFormData({...formData, school: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg" /></div>
            <div className="space-y-2 col-span-2 md:col-span-1"><label className="text-xs font-black text-slate-400">學員行動電話</label><input value={formData.student_phone} onChange={e=>setFormData({...formData, student_phone: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg font-mono" placeholder="選填" /></div>
          </div>
          <h4 className="text-lg font-black text-emerald-600 border-l-4 border-emerald-500 pl-3 pt-4">餐點偏好</h4>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2"><label className="text-xs font-black text-slate-400">喜歡 / 偏好餐點 (選填)</label><input value={formData.meal_preference} onChange={e=>setFormData({...formData, meal_preference: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-emerald-500 rounded-xl p-4 outline-none font-bold text-lg" placeholder="例如：雞腿、咖哩、不辣" /></div>
            <div className="space-y-2"><label className="text-xs font-black text-slate-400">飲食禁忌 / 過敏 (選填)</label><input value={formData.dietary_restrictions} onChange={e=>setFormData({...formData, dietary_restrictions: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-xl p-4 outline-none font-bold text-lg" placeholder="例如：不吃牛、花生過敏" /></div>
          </div>
          <div className="flex items-center justify-between pt-4">
            <h4 className="text-lg font-black text-orange-500 border-l-4 border-orange-500 pl-3">家長聯絡人</h4>
            <button
              type="button"
              onClick={() => setFormData({
                ...formData,
                parent_relations: [...formData.parent_relations, { relationship: "", parent_name: "", phone: "" }],
              })}
              className="rounded-xl bg-orange-50 px-4 py-2 text-sm font-black text-orange-600 transition hover:bg-orange-100"
            >
              + 新增聯絡人
            </button>
          </div>
          <div className="space-y-3">
            {formData.parent_relations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center text-sm font-bold text-slate-400">
                尚未設定家長聯絡人，可按右上角新增。
              </div>
            ) : formData.parent_relations.map((relation, index) => (
              <div key={relation.relation_id || relation.parent_id || index} className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-black text-orange-600">聯絡人 {index + 1}</p>
                  <button
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      parent_relations: formData.parent_relations.filter((_, itemIndex) => itemIndex !== index),
                    })}
                    className="rounded-xl bg-white px-3 py-1.5 text-xs font-black text-red-500 transition hover:bg-red-50"
                  >
                    移除
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400">稱呼</label>
                    <input
                      value={relation.relationship}
                      onChange={(event) => {
                        const next = [...formData.parent_relations];
                        next[index] = { ...next[index], relationship: event.target.value };
                        setFormData({ ...formData, parent_relations: next });
                      }}
                      className="w-full bg-white border-2 border-transparent focus:border-orange-400 rounded-xl p-4 outline-none font-bold text-lg"
                      placeholder="爸爸、媽媽、阿嬤"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400">姓名</label>
                    <input
                      value={relation.parent_name || ""}
                      onChange={(event) => {
                        const next = [...formData.parent_relations];
                        next[index] = { ...next[index], parent_name: event.target.value };
                        setFormData({ ...formData, parent_relations: next });
                      }}
                      className="w-full bg-white border-2 border-transparent focus:border-orange-400 rounded-xl p-4 outline-none font-bold text-lg"
                      placeholder="選填"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400">手機</label>
                    <input
                      value={relation.phone}
                      onChange={(event) => {
                        const next = [...formData.parent_relations];
                        next[index] = { ...next[index], phone: event.target.value.replace(/\D/g, "").slice(0, 10) };
                        setFormData({ ...formData, parent_relations: next });
                      }}
                      className="w-full bg-white border-2 border-transparent focus:border-orange-400 rounded-xl p-4 outline-none font-bold text-lg font-mono"
                      placeholder="09..."
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-8 border-t border-slate-100 flex flex-col gap-3 bg-slate-50 md:flex-row">
          {isEdit && (
            <button onClick={handleDeleteStudent} disabled={isSaving} className="rounded-2xl border border-red-100 bg-white px-5 py-4 font-black text-red-500 transition hover:bg-red-50 disabled:text-slate-300">
              刪除學生
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-4 bg-white border border-slate-200 rounded-2xl font-black text-slate-500 hover:bg-slate-100 transition">取消</button>
          <button onClick={handleSubmit} disabled={isSaving} className="flex-1 rounded-2xl bg-rose-500 py-4 font-black text-white shadow-xl shadow-rose-100 transition hover:bg-rose-600 disabled:bg-slate-300 disabled:shadow-none">{isSaving ? "處理中..." : isEdit ? "儲存修改" : "確認建立"}</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 3️⃣ 子組件：查帳明細 (分頁邏輯獨立)
// ==========================================
function TransactionLogsModal({ student, onClose }: any) {
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState({ month: "this_year", type: "all", page: 0 });
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 15;

  useEffect(() => { fetchLogs(true); }, [filter.month, filter.type]);

  const fetchLogs = async (isNew = true) => {
    let query = supabase.from("transactions").select("*", { count: "exact" }).eq("student_id", student.id);
    const now = new Date();
    if (filter.month === "this") query = query.gte("created_at", new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
    else if (filter.month === "last") query = query.gte("created_at", new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()).lte("created_at", new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString());
    else if (filter.month === "this_year") query = query.gte("created_at", new Date(now.getFullYear(), 0, 1).toISOString());
    
    const from = isNew ? 0 : (filter.page + 1) * PAGE_SIZE;
    const { data, count } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
    
    if (data) {
      setLogs(isNew ? data : [...logs, ...data]);
      if (!isNew) setFilter(p => ({ ...p, page: p.page + 1 }));
      setHasMore((isNew ? data.length : logs.length + data.length) < (count || 0));
    }
  };

  const groupLogsByMonth = (data: any[]) => {
    const groups: any = {};
    data.forEach(log => {
      const m = new Date(log.created_at).toLocaleDateString("zh-TW", { year: 'numeric', month: 'long' });
      if (!groups[m]) groups[m] = [];
      groups[m].push(log);
    });
    return groups;
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[3rem] p-10 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h3 className="text-3xl font-black text-slate-900">{student.name} - 存摺紀錄</h3>
            <p className="text-sm font-bold text-slate-400 mt-2">目前餘額：<span className="text-blue-600 font-black text-lg">${student.balance}</span></p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-700 text-4xl transition">&times;</button>
        </div>
        <div className="flex gap-2 mb-8 bg-slate-50 p-2 rounded-2xl border border-slate-100 overflow-x-auto">
          {[["this_year", "今年"], ["this", "本月"], ["last", "上月"], ["all", "全部"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(p => ({ ...p, month: v, page: 0 }))} className={`flex-1 min-w-[80px] py-2 rounded-xl text-xs font-black transition-all ${filter.month === v ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-400 hover:bg-slate-100"}`}>{l}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto pr-4 space-y-8 scrollbar-thin scrollbar-thumb-slate-200">
          {Object.entries(groupLogsByMonth(logs)).map(([month, items]: any) => (
            <div key={month} className="space-y-4">
              <div className="sticky top-0 bg-white/95 py-2 z-10 backdrop-blur-sm"><span className="bg-slate-100 text-slate-600 px-4 py-1.5 rounded-lg text-xs font-black tracking-widest">{month}</span></div>
              {items.map((log: any) => (
                <div key={log.id} className="flex justify-between items-center group bg-white hover:bg-slate-50 p-3 rounded-2xl transition border border-transparent hover:border-slate-100">
                  <div className="flex gap-4 items-center">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-inner ${log.amount > 0 ? "bg-green-100 text-green-600" : "bg-red-50 text-red-500"}`}>{log.type === 'topup' ? '儲' : log.type === 'order' ? '餐' : log.type === 'refund' ? '退' : '調'}</div>
                    <div><p className="font-black text-slate-700">{log.description}</p><p className="text-[10px] text-slate-400 font-bold mt-1">{new Date(log.created_at).toLocaleString()}</p></div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-black ${log.amount > 0 ? "text-green-600" : "text-red-500"}`}>{log.amount > 0 ? `+${log.amount}` : log.amount}</p>
                    <p className="text-[10px] text-slate-300 font-black mt-1 font-mono">餘額: ${log.balance_after}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {hasMore && <button onClick={() => fetchLogs(false)} className="w-full py-6 text-sm font-black text-blue-500 bg-blue-50/50 hover:bg-blue-50 rounded-3xl transition">查看更早之前的紀錄 ▼</button>}
          {logs.length === 0 && <div className="text-center py-20 text-slate-300 font-bold italic">目前無符合條件的紀錄</div>}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4️⃣ 子組件：手動調帳 (修復丟失原因的 Bug)
// ==========================================
function AdjustBalanceModal({ student, onClose, onRefresh }: any) {
  const [adjustData, setAdjustData] = useState({ amount: "", reason: "" });

  const handleManualAdjust = async () => {
    if (!adjustData.amount || !adjustData.reason) return alert("請填寫完整金額與原因");
    const amount = parseInt(adjustData.amount);
    if (isNaN(amount)) return alert("請輸入正確的數字");
    try {
      const { data, error } = await supabase.rpc("adjust_student_balance_atomic", {
        p_student_id: student.id,
        p_amount: amount,
        p_type: "adjustment",
        p_description: adjustData.reason,
      });
      if (error) {
        if (error.message.includes("adjust_student_balance_atomic")) {
          throw new Error("請先到 Supabase 執行 database/accounting_atomic.sql");
        }
        throw error;
      }

      const result = (data || {}) as { balance_before?: number; balance_after?: number };
      const balanceBefore = Number(result.balance_before ?? student.balance ?? 0);
      const balanceAfter = Number(result.balance_after ?? balanceBefore + amount);

      await logOperation({
        action: "student_adjust_balance",
        targetType: "student",
        targetId: student.id,
        targetName: student.name,
        studentId: student.id,
        studentName: student.name,
        metadata: {
          amount,
          reason: adjustData.reason,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
        },
      });

      alert("調帳成功！");
      onRefresh();
      onClose();
    } catch (err: any) { alert("調帳失敗：" + err.message); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[3.5rem] p-10 w-full max-w-md shadow-2xl">
        <h3 className="text-3xl font-black text-slate-900 mb-2">手動調帳修正</h3>
        <p className="text-sm text-slate-400 font-bold mb-10">針對學生：{student.name}</p>
        <div className="space-y-6">
          <div className="space-y-2"><label className="text-xs font-black text-blue-600 ml-1">調整金額 (+代表加錢, -代表扣款)</label><input type="number" value={adjustData.amount} onChange={(e) => setAdjustData(p => ({ ...p, amount: e.target.value }))} placeholder="例如: -80 或 500" className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-blue-500 font-black text-xl" /></div>
          <div className="space-y-2"><label className="text-xs font-black text-blue-600 ml-1">調整原因 (將顯示於明細中)</label><input type="text" value={adjustData.reason} onChange={(e) => setAdjustData(p => ({ ...p, reason: e.target.value }))} placeholder="例如: 系統錯誤退款" className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" /></div>
          <div className="flex gap-4 pt-6">
            <button onClick={onClose} className="flex-1 py-5 bg-slate-100 hover:bg-slate-200 rounded-2xl font-black text-slate-500 transition">取消</button>
            <button onClick={handleManualAdjust} className="flex-1 rounded-2xl bg-rose-500 py-5 font-black text-white shadow-xl shadow-rose-100 transition hover:bg-rose-600">確認執行</button>
          </div>
        </div>
      </div>
    </div>
  );
}
