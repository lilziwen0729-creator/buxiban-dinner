"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getTaipeiNow } from "@/lib/date";
import { editTransaction, validateTransactionEdit, type TransactionEntry } from "@/lib/transactionEditing";

type Props = {
  student: { id: string; name: string; balance: number };
  onClose: () => void;
  onRefresh: () => void;
};

const PAGE_SIZE = 15;
const periods = [["this_year", "今年"], ["this", "本月"], ["last", "上月"], ["all", "全部"]];
const badges: Record<string, string> = { topup: "儲", order: "餐", refund: "退", adjustment: "調" };
const signed = (amount: number) => (amount > 0 ? "+" : "") + amount;
const formatTimestamp = (date: string) => new Date(date).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
const messageOf = (error: unknown) => error instanceof Error ? error.message
  : typeof error === "object" && error && "message" in error ? String(error.message) : "請稍後再試";

export default function TransactionLogsModal({ student, onClose, onRefresh }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef(0);
  const submitting = useRef(false);
  const [logs, setLogs] = useState<TransactionEntry[]>([]);
  const [period, setPeriod] = useState("this_year");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [balance, setBalance] = useState(student.balance);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<TransactionEntry | null>(null);
  const [draft, setDraft] = useState({ amount: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");

  const fetchLogs = useCallback(async (nextPage = 0) => {
    const currentRequest = ++request.current;
    setLoading(true);
    setLoadError("");
    try {
      let query = supabase.from("transactions").select("*", { count: "exact" }).eq("student_id", student.id);
      const now = getTaipeiNow();
      const boundary = (year: number, month: number) => {
        const date = new Date(Date.UTC(year, month, 1));
        return date.toISOString().slice(0, 10) + "T00:00:00+08:00";
      };
      if (period === "this") query = query.gte("created_at", boundary(now.getFullYear(), now.getMonth()));
      if (period === "last") query = query.gte("created_at", boundary(now.getFullYear(), now.getMonth() - 1))
        .lt("created_at", boundary(now.getFullYear(), now.getMonth()));
      if (period === "this_year") query = query.gte("created_at", boundary(now.getFullYear(), 0));
      const from = nextPage * PAGE_SIZE;
      const [entries, wallet] = await Promise.all([
        query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + PAGE_SIZE - 1),
        supabase.from("students").select("balance").eq("id", student.id).single(),
      ]);
      if (entries.error) throw entries.error;
      if (wallet.error) throw wallet.error;
      if (currentRequest !== request.current) return;
      const rows = (entries.data || []) as TransactionEntry[];
      setLogs((current) => nextPage === 0 ? rows : [...current, ...rows]);
      setBalance(Number(wallet.data.balance || 0));
      setPage(nextPage);
      setHasMore(from + rows.length < (entries.count || 0));
    } catch (error) {
      if (currentRequest === request.current) setLoadError("載入失敗：" + messageOf(error));
    } finally {
      if (currentRequest === request.current) setLoading(false);
    }
  }, [period, student.id]);

  useEffect(() => {
    dialog.current?.showModal();
    const timer = window.setTimeout(() => void fetchLogs(), 0);
    return () => { window.clearTimeout(timer); request.current += 1; };
  }, [fetchLogs]);

  const close = () => {
    if (submitting.current) return;
    if (editing && !window.confirm("尚未儲存修改，確定關閉明細？")) return;
    onClose();
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setSaveError("");
    setNotice("");
    try {
      const result = await editTransaction(editing, draft.amount, draft.description);
      setBalance(result.balance_after);
      setEditing(null);
      setNotice(result.status === "unchanged" ? "明細未變更。"
        : "明細已更新" + (result.delta === 0 ? "，餘額不變。" : "，餘額" + (result.delta > 0 ? "補回" : "扣除") + " $" + Math.abs(result.delta) + "。"));
      onRefresh();
      await fetchLogs();
    } catch (error) {
      setSaveError(messageOf(error));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const groups = new Map<string, TransactionEntry[]>();
  for (const entry of logs) {
    const month = new Date(entry.created_at).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "long" });
    groups.set(month, [...(groups.get(month) || []), entry]);
  }
  let delta: number | null = null;
  if (editing) {
    try { delta = validateTransactionEdit(editing.type, draft.amount, draft.description).amount - editing.amount; }
    catch { /* The form reports validation errors on save. */ }
  }

  return (
    <dialog ref={dialog} aria-labelledby="transaction-title" onCancel={(event) => { event.preventDefault(); close(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-3xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/60">
      <div className="flex max-h-[90dvh] flex-col">
        <header className="shrink-0 border-b border-slate-100 px-5 pb-4 pt-6 sm:px-8">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id="transaction-title" className="break-words text-xl font-black sm:text-2xl">{student.name} · 存摺紀錄</h3>
              <p className="mt-2 text-sm font-bold text-slate-500">目前餘額：<strong className="text-lg text-blue-600">${balance}</strong></p>
            </div>
            <button type="button" disabled={saving} onClick={close} className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-40">關閉</button>
          </div>
          <div role="group" aria-label="明細日期範圍" className="mt-5 grid grid-cols-4 gap-1 rounded-lg bg-slate-50 p-1">
            {periods.map(([value, label]) => (
              <button type="button" key={value} aria-pressed={period === value} disabled={saving || editing !== null}
                onClick={() => { setLogs([]); setPeriod(value); setNotice(""); }}
                className={"min-h-10 rounded-lg px-2 py-2 text-sm font-bold disabled:opacity-50 " + (period === value ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:bg-slate-100")}>{label}</button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-8">
          {notice && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{notice}</p>}
          {loadError && <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <p>{loadError}</p><button type="button" onClick={() => void fetchLogs()} className="mt-2 font-bold underline">重新載入</button>
          </div>}
          {[...groups].map(([month, entries]) => (
            <section key={month} className="mb-5">
              <h4 className="mb-2 py-2 text-sm font-black text-slate-500">{month}</h4>
              <div className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <article key={entry.id} className="py-4">
                    <div className="flex items-start gap-3">
                      <span aria-hidden="true" className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-black " + (entry.amount > 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500")}>{badges[entry.type] || "調"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap break-words font-bold text-slate-700">{entry.description || "未填寫明細"}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatTimestamp(entry.created_at)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={"text-lg font-black " + (entry.amount > 0 ? "text-emerald-600" : "text-rose-500")}>{signed(entry.amount)}</p>
                        <p className="mt-1 text-xs text-slate-500">餘額：{entry.balance_after === null ? "未記錄" : "$" + entry.balance_after}</p>
                        <button type="button" disabled={saving || loading || editing !== null} aria-label={"編輯明細：" + entry.description}
                          onClick={() => { setEditing(entry); setDraft({ amount: String(entry.amount), description: entry.description || "" }); setSaveError(""); setNotice(""); }}
                          className="mt-2 min-h-10 rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-600 hover:bg-blue-100 disabled:opacity-40">編輯</button>
                      </div>
                    </div>
                    {editing?.id === entry.id && (
                      <form onSubmit={save} className="mt-4 space-y-4 border-t border-blue-100 pt-4">
                        <div>
                          <label htmlFor="transaction-description" className="text-sm font-bold">明細內容</label>
                          <textarea id="transaction-description" required rows={3} value={draft.description} disabled={saving}
                            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                            className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-base outline-none focus:ring-2 focus:ring-blue-400" />
                        </div>
                        <div>
                          <label htmlFor="transaction-amount" className="text-sm font-bold">金額（正數入帳／負數扣款）</label>
                          <input id="transaction-amount" type="number" step="1" required value={draft.amount} disabled={saving}
                            onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
                            className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-base outline-none focus:ring-2 focus:ring-blue-400" />
                        </div>
                        {delta !== null && <div aria-live="polite" className="border-l-4 border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                          <p>原金額 {signed(entry.amount)} → 新金額 {signed(entry.amount + delta)}</p>
                          <p className="mt-1 font-bold">{delta === 0 ? "餘額不變" : "餘額" + (delta > 0 ? "補回" : "扣除") + " $" + Math.abs(delta)} · 預估餘額 ${balance + delta}</p>
                        </div>}
                        {saveError && <div role="alert" className="text-sm font-bold text-red-600"><p>{saveError}</p>
                          <button type="button" disabled={saving} onClick={() => { setEditing(null); void fetchLogs(); }} className="mt-2 underline">放棄修改並重新載入</button>
                        </div>}
                        <div className="grid grid-cols-2 gap-3">
                          <button type="button" disabled={saving} onClick={() => setEditing(null)} className="min-h-11 rounded-lg border border-slate-200 px-3 py-3 font-bold text-slate-500 disabled:opacity-50">取消</button>
                          <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-rose-500 px-3 py-3 font-bold text-white hover:bg-rose-600 disabled:opacity-50">{saving ? "儲存中..." : "儲存修改"}</button>
                        </div>
                      </form>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
          {loading && <p role="status" className="py-8 text-center text-sm text-slate-500">載入明細中...</p>}
          {!loading && !loadError && logs.length === 0 && <p className="py-12 text-center text-sm text-slate-400">此期間沒有明細紀錄</p>}
          {hasMore && <button type="button" disabled={loading || saving || editing !== null} onClick={() => void fetchLogs(page + 1)} className="min-h-11 w-full rounded-lg bg-blue-50 px-4 py-3 text-sm font-bold text-blue-600 disabled:opacity-50">查看更早的紀錄</button>}
        </div>
      </div>
    </dialog>
  );
}
