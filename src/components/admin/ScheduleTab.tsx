"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getTaipeiWeekday } from "@/lib/date";
import { findMealSchedule, getGroupMealPlan, mealGroups, mealWeekdays, type MealGroup, type MealPlan, type MealSchedule } from "@/lib/mealSchedule";

type Vendor = { id: string; name: string };
type MenuItem = { id: string; vendor_id: string; name: string; price: number; is_active?: boolean };
type Plans = Record<string, Record<MealGroup, MealPlan>>;
const buildPlans = (rows: MealSchedule[]): Plans => Object.fromEntries(mealWeekdays.map((day) => [day,
  Object.fromEntries(mealGroups.map((group) => [group.value, getGroupMealPlan(findMealSchedule(rows, day), group.value)])),
])) as Plans;
const messageOf = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "連線失敗，請稍後再試";

export default function ScheduleTab() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [plans, setPlans] = useState<Plans>(() => buildPlans([]));
  const [saved, setSaved] = useState<Plans>(() => buildPlans([]));
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [syncToday, setSyncToday] = useState(true);
  const [showOther, setShowOther] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const changes = mealWeekdays.flatMap((day) => mealGroups.flatMap(({ value }) => {
    const current = plans[day][value];
    const original = saved[day][value];
    return current.menu_id === original.menu_id && current.vendor_id === original.vendor_id ? [] : [{
      weekday: day, meal_group: value, ...current, expected_menu_id: original.menu_id, expected_vendor_id: original.vendor_id,
    }];
  }));

  const fetchData = async () => {
    const [vendorRes, menuRes, scheduleRes, schemaRes] = await Promise.all([
      supabase.from("vendors").select("id, name").order("created_at"),
      supabase.from("menus").select("id, vendor_id, name, price, is_active"),
      supabase.from("weekly_schedule").select("*"),
      supabase.from("weekly_schedule").select("primary_menu_id,junior_menu_id").limit(1),
    ]);
    if (vendorRes.error) throw vendorRes.error;
    if (menuRes.error) throw menuRes.error;
    if (scheduleRes.error) throw scheduleRes.error;
    setVendors(vendorRes.data || []);
    setMenus(menuRes.data || []);
    const next = buildPlans(scheduleRes.data || []);
    setPlans(next); setSaved(next); setReady(!schemaRes.error);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData().catch((cause) => setError(messageOf(cause))).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!changes.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changes.length]);

  const updatePlan = (day: string, group: MealGroup, value: MealPlan) => {
    setPlans((current) => ({ ...current, [day]: { ...current[day], [group]: value } }));
    setNotice(""); setError("");
  };

  const save = async () => {
    if (!ready || isSaving || !changes.length) return;
    if (changes.some((row) => Boolean(row.vendor_id) !== Boolean(row.menu_id))) {
      setError("請為選取的商家選擇餐點，或將商家清空。"); return;
    }
    if (syncToday && changes.some((row) => row.weekday === getTaipeiWeekday())
      && !confirm("會同步更換今日受影響組別中，尚未領餐且未扣款的訂單餐點。已領餐、已扣款及已取消的訂單保持不變。確定儲存？")) return;
    setIsSaving(true); setError(""); setNotice("");
    try {
      const { data, error: saveError } = await supabase.rpc("save_grouped_meal_schedule", { p_rows: changes, p_sync_today: syncToday });
      if (saveError) throw saveError;
      setSaved(plans);
      setNotice(`排餐已儲存，更新 ${data?.changed || 0} 項設定；今日同步 ${data?.synced_orders || 0} 筆未領餐訂單。`);
      try { await fetchData(); }
      catch { setError("儲存已完成，但重新讀取失敗，請重新整理頁面。"); }
    } catch (cause) {
      setError(`儲存失敗：${messageOf(cause)}`);
    } finally { setIsSaving(false); }
  };

  const renderPlan = (day: string, group: MealGroup) => {
    const plan = plans[day][group];
    const label = mealGroups.find((item) => item.value === group)!.label;
    const selectedMenu = menus.find((menu) => menu.id === plan.menu_id);
    return <div className="min-w-0 space-y-2">
      <label className={`block text-sm font-black ${group === "primary" ? "text-blue-700" : group === "junior" ? "text-emerald-700" : "text-slate-600"}`}>{label}</label>
      <div className={`grid min-w-0 gap-2 ${group === "other" ? "" : "2xl:grid-cols-2"}`}>
      <select aria-label={`${day}${label}商家`} value={plan.vendor_id || ""} onChange={(event) => updatePlan(day, group, { vendor_id: event.target.value || null, menu_id: null })} disabled={!ready || isSaving} className="app-input min-w-0 px-3 py-2.5 text-sm">
        <option value="">未安排商家</option>
        {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
      </select>
      <select aria-label={`${day}${label}餐點`} value={plan.menu_id || ""} onChange={(event) => updatePlan(day, group, { ...plan, menu_id: event.target.value || null })} disabled={!ready || isSaving || !plan.vendor_id} className="app-input min-w-0 px-3 py-2.5 text-sm disabled:opacity-50">
        <option value="">選擇餐點</option>
        {menus.filter((menu) => menu.vendor_id === plan.vendor_id && (menu.is_active !== false || menu.id === plan.menu_id)).map((menu) => <option key={menu.id} value={menu.id}>{menu.name} (${menu.price}){menu.is_active === false ? " · 已停用" : ""}</option>)}
      </select>
      </div>
      <p className="min-h-5 text-xs text-slate-500">{selectedMenu ? `每份 $${selectedMenu.price}` : "尚未指定餐點"}</p>
    </div>;
  };

  return <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5 sm:p-6">
      <h2 className="text-xl font-black text-slate-900">國小／國中每週排餐</h2>
      <button type="button" disabled={!ready || isSaving || loading} onClick={() => {
        if (!confirm("將國小整週的商家與餐點複製到國中設定？儲存後才會生效。")) return;
        setPlans((current) => Object.fromEntries(mealWeekdays.map((day) => [day, { ...current[day], junior: { ...current[day].primary } }])));
        setNotice(""); setError("");
      }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">國中整週同國小</button>
    </header>
    {loading ? <p role="status" className="p-10 text-center text-slate-500">排餐讀取中...</p> : <>
      {!ready && <p role="alert" className="border-b border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">分組排餐尚未完成資料庫更新，目前暫停儲存；原本訂餐仍照常運作。</p>}
      <div className="divide-y divide-slate-200">{mealWeekdays.map((day) => <div key={day} className={`grid min-w-0 gap-4 p-5 sm:p-6 md:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] ${day === getTaipeiWeekday() ? "bg-blue-50/30" : ""}`}>
        <div className="flex items-center justify-between gap-3 md:block"><h3 className="text-base font-black text-slate-800">{day}</h3>{day === getTaipeiWeekday() && <span className="mt-1 text-xs font-bold text-blue-600">今天</span>}
          <button type="button" disabled={!ready || isSaving} onClick={() => updatePlan(day, "junior", { ...plans[day].primary })} className="mt-2 block text-xs font-bold text-slate-500 hover:text-blue-700 disabled:opacity-40">國中同國小</button>
        </div>
        {renderPlan(day, "primary")}{renderPlan(day, "junior")}
      </div>)}</div>
      <details open={showOther} onToggle={(event) => setShowOther(event.currentTarget.open)} className="border-t border-slate-200 p-5 sm:p-6">
        <summary className="cursor-pointer text-sm font-bold text-slate-600">其他年級／未分級排餐</summary>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{mealWeekdays.map((day) => <div key={day} className="min-w-0"><h3 className="mb-2 text-sm font-black text-slate-700">{day}</h3>{renderPlan(day, "other")}</div>)}</div>
      </details>
      <footer className="space-y-4 border-t border-slate-200 bg-slate-50 px-5 py-5 sm:px-6">
        <label className="flex items-start gap-2 text-sm font-bold text-slate-600"><input type="checkbox" checked={syncToday} disabled={isSaving} onChange={(event) => setSyncToday(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />同步今日尚未領餐且未扣款的訂單</label>
        {error && <p role="alert" className="text-sm font-bold text-red-600">{error}</p>}
        {notice && <p role="status" className="text-sm font-bold text-emerald-700">{notice}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-slate-500">{changes.length ? `${changes.length} 項設定尚未儲存` : "沒有未儲存的變更"}</span><button type="button" onClick={save} disabled={!ready || isSaving || !changes.length} className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400">{isSaving ? "儲存中..." : "儲存排餐設定"}</button></div>
      </footer>
    </>}
  </section>;
}
