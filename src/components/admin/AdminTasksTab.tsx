"use client";

import { useEffect, useMemo, useState } from "react";
import { getToday } from "@/lib/date";
import { logOperation } from "@/lib/operationLog";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  grade: string;
  enrollment_status?: string;
};

type AdminTask = {
  id: string;
  task_date: string;
  task_time: string;
  task_type: string;
  title: string;
  note: string | null;
  student_id: string | null;
  student_name: string | null;
  grade: string | null;
  status: "pending" | "done" | "cancelled";
  completed_at: string | null;
  created_at: string;
};

const taskTypes = [
  { value: "early_leave", label: "提早離開", tone: "bg-orange-50 text-orange-700 border-orange-100" },
  { value: "pickup", label: "接送提醒", tone: "bg-blue-50 text-blue-700 border-blue-100" },
  { value: "call_parent", label: "聯絡家長", tone: "bg-purple-50 text-purple-700 border-purple-100" },
  { value: "payment", label: "收費提醒", tone: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  { value: "other", label: "其他事項", tone: "bg-slate-50 text-slate-700 border-slate-200" },
];

const emptyForm = {
  task_date: getToday(),
  task_time: "15:00",
  task_type: "early_leave",
  student_id: "",
  student_name: "",
  title: "",
  note: "",
};

const formatTime = (time: string) => time.slice(0, 5);

const typeInfo = (value: string) => taskTypes.find((type) => type.value === value) || taskTypes[taskTypes.length - 1];

export default function AdminTasksTab() {
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudents();
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [selectedDate]);

  const fetchStudents = async () => {
    const { data } = await supabase
      .from("students")
      .select("id, name, grade, enrollment_status")
      .order("grade");
    setStudents(((data || []) as Student[]).filter((student) => (student.enrollment_status || "active") === "active"));
  };

  const fetchTasks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_tasks")
      .select("*")
      .eq("task_date", selectedDate)
      .order("status", { ascending: false })
      .order("task_time", { ascending: true });

    if (error) {
      console.warn("行政待辦讀取失敗:", error.message);
      setTasks([]);
    } else {
      setTasks((data || []) as AdminTask[]);
    }
    setLoading(false);
  };

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      return a.task_time.localeCompare(b.task_time);
    }),
    [tasks]
  );

  const studentLabel = (student: Student) => `${student.grade || "未分級"} · ${student.name}`;
  const selectedStudent = students.find((student) =>
    student.id === formData.student_id || studentLabel(student) === formData.student_name.trim() || student.name === formData.student_name.trim()
  );
  const selectedTaskType = typeInfo(formData.task_type);
  const needsCustomTitle = formData.task_type === "other";

  const handleSubmit = async () => {
    if (!formData.task_date || !formData.task_time) return alert("請設定日期與時間。");
    if (needsCustomTitle && !formData.title.trim()) return alert("請輸入待辦事項。");
    if (saving) return;

    setSaving(true);
    try {
      const taskTitle = needsCustomTitle ? formData.title.trim() : selectedTaskType.label;
      const payload = {
        task_date: formData.task_date,
        task_time: formData.task_time,
        task_type: formData.task_type,
        title: taskTitle,
        note: formData.note.trim() || null,
        student_id: selectedStudent?.id || null,
        student_name: selectedStudent?.name || formData.student_name.trim() || null,
        grade: selectedStudent?.grade || null,
        status: "pending",
      };

      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("admin_tasks")
        .insert([{ ...payload, created_by: userData?.user?.id || null }])
        .select("id")
        .single();

      if (error) throw error;

      await logOperation({
        action: "admin_task_create",
        targetType: "admin_task",
        targetId: data?.id,
        targetName: payload.title,
        studentId: payload.student_id || undefined,
        studentName: payload.student_name || undefined,
        metadata: payload,
      });

      setFormData({ ...emptyForm, task_date: selectedDate });
      await fetchTasks();
    } catch (err: any) {
      alert("新增待辦失敗：" + (err?.message || "請稍後再試"));
    } finally {
      setSaving(false);
    }
  };

  const markDone = async (task: AdminTask) => {
    const { error } = await supabase
      .from("admin_tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", task.id);

    if (error) return alert("完成待辦失敗：" + error.message);

    await logOperation({
      action: "admin_task_complete",
      targetType: "admin_task",
      targetId: task.id,
      targetName: task.title,
      studentId: task.student_id || undefined,
      studentName: task.student_name || undefined,
    });
    fetchTasks();
  };

  const deleteTask = async (task: AdminTask) => {
    if (!confirm(`確定刪除「${task.title}」？`)) return;
    const { error } = await supabase.from("admin_tasks").delete().eq("id", task.id);
    if (error) return alert("刪除待辦失敗：" + error.message);

    await logOperation({
      action: "admin_task_delete",
      targetType: "admin_task",
      targetId: task.id,
      targetName: task.title,
      studentId: task.student_id || undefined,
      studentName: task.student_name || undefined,
    });
    fetchTasks();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <p className="text-xs font-black uppercase tracking-widest text-blue-500">Front Desk</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">新增行政待辦</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">設定時間後，今日總覽會依時間排序。</p>
        </div>

        <div className="space-y-4 p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">日期</span>
              <input type="date" value={formData.task_date} onChange={(e) => setFormData({ ...formData, task_date: e.target.value })} className="app-input px-4 py-3 font-black" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">時間</span>
              <input type="time" value={formData.task_time} onChange={(e) => setFormData({ ...formData, task_time: e.target.value })} className="app-input px-4 py-3 font-black" />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-400">事項類型</span>
            <select value={formData.task_type} onChange={(e) => setFormData({ ...formData, task_type: e.target.value })} className="app-input px-4 py-3 font-black">
              {taskTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-400">學生</span>
            <input
              list="admin-task-students"
              value={formData.student_name}
              onChange={(e) => {
                const value = e.target.value;
                const match = students.find((student) => studentLabel(student) === value || student.name === value);
                setFormData({ ...formData, student_name: value, student_id: match?.id || "" });
              }}
              className="app-input px-4 py-3 font-black"
              placeholder="直接輸入學生姓名（選填）"
            />
            <datalist id="admin-task-students">
              {students.map((student) => (
                <option key={student.id} value={studentLabel(student)} />
              ))}
            </datalist>
          </label>

          {needsCustomTitle && (
            <label className="block space-y-2">
              <span className="text-xs font-black text-slate-400">待辦事項（必填）</span>
              <input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="app-input px-4 py-3 font-black" placeholder="例如：提醒帶講義、補繳資料" />
            </label>
          )}

          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-400">備註</span>
            <textarea value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} className="app-input min-h-24 px-4 py-3 font-bold" placeholder="例如：媽媽 14:50 會到櫃台接" />
          </label>

          <button onClick={handleSubmit} disabled={saving} className="w-full rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:bg-slate-300">
            {saving ? "新增中..." : "加入待辦"}
          </button>
        </div>
      </section>

      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-amber-500">Timeline</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">待辦時間軸</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">未完成事項會排在前面，並依時間由早到晚排序。</p>
            </div>
            <input type="date" value={selectedDate} onChange={(e) => {
              setSelectedDate(e.target.value);
              setFormData((prev) => ({ ...prev, task_date: e.target.value }));
            }} className="app-input px-4 py-3 font-black sm:w-48" />
          </div>
        </div>

        <div className="space-y-3 p-6">
          {loading ? (
            <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center text-sm font-bold text-slate-400">待辦讀取中...</div>
          ) : sortedTasks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center text-sm font-bold text-slate-400">這天還沒有待辦事項。</div>
          ) : (
            sortedTasks.map((task) => {
              const info = typeInfo(task.task_type);
              return (
                <div key={task.id} className={`rounded-3xl border p-4 transition ${task.status === "done" ? "border-slate-100 bg-slate-50 opacity-70" : "border-slate-200 bg-white shadow-sm"}`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex gap-4">
                      <button
                        onClick={() => task.status !== "done" && markDone(task)}
                        disabled={task.status === "done"}
                        className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-black transition ${
                          task.status === "done"
                            ? "border-green-500 bg-green-500 text-white"
                            : "border-slate-300 bg-white text-transparent hover:border-green-500 hover:bg-green-50"
                        }`}
                        title={task.status === "done" ? "已完成" : "標記完成"}
                      >
                        ✓
                      </button>
                      <div className="min-w-16 text-center">
                        <p className="text-2xl font-black text-slate-950">{formatTime(task.task_time)}</p>
                        <p className="mt-1 text-[11px] font-black text-slate-400">{task.status === "done" ? "已完成" : "待處理"}</p>
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${info.tone}`}>{info.label}</span>
                          {task.student_name && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">{task.grade || "未分級"} · {task.student_name}</span>}
                        </div>
                        <p className={`mt-2 text-lg font-black ${task.status === "done" ? "text-slate-400 line-through" : "text-slate-950"}`}>{task.title}</p>
                        {task.note && <p className="mt-1 text-sm font-bold text-slate-500">{task.note}</p>}
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => deleteTask(task)} className="rounded-xl bg-red-50 px-4 py-2 text-xs font-black text-red-600 transition hover:bg-red-600 hover:text-white">
                        刪除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
