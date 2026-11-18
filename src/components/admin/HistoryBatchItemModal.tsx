"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, ListX, RefreshCw, Save, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { filterHistoryBatchRows, summarizeHistoryBatch, type HistoryBatchFilter, type HistoryBatchOrder, type HistoryBatchRow, type HistoryItemContext } from "@/lib/historyOrderBatch";

type Menu = { id: string; name: string; price: number; vendor_id: string | null };
type Vendor = { id: string; name: string };
type Props = { orders: HistoryBatchOrder[]; date: string; onClose: () => void; onSaved: (message: string) => void };
const defaultFilter: HistoryBatchFilter = { grade: "all", charge: "unpaid", meal: "all" };
const money = (amount: number) => "$" + amount.toLocaleString("zh-TW");
const field = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-50";
const gradeOrder = ["小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];
function message(error: unknown) {
  const text = error && typeof error === "object" && "message" in error ? String(error.message) : "請稍後再試";
  return /Could not find the function|schema cache/.test(text) ? "批次更改功能尚未安裝完成，請聯絡管理員更新資料庫。" : text;
}

export default function HistoryBatchItemModal({ orders, date, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const [rows, setRows] = useState<HistoryBatchRow[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [mealId, setMealId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState(defaultFilter);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { dialog.current?.showModal(); }, []);
  const load = useCallback(async () => {
    setLoading(true); setError(""); setRows([]); setSelectedIds(new Set()); setMealId("");
    try {
      const [preview, menuRes, vendorRes] = await Promise.all([
        supabase.rpc("preview_history_order_items", { p_order_ids: orders.map((order) => order.id) }),
        supabase.from("menus").select("id, name, price, vendor_id").eq("is_active", true).order("name"),
        supabase.from("vendors").select("id, name").order("name"),
      ]);
      if (preview.error) throw preview.error;
      if (menuRes.error) throw menuRes.error;
      if (vendorRes.error) throw vendorRes.error;
      if (!Array.isArray(preview.data?.orders) || !Array.isArray(preview.data?.errors)) throw new Error("無法取得訂單，請重新載入");
      const contexts = new Map<string, HistoryItemContext>(preview.data.orders.map((context: HistoryItemContext) => [context.order_id, context]));
      const errors = new Map<string, string>(preview.data.errors.map((item: { order_id: string; message: string }) => [item.order_id, item.message]));
      const nextRows = orders.map((order) => {
        const context = contexts.get(order.id);
        return { ...order, context: context?.order_date === date ? context : undefined,
          error: errors.get(order.id) || (context?.order_date !== date ? "訂單日期不一致或資料已異動" : undefined) };
      }).sort((a, b) => (gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade)) || a.name.localeCompare(b.name, "zh-TW"));
      setRows(nextRows);
      setSelectedIds(new Set(nextRows.filter((row) => row.context && !row.context.charged).map((row) => row.id)));
      setMenus((menuRes.data || []).filter((item) => Number.isSafeInteger(Number(item.price)) && Number(item.price) > 0));
      setVendors(vendorRes.data || []);
      setVendorId(""); setFilter(defaultFilter); setNeedsReload(false);
    } catch (cause) { setError(message(cause)); }
    finally { setLoading(false); }
  }, [orders, date]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleRows = useMemo(() => filterHistoryBatchRows(rows, filter), [rows, filter]);
  const contexts = rows.filter((row) => selectedIds.has(row.id) && row.context).map((row) => row.context!);
  const selectedMeal = menus.find((meal) => meal.id === mealId);
  const summary = summarizeHistoryBatch(contexts, mealId, Number(selectedMeal?.price || 0));
  const originalMeals = Array.from(new Map(rows.filter((row) => row.context).map((row) => [row.context!.meal_id || "missing", row.context!.meal_name])).entries());
  const grades = Array.from(new Set(rows.map((row) => row.grade)));
  const blocked = rows.filter((row) => !row.context);
  const changeFilter = (key: keyof HistoryBatchFilter, value: string) => {
    setFilter((current) => ({ ...current, [key]: value }));
    setSelectedIds(new Set());
  };
  const toggle = (id: string, checked: boolean) => setSelectedIds((current) => {
    const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next;
  });
  const save = async () => {
    if (inFlight.current || loading || needsReload || !selectedMeal || contexts.length === 0 || summary.changed === 0) return;
    inFlight.current = true; setSaving(true); setError("");
    try {
      const { data, error: saveError } = await supabase.rpc("change_history_order_items_atomic", {
        p_order_date: date, p_meal_id: selectedMeal.id, p_expected: contexts, p_expected_price: Number(selectedMeal.price),
      });
      if (saveError) throw saveError;
      if (data?.status !== "updated" || !Number.isInteger(data.changed)) throw new Error("無法確認儲存結果，請重新載入核對");
      onSaved("已將 " + data.changed + " 筆訂單更改為「" + selectedMeal.name + "」。"
        + (data.unchanged ? "原品項相同 " + data.unchanged + " 筆未變動。" : "")
        + (data.extra_charge > 0 ? "補扣差額 " + money(data.extra_charge) + "。" : "")
        + (data.refund > 0 ? "退回差額 " + money(data.refund) + "。" : ""));
    } catch (cause) { setError(message(cause)); setNeedsReload(true); }
    finally { inFlight.current = false; setSaving(false); }
  };

  return <dialog ref={dialog} aria-labelledby="batch-item-title" onCancel={(event) => { event.preventDefault(); if (!inFlight.current) onClose(); }}
    className="fixed inset-0 m-auto max-h-[92svh] w-[calc(100%-2rem)] max-w-4xl overflow-hidden rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/50">
    <form className="flex max-h-[92svh] flex-col" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div><h2 id="batch-item-title" className="text-xl font-black">批次更改品項</h2><p className="mt-1 text-sm text-slate-500">{date} · 已選 {contexts.length} 筆</p></div>
        <button type="button" title="關閉" aria-label="關閉批次更改" disabled={saving} onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-50"><X size={18} /></button>
      </header>
      <div className="min-h-0 space-y-5 overflow-y-auto p-5">
        {loading ? <p role="status" className="py-12 text-center text-slate-500">讀取訂單與餐點中...</p> : <>
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><p>{error}</p>
            <button type="button" disabled={saving} onClick={() => void load()} className="mt-3 inline-flex items-center gap-2 font-bold underline"><RefreshCw size={15} />重新載入</button></div>}
          <fieldset disabled={saving || needsReload} className="min-w-0 space-y-5 disabled:opacity-60">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="min-w-0 text-sm font-bold">商家<select className={field} value={vendorId} onChange={(event) => { setVendorId(event.target.value); setMealId(""); }}>
                <option value="">全部商家</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
              </select></label>
              <label className="min-w-0 text-sm font-bold">統一更換為<select className={field} required value={mealId} onChange={(event) => setMealId(event.target.value)}>
                <option value="">選擇新餐點</option>{menus.filter((meal) => !vendorId || meal.vendor_id === vendorId).map((meal) => <option key={meal.id} value={meal.id}>
                  {meal.name} · {money(Number(meal.price))}{!vendorId ? " · " + (vendors.find((vendor) => vendor.id === meal.vendor_id)?.name || "未設定商家") : ""}
                </option>)}
              </select></label>
            </div>
            {menus.length === 0 && <p className="text-sm text-amber-700">沒有可選的啟用餐點，請先在商家菜單新增餐點與價格。</p>}
            <section className="border-t border-slate-200 pt-4">
              <h3 className="mb-3 text-base font-bold">更改名單</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="min-w-0 text-xs font-bold text-slate-600">年級<select value={filter.grade} className={field} onChange={(event) => changeFilter("grade", event.target.value)}>
                  <option value="all">全部年級</option><option value="primary">國小</option><option value="junior">國中</option>{grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select></label>
                <label className="min-w-0 text-xs font-bold text-slate-600">扣款狀態<select value={filter.charge} className={field} onChange={(event) => changeFilter("charge", event.target.value)}>
                  <option value="unpaid">未扣款</option><option value="charged">已扣款</option><option value="all">全部狀態</option>
                </select></label>
                <label className="min-w-0 text-xs font-bold text-slate-600">原餐點<select value={filter.meal} className={field} onChange={(event) => changeFilter("meal", event.target.value)}>
                  <option value="all">全部餐點</option>{originalMeals.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select></label>
              </div>
              <div className="my-3 flex flex-wrap items-center gap-2">
                <button type="button" className={secondary} disabled={!visibleRows.some((row) => row.context)} onClick={() => setSelectedIds(new Set(visibleRows.filter((row) => row.context).map((row) => row.id)))}><CheckCheck size={16} />全選目前名單</button>
                <button type="button" className={secondary} disabled={contexts.length === 0} onClick={() => setSelectedIds(new Set())}><ListX size={16} />清除勾選</button>
                <span className="text-xs text-slate-500">目前名單 {visibleRows.length} 筆</span>
              </div>
              <div className="max-h-60 overflow-y-auto border-y border-slate-200">
                {visibleRows.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">沒有符合條件的訂單</p> : visibleRows.map((row) =>
                  <label key={row.id} className={"flex min-w-0 items-start gap-3 border-b border-slate-100 p-3 last:border-0 " + (selectedIds.has(row.id) ? "bg-blue-50" : "bg-white")}>
                    <input aria-label={"選取 " + row.name} type="checkbox" checked={selectedIds.has(row.id)} disabled={!row.context} onChange={(event) => toggle(row.id, event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-blue-600" />
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"><strong>{row.name}</strong><span className="text-xs text-slate-500">{row.grade} · {row.context?.charged ? "已扣款" : "未扣款"}</span></div>
                      <p className="mt-1 break-words text-xs text-slate-600">{row.context?.meal_name}{row.context ? " · " + money(Number(row.context.charged ? row.context.charged_amount : row.context.price || 0)) : row.error}</p>
                    </div>
                    {row.context && selectedMeal && row.context.meal_id === mealId && <span className="shrink-0 text-xs text-slate-500">品項相同</span>}
                  </label>)}
              </div>
            </section>
          </fieldset>
          {blocked.length > 0 && <details className="text-sm text-amber-800"><summary>無法更改 {blocked.length} 筆</summary><ul className="mt-2 space-y-2">{blocked.map((row) => <li key={row.id}>{row.name}：{row.error}</li>)}</ul></details>}
        </>}
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-white p-4">
          {selectedMeal && <section aria-label="批次異動摘要" className="mb-3 text-sm" role="status">
            <p className="font-bold">更換 {summary.changed} 筆為「{selectedMeal.name}」· 每份 {money(Number(selectedMeal.price))}</p>
            <p className="mt-2 text-slate-600">未扣款 {summary.unpaid} 筆，本次不扣款{summary.unchanged > 0 ? "；品項相同 " + summary.unchanged + " 筆不變動" : ""}。</p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-bold"><span className="text-red-600">補扣差額 {money(summary.extraCharge)}</span><span className="text-emerald-700">退回餘額 {money(summary.refund)}</span></div>
          </section>}
        <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={secondary} disabled={saving} onClick={onClose}>取消</button>
        <button type="submit" disabled={loading || saving || needsReload || !selectedMeal || contexts.length === 0 || summary.changed === 0}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500">
          <Save size={16} />{saving ? "整批儲存中..." : "確認更改 " + (selectedMeal ? summary.changed : contexts.length) + " 筆"}
        </button>
        </div>
      </footer>
    </form>
  </dialog>;
}
