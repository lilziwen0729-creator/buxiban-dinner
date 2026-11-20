"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Archive, Check, Copy, ExternalLink, Film, Link2, Pause, Play, Plus, RefreshCw, Settings, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import { availableContactCourses, pickContactCourse, type ContactBookCourse } from "@/lib/contactBook";
import { formatRecordingSize, moveRecordingPart, recordingFingerprint, recordingShareMessage, recordingStatus, recordingTitle, sortRecordingFiles, validateRecordingFile, type CourseRecording, type RecordingPart } from "@/lib/courseRecordings";
import { activeYoutubeToken, connectYoutube, inspectYoutubeVideo, loadYoutubeIdentity, startYoutubeUpload, uploadYoutubeFile, type YoutubeConnection } from "@/lib/youtubeRecordingUpload";

const field = "min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100";
const button = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed";
const primary = "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed";
const message = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "連線失敗，請稍後再試";
const courseName = (course?: ContactBookCourse) => (course?.name || "").replace(/\s*[（(](週|星期)[一二三四五六日天][)）]\s*$/, "").trim();
const videoUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
type DraftFile = { key: string; file: File; fingerprint: string };

export default function CourseRecordingsTab() {
  const [courses, setCourses] = useState<ContactBookCourse[]>([]);
  const [records, setRecords] = useState<CourseRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [month, setMonth] = useState(getToday().slice(0, 7));
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const [form, setForm] = useState({ date: getToday(), courseId: "", title: "", classroom: "", allCourses: false });
  const [draftFiles, setDraftFiles] = useState<DraftFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [clientId, setClientId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clientDraft, setClientDraft] = useState("");
  const [identityReady, setIdentityReady] = useState(false);
  const [connection, setConnection] = useState<YoutubeConnection | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [recover, setRecover] = useState<{ part: RecordingPart; url: string } | null>(null);
  const [shareDraft, setShareDraft] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const draftId = useRef("");
  const editorRef = useRef<HTMLElement>(null);
  const loadRequest = useRef(0);
  const selected = records.find((record) => record.id === selectedId);
  const choices = availableContactCourses(courses, form.date, form.allCourses ? "all" : "scheduled");
  const displayed = records.filter((record) => `${record.course_title} ${record.classroom} ${record.lesson_date}`.toLowerCase().includes(search.trim().toLowerCase()));
  const parts = useMemo(() => [...(selected?.recording_parts || [])].sort((a, b) => a.part_no - b.part_no), [selected]);
  const available = parts.filter((part) => !part.youtube_id);
  const readyToShare = parts.length > 0 && parts.every((part) => part.status === "ready");

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    const [year, m] = month.split("-").map(Number);
    if (!year || !m) return;
    setLoading(true);
    try {
      const loaded: CourseRecording[] = [];
      for (let offset = 0; ; offset += 200) {
        let query = supabase.from("course_recordings").select("*,recording_parts(*)")
          .gte("lesson_date", `${month}-01`).lt("lesson_date", new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10))
          .order("lesson_date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(offset, offset + 199);
        if (!includeArchived) query = query.eq("archived", false);
        const { data, error } = await query;
        if (error) throw error;
        loaded.push(...(data || []) as CourseRecording[]);
        if (!data || data.length < 200) break;
      }
      if (request !== loadRequest.current) return;
      setRecords(loaded);
      setSelectedId((current) => loaded.some((r) => r.id === current) ? current : loaded[0]?.id || "");
    } catch (error) { if (request === loadRequest.current) setError(message(error)); }
    finally { if (request === loadRequest.current) setLoading(false); }
  }, [month, includeArchived]);

  // Loading is synchronous feedback for an asynchronous database request.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let ignore = false;
    void (async () => {
      const courseResult = await supabase.from("courses").select("*").order("name");
      const config = await supabase.from("recording_settings").select("google_client_id").eq("id", true).maybeSingle();
      if (ignore) return;
      if (courseResult.error || config.error) { setError(message(courseResult.error || config.error)); return; }
      setCourses(courseResult.data || []);
      setClientId(config.data?.google_client_id || "");
      setClientDraft(config.data?.google_client_id || "");
    })();
    void loadYoutubeIdentity().then(() => { if (!ignore) setIdentityReady(true); }).catch((error) => { if (!ignore) setError(message(error)); });
    return () => { ignore = true; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);
  useEffect(() => {
    if (!uploading && !draftFiles.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading, draftFiles.length]);

  const rpc = async (name: string, params: Record<string, unknown>) => {
    const result = await supabase.rpc(name, params);
    if (result.error) {
      if (name === "create_course_recording" && result.error.code === "23505") throw new Error("這個日期、課程與教室已有錄影紀錄（可能已封存）");
      throw result.error;
    }
    return result.data;
  };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (error) { setError(message(error)); }
    finally { lock.current = false; setBusy(false); }
  };
  const openDraft = () => {
    const id = pickContactCourse(courses, form.date, form.allCourses ? "all" : "scheduled", form.courseId);
    setForm((current) => ({ ...current, courseId: id, title: courseName(courses.find((course) => course.id === id)) }));
    setDraftOpen(true); draftId.current = crypto.randomUUID();
  };
  const addFiles = async (files: File[]) => run(async () => {
    if (files.length + draftFiles.length > 30) throw new Error("每堂課最多 30 支影片");
    files.forEach(validateRecordingFile);
    const additions: DraftFile[] = [];
    for (const file of sortRecordingFiles(files)) {
      const fingerprint = await recordingFingerprint(file);
      if ([...draftFiles, ...additions].some((item) => item.fingerprint === fingerprint)) continue;
      additions.push({ key: crypto.randomUUID(), file, fingerprint });
    }
    setDraftFiles((current) => [...current, ...additions]);
    if (additions.length < files.length) setNotice("已略過重複影片");
  });
  const createRecording = () => run(async () => {
    if (!draftFiles.length || !form.courseId) throw new Error("請選擇課程與影片");
    recordingTitle(form.date, form.title, draftFiles.length);
    const id = draftId.current || crypto.randomUUID(); draftId.current = id;
    await rpc("create_course_recording", { p_id: id, p_course_id: form.courseId, p_date: form.date,
      p_title: form.title.trim().replace(/\s+/g, " "), p_classroom: form.classroom.trim(),
      p_parts: draftFiles.map((item) => ({ file_name: item.file.name, file_size: item.file.size, fingerprint: item.fingerprint })) });
    const { data, error } = await supabase.from("recording_parts").select("*").eq("recording_id", id);
    if (error) throw error;
    setSelectedFiles((current) => ({ ...current, ...Object.fromEntries((data || []).map((part) => [part.id, draftFiles.find((file) => file.fingerprint === part.fingerprint)!.file])) }));
    setMonth(form.date.slice(0, 7)); setDraftOpen(false); setDraftFiles([]); setShareDraft(null);
    setNotice("已建立待上傳紀錄，確認 YouTube 頻道後即可全部上傳");
    await load(); setSelectedId(id);
  });
  const reselectFiles = (files: File[]) => run(async () => {
    let count = 0;
    const matched: Record<string, File> = {};
    for (const file of files) {
      const fingerprint = await recordingFingerprint(file);
      const part = available.find((item) => item.fingerprint === fingerprint && item.file_size === file.size);
      if (part) { matched[part.id] = file; count++; }
    }
    setSelectedFiles((current) => ({ ...current, ...matched }));
    setNotice(`已配對 ${count} 支原始影片${count < files.length ? "，其他檔案不屬於這堂課" : ""}`);
  });
  const updateLocalPart = (id: string, update: Partial<RecordingPart>) => setRecords((current) => current.map((record) => ({
    ...record, recording_parts: record.recording_parts.map((part) => part.id === id ? { ...part, ...update } : part),
  })));

  const uploadAll = () => run(async () => {
    const current = selected;
    const account = connection;
    activeYoutubeToken(account);
    if (!current || !account) return;
    if (available.some((part) => !selectedFiles[part.id])) throw new Error("請重新選取缺少的原始影片");
    const abort = new AbortController(); controller.current = abort; setUploading(true);
    try {
      for (const original of available) {
        abort.signal.throwIfAborted();
        const lease = crypto.randomUUID();
        const part = await rpc("claim_recording_part", { p_id: original.id, p_lease: lease, p_channel: account.channelId }) as RecordingPart;
        if (part.youtube_id) continue;
        let url = part.upload_url, offset = part.uploaded_bytes, completed: string | null = null;
        const save = async (status: string, detail = "") => {
          await rpc("update_recording_upload", { p_id: part.id, p_lease: lease, p_url: url, p_bytes: offset,
            p_video: completed, p_status: status, p_error: detail });
          updateLocalPart(part.id, { upload_url: url, uploaded_bytes: offset, youtube_id: completed, status: status as RecordingPart["status"], error_message: detail });
        };
        try {
          if (!url) {
            url = await startYoutubeUpload(activeYoutubeToken(connection), recordingTitle(current.lesson_date, current.course_title, part.part_no), part.file_size, abort.signal);
            // Persist the session before any bytes leave the computer.
            await save("uploading");
          }
          completed = await uploadYoutubeFile({ file: selectedFiles[part.id], url, token: () => activeYoutubeToken(connection), signal: abort.signal,
            progress: async (bytes) => { offset = bytes; await save("uploading"); } });
          offset = part.file_size; await save("processing");
        } catch (error) {
          // A completed response must never be replaced by a new upload on retry.
          const detail = abort.signal.aborted ? "上傳已暫停" : message(error);
          await save(completed ? "processing" : "paused", detail.slice(0, 1000)).catch(() => undefined);
          throw new Error(detail);
        }
      }
      setNotice("影片已傳送，請按「確認影片狀態」等待 YouTube 處理完成");
    } finally { setUploading(false); controller.current = null; await load(); }
  });
  const checkVideos = () => run(async () => {
    const account = connection, token = activeYoutubeToken(account);
    if (!account) return;
    for (const part of parts.filter((item) => item.youtube_id)) {
      if (part.channel_id !== account.channelId) throw new Error("請連線至原本上傳影片的 YouTube 頻道");
      const result = await inspectYoutubeVideo(token, part.youtube_id!, account.channelId);
      await rpc("verify_recording_video", { p_id: part.id, p_video: part.youtube_id, p_status: result.status, p_error: result.error });
    }
    await load(); setNotice("已更新影片狀態");
  });
  const setVisibility = (share: boolean, archived: boolean) => run(async () => {
    if (!selected) return;
    await rpc("set_recording_visibility", { p_id: selected.id, p_share: share, p_archived: archived });
    await load();
    if (share) setShareDraft(recordingShareMessage(selected, `${window.location.origin}/class-video/${selected.share_token}`));
    else setShareDraft(null);
    setNotice(archived ? "課程已封存，補課連結已停用" : share ? "補課連結已啟用" : "已更新課程設定");
  });
  const copy = (text: string) => run(async () => { await navigator.clipboard.writeText(text); setNotice("已複製"); });
  const connect = () => run(async () => { setConnection(await connectYoutube(clientId)); setNotice("YouTube 頻道已連線"); });

  return <section className="min-w-0 rounded-lg border border-slate-200 bg-white text-slate-800">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-5 sm:px-6">
      <div><h2 className="flex items-center gap-2 text-2xl font-black"><Film className="h-6 w-6 text-blue-600" />課程錄影</h2>
        <p className="mt-1 text-sm text-slate-500">{connection ? `YouTube · ${connection.channelTitle}` : clientId ? "YouTube 尚未連線" : "YouTube 尚未設定"}</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} title="YouTube 連線設定" aria-label="YouTube 連線設定" disabled={busy} onClick={() => setSettingsOpen(true)}><Settings size={18} /></button>
        <button type="button" className={button} disabled={busy || !clientId || !identityReady} onClick={connect}><Link2 size={16} />{connection ? "重新連線" : "連線 YouTube"}</button>
        <button type="button" className={primary} disabled={busy || draftOpen} onClick={openDraft}><Plus size={17} />匯入課程影片</button>
      </div>
    </header>
    {(error || notice) && <div role={error ? "alert" : "status"} className={`mx-4 mt-4 flex items-start justify-between gap-3 rounded-lg p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
      <span className="break-words">{error || notice}</span><button type="button" aria-label="關閉訊息" onClick={() => { setError(""); setNotice(""); }}><X size={16} /></button>
    </div>}

    {draftOpen && <section ref={editorRef} className="border-b border-slate-200 px-4 py-5 sm:px-6">
      <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">匯入課程影片</h3><button type="button" className={button} aria-label="取消匯入" disabled={busy} onClick={() => { if (!draftFiles.length || confirm("放棄這次尚未建立的匯入？原始影片不會刪除。")) { setDraftOpen(false); setDraftFiles([]); } }}><X size={18} /></button></div>
      <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 text-sm font-bold">上課日期<input type="date" className={field} value={form.date} onChange={(event) => {
          const date = event.target.value, id = pickContactCourse(courses, date, form.allCourses ? "all" : "scheduled", form.courseId);
          setForm({ ...form, date, courseId: id, title: courseName(courses.find((course) => course.id === id)) });
        }} /></label>
        <label className="space-y-1 text-sm font-bold">課程<select className={field} value={form.courseId} onChange={(event) => setForm({ ...form, courseId: event.target.value, title: courseName(courses.find((course) => course.id === event.target.value)) })}>
          <option value="">{choices.length ? "選擇課程" : "當日沒有排課"}</option>{choices.map((course) => <option key={course.id} value={course.id}>{course.name} {course.start_time?.slice(0, 5)}</option>)}
        </select></label>
        <label className="space-y-1 text-sm font-bold">影片課程名稱<input className={field} value={form.title} maxLength={70} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label className="space-y-1 text-sm font-bold">教室（選填）<input className={field} maxLength={50} value={form.classroom} onChange={(event) => setForm({ ...form, classroom: event.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allCourses} onChange={(event) => {
          const allCourses = event.target.checked, id = pickContactCourse(courses, form.date, allCourses ? "all" : "scheduled", form.courseId);
          setForm({ ...form, allCourses, courseId: id, title: courseName(courses.find((course) => course.id === id)) });
        }} />包含其他上課日</label>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className={`${button} cursor-pointer`}><Plus size={16} />選取 MP4<input aria-label="選取 MP4" className="sr-only" type="file" accept="video/mp4,.mp4" multiple disabled={busy} onChange={(event) => { void addFiles(Array.from(event.target.files || [])); event.target.value = ""; }} /></label>
        <span className="text-sm text-slate-500">{draftFiles.length} 段 · {formatRecordingSize(draftFiles.reduce((sum, item) => sum + item.file.size, 0))}</span>
      </div>
      <ol className="mt-3 divide-y divide-slate-200">{draftFiles.map((item, index) => <li key={item.key} className="flex min-w-0 flex-wrap items-center gap-3 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 font-bold text-blue-700">P{index + 1}</span>
        <div className="min-w-0 flex-1"><p className="break-words font-bold">{form.date} {form.title || "課程名稱"} P{index + 1}</p><p className="mt-1 break-all text-sm text-slate-500">{item.file.name} · {formatRecordingSize(item.file.size)}</p></div>
        <div className="flex gap-1"><button type="button" className={button} aria-label={`預覽 P${index + 1}`} title="預覽影片" onClick={() => setPreview({ url: URL.createObjectURL(item.file), name: item.file.name })}><Play size={16} /></button>
          <button type="button" className={button} disabled={busy || index === 0} aria-label={`上移 P${index + 1}`} title="上移" onClick={() => setDraftFiles(moveRecordingPart(draftFiles, index, -1))}><ArrowUp size={16} /></button>
          <button type="button" className={button} disabled={busy || index === draftFiles.length - 1} aria-label={`下移 P${index + 1}`} title="下移" onClick={() => setDraftFiles(moveRecordingPart(draftFiles, index, 1))}><ArrowDown size={16} /></button>
          <button type="button" className={button} disabled={busy} aria-label={`移除 P${index + 1}`} title="移出本次匯入" onClick={() => setDraftFiles(draftFiles.filter((row) => row.key !== item.key))}><Trash2 size={16} /></button></div>
      </li>)}</ol>
      <div className="mt-4 flex justify-end"><button type="button" className={primary} disabled={busy || !draftFiles.length || !form.courseId || !form.title.trim()} onClick={createRecording}><Check size={17} />{busy ? "處理中..." : `建立待上傳（${draftFiles.length} 段）`}</button></div>
    </section>}

    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
      <label className="sr-only" htmlFor="recording-month">錄影月份</label><input id="recording-month" type="month" className={`${field} max-w-48`} value={month} disabled={busy} onChange={(event) => { if (event.target.value) { setMonth(event.target.value); setShareDraft(null); } }} />
      <input aria-label="搜尋課程錄影" placeholder="課程、日期、教室" className={`${field} flex-1 basis-48`} value={search} onChange={(event) => setSearch(event.target.value)} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeArchived} disabled={busy} onChange={(event) => { setIncludeArchived(event.target.checked); setShareDraft(null); }} />含封存</label>
      <button type="button" className={button} disabled={busy || loading} aria-label="重新整理課程錄影" title="重新整理" onClick={() => void load()}><RefreshCw size={17} /></button>
    </div>
    <div className="grid min-w-0 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,2fr)]">
      <nav aria-label="課程錄影清單" className="max-h-80 overflow-y-auto border-b border-slate-200 lg:max-h-[720px] lg:border-r lg:border-b-0">
        {loading ? <p className="p-6 text-sm text-slate-500">載入中...</p> : !displayed.length ? <p className="p-6 text-sm text-slate-500">本月尚無課程錄影</p> : displayed.map((record) => <button type="button" key={record.id} disabled={busy} onClick={() => { setSelectedId(record.id); setShareDraft(null); }} aria-current={selectedId === record.id ? "true" : undefined}
          className={`block w-full border-b border-slate-100 px-4 py-4 text-left ${selectedId === record.id ? "border-l-4 border-l-blue-600 bg-blue-50" : "border-l-4 border-l-transparent hover:bg-slate-50"}`}>
          <span className="text-sm text-slate-500">{record.lesson_date}{record.archived ? " · 已封存" : ""}</span><span className="mt-1 block break-words font-bold">{record.course_title}</span>
          <span className="mt-2 block text-sm text-slate-600">{record.classroom && `${record.classroom} · `}{record.recording_parts.filter((part) => part.status === "ready").length}/{record.recording_parts.length} 段可觀看</span>
        </button>)}
      </nav>
      <section className="min-w-0 p-4 sm:p-6">
        {!selected ? <div className="py-16 text-center text-slate-500"><Film size={36} className="mx-auto mb-3 text-slate-300" />尚未選擇課程錄影</div> : <>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-slate-500">{selected.lesson_date}{selected.classroom && ` · ${selected.classroom}`}</p><h3 className="mt-1 break-words text-xl font-bold">{selected.course_title}</h3></div>
            <button type="button" className={button} disabled={busy} title={selected.archived ? "還原課程" : "封存課程"} onClick={() => { if (selected.archived || confirm("封存這堂課並停用補課連結？YouTube 影片不會刪除。")) void setVisibility(false, !selected.archived); }}><Archive size={16} />{selected.archived ? "還原" : "封存"}</button></div>
          <div className="my-4 flex flex-wrap gap-2">
            {available.length > 0 && !selected.archived && <>
              <label className={`${button} cursor-pointer`}>選取原始影片<input aria-label="選取原始影片" className="sr-only" type="file" accept="video/mp4,.mp4" multiple disabled={busy} onChange={(event) => { void reselectFiles(Array.from(event.target.files || [])); event.target.value = ""; }} /></label>
              {uploading ? <button type="button" className={button} onClick={() => controller.current?.abort()}><Pause size={16} />暫停上傳</button> : <button type="button" className={primary} disabled={busy || !connection} onClick={uploadAll}><Upload size={16} />全部上傳（{available.length}）</button>}
            </>}
            <button type="button" className={button} disabled={busy || !connection || !parts.some((part) => part.youtube_id)} onClick={checkVideos}><RefreshCw size={16} />確認影片狀態</button>
          </div>
          {uploading && <p className="mb-3 text-sm text-amber-800">上傳中，請保持此頁開啟並避免電腦休眠。</p>}
          <ol className="divide-y divide-slate-200">{parts.map((part) => <li key={part.id} className="py-4">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-bold">{recordingTitle(selected.lesson_date, selected.course_title, part.part_no)}</p><p className="mt-1 break-all text-sm text-slate-500">{part.file_name} · {formatRecordingSize(part.file_size)}</p></div><span className={`shrink-0 rounded px-2 py-1 text-xs font-bold ${part.status === "ready" ? "bg-emerald-50 text-emerald-700" : part.status === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{recordingStatus[part.status]}</span></div>
            {!part.youtube_id && <><progress aria-label={`P${part.part_no} 上傳進度`} max={part.file_size} value={part.uploaded_bytes} className="mt-3 h-2 w-full accent-blue-600" /><p className="mt-1 text-sm text-slate-500">{Math.floor(part.uploaded_bytes / part.file_size * 100)}% · {selectedFiles[part.id] ? "原始影片已選取" : "請選取原始影片"}</p></>}
            {part.error_message && <p className="mt-2 break-words text-sm text-red-700">{part.error_message}</p>}
            <div className="mt-2 flex flex-wrap gap-2">{part.youtube_id ? <a href={videoUrl(part.youtube_id)} target="_blank" rel="noreferrer" className={button}><ExternalLink size={15} />YouTube</a> : !selected.archived && <>
              <button type="button" className={button} disabled={busy || !connection} onClick={() => setRecover({ part, url: "" })}><Link2 size={15} />補登已上傳連結</button>
              {part.upload_url && <button type="button" className={button} disabled={busy} onClick={() => { if (confirm("請先至 YouTube 確認這段影片沒有上傳成功。重新開始會放棄目前進度，可能產生重複影片，確定繼續？")) void run(async () => { await rpc("recover_recording_part", { p_id: part.id, p_video: null, p_channel: null, p_reset: true }); await load(); }); }}>重新開始</button>}
            </>}</div>
          </li>)}</ol>
          <div className="mt-5 border-t border-slate-200 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-bold">補課連結</h4><button type="button" className={button} disabled={busy || selected.archived || (!selected.share_enabled && !readyToShare)} onClick={() => void setVisibility(!selected.share_enabled, false)}><Link2 size={16} />{selected.share_enabled ? "停用連結" : "建立補課連結"}</button></div>
            {selected.share_enabled && readyToShare ? <>
              <p className="mt-3 text-sm text-amber-800">持有連結者可觀看。停用補課頁不會停用已轉傳的 YouTube 網址。</p>
              <textarea aria-label="補課通知文案" rows={7} className={`${field} mt-3`} value={shareDraft ?? recordingShareMessage(selected, `${typeof window !== "undefined" ? window.location.origin : ""}/class-video/${selected.share_token}`)} onChange={(event) => setShareDraft(event.target.value)} />
              <div className="mt-2 flex flex-wrap gap-2"><button type="button" className={primary} disabled={busy || shareDraft === ""} onClick={() => void copy(shareDraft ?? recordingShareMessage(selected, `${window.location.origin}/class-video/${selected.share_token}`))}><Copy size={16} />複製補課文案</button><button type="button" className={button} disabled={busy} onClick={() => void copy(`${window.location.origin}/class-video/${selected.share_token}`)}><Link2 size={16} />複製連結</button><a className={button} href={`/class-video/${selected.share_token}`} target="_blank" rel="noreferrer"><ExternalLink size={16} />開啟補課頁</a></div>
            </> : <p className="mt-3 text-sm text-slate-500">{readyToShare ? "尚未建立補課連結" : "全部段落可觀看後才能建立補課連結"}</p>}
          </div>
        </>}
      </section>
    </div>
    {settingsOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-label="YouTube 連線設定" className="w-full max-w-xl rounded-lg bg-white p-5 shadow-xl">
      <div className="mb-4 flex justify-between"><h3 className="text-lg font-bold">YouTube 連線設定</h3><button type="button" aria-label="關閉設定" onClick={() => setSettingsOpen(false)}><X size={20} /></button></div>
      <label className="text-sm font-bold">Google OAuth 用戶端 ID<input className={`${field} mt-2`} value={clientDraft} placeholder="...apps.googleusercontent.com" onChange={(event) => setClientDraft(event.target.value)} /></label>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end"><button type="button" className={primary} disabled={busy || !clientDraft.trim()} onClick={() => void run(async () => {
        if (!/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientDraft.trim())) throw new Error("請輸入有效的 Google OAuth 用戶端 ID，不是 API 金鑰或密碼");
        const result = await supabase.from("recording_settings").upsert({ id: true, google_client_id: clientDraft.trim() });
        if (result.error) throw result.error; setClientId(clientDraft.trim()); setConnection(null); setSettingsOpen(false); setNotice("YouTube 設定已儲存");
      })}>儲存設定</button></div>
    </section></div>}
    {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><section role="dialog" aria-modal="true" aria-label="影片預覽" className="w-full max-w-4xl rounded-lg bg-white p-4"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="min-w-0 break-all font-bold">{preview.name}</h3><button type="button" aria-label="關閉預覽" onClick={() => setPreview(null)}><X size={22} /></button></div><video src={preview.url} controls className="max-h-[70vh] w-full bg-black" /></section></div>}
    {recover && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-label="補登影片連結" className="w-full max-w-xl rounded-lg bg-white p-5"><h3 className="mb-4 text-lg font-bold">補登 P{recover.part.part_no} 影片連結</h3><label className="text-sm font-bold">YouTube 網址<input className={`${field} mt-2`} value={recover.url} onChange={(event) => setRecover({ ...recover, url: event.target.value })} /></label><div className="mt-4 flex justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={() => setRecover(null)}>取消</button><button type="button" className={primary} disabled={busy} onClick={() => void run(async () => {
      const url = new URL(recover.url), id = url.hostname === "youtu.be" ? url.pathname.slice(1) : ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname) ? url.searchParams.get("v") : null;
      if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error("請輸入有效的 YouTube 影片網址");
      const account = connection, token = activeYoutubeToken(account); if (!account) return;
      const result = await inspectYoutubeVideo(token, id, account.channelId);
      if (result.status === "failed") throw new Error(result.error);
      await rpc("recover_recording_part", { p_id: recover.part.id, p_video: id, p_channel: account.channelId, p_reset: false });
      await rpc("verify_recording_video", { p_id: recover.part.id, p_video: id, p_status: result.status, p_error: "" });
      setRecover(null); await load();
    })}>確認連結</button></div>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}</section></div>}
  </section>;
}
