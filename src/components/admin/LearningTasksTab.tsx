"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, ArrowLeft, ArrowRight, Check, Copy, Pencil, Plus, RotateCcw, Save, Search, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import {
  learningGrades, learningKinds, learningSubjects, learningKindLabel, matchesLearningTask, shiftLearningDate, taskProgress,
  type LearningEntry, type LearningStudent, type LearningTask,
} from "@/lib/learningTasks";

const field = "min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100";
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40";
const errorText = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "連線失敗，請稍後再試。";
type View = "day" | "pending" | "history";
type Editor = { id: string; version: number; date: string; subject: string; kind: string; scope: string; note: string; studentIds: string[]; retained: LearningEntry[] };
const editorFor = (date: string, task?: LearningTask, copy = false): Editor => ({
  id: task && !copy ? task.id : crypto.randomUUID(), version: task && !copy ? task.version : 0,
  date: task && !copy ? task.task_date : date, subject: task?.subject || "國語", kind: task?.task_kind || "paper",
  scope: task?.scope || "", note: task?.note || "",
  studentIds: task?.learning_task_students.filter((entry) => entry.active && entry.student_id).map((entry) => entry.student_id!) || [],
  retained: task?.learning_task_students.filter((entry) => entry.active) || [],
});

function TaskEditor({ initial, students, onClose, onSaved }: { initial: Editor; students: LearningStudent[]; onClose: () => void; onSaved: (date: string, id: string) => void }) {
  const [form, setForm] = useState(initial);
  const [grade, setGrade] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const allStudents = [...students];
  for (const entry of initial.retained) {
    if (entry.student_id && !allStudents.some((student) => student.id === entry.student_id)) {
      allStudents.push({ id: entry.student_id, name: entry.student_name, grade: entry.grade, enrollment_status: "inactive" });
    }
  }
  const visible = allStudents.filter((student) => (!grade || student.grade === grade) && `${student.name} ${student.grade}`.includes(search.trim()));
  const selected = new Set(form.studentIds);
  const patch = (values: Partial<Editor>) => setForm((current) => ({ ...current, ...values }));
  const close = () => { if (!saving) { if (dirty) setDiscard(true); else onClose(); } };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    if (!form.subject.trim() || !form.scope.trim() || !form.date) { setError("請填寫日期、科目與範圍。"); return; }
    if (!form.studentIds.length && !initial.retained.some((entry) => !entry.student_id)) { setError("請至少選擇一位學生。"); return; }
    submitting.current = true; setSaving(true); setError("");
    try {
      const { error: failure } = await supabase.rpc("save_learning_task", {
        p_id: form.id, p_expected_version: form.version, p_date: form.date, p_subject: form.subject.trim(),
        p_kind: form.kind, p_scope: form.scope.trim(), p_note: form.note.trim(), p_student_ids: [...new Set(form.studentIds)],
      });
      if (failure) throw failure;
      onSaved(form.date, form.id);
    } catch (cause) { setError(errorText(cause)); }
    finally { submitting.current = false; setSaving(false); }
  };
  return <dialog ref={dialog} aria-labelledby="learning-editor-title" onCancel={(event) => { event.preventDefault(); close(); }} className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-3xl overflow-y-auto rounded-lg bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-950/40">
    <form onSubmit={submit}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4"><h2 id="learning-editor-title" className="text-lg font-black">{initial.version ? "編輯學習任務" : "新增學習任務"}</h2><button type="button" onClick={close} disabled={saving} aria-label="關閉任務編輯" title="關閉" className={button}><X size={18} /></button></header>
      <fieldset disabled={saving} className="space-y-4 px-5 py-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5 text-sm font-bold">日期<input required type="date" value={form.date} onChange={(event) => patch({ date: event.target.value })} className={field} /></label>
          <label className="grid gap-1.5 text-sm font-bold">科目<input required list="learning-subjects" maxLength={40} value={form.subject} onChange={(event) => patch({ subject: event.target.value })} className={field} /><datalist id="learning-subjects">{learningSubjects.map((subject) => <option key={subject} value={subject} />)}</datalist></label>
          <label className="grid gap-1.5 text-sm font-bold">任務類型<select value={form.kind} onChange={(event) => patch({ kind: event.target.value })} className={field}>{learningKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label>
        </div>
        <label className="grid gap-1.5 text-sm font-bold">範圍／內容<textarea required maxLength={1000} rows={2} placeholder="例如：社會第 3 課填空、英文 Unit 2 單字 1–20" value={form.scope} onChange={(event) => patch({ scope: event.target.value })} className={field} /></label>
        <label className="grid gap-1.5 text-sm font-bold">任務備註（選填）<textarea maxLength={2000} rows={2} value={form.note} onChange={(event) => patch({ note: event.target.value })} className={field} /></label>
        <section className="border-t border-slate-200 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">指定學生</h3><span className="text-sm font-bold text-blue-700">已選 {selected.size} 人</span></div>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"><select aria-label="選取學生年級" value={grade} onChange={(event) => setGrade(event.target.value)} className={field}><option value="">全部年級</option>{learningGrades.map((value) => <option key={value}>{value}</option>)}</select><input aria-label="搜尋指定學生" placeholder="學生姓名" value={search} onChange={(event) => setSearch(event.target.value)} className={`${field} w-full`} /><button type="button" className={button} onClick={() => patch({ studentIds: [...new Set([...form.studentIds, ...visible.map((student) => student.id)])] })}>全選篩選名單</button><button type="button" className={button} onClick={() => patch({ studentIds: form.studentIds.filter((id) => !visible.some((student) => student.id === id)) })}>清除篩選名單</button></div>
          <div className="grid max-h-64 grid-cols-1 gap-x-4 overflow-y-auto border-y border-slate-200 sm:grid-cols-2">{visible.map((student) => <label key={student.id} className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-slate-100 px-2 py-2 text-sm hover:bg-blue-50"><input type="checkbox" className="h-5 w-5 shrink-0 accent-blue-600" checked={selected.has(student.id)} onChange={(event) => patch({ studentIds: event.target.checked ? [...form.studentIds, student.id] : form.studentIds.filter((id) => id !== student.id) })} /><span className="min-w-0 break-words font-bold">{student.name}<span className="ml-2 text-xs font-normal text-slate-500">{student.grade}{student.enrollment_status === "inactive" ? " · 原任務學生" : ""}</span></span></label>)}{!visible.length && <p className="py-6 text-sm text-slate-500">沒有符合的學生</p>}</div>
          {!!selected.size && <p className="mt-2 text-xs leading-6 text-slate-500">{allStudents.filter((student) => selected.has(student.id)).slice(0, 12).map((student) => student.name).join("、")}{selected.size > 12 ? ` 等 ${selected.size} 人` : ""}</p>}
        </section>
      </fieldset>
      <footer className="sticky bottom-0 space-y-3 border-t bg-white px-5 py-4">
        {error && <p role="alert" className="text-sm font-bold text-red-600">{error}</p>}
        {discard ? <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-amber-800">要放棄尚未儲存的內容嗎？</span><div className="flex gap-2"><button type="button" className={button} onClick={() => setDiscard(false)}>繼續編輯</button><button type="button" className={button} onClick={onClose}>放棄變更</button></div></div>
          : <div className="flex justify-end gap-2"><button type="button" className={button} disabled={saving} onClick={close}>取消</button><button type="submit" className={primary} disabled={saving}><Save size={16} />{saving ? "儲存中..." : "儲存任務"}</button></div>}
      </footer>
    </form>
  </dialog>;
}

export default function LearningTasksTab() {
  const [view, setView] = useState<View>("day");
  const [date, setDate] = useState(getToday());
  const [from, setFrom] = useState(() => `${getToday().slice(0, 7)}-01`);
  const [to, setTo] = useState(getToday());
  const [showArchived, setShowArchived] = useState(false);
  const [grade, setGrade] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState({ key: "", tasks: [] as LearningTask[], error: "" });
  const [students, setStudents] = useState<LearningStudent[]>([]);
  const [studentsError, setStudentsError] = useState("");
  const [studentsReady, setStudentsReady] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const locks = useRef(new Set<string>());
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [studentFilter, setStudentFilter] = useState("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const key = `${view}/${date}/${from}/${to}/${showArchived}/${reload}`;
  const loading = data.key !== key;
  const dirtyNotes = Object.keys(draftNotes).length > 0;
  const locked = dirtyNotes || busyIds.length > 0;
  const tasks = loading ? [] : data.tasks.slice(0, 200).filter((task) => matchesLearningTask(task, search, grade));
  const selected = tasks.find((task) => task.id === selectedId) || tasks[0];
  const entries = selected?.learning_task_students.filter((entry) => entry.active) || [];
  const progress = selected ? taskProgress(selected) : { completed: 0, total: 0, pending: 0 };
  const shownEntries = entries.filter((entry) => (studentFilter === "all" || entry.completed === (studentFilter === "done")) && `${entry.student_name} ${entry.grade}`.includes(studentSearch.trim()));
  const copyTask = () => {
    if (!selected) return;
    const copy = editorFor(getToday(), selected, true);
    copy.studentIds = copy.studentIds.filter((id) => students.some((student) => student.id === id));
    copy.retained = [];
    setEditor(copy);
  };
  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        // Page through the roster rather than silently truncating at Supabase's row cap.
        const rows: LearningStudent[] = [];
        for (let offset = 0; ; offset += 500) {
          const { data: result, error } = await supabase.from("students").select("id,name,grade,enrollment_status").or("enrollment_status.eq.active,enrollment_status.is.null").order("id").range(offset, offset + 499);
          if (error) throw error;
          rows.push(...(result || []));
          if ((result || []).length < 500) break;
        }
        if (!ignore) { setStudents(rows.sort((a, b) => (learningGrades.indexOf(a.grade) - learningGrades.indexOf(b.grade)) || a.name.localeCompare(b.name, "zh-Hant"))); setStudentsReady(true); setStudentsError(""); }
      } catch (cause) { if (!ignore) setStudentsError(errorText(cause)); }
    };
    void load(); return () => { ignore = true; };
  }, [reload]);
  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        if (view === "history" && (!from || !to || from > to)) throw new Error("請確認歷史查詢的起訖日期。");
        const { data: result, error } = await supabase.rpc("list_learning_tasks", {
          p_view: view, p_from: view === "history" ? from : view === "pending" ? "2000-01-01" : date,
          p_to: view === "history" ? to : view === "pending" ? getToday() : date, p_archived: showArchived,
        });
        if (error) throw error;
        if (!ignore) setData({ key, tasks: (result || []) as LearningTask[], error: "" });
      } catch (cause) { if (!ignore) setData({ key, tasks: [], error: errorText(cause) }); }
    };
    void load(); return () => { ignore = true; };
  }, [key, view, date, from, to, showArchived]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirtyNotes) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [dirtyNotes]);
  const updateEntry = async (entry: LearningEntry, completed: boolean) => {
    if (locks.current.has(entry.id)) return;
    locks.current.add(entry.id); setBusyIds((ids) => [...ids, entry.id]); setActionError("");
    try {
      const { data: saved, error } = await supabase.rpc("update_learning_task_student", {
        p_id: entry.id, p_expected_version: entry.version, p_completed: completed, p_note: draftNotes[entry.id] ?? entry.note,
      });
      if (error) throw error;
      setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === entry.task_id ? { ...task, learning_task_students: task.learning_task_students.map((row) => row.id === entry.id ? saved as LearningEntry : row) } : task) }));
      setDraftNotes((current) => { const next = { ...current }; delete next[entry.id]; return next; });
      setNotice(`${entry.student_name}：${completed ? "已完成" : "未完成"}，已儲存`);
    } catch (cause) { setActionError(errorText(cause)); }
    finally { locks.current.delete(entry.id); setBusyIds((ids) => ids.filter((id) => id !== entry.id)); }
  };
  const archive = async () => {
    if (!selected || locks.current.has(selected.id)) return;
    locks.current.add(selected.id); setBusyIds((ids) => [...ids, selected.id]); setActionError("");
    try {
      const { error } = await supabase.rpc("archive_learning_task", { p_id: selected.id, p_expected_version: selected.version, p_archived: !selected.archived });
      if (error) throw error;
      setNotice(selected.archived ? "任務已還原" : "任務已封存，可從歷史紀錄還原"); setArchiveConfirm(false); setReload((value) => value + 1);
    } catch (cause) { setActionError(errorText(cause)); }
    finally { locks.current.delete(selected.id); setBusyIds((ids) => ids.filter((id) => id !== selected.id)); }
  };
  return <section className="min-w-0 bg-white text-slate-800">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-5 sm:px-6"><div><div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-500"><ShieldCheck size={14} />管理員專用</div><h2 className="text-2xl font-black">學習任務</h2></div><button className={primary} disabled={!studentsReady || locked || loading || !!data.error} onClick={() => setEditor(editorFor(view === "day" ? date : getToday()))}><Plus size={18} />新增任務</button></header>
    <div className="space-y-3 border-b border-slate-200 px-5 py-4 sm:px-6">
      <div role="tablist" aria-label="任務查詢" className="flex border-b border-slate-200">{([{ value: "day", label: "當日任務" }, { value: "pending", label: "待完成" }, { value: "history", label: "歷史紀錄" }] as const).map((item) => <button key={item.value} role="tab" aria-selected={view === item.value} disabled={locked} onClick={() => { setView(item.value); setArchiveConfirm(false); }} className={`min-h-11 flex-1 border-b-2 px-2 text-sm font-bold sm:flex-none sm:px-5 ${view === item.value ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}>{item.label}</button>)}</div>
      <div className="flex flex-wrap items-center gap-2">
        {view === "day" && <><button className={button} title="前一天" aria-label="前一天" disabled={locked} onClick={() => setDate(shiftLearningDate(date, -1))}><ArrowLeft size={17} /></button><input aria-label="任務日期" type="date" className={`${field} w-40`} disabled={locked} value={date} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /><button className={button} title="後一天" aria-label="後一天" disabled={locked} onClick={() => setDate(shiftLearningDate(date, 1))}><ArrowRight size={17} /></button><button className={button} disabled={locked} onClick={() => setDate(getToday())}>今天</button></>}
        {view === "pending" && <span className="text-sm font-bold text-amber-700">截至 {getToday()} 尚未完成</span>}
        {view === "history" && <><input aria-label="開始日期" type="date" className={`${field} w-40`} disabled={locked} value={from} onChange={(event) => setFrom(event.target.value)} /><span>至</span><input aria-label="結束日期" type="date" className={`${field} w-40`} disabled={locked} value={to} onChange={(event) => setTo(event.target.value)} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={locked} checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />包含已封存</label></>}
        <button className={`${button} ml-auto`} title="重新整理" aria-label="重新整理學習任務" disabled={locked} onClick={() => { setNotice(""); setActionError(""); setReload((value) => value + 1); }}><RotateCcw size={17} /></button>
      </div>
      <div className="flex gap-2"><select aria-label="篩選任務年級" value={grade} disabled={locked} onChange={(event) => setGrade(event.target.value)} className={field}><option value="">全部年級</option>{learningGrades.map((value) => <option key={value}>{value}</option>)}</select><label className="flex min-w-0 flex-1 items-center gap-2"><Search size={17} className="shrink-0 text-slate-400" /><input aria-label="搜尋任務" placeholder="科目、範圍或學生姓名" value={search} disabled={locked} onChange={(event) => setSearch(event.target.value)} className={`${field} w-full`} /></label></div>
      {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
      {(actionError || studentsError) && <p role="alert" className="text-sm text-red-700">{actionError || `學生名單讀取失敗：${studentsError}`}</p>}
      {dirtyNotes && <p className="text-sm text-amber-800">學生備註尚未儲存，請先儲存或取消備註再切換任務。</p>}
    </div>
    {loading ? <p role="status" className="p-12 text-center text-slate-500">讀取任務中...</p> : data.error ? <p role="alert" className="p-6 text-red-700">讀取失敗：{data.error}</p> : <>
      {data.tasks.length > 200 && <p className="px-5 py-3 text-sm text-amber-800">目前顯示 200 項任務，請縮小歷史日期範圍以查詢其他紀錄。</p>}
      {!tasks.length ? <div className="py-16 text-center"><p className="font-bold text-slate-500">{view === "pending" ? "沒有待完成的任務" : "沒有符合的任務"}</p>{view === "day" && !search && !grade && <button className={`${primary} mt-4`} disabled={!studentsReady} onClick={() => setEditor(editorFor(date))}><Plus size={17} />新增當日任務</button>}</div>
        : <div className="grid min-w-0 lg:grid-cols-[260px_minmax(0,1fr)]">
          <label className="grid gap-2 border-b border-slate-200 px-5 py-4 text-sm font-bold lg:hidden">任務（{tasks.length} 項）<select className={`${field} w-full`} aria-label="切換學習任務" value={selected?.id || ""} disabled={locked} onChange={(event) => { setSelectedId(event.target.value); setStudentFilter("all"); setStudentSearch(""); setArchiveConfirm(false); setActionError(""); }}>{tasks.map((task) => <option key={task.id} value={task.id}>{task.archived ? "[封存] " : ""}{task.task_date} · {task.subject}{learningKindLabel(task.task_kind)} · {task.scope.slice(0, 40)}</option>)}</select></label>
          <nav aria-label="學習任務清單" className="hidden max-h-[70vh] overflow-y-auto border-r border-slate-200 lg:block">{tasks.map((task) => { const count = taskProgress(task); return <button key={task.id} disabled={locked} aria-pressed={selected?.id === task.id} onClick={() => { setSelectedId(task.id); setStudentFilter("all"); setStudentSearch(""); setArchiveConfirm(false); setActionError(""); }} className={`block w-full border-b border-slate-200 border-l-4 px-5 py-4 text-left ${selected?.id === task.id ? "border-l-blue-600 bg-blue-50" : "border-l-transparent hover:bg-slate-50"}`}><div className="flex items-center justify-between gap-2 text-xs text-slate-500"><span>{task.task_date}</span>{task.archived && <span>已封存</span>}</div><div className="mt-2 break-words font-bold">{task.subject} · {learningKindLabel(task.task_kind)}</div><p className="mt-1 line-clamp-2 break-words text-sm text-slate-600">{task.scope}</p><div className="mt-3 flex items-center justify-between text-xs"><span className={count.pending ? "text-amber-700" : "text-emerald-700"}>{count.pending ? `未完成 ${count.pending} 人` : "全數完成"}</span><span>{count.completed} / {count.total}</span></div><progress aria-label={`${task.subject}完成進度`} value={count.completed} max={count.total || 1} className="mt-2 h-1.5 w-full accent-emerald-600" /></button>; })}</nav>
          {selected && <article className="min-w-0 px-5 py-5 sm:px-6">
            <header className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-slate-500">{selected.task_date}{selected.archived ? " · 已封存" : ""}</p><h3 className="mt-1 break-words text-xl font-black">{selected.subject} · {learningKindLabel(selected.task_kind)}</h3></div><div className="flex gap-2"><button className={button} title="複製成新任務" aria-label="複製成新任務" disabled={locked || !studentsReady} onClick={copyTask}><Copy size={17} /></button>{!selected.archived && <button className={button} title="編輯任務與學生" aria-label="編輯任務與學生" disabled={locked || !studentsReady} onClick={() => setEditor(editorFor(selected.task_date, selected))}><Pencil size={17} /></button>}<button className={button} title={selected.archived ? "還原任務" : "封存任務"} aria-label={selected.archived ? "還原任務" : "封存任務"} disabled={locked} onClick={() => setArchiveConfirm(true)}>{selected.archived ? <RotateCcw size={17} /> : <Archive size={17} />}</button></div></header>
            <p className="mt-4 whitespace-pre-wrap break-words font-medium leading-7">{selected.scope}</p>{selected.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-500">{selected.note}</p>}
            {archiveConfirm && <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-amber-200 bg-amber-50 py-3 text-sm"><span className="mr-auto">{selected.archived ? "確定還原這項任務？" : "封存後會保留內容與完成紀錄。確定封存？"}</span><button className={button} disabled={locked} onClick={() => setArchiveConfirm(false)}>取消</button><button className={primary} disabled={locked} onClick={() => void archive()}>確定{selected.archived ? "還原" : "封存"}</button></div>}
            <div className="my-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-slate-200 py-3 text-sm"><span>應完成 <b>{progress.total}</b></span><span className="text-emerald-700">已完成 <b>{progress.completed}</b></span><span className="text-amber-700">未完成 <b>{progress.pending}</b></span></div>
            <div className="mb-3 flex flex-wrap gap-2"><select aria-label="完成狀態篩選" className={field} value={studentFilter} disabled={locked} onChange={(event) => setStudentFilter(event.target.value)}><option value="all">全部學生</option><option value="pending">未完成</option><option value="done">已完成</option></select><input aria-label="搜尋任務學生" className={`${field} w-36 flex-1`} placeholder="搜尋學生姓名" value={studentSearch} disabled={locked} onChange={(event) => setStudentSearch(event.target.value)} /></div>
            <ul className="divide-y divide-slate-200">{shownEntries.map((entry) => { const busy = busyIds.includes(entry.id); return <li key={entry.id} className="flex flex-wrap items-start gap-3 py-4"><label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-3 sm:flex-none sm:basis-40"><input type="checkbox" aria-label={`${entry.student_name}已完成`} checked={entry.completed} disabled={busy || selected.archived} onChange={(event) => void updateEntry(entry, event.target.checked)} className="h-5 w-5 shrink-0 accent-emerald-600" /><span className="min-w-0"><span className="block break-words font-bold">{entry.student_name}</span><span className="text-xs text-slate-500">{entry.grade}{entry.completed ? " · 已完成" : " · 未完成"}</span></span></label><div className="min-w-0 basis-full space-y-2 sm:flex-1 sm:basis-0"><div className="flex gap-2"><input aria-label={`${entry.student_name}備註`} placeholder="個別備註（選填）" maxLength={1000} value={draftNotes[entry.id] ?? entry.note} disabled={busy || selected.archived} onChange={(event) => setDraftNotes((current) => { const next = { ...current }; if (event.target.value === entry.note) delete next[entry.id]; else next[entry.id] = event.target.value; return next; })} className={`${field} w-full`} />{entry.id in draftNotes && <><button className={button} title="儲存備註" aria-label={`儲存${entry.student_name}備註`} disabled={busy} onClick={() => void updateEntry(entry, entry.completed)}><Save size={16} /></button><button className={button} title="取消備註變更" aria-label={`取消${entry.student_name}備註變更`} disabled={busy} onClick={() => setDraftNotes((current) => { const next = { ...current }; delete next[entry.id]; return next; })}><X size={16} /></button></>}</div>{busy ? <p className="text-xs text-blue-600">儲存中...</p> : entry.completed_at && <p className="flex items-center gap-1 text-xs text-emerald-700"><Check size={12} />{new Date(entry.completed_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} 完成</p>}</div></li>; })}</ul>
            {!shownEntries.length && <p className="py-8 text-center text-sm text-slate-500">沒有符合的學生</p>}
          </article>}
        </div>}
    </>}
    {editor && <TaskEditor initial={editor} students={students} onClose={() => setEditor(null)} onSaved={(savedDate, id) => { setEditor(null); setView("day"); setDate(savedDate); setSelectedId(id); setSearch(""); setGrade(""); setStudentFilter("all"); setStudentSearch(""); setNotice("任務已儲存"); setReload((value) => value + 1); }} />}
  </section>;
}
