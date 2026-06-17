"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getTaipeiShortWeekday, getTaipeiWeekday, getToday } from "@/lib/date";
import { logOperation } from "@/lib/operationLog";

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
  dietaryRestrictions?: string | null;
  mealPreference?: string | null;
};

type Vendor = {
  id: string;
  name: string;
  phone?: string;
};

type TodayMeal = {
  name: string;
  price: number;
};

type SettlementResult = {
  orderId: string;
  studentName: string;
  amount: number;
  status: "charged" | "skipped" | "failed";
  reason?: string;
};

const normalizeWeekday = (value: string) =>
  value.normalize("NFKC").replace(/\s/g, "").replace(/周/g, "週");

export default function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [todayVendor, setTodayVendor] = useState<Vendor | null>(null);
  const [todayMeal, setTodayMeal] = useState<TodayMeal | null>(null);
  const [showUnreceived, setShowUnreceived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [generatingOrders, setGeneratingOrders] = useState(false);
  const [settlementResults, setSettlementResults] = useState<SettlementResult[]>([]);

  const grades = ["小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];

  useEffect(() => {
    refreshAll();
    const interval = setInterval(fetchData, 30000);
    const handleFocus = () => refreshAll();
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([fetchData(), fetchTodayMeal()]);
    setLoading(false);
  };

  const fetchData = async () => {
    const today = getToday();
    const [studentRes, orderRes] = await Promise.all([
      supabase.from("students").select("id, name, grade, enrollment_status"),
      supabase
        .from("orders")
        .select("id, student_id, meal_id, received, charged")
        .eq("order_date", today),
    ]);

    if (orderRes.data && studentRes.data) {
      const activeStudents = (studentRes.data || []).filter((student: any) => (student.enrollment_status || "active") === "active");
      const preferenceRes = await supabase
        .from("students")
        .select("id, dietary_restrictions, meal_preference, enrollment_status");
      const preferenceMap = new Map(
        (preferenceRes.data || []).filter((student: any) => (student.enrollment_status || "active") === "active").map((student: any) => [student.id, student])
      );
      const mealIds = Array.from(new Set(orderRes.data.map((order: any) => order.meal_id).filter(Boolean)));
      const { data: menuData } = mealIds.length > 0
        ? await supabase.from("menus").select("id, name, price").in("id", mealIds)
        : { data: [] };
      const menuMap = new Map((menuData || []).map((menu: any) => [menu.id, menu]));

      const merged = orderRes.data.map((order: any) => {
        const student = activeStudents.find((s: any) => s.id === order.student_id);
        const preference = preferenceMap.get(order.student_id) as any;
        const meal = order.meal_id ? menuMap.get(order.meal_id) : null;

        return {
          id: order.id,
          student_id: order.student_id,
          name: student?.name || "未知",
          grade: student?.grade || "",
          received: order.received || false,
          charged: order.charged || false,
          meal_id: order.meal_id || null,
          mealName: meal?.name || "",
          mealPrice: typeof meal?.price === "number" ? meal.price : null,
          dietaryRestrictions: preference?.dietary_restrictions || null,
          mealPreference: preference?.meal_preference || null,
        };
      });

      setOrders(merged.filter((order) => order.name !== "未知"));
    }
  };

  const fetchTodayMeal = async () => {
    const todayKey = getTaipeiWeekday();

    if (todayKey === "星期日" || todayKey === "星期六") {
      setTodayVendor(null);
      setTodayMeal(null);
      return;
    }

    const { data: schedule } = await supabase
      .from("weekly_schedule")
      .select("vendor_id, vendors(*), menus(name, price)")
      .eq("weekday", todayKey)
      .maybeSingle();

    const vendor = (schedule as any)?.vendors || null;
    const meal = (schedule as any)?.menus || null;
    setTodayVendor(vendor);
    setTodayMeal(meal ? { name: meal.name, price: meal.price } : null);
  };

  const markReceived = async (order: Order) => {
    if (!order.meal_id) {
      alert("這筆訂單缺少餐點資料，請先確認今日排餐或重新產生訂單。");
      return;
    }

    const { error } = await supabase
      .from("orders")
      .update({ received: true })
      .eq("id", order.id);

    if (error) {
      alert("標記領餐失敗：" + error.message);
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

  const cancelOrder = async (order: Order) => {
    if (order.received || order.charged) {
      alert("這筆訂單已領餐或已扣款，不建議直接取消。請改到領餐/帳務流程處理退款或修正。");
      return;
    }

    if (!confirm(`確定取消 ${order.name} 今日訂餐？\n取消後今日訂餐名單會移除此學生。`)) return;

    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", order.id);

    if (error) {
      alert("取消訂餐失敗：" + error.message);
      return;
    }

    await logOperation({
      action: "order_cancel",
      targetType: "order",
      targetId: order.id,
      targetName: `${order.grade} ${order.name}`,
      studentId: order.student_id,
      studentName: order.name,
      metadata: { meal_name: order.mealName, meal_price: order.mealPrice },
    });

    await fetchData();
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
        .select("weekday, menu_id")
        .not("menu_id", "is", null);

      if (scheduleError) throw scheduleError;

      const todaySchedule = (schedules || []).find(
        (schedule: any) => normalizeWeekday(schedule.weekday || "") === normalizeWeekday(todayKey)
      );

      if (!todaySchedule?.menu_id) {
        alert("今日尚未設定排餐，無法補產固定訂餐。");
        return;
      }

      const [studentRes, existingOrderRes] = await Promise.all([
        supabase
          .from("students")
          .select("id, name, grade, fixed_days_off, auto_order, enrollment_status")
          .eq("auto_order", true),
        supabase
          .from("orders")
          .select("student_id")
          .eq("order_date", today),
      ]);

      if (studentRes.error) throw studentRes.error;
      if (existingOrderRes.error) throw existingOrderRes.error;

      const existingIds = new Set((existingOrderRes.data || []).map((order: any) => order.student_id));
      const fixedStudents = (studentRes.data || []).filter((student: any) => {
        if ((student.enrollment_status || "active") !== "active") return false;
        const fixedDays = Array.isArray(student.fixed_days_off) ? student.fixed_days_off : [];
        return fixedDays.some((day: string) => normalizeWeekday(day) === normalizeWeekday(todayShortKey));
      });
      const newOrders = fixedStudents
        .filter((student: any) => !existingIds.has(student.id))
        .map((student: any) => ({
          student_id: student.id,
          order_date: today,
          ordered: true,
          cancelled: false,
          received: false,
          charged: false,
          meal_id: todaySchedule.menu_id,
        }));

      if (newOrders.length > 0) {
        const { error: insertError } = await supabase.from("orders").insert(newOrders);
        if (insertError) throw insertError;
      }

      await logOperation({
        action: "orders_generate",
        targetType: "orders",
        targetName: "補產今日固定訂餐",
        metadata: {
          date: today,
          weekday: todayShortKey,
          generated: newOrders.length,
          already_exists: fixedStudents.length - newOrders.length,
          fixed_students: fixedStudents.length,
        },
      });

      alert(`補產完成：新增 ${newOrders.length} 筆，已存在 ${fixedStudents.length - newOrders.length} 筆。`);
      await refreshAll();
    } catch (err: any) {
      alert("補產固定訂餐失敗：" + err.message);
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
      const { data: students, error: studentError } = await supabase
        .from("students")
        .select("id, balance")
        .in("id", pendingOrders.map((order) => order.student_id));

      if (studentError) throw studentError;

      const balanceMap = new Map((students || []).map((student: any) => [student.id, Number(student.balance || 0)]));

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

        if (!balanceMap.has(order.student_id)) {
          results.push({
            orderId: order.id,
            studentName: order.name,
            amount: 0,
            status: "skipped",
            reason: "找不到學生餘額",
          });
          continue;
        }

        const newBalance = Number(balanceMap.get(order.student_id) || 0) - mealPrice;

        try {
          const { error: balanceError } = await supabase
            .from("students")
            .update({ balance: newBalance })
            .eq("id", order.student_id);
          if (balanceError) throw balanceError;

          const { error: txError } = await supabase.from("transactions").insert([{
            student_id: order.student_id,
            type: "order",
            amount: -mealPrice,
            balance_after: newBalance,
            description: `今日餐費結算：${order.mealName || "今日餐點"}`,
          }]);
          if (txError) throw txError;

          const { error: orderError } = await supabase
            .from("orders")
            .update({ charged: true })
            .eq("id", order.id)
            .eq("charged", false);
          if (orderError) throw orderError;

          balanceMap.set(order.student_id, newBalance);
          results.push({
            orderId: order.id,
            studentName: order.name,
            amount: -mealPrice,
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

  const stats = useMemo(() => {
    const received = orders.filter((order) => order.received).length;
    const charged = orders.filter((order) => order.charged).length;
    const pendingSettlement = orders.filter((order) => order.received && !order.charged).length;
    const pendingAmount = orders
      .filter((order) => order.received && !order.charged && order.meal_id)
      .reduce((sum, order) => sum + Number(order.mealPrice || 0), 0);
    const missingMeal = orders.filter((order) => !order.meal_id).length;
    const preferenceCount = orders.filter((order) => order.dietaryRestrictions || order.mealPreference).length;

    return {
      total: orders.length,
      received,
      charged,
      pendingSettlement,
      pendingAmount,
      unreceived: orders.length - received,
      missingMeal,
      preferenceCount,
    };
  }, [orders]);

  const unreceivedOrders = useMemo(
    () => orders
      .filter((order) => !order.received)
      .sort((a, b) => `${a.grade}${a.name}`.localeCompare(`${b.grade}${b.name}`, "zh-TW")),
    [orders]
  );

  const renderGradeStats = (orderList: Order[]) => (
    <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-9">
      {grades.filter((grade) => grade !== "高一").map((grade) => {
        const gradeOrders = orderList.filter((order) => order.grade === grade);
        const total = gradeOrders.length;
        const received = gradeOrders.filter((order) => order.received).length;

        return (
          <div key={grade} className="rounded-2xl border border-white/20 bg-white/10 p-4 text-center shadow-sm backdrop-blur-sm">
            <p className="text-sm font-bold tracking-wider text-blue-200">{grade}</p>
            <p className="mt-1 text-2xl font-black">{received} <span className="text-sm font-normal">/ {total}</span></p>
            <p className="mt-1 text-xs font-bold text-yellow-300">未領 {total - received}</p>
          </div>
        );
      })}
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

                <div className="flex flex-wrap gap-2">
                  {!order.received && (
                    <button onClick={() => markReceived(order)} className="rounded-xl bg-green-500 px-4 py-2 text-sm font-black text-white shadow-md transition hover:bg-green-600">
                      標記已領
                    </button>
                  )}
                  <button
                    onClick={() => cancelOrder(order)}
                    className={`rounded-xl px-4 py-2 text-sm font-black shadow-md transition ${
                      order.received || order.charged
                        ? "bg-slate-600 text-slate-300"
                        : "bg-red-500 text-white hover:bg-red-600"
                    }`}
                  >
                    取消
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    });

  return (
    <div className="relative overflow-hidden rounded-[2.5rem] bg-[#0f172a] p-6 text-white shadow-2xl animate-in fade-in duration-500 md:p-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-4xl font-black">今日訂餐</h2>
          <p className="mt-2 text-lg font-bold text-slate-400">總計 {stats.total} 份餐點</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={generateTodayFixedOrders}
            disabled={generatingOrders || loading}
            className="rounded-2xl bg-blue-500 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-600 disabled:bg-slate-600 disabled:text-slate-300"
          >
            {generatingOrders ? "補產中..." : "補產固定訂餐"}
          </button>
          <button onClick={refreshAll} disabled={loading} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15 disabled:text-slate-400">
            {loading ? "同步中..." : "重新整理"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-6">
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

      <div className="mt-6 rounded-2xl border border-blue-500/30 bg-blue-600/20 p-6">
        <p className="mb-1 text-sm font-black uppercase tracking-widest text-blue-300">今日供餐資訊</p>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
          <div>
            <p className="text-3xl font-black text-white">{todayVendor?.name || "未設定店家"}</p>
            <p className="mt-1 text-blue-200">{todayVendor?.phone || "尚無電話"}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-xs font-black text-blue-200">今日餐點</p>
            <p className="mt-1 text-xl font-black">{todayMeal ? `${todayMeal.name} · $${todayMeal.price}` : "未設定排餐"}</p>
          </div>
        </div>
      </div>

      {renderGradeStats(orders)}

      {stats.missingMeal > 0 && (
        <div className="mt-8 rounded-2xl border border-red-400/40 bg-red-500/15 p-5 text-red-100">
          <h3 className="text-lg font-black">有訂單缺少餐點資料</h3>
          <p className="mt-1 text-sm font-bold">請先確認今日排餐，缺餐點的訂單不會允許直接標記已領，避免後續扣款錯誤。</p>
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-purple-400/30 bg-purple-500/10 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-purple-200">Settlement</p>
            <h3 className="mt-1 text-xl font-black text-white">今日餐費結算</h3>
            <p className="mt-1 text-sm font-bold text-purple-100">
              已領未扣款 {stats.pendingSettlement} 筆，預估扣款 ${stats.pendingAmount}
            </p>
          </div>
          <button
            onClick={settleTodayOrders}
            disabled={settling || stats.pendingSettlement === 0}
            className="rounded-2xl bg-purple-500 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:bg-purple-600 disabled:bg-slate-600 disabled:text-slate-300"
          >
            {settling ? "結算中..." : "立即結算今日餐費"}
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
          <button onClick={() => setShowUnreceived(!showUnreceived)} className="flex w-full items-center justify-between px-6 py-5 text-left text-xl font-black transition hover:bg-yellow-300">
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

      <div className="mt-10">{renderOrdersByGrade(orders)}</div>
    </div>
  );
}
