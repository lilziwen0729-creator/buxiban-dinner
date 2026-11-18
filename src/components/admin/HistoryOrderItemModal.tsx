"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCw, Save, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type OrderContext = {
  order_id: string;
  order_date: string;
  meal_id: string | null;
  meal_name: string;
  vendor_id: string | null;
  price: number | null;
  charged: boolean;
  received: boolean;
  charged_amount: number | null;
};
type Menu = { id: string; name: string; price: number; vendor_id: string | null };
type Vendor = { id: string; name: string };
type Props = { orderId: string; studentName: string; onClose: () => void; onSaved: (message: string) => void };
const money = (value: number) => "$" + value.toLocaleString("zh-TW");
const field = "min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

function message(error: unknown) {
  const text = error && typeof error === "object" && "message" in error ? String(error.message) : "請稍後再試";
  return /Could not find the function|schema cache/.test(text)
    ? "更改品項功能尚未安裝完成，請聯絡管理員更新資料庫。" : text;
}

export default function HistoryOrderItemModal({ orderId, studentName, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const [context, setContext] = useState<OrderContext | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [mealId, setMealId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [needsReload, setNeedsReload] = useState(false);

  useEffect(() => { dialog.current?.showModal(); }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setContext(null);
    setMealId("");
    try {
      const [preview, menuRes, vendorRes] = await Promise.all([
        supabase.rpc("preview_history_order_item", { p_order_id: orderId }),
        supabase.from("menus").select("id, name, price, vendor_id").eq("is_active", true).order("name"),
        supabase.from("vendors").select("id, name").order("name"),
      ]);
      if (preview.error) throw preview.error;
      if (menuRes.error) throw menuRes.error;
      if (vendorRes.error) throw vendorRes.error;
      if (!preview.data?.order_id) throw new Error("無法取得訂單，請重新整理");
      setContext(preview.data as OrderContext);
      setMenus((menuRes.data || []).filter((item) => Number.isSafeInteger(Number(item.price)) && Number(item.price) > 0));
      setVendors(vendorRes.data || []);
      setVendorId("");
      setNeedsReload(false);
    } catch (cause) {
      setError(message(cause));
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = menus.find((meal) => meal.id === mealId);
  const previousPrice = context?.charged ? context.charged_amount : context?.price;
  const delta = context?.charged && selected ? Number(context.charged_amount) - Number(selected.price) : 0;
  const amountEffect = !context?.charged ? "本次不扣款，後續補扣將使用新餐點價格。"
    : delta < 0 ? "確認後補扣差額 " + money(-delta)
    : delta > 0 ? "確認後退回差額 " + money(delta) + " 至餐費餘額"
    : "金額不變，只更新餐點與明細內容。";
  const save = async () => {
    if (!context || !selected || inFlight.current || needsReload || selected.id === context.meal_id) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const { data, error: saveError } = await supabase.rpc("change_history_order_item_atomic", {
        p_order_id: orderId, p_meal_id: selected.id, p_expected: context, p_expected_price: Number(selected.price),
      });
      if (saveError) throw saveError;
      if (data?.status !== "updated" && data?.status !== "unchanged") throw new Error("未能確認儲存結果，請重新載入核對");
      const savedDelta = Number(data.delta || 0);
      onSaved(studentName + " 已更改為「" + selected.name + "」。" + (data.charged
        ? (savedDelta < 0 ? "已補扣 " + money(-savedDelta) : savedDelta > 0 ? "已退回 " + money(savedDelta) : "扣款金額不變")
        : "尚未扣款。"));
    } catch (cause) {
      setError(message(cause));
      setNeedsReload(true);
    } finally { inFlight.current = false; setSaving(false); }
  };

  return (
    <dialog ref={dialog} aria-labelledby="history-item-title" onCancel={(event) => { event.preventDefault(); if (!inFlight.current) onClose(); }}
      className="fixed inset-0 m-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/50">
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div className="min-w-0"><h2 id="history-item-title" className="text-xl font-black">更改歷史訂單品項</h2>
            <p className="mt-1 break-words text-sm text-slate-500">{studentName}{context ? " · " + context.order_date : ""}</p></div>
          <button type="button" aria-label="關閉" title="關閉" disabled={saving} onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-50"><X size={18} /></button>
        </header>
        <div className="space-y-5 p-5">
          {loading ? <p role="status" className="py-8 text-center text-sm text-slate-500">讀取訂單與餐點中...</p> : <>
            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p>{error}</p><button type="button" disabled={saving} onClick={() => void load()} className="mt-3 inline-flex items-center gap-2 font-bold underline"><RefreshCw size={15} />重新載入</button>
            </div>}
            {context && <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4 text-sm">
                <span className="text-slate-500">{context.received ? "已領餐" : "未領餐"} · {context.charged ? "已扣款" : "未扣款"}</span>
                <span>原品項：<strong>{context.meal_name}</strong>{previousPrice != null ? " · " + money(Number(previousPrice)) : ""}</span>
              </div>
              <fieldset disabled={saving || needsReload} className="space-y-4 disabled:opacity-60">
                <label className="block text-sm font-bold">商家
                  <select className={field + " mt-2"} value={vendorId} onChange={(event) => { setVendorId(event.target.value); setMealId(""); }}>
                    <option value="">全部商家</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-bold">新餐點
                  <select required className={field + " mt-2"} value={mealId} onChange={(event) => setMealId(event.target.value)}>
                    <option value="">選擇餐點</option>{menus.filter((meal) => !vendorId || meal.vendor_id === vendorId).map((meal) =>
                      <option key={meal.id} value={meal.id} disabled={meal.id === context.meal_id}>
                        {meal.name} · {money(Number(meal.price))}{!vendorId ? " · " + (vendors.find((vendor) => vendor.id === meal.vendor_id)?.name || "未設定商家") : ""}{meal.id === context.meal_id ? "（原品項）" : ""}
                      </option>)}
                  </select>
                </label>
              </fieldset>
              {menus.length === 0 && <p className="text-sm text-amber-700">沒有可選的啟用餐點，請先在商家菜單新增餐點與價格。</p>}
              {selected && <div className="border-t border-slate-200 pt-4" role="status">
                <div className="flex items-center gap-3 text-lg font-bold"><span>{previousPrice == null ? "未設定" : money(Number(previousPrice))}</span><ArrowRight size={18} className="text-slate-400" /><span>{money(Number(selected.price))}</span></div>
                <p className={"mt-2 text-sm font-bold " + (delta < 0 ? "text-red-600" : "text-emerald-700")}>{amountEffect}</p>
              </div>}
            </>}
          </>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-4">
          <button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-bold disabled:opacity-50">取消</button>
          <button type="submit" disabled={loading || saving || needsReload || !selected || !context || selected.id === context.meal_id}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
            <Save size={16} />{saving ? "儲存中..." : context?.charged && delta !== 0 ? "確認更換並調整差額" : "確認更換品項"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
