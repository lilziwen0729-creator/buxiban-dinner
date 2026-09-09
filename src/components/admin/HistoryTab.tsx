"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getToday } from "@/lib/date";
import { logOperation } from "@/lib/operationLog";
import { supabase } from "@/lib/supabase";

type HistoryOrder = {
  id: string;
  student_id: string;
  name: string;
  grade: string;
  received: boolean;
  charged: boolean;
  chargedAmount: number | null;
  mealId: string | null;
  mealName: string;
  mealPrice: number | null;
};

type SettlementResponse = {
  status?: "charged" | "skipped";
  amount?: number;
  balance_after?: number;
  reason?: string;
};

const grades = ["小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "請稍後再試";

const settleOrder = async (orderId: string) => {
  const { data, error } = await supabase.rpc("settle_order_atomic", {
    p_order_id: orderId,
  });
  if (error) {
    if (error.message.includes("settle_order_atomic")) {
      throw new Error("扣款功能尚未安裝，請先執行 database/accounting_atomic.sql");
    }
    throw error;
  }
  return (data || {}) as SettlementResponse;
};

export default function HistoryTab() {
  const [historyOrders, setHistoryOrders] = useState<HistoryOrder[]>([]);
  const [historyDate, setHistoryDate] = useState(getToday());
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [chargingOrderId, setChargingOrderId] = useState<string | null>(null);
  const [batchCharging, setBatchCharging] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");

    try {
      const [studentRes, orderRes] = await Promise.all([
        supabase.from("students").select("id, name, grade"),
        supabase
          .from("orders")
          .select("id, student_id, meal_id, received, charged, charged_amount")
          .eq("order_date", historyDate)
          .or("cancelled.eq.false,cancelled.is.null"),
      ]);

      if (studentRes.error) throw studentRes.error;
      if (orderRes.error) throw orderRes.error;

      const students = studentRes.data || [];
      const orders = orderRes.data || [];
      const studentMap = new Map(students.map((student) => [student.id, student]));
      const mealIds = Array.from(new Set(
        orders.map((order) => order.meal_id).filter((id): id is string => Boolean(id))
      ));
      const menuRes = mealIds.length > 0
        ? await supabase.from("menus").select("id, name, price").in("id", mealIds)
        : { data: [], error: null };

      if (menuRes.error) throw menuRes.error;

      const menuMap = new Map((menuRes.data || []).map((meal) => [meal.id, meal]));
      const merged: HistoryOrder[] = orders.map((order) => {
        const student = studentMap.get(order.student_id);
        const meal = order.meal_id ? menuMap.get(order.meal_id) : null;

        return {
          id: order.id,
          student_id: order.student_id,
          name: student?.name || "未知學生",
          grade: student?.grade || "未設定",
          received: Boolean(order.received),
          charged: Boolean(order.charged),
          chargedAmount: order.charged_amount === null || order.charged_amount === undefined
            ? null
            : Number(order.charged_amount),
          mealId: order.meal_id || null,
          mealName: meal?.name || "",
          mealPrice: meal?.price === null || meal?.price === undefined ? null : Number(meal.price),
        };
      });

      setHistoryOrders(merged);
    } catch (error) {
      console.error("讀取歷史訂單失敗", error);
      setHistoryOrders([]);
      setLoadError("歷史訂單載入失敗：" + errorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [historyDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchHistory]);

  const stats = useMemo(() => {
    const received = historyOrders.filter((order) => order.received).length;
    const charged = historyOrders.filter((order) => order.charged).length;
    const pending = historyOrders.filter((order) => order.received && !order.charged);

    return {
      total: historyOrders.length,
      received,
      charged,
      pending: pending.length,
      pendingAmount: pending.reduce((sum, order) => sum + Number(order.mealPrice || 0), 0),
    };
  }, [historyOrders]);

  const chargeableOrders = useMemo(
    () => historyOrders.filter(
      (order) => order.received && !order.charged && Boolean(order.mealId) && Number(order.mealPrice || 0) > 0
    ),
    [historyOrders]
  );

  const chargeHistoricalOrder = async (order: HistoryOrder) => {
    if (order.charged) {
      alert("這筆訂單已經扣款，不會再次扣除。");
      return;
    }
    if (!order.received) {
      alert("這筆訂單尚未標記領餐，不能補扣餐費。");
      return;
    }
    if (!order.mealId || !order.mealPrice || order.mealPrice <= 0) {
      alert("這筆訂單缺少餐點或價格，請先確認排餐資料。");
      return;
    }

    const confirmed = window.confirm(
      "確定補扣 " + order.grade + " " + order.name + " 的餐費嗎？\n" +
      "日期：" + historyDate + "\n餐點：" + order.mealName + "\n扣款金額：$" + order.mealPrice +
      "\n\n系統會再次檢查扣款狀態，已扣過的訂單不會重複扣款。"
    );
    if (!confirmed) return;

    setChargingOrderId(order.id);
    setSuccessMessage("");

    try {
      const result = await settleOrder(order.id);
      if (result.status !== "charged") {
        alert("未執行扣款：" + (result.reason || "訂單狀態已變更"));
        await fetchHistory();
        return;
      }

      const chargedAmount = Math.abs(Number(result.amount ?? order.mealPrice));
      await logOperation({
        action: "order_charge_retry",
        targetType: "order",
        targetId: order.id,
        targetName: historyDate + " " + order.grade + " " + order.name,
        studentId: order.student_id,
        studentName: order.name,
        metadata: {
          date: historyDate,
          meal_name: order.mealName,
          amount: chargedAmount,
          balance_after: result.balance_after,
          source: "history",
        },
      });

      setSuccessMessage(
        order.name + " 已補扣 $" + chargedAmount + "，目前餘額 $" + Number(result.balance_after || 0) + "。"
      );
      await fetchHistory();
    } catch (error) {
      alert("補扣餐費失敗：" + errorMessage(error));
    } finally {
      setChargingOrderId(null);
    }
  };

  const chargeAllHistoricalOrders = async () => {
    if (chargeableOrders.length === 0) return;

    const totalAmount = chargeableOrders.reduce((sum, order) => sum + Number(order.mealPrice || 0), 0);
    const invalidCount = stats.pending - chargeableOrders.length;
    const confirmed = window.confirm(
      "確定補扣 " + historyDate + " 的全部漏扣餐費嗎？\n" +
      "可補扣：" + chargeableOrders.length + " 筆\n預估金額：$" + totalAmount +
      (invalidCount > 0 ? "\n另有 " + invalidCount + " 筆因缺少餐點或價格將不處理。" : "") +
      "\n\n每筆訂單都會再次檢查，已扣過的訂單不會重複扣款。"
    );
    if (!confirmed) return;

    setBatchCharging(true);
    setSuccessMessage("");
    let charged = 0;
    let skipped = 0;
    let failed = 0;
    let chargedAmount = 0;

    try {
      for (const order of chargeableOrders) {
        try {
          const result = await settleOrder(order.id);
          if (result.status === "charged") {
            charged += 1;
            chargedAmount += Math.abs(Number(result.amount ?? order.mealPrice ?? 0));
          } else {
            skipped += 1;
          }
        } catch (error) {
          console.error("歷史訂單批次補扣失敗", order.id, error);
          failed += 1;
        }
      }

      await logOperation({
        action: "order_charge_retry",
        targetType: "orders",
        targetName: historyDate + " 歷史訂單批次補扣",
        metadata: {
          date: historyDate,
          charged,
          skipped,
          failed,
          amount: chargedAmount,
          source: "history_batch",
        },
      });

      setSuccessMessage(
        "當日補扣完成：成功 " + charged + " 筆，共 $" + chargedAmount +
        "；略過 " + skipped + " 筆，失敗 " + failed + " 筆。"
      );
      await fetchHistory();
    } finally {
      setBatchCharging(false);
    }
  };

  const orderedGrades = useMemo(() => {
    const extras = historyOrders.map((order) => order.grade).filter((grade) => !grades.includes(grade));
    return [...grades, ...Array.from(new Set(extras))];
  }, [historyOrders]);

  const summaryCards = [
    { label: "總訂餐", value: stats.total, detail: "份", tone: "text-white" },
    { label: "已領餐", value: stats.received, detail: "份", tone: "text-emerald-300" },
    { label: "已扣款", value: stats.charged, detail: "筆", tone: "text-blue-300" },
    { label: "待補扣", value: stats.pending, detail: "筆 · $" + stats.pendingAmount, tone: "text-amber-300" },
  ];

  return (
    <div className="animate-in fade-in duration-500">
      <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-2xl">
        <div className="border-b border-white/10 p-5 sm:p-7 lg:p-9">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-blue-300">Order History</p>
              <h2 className="mt-1 text-2xl font-black sm:text-3xl">歷史訂單</h2>
              <p className="mt-2 text-sm font-bold text-slate-400">查看領餐與扣款狀態，並補扣當天遺漏的餐費。</p>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end lg:w-auto">
              <label className="w-full lg:w-72">
                <span className="mb-2 block text-xs font-black text-slate-400">訂單日期</span>
                <input
                  type="date"
                  max={getToday()}
                  value={historyDate}
                  onChange={(event) => {
                    setHistoryDate(event.target.value);
                    setSuccessMessage("");
                  }}
                  className="min-h-12 w-full rounded-xl border border-white/15 bg-white px-4 py-3 font-black text-slate-950 outline-none focus:ring-4 focus:ring-blue-500/30"
                />
              </label>
              <button
                onClick={() => void chargeAllHistoricalOrders()}
                disabled={batchCharging || chargingOrderId !== null || isLoading || chargeableOrders.length === 0}
                className="min-h-12 rounded-xl bg-amber-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
              >
                {batchCharging ? "批次補扣中..." : "補扣當日全部 (" + chargeableOrders.length + ")"}
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {summaryCards.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-black text-slate-400">{item.label}</p>
                <p className={"mt-1 text-2xl font-black " + item.tone}>
                  {item.value} <span className="text-xs font-bold text-slate-400">{item.detail}</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 sm:p-7 lg:p-9">
          {successMessage && (
            <div role="status" className="mb-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm font-black text-emerald-200">
              {successMessage}
            </div>
          )}

          {loadError ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-center">
              <p className="font-black text-red-200">{loadError}</p>
              <button onClick={() => void fetchHistory()} className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950">
                重新載入
              </button>
            </div>
          ) : isLoading ? (
            <div className="py-20 text-center text-sm font-bold text-slate-400">資料載入中...</div>
          ) : historyOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 py-20 text-center text-sm font-bold text-slate-500">
              此日期沒有訂餐資料
            </div>
          ) : (
            <div className="space-y-7">
              {orderedGrades.map((grade) => {
                const gradeOrders = historyOrders
                  .filter((order) => order.grade === grade)
                  .sort((a, b) => a.name.localeCompare(b.name, "zh-TW"));
                if (gradeOrders.length === 0) return null;

                return (
                  <section key={grade}>
                    <div className="mb-3 flex items-center gap-3">
                      <h3 className="text-lg font-black text-blue-300">{grade}</h3>
                      <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-black text-slate-300">{gradeOrders.length} 份</span>
                    </div>
                    <div className="space-y-2">
                      {gradeOrders.map((order) => {
                        const canCharge = order.received && !order.charged && Boolean(order.mealId) && Number(order.mealPrice || 0) > 0;
                        const isCharging = chargingOrderId === order.id;
                        const displayAmount = order.charged ? order.chargedAmount ?? order.mealPrice : order.mealPrice;

                        return (
                          <div key={order.id} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-base font-black text-white">{order.name}</p>
                                <span className={"rounded-full px-2 py-0.5 text-xs font-black " + (order.received ? "bg-emerald-400/15 text-emerald-200" : "bg-slate-400/15 text-slate-300")}>
                                  {order.received ? "已領餐" : "未領餐"}
                                </span>
                                <span className={"rounded-full px-2 py-0.5 text-xs font-black " + (order.charged ? "bg-blue-400/15 text-blue-200" : "bg-amber-400/15 text-amber-200")}>
                                  {order.charged ? "已扣款" : "未扣款"}
                                </span>
                              </div>
                              <p className={"mt-1 text-sm font-bold " + (order.mealId && order.mealPrice ? "text-slate-400" : "text-red-300")}>
                                {order.mealName || "缺少餐點資料"}
                                {displayAmount !== null ? " · $" + displayAmount : ""}
                              </p>
                              {!order.received && !order.charged && (
                                <p className="mt-1 text-xs font-bold text-slate-500">尚未領餐，不會開放補扣。</p>
                              )}
                            </div>

                            {canCharge && (
                              <button
                                onClick={() => void chargeHistoricalOrder(order)}
                                disabled={chargingOrderId !== null || batchCharging}
                                className="min-h-11 w-full shrink-0 rounded-xl bg-amber-400 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-50 sm:w-auto"
                              >
                                {isCharging ? "補扣中..." : "補扣餐費 $" + order.mealPrice}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
