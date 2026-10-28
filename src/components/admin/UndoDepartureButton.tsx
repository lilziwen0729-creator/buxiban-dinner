"use client";

import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

export default function UndoDepartureButton({ name, english = false, onUndo }: { name: string; english?: boolean; onUndo: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const label = english ? "Undo Departure" : "取消離班";
  const undo = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await onUndo(); setConfirm(false); }
    catch (cause) { setError(cause && typeof cause === "object" && "message" in cause ? String(cause.message) : english ? "Unable to save. Try again." : "儲存失敗，請再試一次。"); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="break-words font-bold text-slate-700">{name}</span><button type="button" title={label} aria-label={`${name} ${label}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50" disabled={busy} onClick={() => setConfirm(!confirm)}><RotateCcw size={15} />{label}</button></div>
    {confirm && <div className="mt-2 max-w-sm space-y-2 border-t border-slate-100 pt-2"><p className="text-xs leading-5 text-slate-600">{english ? "Restore in-class status? Previously sent LINE messages cannot be recalled." : "恢復在班狀態？已送出的 LINE 通知無法撤回。"}</p><div className="flex justify-end gap-2"><button type="button" disabled={busy} className="min-h-9 px-2 text-slate-600" onClick={() => { setConfirm(false); setError(""); }}>{english ? "Back" : "返回"}</button><button type="button" disabled={busy} className="min-h-9 rounded-md bg-blue-600 px-3 font-bold text-white disabled:opacity-50" onClick={() => void undo()}>{busy ? (english ? "Saving..." : "儲存中...") : (english ? "Confirm Undo" : "確定取消離班")}</button></div></div>}
    {error && <p role="alert" className="mt-2 max-w-sm break-words text-xs text-red-600">{error}</p>}
  </div>;
}
