"use client";

import { useEffect, useRef, useState } from "react";
import {
  cancelOrderWithRefund, previewOrderCancellation,
  type CancellationPreview, type CancellationResult,
} from "@/lib/orderCancellation";

type Props = {
  order: { id: string; name: string; grade: string; mealName: string };
  onClose: () => void;
  onCancelled: (result: CancellationResult) => Promise<void>;
};

export default function OrderCancellationDialog({ order, onClose, onCancelled }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [preview, setPreview] = useState<CancellationPreview | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    dialog.current?.showModal();
    void previewOrderCancellation(order.id).then((data) => {
      if (!active) return;
      setPreview(data);
      setAmount(data.refund_amount === null ? "" : String(data.refund_amount));
    }).catch((err: Error) => {
      if (active) setError(err.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [order.id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!preview || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await cancelOrderWithRefund(preview, Number(amount), reason);
      await onCancelled(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "取消失敗，請稍後再試。");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialog} aria-labelledby="cancel-order-title"
      onCancel={(event) => { if (submitting.current) event.preventDefault(); else onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        if (!submitting.current) onClose();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50">
      <form onSubmit={submit} className="p-5 sm:p-6">
        <h2 id="cancel-order-title" className="text-xl font-black">取消訂餐</h2>
        <p className="mt-2 break-words font-bold">{order.grade} · {order.name}</p>
        <p className="mt-1 break-words text-sm text-slate-500">{order.mealName || "未設定餐點"}{preview && ` · ${preview.order_date}`}</p>

        {loading && <p role="status" className="py-6 text-sm text-slate-500">確認訂單與退款金額中...</p>}
        {preview && (
          <div className="mt-5 space-y-4 border-t border-slate-100 pt-4">
            {preview.received && <p className="text-sm font-bold text-amber-700">這筆訂單已領餐，取消後會一併清除領餐狀態。</p>}
            {!preview.charged ? (
              <p className="font-bold text-emerald-700">尚未扣款，不會變更學生餘額。</p>
            ) : preview.refund_amount !== null ? (
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold">退回餐費餘額</span>
                <strong className="text-2xl text-emerald-700">${preview.refund_amount}</strong>
              </div>
            ) : (
              <div>
                <p className="mb-3 text-sm font-bold text-amber-700">找不到唯一的原扣款紀錄，請核對退款金額。</p>
                <label htmlFor="cancel-refund-amount" className="text-sm font-bold">退款金額</label>
                <input id="cancel-refund-amount" type="number" inputMode="numeric" required min="1" step="1"
                  value={amount} disabled={saving} onChange={(event) => setAmount(event.target.value)}
                  className="app-input mt-1 w-full px-3 py-3" />
              </div>
            )}
            <div>
              <label htmlFor="cancel-order-reason" className="text-sm font-bold">取消原因{preview.refund_amount === null ? "（必填）" : "（選填）"}</label>
              <input id="cancel-order-reason" value={reason} disabled={saving} required={preview.refund_amount === null}
                onChange={(event) => setReason(event.target.value)} maxLength={200}
                className="app-input mt-1 w-full px-3 py-3" />
            </div>
          </div>
        )}
        {error && <p role="alert" className="mt-4 break-words text-sm font-bold text-red-600">{error}</p>}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" disabled={saving} onClick={onClose}
            className="min-h-11 rounded-lg border border-slate-200 px-3 py-3 font-bold disabled:opacity-50">返回名單</button>
          <button type="submit" disabled={loading || saving || !preview}
            className="min-h-11 rounded-lg bg-red-600 px-3 py-3 font-bold text-white hover:bg-red-700 disabled:bg-slate-300">
            {saving ? "處理中..." : preview?.charged ? "取消並退款" : "確認取消"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
