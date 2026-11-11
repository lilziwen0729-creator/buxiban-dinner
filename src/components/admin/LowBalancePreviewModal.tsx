"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Pencil, RotateCcw, X } from "lucide-react";
import { balanceDraft, canSendLowBalanceLine, type LowBalancePreviewRow } from "@/lib/lowBalanceDraft";

const templateKey = "admin.lowBalance.manualTemplate.v1";
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-40";
const field = "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-600";

type Props = {
  rows: LowBalancePreviewRow[]; defaultTemplate: string; selectedIds: string[];
  ignoredNoFixedMeal: number; sending: boolean; onToggle: (id: string) => void;
  onSelectAll: () => void; onClear: () => void; onClose: () => void; onSend: () => void;
};

export default function LowBalancePreviewModal({ rows, defaultTemplate, selectedIds, ignoredNoFixedMeal, sending, onToggle, onSelectAll, onClear, onClose, onSend }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"manual" | "line">("manual");
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState(rows[0]?.student_id ?? "");
  const [template, setTemplate] = useState(() => {
    try { return localStorage.getItem(templateKey)?.trim() || defaultTemplate; } catch { return defaultTemplate; }
  });
  const [templateEdit, setTemplateEdit] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [copies, setCopies] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [copying, setCopying] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);

  const messageFor = (row: LowBalancePreviewRow) => drafts[row.student_id] ?? balanceDraft(template, row);
  const copied = (row: LowBalancePreviewRow) => copies[row.student_id] === messageFor(row);
  const filtered = rows.filter(row => row.student_name.includes(search.trim()));
  const current = filtered.find(row => row.student_id === studentId) ?? filtered[0];
  const text = current ? messageFor(current) : "";
  const eligible = rows.filter(canSendLowBalanceLine);
  const choose = (id: string) => { setStudentId(id); setNotice(""); };
  const close = () => {
    if (!sending && (templateEdit === null || templateEdit === template || window.confirm("放棄尚未儲存的範本修改？"))) onClose();
  };
  const saveTemplate = () => {
    if (!templateEdit?.trim()) return;
    const next = templateEdit.trim();
    setTemplate(next); setTemplateEdit(null);
    try {
      localStorage.setItem(templateKey, next);
      setNotice("範本已儲存在此瀏覽器，個別修改的文案已保留。");
    } catch { setNotice("已套用本次範本，但此瀏覽器無法保存供下次使用。"); }
  };
  const copy = async () => {
    if (!current || !text.trim() || copying) return;
    setCopying(true); setNotice("");
    try {
      await navigator.clipboard.writeText(text);
      setCopies(previous => ({ ...previous, [current.student_id]: text }));
      setNotice(`已複製${current.student_name}的文案，尚未發送。`);
    } catch {
      editor.current?.focus(); editor.current?.select();
      setNotice("無法自動複製，已選取文案，請手動複製。");
    } finally { setCopying(false); }
  };

  return <dialog ref={dialog} aria-labelledby="balance-list-title" onCancel={e => { e.preventDefault(); close(); }}
    className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-1rem)] max-w-4xl overflow-y-auto rounded-lg bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-950/50">
    <header className="border-b border-slate-200 px-4 pt-4 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div><h2 id="balance-list-title" className="text-xl font-black">固定訂餐低餘額通知</h2>
          <p className="mt-1 text-sm text-slate-600">餘額低於 $200：{rows.length} 位 · 未固定訂餐略過 {ignoredNoFixedMeal} 位</p></div>
        <button type="button" aria-label="關閉低餘額名單" title="關閉" className={button} onClick={close} disabled={sending}><X size={18} /></button>
      </div>
      <div className="mt-3 flex gap-3" role="group" aria-label="通知方式">
        {([["manual", "手動複製"], ["line", "官方 LINE 發送"]] as const).map(([value, label]) =>
          <button type="button" key={value} aria-pressed={mode === value} disabled={sending || templateEdit !== null || copying} onClick={() => { setMode(value); setNotice(""); }}
            className={`border-b-2 px-2 py-3 text-sm font-bold ${mode === value ? "border-blue-700 text-blue-700" : "border-transparent text-slate-500"}`}>{label}</button>)}
      </div>
    </header>

    {mode === "manual" ? <>
      {templateEdit !== null ? <section className="space-y-3 p-4 sm:p-6">
        <label className="grid gap-2 font-bold">共用文案範本<textarea autoFocus value={templateEdit} onChange={e => setTemplateEdit(e.target.value)}
          rows={12} className={`${field} leading-6`} /></label>
        <p className="text-sm text-slate-600">{"{{學生姓名}}、{{餘額}} 會依名單自動帶入。"}</p>
        <div className="flex flex-wrap gap-2">
          <button className={button} onClick={() => setTemplateEdit(defaultTemplate)}><RotateCcw size={15} />還原預設範本</button>
          <button className={`${button} sm:ml-auto`} onClick={() => setTemplateEdit(null)}>取消</button>
          <button className={primary} onClick={saveTemplate} disabled={!templateEdit.trim()}>儲存範本</button>
        </div>
      </section> : <div className="grid min-w-0 sm:grid-cols-[minmax(12rem,0.8fr)_minmax(0,2fr)]">
        <aside className="min-w-0 space-y-2 border-b border-slate-200 p-4 sm:border-r sm:border-b-0">
          <div className="flex items-baseline justify-between gap-2"><h3 className="font-bold">學生名單</h3>
            <span className="text-xs text-slate-500">已複製 {rows.filter(copied).length} / {rows.length}</span></div>
          <input type="search" aria-label="搜尋低餘額學生" placeholder="搜尋學生姓名" className={field} value={search} disabled={copying} onChange={e => { setSearch(e.target.value); setNotice(""); }} />
          {!!filtered.length && <select aria-label="選擇通知學生" className={`${field} sm:hidden`} value={current.student_id} disabled={copying} onChange={e => choose(e.target.value)}>
            {filtered.map(row => <option key={row.student_id} value={row.student_id}>{row.student_name} · ${row.balance}{copied(row) && " · 已複製"}</option>)}
          </select>}
          <div className="hidden max-h-[52dvh] overflow-y-auto sm:block">
            {filtered.map(row => <button type="button" key={row.student_id} disabled={copying} aria-pressed={row.student_id === current.student_id} onClick={() => choose(row.student_id)}
              className={`flex w-full items-center justify-between gap-2 border-b border-slate-100 px-2 py-3 text-left text-sm ${row.student_id === current.student_id ? "bg-blue-50 text-blue-800" : "hover:bg-slate-50"}`}>
              <span className="min-w-0 break-words font-bold">{row.student_name}{copied(row) && <Check size={15} className="ml-1 inline text-emerald-700" aria-label="已複製" />}</span>
              <span className="shrink-0 tabular-nums">${row.balance}</span></button>)}
          </div>
        </aside>
        <section className="min-w-0 p-4 sm:p-6">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>{current && <><h3 className="font-black">{current.student_name} <span className="text-sm text-rose-700">餘額 ${current.balance}</span></h3>
              <p className="text-xs text-slate-500">{current.parent_count ? `已綁 LINE 家長 ${current.parent_count} 位` : "未綁定官方 LINE"}</p></>}</div>
            <button type="button" className={button} disabled={copying} onClick={() => { setTemplateEdit(template); setNotice(""); }}><Pencil size={15} />編輯共用範本</button>
          </div>
          {current ? <>
            <label className="grid gap-2 text-sm font-bold">給家長的文案<textarea ref={editor} rows={12} className={`${field} resize-y font-normal leading-6`} value={text}
              disabled={copying} onChange={e => { const value = e.target.value; setDrafts(prev => ({ ...prev, [current.student_id]: value })); setNotice(""); }} /></label>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {current.student_id in drafts && <button className={button} disabled={copying} onClick={() => {
                setDrafts(prev => { const next = { ...prev }; delete next[current.student_id]; return next; }); setNotice("");
              }}>還原此人文案</button>}
              <button className={primary} onClick={() => void copy()} disabled={!text.trim() || copying}><Copy size={16} />複製文案</button>
            </div>
          </> : <p className="py-8 text-center text-sm text-slate-500">{rows.length ? "沒有符合搜尋的學生。" : "目前沒有符合條件的學生。"}</p>}
          <p role="status" className="mt-2 text-sm text-slate-600">{notice}</p>
        </section>
      </div>}
    </> : <>
      <section className="p-4 sm:p-6">
        <p className="text-sm text-slate-600">使用官方 LINE 通知範本，不使用手動文案。可發送 {eligible.length} 位。</p>
        {eligible.length > 0 && <div className="my-3 flex gap-2"><button className={button} disabled={sending} onClick={onSelectAll}>全選可發送</button>
          <button className={button} disabled={sending} onClick={onClear}>全部取消</button></div>}
        <div className="mt-3 max-h-[48dvh] divide-y divide-slate-100 overflow-y-auto">
          {eligible.map(row => <label key={row.student_id} className="flex items-center gap-3 py-3 text-sm">
            <input type="checkbox" checked={selectedIds.includes(row.student_id)} disabled={sending} onChange={() => onToggle(row.student_id)} />
            <b>{row.student_name}</b><span>餘額 ${row.balance} · LINE 家長 {row.parent_count} 位</span></label>)}
        </div>
        {rows.length > eligible.length && <p className="mt-3 text-sm text-slate-600">{rows.length - eligible.length} 位無法透過官方 LINE 發送，可切到「手動複製」。</p>}
      </section>
      <footer className="flex justify-end border-t border-slate-200 p-4"><button className={primary} onClick={onSend} disabled={sending || !selectedIds.length}>{sending ? "發送中…" : `透過 LINE 發送（${selectedIds.length}）`}</button></footer>
    </>}
  </dialog>;
}
