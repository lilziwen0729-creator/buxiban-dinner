"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, Plus, RotateCcw, Save, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import { getMealGroup, mealGroups } from "@/lib/mealSchedule";
import { logOperation } from "@/lib/operationLog";
import { addMealDays, canSelectSpecialStudent, nextMealSaturday, specialView, type SpecialAction, type SpecialDay, type SpecialRoster, type SpecialStudent, type SpecialView } from "@/lib/specialMeals";

type Menu = { id: string; name: string; vendor_id: string; price: number; is_active: boolean | null };
type Vendor = { id: string; name: string };
const field = "min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 disabled:opacity-50";
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40";
const messageOf = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "連線失敗，請稍後再試";
const labels: Record<SpecialAction, string> = { save: "儲存活動", add: "加入訂餐", cancel: "取消訂餐", restore: "恢復訂餐", menu: "變更餐點" };
const viewLabels = { available: "待加入", ordered: "已訂餐", cancelled: "已取消" };

function ConfirmChange({ action, count, date, menu, busy, onClose, onConfirm }: { action: SpecialAction; count: number; date: string; menu?: Menu; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} aria-labelledby="special-confirm-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-lg bg-white p-5 shadow-xl backdrop:bg-black/40">
    <h3 id="special-confirm-title" className="text-lg font-black">{labels[action]} · {count} 人</h3>
    <p className="mt-3 text-sm text-slate-600">{date}{action !== "cancel" && menu ? ` · ${menu.name} · 每份 $${menu.price}` : ""}</p>
    <p className="mt-3 text-sm text-slate-600">{action === "cancel" ? "只取消這一天的訂餐，保留紀錄，不更改固定訂餐。" : "只更新這一天的餐單，不會立即扣款或標記學生到班。"}</p>
    <div className="mt-5 flex justify-end gap-2"><button className={button} disabled={busy} onClick={onClose}>返回</button><button className={primary} disabled={busy} onClick={onConfirm}>{busy ? "儲存中..." : `確定${labels[action]}`}</button></div>
  </dialog>;
}

