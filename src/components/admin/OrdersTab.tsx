"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getTaipeiShortWeekday, getTaipeiWeekday, getToday } from "@/lib/date";
import { logOperation } from "@/lib/operationLog";
import OrderCancellationDialog from "./OrderCancellationDialog";
import type { CancellationResult } from "@/lib/orderCancellation";
import { getMealOrderCandidates } from "@/lib/mealOrderPlanning";
import { findMealSchedule, getGroupMealPlan, getMealGroup, mealGroups, planMealOrders, type MealGroup } from "@/lib/mealSchedule";

type Order = {
  id: string;
  student_id: string;
  name: string;
  grade: string;
  received: boolean;
  charged: boolean;
  meal_id: string | null;
  mealName: string;
  mealPrice: number | null;
  mealVendor: string;
  dietaryRestrictions?: string | null;
  mealPreference?: string | null;
};

type GroupSupply = { group: MealGroup; vendor: string; phone: string; meal: string; price: number | null };

type SettlementResult = {
  orderId: string;
  studentName: string;
  amount: number;
  status: "charged" | "skipped" | "failed";
  reason?: string;
};

const defaultGrades = ["小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三"];

const getOrderStats = (orders: Order[]) => {
  const received = orders.filter((order) => order.received).length;
  const pendingOrders = orders.filter((order) => order.received && !order.charged);
  return {
    total: orders.length,
    received,
    unreceived: orders.length - received,
    missingMeal: orders.filter((order) => !order.meal_id).length,
    pendingSettlement: pendingOrders.length,
    pendingAmount: pendingOrders.filter((order) => order.meal_id)
      .reduce((sum, order) => sum + Number(order.mealPrice || 0), 0),
    preferenceCount: orders.filter((order) => order.dietaryRestrictions || order.mealPreference).length,
  };
};

export default function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [supplies, setSupplies] = useState<GroupSupply[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<MealGroup | "all">("all");
  const [loadError, setLoadError] = useState("");
  const [showUnreceived, setShowUnreceived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [generatingOrders, setGeneratingOrders] = useState(false);
  const [settlementResults, setSettlementResults] = useState<SettlementResult[]>([]);
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [selectedGrade, setSelectedGrade] = useState("all");

  const fetchData = useCallback(async () => {
    const today = getToday();
    const [studentRes, orderRes] = await Promise.all([
      supabase.from("students").select("id, name, grade, enrollment_status, dietary_restrictions, meal_preference"),
      supabase
        .from("orders")
        .select("id, student_id, meal_id, received, charged")
        .or("cancelled.eq.false,cancelled.is.null")
        .eq("order_date", today),
    ]);
    if (studentRes.error) throw studentRes.error;
    if (orderRes.error) throw orderRes.error;

    if (orderRes.data && studentRes.data) {
      const activeStudents = (studentRes.data || []).filter((student: any) => (student.enrollment_status || "active") === "active");
      const preferenceMap = new Map(
        activeStudents.map((student: any) => [student.id, student])
      );
      const mealIds = Array.from(new Set(orderRes.data.map((order: any) => order.meal_id).filter(Boolean)));
      const { data: menuData, error: menuError } = mealIds.length > 0
        ? await supabase.from("menus").select("id, name, price, vendors(name)").in("id", mealIds)
        : { data: [], error: null };
      if (menuError) throw menuError;
      const menuMap = new Map((menuData || []).map((menu: any) => [menu.id, menu]));

      const merged = orderRes.data.map((order: any) => {
        const student = activeStudents.find((s: any) => s.id === order.student_id);
        const preference = preferenceMap.get(order.student_id) as any;
        const meal = order.meal_id ? menuMap.get(order.meal_id) : null;

        return {
          id: order.id,
          student_id: order.student_id,
          name: student?.name || "未知",
          grade: student?.grade?.trim() || "未分級",
          received: order.received || false,
          charged: order.charged || false,
          meal_id: order.meal_id || null,
          mealName: meal?.name || "",
          mealPrice: typeof meal?.price === "number" ? meal.price : null,
          mealVendor: meal?.vendors?.name || "未設定商家",
          dietaryRestrictions: preference?.dietary_restrictions || null,
          mealPreference: preference?.meal_preference || null,
        };
      });

      setOrders(merged.filter((order) => order.name !== "未知"));
    }
  }, []);

  const fetchTodayMeal = useCallback(async () => {
    const todayKey = getTaipeiWeekday();

    if (todayKey === "星期日" || todayKey === "星期六") {
      setSupplies([]);
      return;
    }

    const [scheduleRes, vendorRes, menuRes] = await Promise.all([
      supabase.from("weekly_schedule").select("*"),
      supabase.from("vendors").select("id,name,phone"),
      supabase.from("menus").select("id,name,price"),
    ]);
    if (scheduleRes.error) throw scheduleRes.error;
    if (vendorRes.error) throw vendorRes.error;
    if (menuRes.error) throw menuRes.error;
    const schedule = findMealSchedule(scheduleRes.data || [], todayKey);
    setSupplies(mealGroups.map(({ value }) => {
      const plan = getGroupMealPlan(schedule, value);
      const vendor = vendorRes.data?.find((item) => item.id === plan.vendor_id);
      const menu = menuRes.data?.find((item) => item.id === plan.menu_id);
      return { group: value, vendor: vendor?.name || "未設定商家", phone: vendor?.phone || "", meal: menu?.name || "未設定排餐", price: menu?.price ?? null };
    }));
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchData(), fetchTodayMeal()]);
      setLoadError("");
    } catch (error) {
      console.error("讀取今日訂餐資料失敗", error);
      setLoadError("讀取訂餐資料失敗，請重新整理後再操作。");
    } finally {
      setLoading(false);
    }
  }, [fetchData, fetchTodayMeal]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refreshAll(), 0);
    const interval = window.setInterval(() => void fetchData().catch(() => setLoadError("訂餐名單更新失敗，請重新整理。")), 30000);
    const handleFocus = () => void refreshAll();
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchData, refreshAll]);

  const markReceived = async (order: Order) => {
    if (!order.meal_id) {
      alert("這筆訂單缺少餐點資料，請先確認今日排餐或重新產生訂單。");
      return;
    }

    const { data: updated, error } = await supabase
      .from("orders")
      .update({ received: true })
      .or("cancelled.eq.false,cancelled.is.null")
      .eq("id", order.id)
      .select("id");

    if (error) {
      alert("標記領餐失敗：" + error.message);
      return;
    }

    if (!updated?.length) {
      alert("這筆訂餐已取消或不存在，請確認重新整理後的名單。");
      await fetchData();
      return;
    }

    await logOperation({
      action: "order_mark_received",
      targetType: "order",
      targetId: order.id,
      targetName: `${order.grade} ${order.name}`,
      studentId: order.student_id,
      studentName: order.name,
      metadata: { meal_name: order.mealName, meal_price: order.mealPrice },
    });

    await fetchData();
  };

  const handleOrderCancelled = async (result: CancellationResult) => {
    const order = cancellingOrder;
    if (!order) return;
    setOrders((current) => current.filter((item) => item.id !== order.id));
    setSettlementResults((current) => current.filter((item) => item.orderId !== order.id));
    if (result.status === "cancelled") await logOperation({
      action: "order_cancel",
      targetType: "order",
      targetId: order.id,
      targetName: `${order.grade} ${order.name}`,
      studentId: order.student_id,
      studentName: order.name,
      metadata: { meal_name: order.mealName, refund_amount: result.refund_amount,
        balance_after: result.balance_after, manual_refund: result.manual_refund },
    });
    if (result.refund_amount > 0) alert(`已取消 ${order.name} 的訂餐，餐費餘額已退回 $${result.refund_amount}。`);
    try { await fetchData(); }
    catch { alert("取消已完成，但名單同步失敗，請重新整理。"); }
  };

  const generateTodayFixedOrders = async () => {
    const today = getToday();
    const todayKey = getTaipeiWeekday();
    const todayShortKey = getTaipeiShortWeekday();

    if (todayKey === "星期日" || todayKey === "星期六") {
      alert("今天是假日，不會自動產生固定訂餐。");
      return;
    }

    setGeneratingOrders(true);

    try {
      const { data: schedules, error: scheduleError } = await supabase
        .from("weekly_schedule")
        .select("*");

      if (scheduleError) throw scheduleError;

      const todaySchedule = findMealSchedule(schedules || [], todayKey);

      if (!todaySchedule) {
        alert("今日尚未設定排餐，無法補產訂餐。");
        return;
      }

      const { eligibleStudents } = await getMealOrderCandidates(today, todayShortKey);
      const { orders: orderCandidates, missing } = planMealOrders(eligibleStudents, todaySchedule, today);

      let generatedCount = 0;
      if (orderCandidates.length > 0) {
        const { data: insertedOrders, error: insertError } = await supabase
          .from("orders")
          .upsert(orderCandidates, {
            onConflict: "student_id,order_date",
            ignoreDuplicates: true,
          })
          .select("student_id");
        if (insertError) throw insertError;
        generatedCount = insertedOrders?.length || 0;
      }

      const alreadyExistsCount = orderCandidates.length - generatedCount;

      await logOperation({
        action: "orders_generate",
        targetType: "orders",
        targetName: "補產今日訂餐",
        metadata: {
          date: today,
          weekday: todayShortKey,
          generated: generatedCount,
          already_exists: alreadyExistsCount,
          eligible_students: eligibleStudents.length,
          missing_schedule: missing.length,
        },
      });

      alert(`補產完成：新增 ${generatedCount} 筆，已存在 ${alreadyExistsCount} 筆。${missing.length ? `\n${missing.length} 位學生的年級尚未設定排餐，已略過，未套用其他組別的餐點。` : ""}`);
      await refreshAll();
    } catch (err: any) {
      alert("補產今日訂餐失敗：" + err.message);
    } finally {
      setGeneratingOrders(false);
    }
  };

  const settleTodayOrders = async () => {
    const pendingOrders = orders.filter((order) => order.received && !order.charged);
    const validOrders = pendingOrders.filter((order) => order.meal_id && Number(order.mealPrice || 0) > 0);
    const totalAmount = validOrders.reduce((sum, order) => sum + Number(order.mealPrice || 0), 0);

    if (pendingOrders.length === 0) {
      alert("目前沒有已領但未扣款的訂單。");
      return;
    }

    if (!confirm(`準備結算 ${validOrders.length} 筆餐費，總金額 $${totalAmount}。\n缺餐點或價格異常的訂單會略過。確定執行？`)) return;

    setSettling(true);
    const results: SettlementResult[] = [];

    try {
      for (const order of pendingOrders) {
        const mealPrice = Number(order.mealPrice || 0);

        if (!order.meal_id || mealPrice <= 0) {
          results.push({
            orderId: order.id,
            studentName: order.name,
            amount: 0,
            status: "skipped",
            reason: "缺少餐點或價格",
          });
          continue;
        }

        try {
          const { data, error } = await supabase.rpc("settle_order_atomic", {
            p_order_id: order.id,
          });
          if (error) {
            if (error.message.includes("settle_order_atomic")) {
              throw new Error("請先到 Supabase 執行 database/accounting_atomic.sql");
            }
            throw error;
          }

          const result = (data || {}) as {
            status?: "charged" | "skipped";
            amount?: number;
            reason?: string;
          };

          if (result.status !== "charged") {
            results.push({
              orderId: order.id,
              studentName: order.name,
              amount: 0,
              status: "skipped",
              reason: result.reason || "訂單未扣款",
            });
            continue;
          }

          results.push({
            orderId: order.id,
            studentName: order.name,
            amount: Number(result.amount ?? -mealPrice),
            status: "charged",
          });
        } catch (err: any) {
          results.push({
            orderId: order.id,
            studentName: order.name,
            amount: -mealPrice,
            status: "failed",
            reason: err.message,
          });
        }
      }

      setSettlementResults(results);
      const charged = results.filter((result) => result.status === "charged").length;
      const skipped = results.filter((result) => result.status === "skipped").length;
      const failed = results.filter((result) => result.status === "failed").length;
      await logOperation({
        action: "orders_settle",
        targetType: "orders",
        targetName: "今日餐費結算",
        metadata: {
          charged,
          skipped,
          failed,
          total: results.length,
          amount: results
            .filter((result) => result.status === "charged")
            .reduce((sum, result) => sum + Math.abs(result.amount), 0),
        },
      });
      alert(`結算完成：成功 ${charged} 筆，略過 ${skipped} 筆，失敗 ${failed} 筆。`);
      await refreshAll();
    } catch (err: any) {
      alert("結算失敗：" + err.message);
    } finally {
      setSettling(false);
    }
  };

  const visibleOrders = useMemo(
    () => orders.filter((order) => (selectedGrade === "all" || order.grade === selectedGrade)
      && (selectedGroup === "all" || getMealGroup(order.grade) === selectedGroup)),
    [orders, selectedGrade, selectedGroup]
  );
  const stats = useMemo(() => getOrderStats(visibleOrders), [visibleOrders]);
  const schoolStats = useMemo(() => getOrderStats(orders), [orders]);
  const grades = useMemo(() => [
    ...defaultGrades,
    ...Array.from(new Set(orders.map((order) => order.grade)))
      .filter((grade) => grade && !defaultGrades.includes(grade))
      .sort((a, b) => a.localeCompare(b, "zh-TW")),
  ], [orders]);
  const filterLabel = selectedGrade !== "all" ? selectedGrade : selectedGroup === "all" ? "全校" : mealGroups.find((group) => group.value === selectedGroup)!.label;
  const shownGroups = mealGroups.filter((group) => (selectedGroup === "all" || group.value === selectedGroup)
    && (selectedGrade === "all" || getMealGroup(selectedGrade) === group.value)
    && (group.value !== "other" || orders.some((order) => getMealGroup(order.grade) === "other")));
  const gradeStats = useMemo(() => new Map(grades.map((grade) => [
    grade, getOrderStats(orders.filter((order) => order.grade === grade)),
  ])), [grades, orders]);

  const unreceivedOrders = useMemo(
    () => visibleOrders
      .filter((order) => !order.received)
      .sort((a, b) => `${a.grade}${a.name}`.localeCompare(`${b.grade}${b.name}`, "zh-TW")),
    [visibleOrders]
  );

  const renderGradeFilter = () => (
    <div className="mt-5 border-y border-white/15 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-white">年級篩選</h3>
        <span className="text-xs font-bold text-slate-400">{filterLabel} · {stats.total} 份</span>
      </div>
      <div role="group" aria-label="學段篩選" className="mb-3 flex flex-wrap gap-2">
        {[{ value: "all", label: "全校" }, ...mealGroups.filter((group) => group.value !== "other" || orders.some((order) => getMealGroup(order.grade) === "other"))].map((group) => (
          <button key={group.value} type="button" aria-pressed={selectedGroup === group.value} onClick={() => { setSelectedGroup(group.value as MealGroup | "all"); setSelectedGrade("all"); }} className={`rounded-md border px-4 py-2 text-sm font-bold ${selectedGroup === group.value ? "border-emerald-300 bg-emerald-600 text-white" : "border-white/20 bg-white/5 text-slate-200"}`}>
            {group.label} · {orders.filter((order) => group.value === "all" || getMealGroup(order.grade) === group.value).length} 份
          </button>
        ))}
      </div>
      <div role="group" aria-label="年級篩選" className="grid grid-cols-3 gap-2 sm:grid-cols-5 2xl:grid-cols-10">
        {[{ grade: "all", label: "全部年級", count: orders.filter((order) => selectedGroup === "all" || getMealGroup(order.grade) === selectedGroup).length }, ...grades.filter((grade) => selectedGroup === "all" || getMealGroup(grade) === selectedGroup).map((grade) => ({
          grade, label: grade, count: gradeStats.get(grade)?.total || 0,
        }))].map(({ grade, label, count }) => (
          <button type="button" key={grade} aria-pressed={selectedGrade === grade} onClick={() => setSelectedGrade(grade)}
            className={`min-h-14 min-w-0 rounded-md border px-2 py-2 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${selectedGrade === grade ? "border-blue-300 bg-blue-500 text-white shadow-sm" : "border-white/15 bg-white/5 text-slate-200 hover:border-white/40 hover:bg-white/10"}`}>
            <span className="block text-sm font-black">{label}</span>
            <span className={`mt-0.5 block text-xs font-bold ${selectedGrade === grade ? "text-blue-50" : "text-slate-400"}`}>{count} 份</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderOrdersByGrade = (orderList: Order[]) =>
    grades.map((grade) => {
      const gradeOrders = orderList
        .filter((order) => order.grade === grade)
        .sort((a, b) => a.name.localeCompare(b.name, "zh-TW"));

      if (gradeOrders.length === 0) return null;

      return (
        <div key={grade} className="mb-6">
          <h3 className="mb-3 inline-block border-b border-blue-800 pb-2 text-xl font-bold text-blue-300">{grade}（{gradeOrders.length}）</h3>
          <div className="space-y-2">
            {gradeOrders.map((order) => (
              <div
                key={order.id}
                className={`flex flex-col gap-3 rounded-xl border p-4 transition md:flex-row md:items-center md:justify-between ${
                  !order.meal_id
                    ? "border-red-400/50 bg-red-500/15"
                    : order.received
                      ? "border-green-400/30 bg-green-500/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-black text-white">{order.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-black ${order.received ? "bg-green-400/20 text-green-200" : "bg-yellow-400/20 text-yellow-200"}`}>
                      {order.received ? "已領" : "未領"}
                    </span>
                    {order.charged && <span className="rounded-full bg-blue-400/20 px-2 py-0.5 text-xs font-black text-blue-200">已扣款</span>}
                    {!order.meal_id && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-black text-white">缺餐點</span>}
                  </div>
                  <p className="mt-1 text-sm font-bold text-slate-300">
                    {order.mealName ? `${order.mealName}${order.mealPrice !== null ? ` · $${order.mealPrice}` : ""}` : "尚未連到餐點資料"}
                  </p>
                  {(order.mealPreference || order.dietaryRestrictions) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {order.mealPreference && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-black text-emerald-100">偏好：{order.mealPreference}</span>}
                      {order.dietaryRestrictions && <span className="rounded-full bg-orange-400/20 px-2 py-0.5 text-xs font-black text-orange-100">禁忌：{order.dietaryRestrictions}</span>}
                    </div>
                  )}
                </div>

                <div className="flex w-full flex-wrap gap-2 md:w-auto">
                  {!order.received && (
                    <button onClick={() => markReceived(order)} className="min-h-11 flex-1 rounded-xl bg-green-500 px-4 py-2 text-sm font-black text-white shadow-md transition hover:bg-green-600 md:flex-none">
                      標記已領
                    </button>
                  )}
                  <button
                    onClick={() => setCancellingOrder(order)}
                    disabled={settling}
                    aria-label={`取消 ${order.name} 的訂餐`}
                    className="min-h-11 flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-black text-white shadow-md transition hover:bg-red-600 disabled:opacity-50 md:flex-none"
                  >
                    {order.charged ? "取消／退款" : "取消"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    });

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#0f172a] p-4 text-white shadow-2xl animate-in fade-in duration-500 sm:p-6 lg:p-8">
      {cancellingOrder && <OrderCancellationDialog key={cancellingOrder.id} order={cancellingOrder}
        onClose={() => setCancellingOrder(null)} onCancelled={handleOrderCancelled} />}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-black sm:text-3xl">今日訂餐</h2>
          <p className="mt-1 text-sm font-bold text-slate-400 sm:text-base">{filterLabel} {stats.total} 份餐點{filterLabel !== "全校" && ` · 全校 ${schoolStats.total} 份`}</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button
            onClick={generateTodayFixedOrders}
            disabled={generatingOrders || loading}
            className="app-button bg-blue-500 text-white hover:bg-blue-600 disabled:bg-slate-600 disabled:text-slate-300"
          >
            {generatingOrders ? "補產中..." : "補產全校訂餐"}
          </button>
          <button onClick={refreshAll} disabled={loading} className="app-button bg-white/10 text-white hover:bg-white/15 disabled:text-slate-400">
            {loading ? "同步中..." : "重新整理"}
          </button>
        </div>
      </div>

      {renderGradeFilter()}
      {loadError && <p role="alert" className="mt-4 border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100">{loadError}</p>}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
          <p className="text-xs font-black text-blue-200">總份數</p>
          <p className="mt-1 text-3xl font-black">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-green-400/20 bg-green-500/10 p-4">
          <p className="text-xs font-black text-green-200">已領餐</p>
          <p className="mt-1 text-3xl font-black text-green-300">{stats.received}</p>
        </div>
        <div className="rounded-2xl border border-yellow-400/20 bg-yellow-500/10 p-4">
          <p className="text-xs font-black text-yellow-200">未領餐</p>
          <p className="mt-1 text-3xl font-black text-yellow-300">{stats.unreceived}</p>
        </div>
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4">
          <p className="text-xs font-black text-red-200">缺餐點</p>
          <p className="mt-1 text-3xl font-black text-red-300">{stats.missingMeal}</p>
        </div>
        <div className="rounded-2xl border border-purple-400/20 bg-purple-500/10 p-4">
          <p className="text-xs font-black text-purple-200">待扣款</p>
          <p className="mt-1 text-3xl font-black text-purple-200">{stats.pendingSettlement}</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
          <p className="text-xs font-black text-emerald-200">餐點提醒</p>
          <p className="mt-1 text-3xl font-black text-emerald-200">{stats.preferenceCount}</p>
        </div>
      </div>

      <section aria-label="分組供餐資訊" className="mt-6 border-y border-white/15 py-5">
        <h3 className="mb-4 text-base font-black text-white">國小／國中供餐明細</h3>
        <div className="grid gap-6 lg:grid-cols-2">{shownGroups.map((group) => {
          const supply = supplies.find((item) => item.group === group.value);
          const groupOrders = visibleOrders.filter((order) => getMealGroup(order.grade) === group.value);
          const items = new Map<string, { name: string; vendor: string; price: number | null; count: number; received: number }>();
          groupOrders.forEach((order) => {
            const key = order.meal_id || "missing";
            const item = items.get(key) || { name: order.mealName || "缺餐點", vendor: order.mealVendor, price: order.mealPrice, count: 0, received: 0 };
            item.count++; if (order.received) item.received++; items.set(key, item);
          });
          return <div key={group.value} className="min-w-0" aria-label={`${group.label}供餐明細`}>
            <div className="flex items-baseline justify-between gap-3"><h4 className={`text-lg font-black ${group.value === "primary" ? "text-blue-200" : "text-emerald-200"}`}>{group.label}</h4><span className="text-sm font-bold">{groupOrders.length} 份</span></div>
            <p className="mt-2 break-words text-sm text-slate-300">預設：{supply?.vendor || "未設定商家"} · {supply?.meal || "未設定排餐"}{supply?.price != null ? ` · $${supply.price}` : ""}</p>
            {supply?.phone && <p className="mt-1 text-xs text-slate-400">{supply.phone}</p>}
            <div className="mt-3 divide-y divide-white/10">{[...items.entries()].map(([id, item]) => <div key={id} className="flex items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-0"><p className="break-words font-bold">{item.name}{item.price !== null ? ` · $${item.price}` : ""}</p><p className="mt-1 break-words text-xs text-slate-400">{item.vendor}</p></div>
              <div className="shrink-0 text-right"><p className="font-black">{item.count} 份</p><p className="mt-1 text-xs text-slate-400">已領 {item.received} · 未領 {item.count - item.received}</p></div>
            </div>)}{!items.size && <p className="py-3 text-sm text-slate-400">目前沒有訂餐</p>}</div>
          </div>;
        })}</div>
      </section>

      {schoolStats.missingMeal > 0 && (
        <div className="mt-8 rounded-2xl border border-red-400/40 bg-red-500/15 p-5 text-red-100">
          <h3 className="text-lg font-black">全校有 {schoolStats.missingMeal} 筆訂單缺少餐點資料</h3>
          <p className="mt-1 text-sm font-bold">請先確認今日排餐，缺餐點的訂單不會允許直接標記已領，避免後續扣款錯誤。</p>
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-purple-400/30 bg-purple-500/10 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-purple-200">Settlement</p>
            <h3 className="mt-1 text-xl font-black text-white">全校今日餐費結算</h3>
            <p className="mt-1 text-sm font-bold text-purple-100">
              已領未扣款 {schoolStats.pendingSettlement} 筆，預估扣款 ${schoolStats.pendingAmount}
            </p>
          </div>
          <button
            onClick={settleTodayOrders}
            disabled={settling || schoolStats.pendingSettlement === 0}
            className="app-button w-full bg-purple-500 text-white shadow-lg hover:bg-purple-600 disabled:bg-slate-600 disabled:text-slate-300 md:w-auto"
          >
            {settling ? "結算中..." : "結算全校餐費"}
          </button>
        </div>

        {settlementResults.length > 0 && (
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {settlementResults.slice(0, 12).map((result) => (
              <div key={result.orderId} className="rounded-xl bg-white/10 p-3 text-sm font-bold">
                <div className="flex items-center justify-between gap-3">
                  <span>{result.studentName}</span>
                  <span className={
                    result.status === "charged"
                      ? "text-green-200"
                      : result.status === "skipped"
                        ? "text-yellow-200"
                        : "text-red-200"
                  }>
                    {result.status === "charged" ? "已扣款" : result.status === "skipped" ? "略過" : "失敗"}
                  </span>
                </div>
                {result.reason && <p className="mt-1 text-xs text-slate-300">{result.reason}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {unreceivedOrders.length > 0 && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-yellow-500 bg-yellow-400 text-slate-900 shadow-lg">
          <button onClick={() => setShowUnreceived(!showUnreceived)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-4 text-left text-base font-black transition hover:bg-yellow-300 sm:px-6 sm:text-lg">
            <span>尚未領餐名單（{unreceivedOrders.length} 人）</span>
            <span>{showUnreceived ? "收起" : "展開"}</span>
          </button>
          {showUnreceived && (
            <div className="px-6 pb-6 pt-2">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {unreceivedOrders.map((order) => (
                  <div key={order.id} className="rounded-xl bg-white/90 p-3 font-bold shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-black">{order.grade}｜{order.name}</p>
                        <p className={`mt-1 text-xs ${order.meal_id ? "text-slate-500" : "text-red-600"}`}>
                          {order.mealName || "缺餐點資料"}
                        </p>
                        {(order.mealPreference || order.dietaryRestrictions) && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {order.mealPreference && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-700">偏好：{order.mealPreference}</span>}
                            {order.dietaryRestrictions && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-black text-orange-700">禁忌：{order.dietaryRestrictions}</span>}
                          </div>
                        )}
                      </div>
                      <button onClick={() => markReceived(order)} className="shrink-0 rounded-lg bg-green-600 px-3 py-2 text-xs font-black text-white transition hover:bg-green-700">
                        已領
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-10">
        {visibleOrders.length === 0 && <p className="rounded-lg border border-white/20 bg-white/5 px-4 py-8 text-center text-sm font-bold text-slate-300">{filterLabel} 今天沒有訂餐紀錄。</p>}
        {renderOrdersByGrade(visibleOrders)}
      </div>
    </div>
  );
}