export default function SpecialMealsTab() {
  const today = getToday();
  const [date, setDate] = useState(() => nextMealSaturday(getToday()));
  const [title, setTitle] = useState("臨時到班");
  const [loaded, setLoaded] = useState<{ date: string; roster: SpecialRoster; error: string }>({ date: "", roster: { day: null, students: [] }, error: "" });
  const [days, setDays] = useState<SpecialDay[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [menuId, setMenuId] = useState("");
  const [view, setView] = useState<SpecialView>("available");
  const [group, setGroup] = useState("all");
  const [grade, setGrade] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [confirm, setConfirm] = useState<SpecialAction | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const loading = loaded.date !== date || refreshing;
  const students = loading ? [] : loaded.roster.students;
  const day = loaded.roster.day;
  const titleDirty = !loading && title !== (day?.title || "臨時到班");
  const writable = date >= today && date <= addMealDays(today, 180) && !busy && !loading && !loaded.error;
  const selection = new Set(selectedIds);
  const selectedStudents = students.filter((student) => selection.has(student.id));
  const selectedMenu = menus.find((menu) => menu.id === menuId && menu.is_active !== false && menu.price > 0);
  const grades = [...new Set(students.filter((student) => group === "all" || getMealGroup(student.grade) === group).map((student) => student.grade || "未分級"))];
  const visible = students.filter((student) => specialView(student) === view && (group === "all" || getMealGroup(student.grade) === group)
    && (!grade || (student.grade || "未分級") === grade) && `${student.name} ${student.grade}`.includes(search.trim()));
  const selectables = visible.filter((student) => canSelectSpecialStudent(student, view));
  const activeOrders = students.filter((student) => specialView(student) === "ordered");
  const totals = new Map<string, { label: string; quantity: number; amount: number }>();
  for (const student of activeOrders) {
    const menu = menus.find((item) => item.id === student.order?.meal_id);
    const mealGroup = getMealGroup(student.grade);
    const key = `${mealGroup}/${menu?.id || "missing"}`;
    const entry = totals.get(key) || { label: `${mealGroups.find((item) => item.value === mealGroup)?.label} · ${vendors.find((item) => item.id === menu?.vendor_id)?.name || "未設定商家"} · ${menu?.name || "缺餐點"}`, quantity: 0, amount: 0 };
    entry.quantity++; entry.amount += Number(menu?.price || 0); totals.set(key, entry);
  }
  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const [roster, menuRes, vendorRes, daysRes] = await Promise.all([
          supabase.rpc("get_special_meal_day", { p_date: date }),
          supabase.from("menus").select("id,name,vendor_id,price,is_active"),
          supabase.from("vendors").select("id,name").order("name"),
          supabase.from("special_meal_days").select("meal_date,title,version").order("meal_date", { ascending: false }).limit(200),
        ]);
        const failure = roster.error || menuRes.error || vendorRes.error || daysRes.error;
        if (failure) throw failure;
        if (!ignore) { const result = roster.data as SpecialRoster; setLoaded({ date, roster: result, error: "" }); setTitle(result.day?.title || "臨時到班"); setMenus(menuRes.data || []); setVendors(vendorRes.data || []); setDays(daysRes.data || []); }
      } catch (cause) { if (!ignore) setLoaded({ date, roster: { day: null, students: [] }, error: messageOf(cause) }); }
      finally { if (!ignore) setRefreshing(false); }
    };
    void load(); return () => { ignore = true; };
  }, [date, reload]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (titleDirty || selectedIds.length) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [titleDirty, selectedIds.length]);
  const changeDate = (value: string) => { if (value) { setDate(value); setSelectedIds([]); setError(""); setNotice(""); setSkipped([]); setView("available"); } };
  const refresh = () => { setRefreshing(true); setSelectedIds([]); setReload((value) => value + 1); };
  const update = async (action: SpecialAction) => {
    if (!writable || submitting.current) return;
    if (!title.trim()) { setError("請填寫活動名稱"); setConfirm(null); return; }
    submitting.current = true; setBusy(true); setError(""); setNotice(""); setSkipped([]);
    try {
      const { data, error: failure } = await supabase.rpc("update_special_meal_day", {
        p_date: date, p_title: title.trim(), p_expected_version: day?.version || 0, p_action: action,
        p_menu_id: action === "cancel" || action === "save" ? null : menuId,
        p_rows: action === "save" ? [] : selectedStudents.map((student) => ({ student_id: student.id, expected_order: student.order })),
      });
      if (failure) throw failure;
      setConfirm(null); setSkipped(data.skipped || []); setNotice(action === "save" ? "活動已儲存" : `${labels[action]}：已更新 ${data.changed} 人${data.skipped?.length ? `，略過 ${data.skipped.length} 人` : ""}`);
      if (action === "add" || action === "restore") setView("ordered");
      await logOperation({ action: "meal_order_dates_update", targetType: "special_meal_day", targetName: title.trim(), metadata: { date, action, changed: data.changed, skipped: data.skipped, student_ids: selectedStudents.map((student) => student.id) } });
      refresh();
    } catch (cause) { setConfirm(null); setError(messageOf(cause)); }
    finally { submitting.current = false; setBusy(false); }
  };
  const request = (action: SpecialAction, student?: SpecialStudent) => { if (student) setSelectedIds([student.id]); setConfirm(action); };

  return <section className="min-w-0 bg-white text-slate-800">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-5 sm:px-6"><div><p className="text-xs font-bold text-emerald-700">餐務管理</p><h2 className="mt-1 text-2xl font-black">假日／臨時訂餐</h2></div><a className={button} href="/admin?tab=orders">今日領餐與結算</a></header>
    <div className="space-y-4 border-b border-slate-200 px-5 py-4 sm:px-6">
      <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
        <label className="grid gap-1.5 text-sm font-bold">訂餐日期<input aria-label="臨時訂餐日期" type="date" max={addMealDays(today,180)} value={date} disabled={busy || titleDirty || !!selectedIds.length} onChange={(event) => changeDate(event.target.value)} className={field} /></label>
        <label className="grid gap-1.5 text-sm font-bold">活動名稱<input maxLength={80} value={title} disabled={!writable} onChange={(event) => setTitle(event.target.value)} placeholder="例如：週六模擬考" className={field} /></label>
        <button className={`${button} self-end`} disabled={!writable || (!titleDirty && !!day)} onClick={() => void update("save")}><Save size={16} />儲存活動</button>
      </div>
      <div className="flex flex-wrap items-center gap-2"><button className={button} disabled={busy || titleDirty || !!selectedIds.length} onClick={() => changeDate(nextMealSaturday(today))}><CalendarDays size={16} />本週六</button><select aria-label="開啟已儲存餐單" className={`${field} max-w-full flex-1 sm:flex-none sm:w-72`} value={days.some((item) => item.meal_date === date) ? date : ""} disabled={busy || titleDirty || !!selectedIds.length} onChange={(event) => changeDate(event.target.value)}><option value="">已儲存餐單</option>{days.map((item) => <option key={item.meal_date} value={item.meal_date}>{item.meal_date} · {item.title}</option>)}</select><button className={`${button} ml-auto`} title="重新整理" aria-label="重新整理臨時餐單" disabled={busy || titleDirty} onClick={refresh}><RotateCcw size={16} /></button></div>
      {(titleDirty || !!selectedIds.length) && <p className="text-sm text-amber-800">{titleDirty ? "活動名稱尚未儲存。" : ""}{selectedIds.length ? `已勾選 ${selectedIds.length} 人，完成操作或清除勾選後可切換日期。` : ""}</p>}
      {(error || loaded.error) && <p role="alert" className="text-sm font-bold text-red-700">{error || loaded.error}</p>}
      {notice && <p role="status" className="text-sm font-bold text-emerald-700">{notice}</p>}
      {!!skipped.length && <ul className="max-h-32 overflow-y-auto text-sm text-amber-800">{skipped.map((item,index) => <li key={index}>{item.name}：{item.reason}</li>)}</ul>}
    </div>
    {loading ? <p role="status" className="p-12 text-center text-slate-500">載入餐單中...</p> : !loaded.error && <>
      <div className="border-b border-slate-200 px-5 py-4 sm:px-6"><div className="flex flex-wrap gap-x-6 gap-y-2 text-sm"><span>已訂 <b className="text-xl text-blue-700">{activeOrders.length}</b> 份</span><span>已取消 <b>{students.filter((student) => specialView(student) === "cancelled").length}</b> 份</span><span>未領餐 <b>{activeOrders.filter((student) => !student.order?.received).length}</b> 份</span></div>{!!totals.size && <ul className="mt-3 divide-y divide-slate-100">{[...totals.entries()].map(([key, value]) => <li key={key} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="min-w-0 break-words">{value.label}</span><b>{value.quantity} 份</b></li>)}</ul>}</div>
      <div className="px-5 py-4 sm:px-6">
        <div role="tablist" aria-label="臨時訂餐名單" className="flex border-b border-slate-200">{(["available","ordered","cancelled"] as const).map((value) => <button key={value} role="tab" aria-selected={view === value} disabled={busy} onClick={() => { setView(value); setSelectedIds([]); }} className={`min-h-11 flex-1 border-b-2 px-2 text-sm font-bold ${view === value ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}>{viewLabels[value]} {students.filter((student) => specialView(student) === value).length}</button>)}</div>
        <div className="mt-4 flex flex-wrap gap-2">{[{value:"all",label:"全校"},...mealGroups].map((item) => <button key={item.value} aria-pressed={group === item.value} disabled={busy} onClick={() => { setGroup(item.value); setGrade(""); }} className={`${button} ${group === item.value ? "!border-blue-500 !bg-blue-50 !text-blue-700" : ""}`}>{item.label}</button>)}</div>
        <div className="mt-3 flex gap-2"><select aria-label="臨時訂餐年級" value={grade} disabled={busy} onChange={(event) => setGrade(event.target.value)} className={field}><option value="">全部年級</option>{grades.map((value) => <option key={value}>{value}</option>)}</select><label className="flex min-w-0 flex-1 items-center gap-2"><Search size={16} className="shrink-0 text-slate-400" /><input aria-label="搜尋臨時訂餐學生" placeholder="學生姓名" value={search} onChange={(event) => setSearch(event.target.value)} className={`${field} w-full`} /></label></div>
        {writable && <div className="mt-4 space-y-3 border-y border-slate-200 bg-slate-50 px-3 py-3">
          {view !== "cancelled" || selectedIds.length > 0 ? <div className="grid gap-2 sm:grid-cols-2"><select aria-label="臨時訂餐商家" value={vendorId} disabled={busy} onChange={(event) => { setVendorId(event.target.value); setMenuId(""); }} className={field}><option value="">選擇商家</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select><select aria-label="臨時訂餐餐點" value={menuId} disabled={busy || !vendorId} onChange={(event) => setMenuId(event.target.value)} className={field}><option value="">選擇餐點</option>{menus.filter((menu) => menu.vendor_id === vendorId && menu.is_active !== false && menu.price > 0).map((menu) => <option key={menu.id} value={menu.id}>{menu.name} · ${menu.price}</option>)}</select></div> : null}
          <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !selectables.length} onClick={() => setSelectedIds((ids) => [...new Set([...ids,...selectables.map((student) => student.id)])])}><Check size={16} />全選目前名單</button><button className={button} disabled={busy || !selectedIds.length} onClick={() => setSelectedIds([])}><X size={16} />清除勾選</button><span className="self-center text-sm font-bold">已選 {selectedIds.length} 人</span></div>
          <div className="flex flex-wrap gap-2">{view === "available" ? <button className={primary} disabled={busy || !selectedIds.length || !selectedMenu} onClick={() => request("add")}><Plus size={16} />加入訂餐（{selectedIds.length}）</button> : view === "cancelled" ? <button className={primary} disabled={busy || !selectedIds.length || !selectedMenu} onClick={() => request("restore")}><RotateCcw size={16} />恢復訂餐</button> : <><button className={primary} disabled={busy || !selectedIds.length || !selectedMenu} onClick={() => request("menu")}>變更所選餐點</button><button className={`${button} !text-red-700`} disabled={busy || !selectedIds.length} onClick={() => request("cancel")}>取消所選訂餐</button></>}</div>
        </div>}
        {date < today && <p className="mt-4 text-sm text-slate-500">歷史餐單唯讀</p>}
        <ul className="mt-2 divide-y divide-slate-200">{visible.map((student) => { const menu = menus.find((item) => item.id === student.order?.meal_id); const selectable = canSelectSpecialStudent(student,view); return <li key={student.id} className="flex items-center gap-3 py-3">
          <label className="flex min-w-0 flex-1 items-center gap-3"><input type="checkbox" aria-label={`選取${student.name}`} checked={selection.has(student.id)} disabled={!writable || !selectable} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids,student.id] : ids.filter((id) => id !== student.id))} className="h-5 w-5 shrink-0 accent-blue-600" /><span className="min-w-0"><span className="block break-words font-bold">{student.name}<span className="ml-2 text-xs font-normal text-slate-500">{student.grade || "未分級"}</span></span><span className="mt-1 block break-words text-xs text-slate-500">{student.order ? `${menu?.name || "缺餐點"}${menu ? ` · $${menu.price}` : ""} · ${student.order.special_meal ? "臨時" : "原有訂餐"}` : "尚未訂餐"}{student.absent ? " · 已請假停餐" : ""}{!student.active ? " · 已退班" : ""}{student.order?.charged ? " · 已扣款" : student.order?.received ? " · 已領餐" : ""}</span></span></label>
          {view === "ordered" && selectable && writable && <button className={`${button} shrink-0 !text-red-700`} aria-label={`取消${student.name}訂餐`} onClick={() => request("cancel",student)}>取消</button>}
        </li>; })}</ul>{!visible.length && <p className="py-12 text-center text-sm text-slate-500">沒有符合的學生</p>}
      </div>
    </>}
    {confirm && <ConfirmChange action={confirm} count={selectedIds.length} date={date} menu={selectedMenu} busy={busy} onClose={() => setConfirm(null)} onConfirm={() => void update(confirm)} />}
  </section>;
}
