"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  grade: string;
  balance: number;
};

type OrderRow = {
  id: string;
  student_id: string;
  order_date: string;
  received: boolean;
  charged: boolean;
  menus?: { name?: string; price?: number } | { name?: string; price?: number }[] | null;
};

type TransactionRow = {
  id: string;
  student_id: string;
  type: string;
  amount: number;
  balance_after: number;
  description?: string | null;
  created_at: string;
};

type StudentReport = {
  id: string;
  name: string;
  grade: string;
  balance: number;
  orderCount: number;
  receivedCount: number;
  chargedCount: number;
  mealCharge: number;
  topup: number;
  refund: number;
  adjustment: number;
  net: number;
};

const gradeOrder = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];

const getDefaultMonth = () => {
  const now = new Date();
  const taipei = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  return `${taipei.getFullYear()}-${String(taipei.getMonth() + 1).padStart(2, "0")}`;
};

const getMonthRange = (month: string) => {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(`${month}-01T00:00:00+08:00`);
  const end = new Date(Date.UTC(year, monthIndex, 0, 16, 0, 0));
  const firstDate = `${month}-01`;
  const lastDay = new Date(year, monthIndex, 0).getDate();

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    firstDate,
    lastDate: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
};

const formatCurrency = (value: number) => `$${Math.round(value).toLocaleString("zh-TW")}`;

export default function MonthlyReportTab() {
  const [month, setMonth] = useState(getDefaultMonth());
  const [students, setStudents] = useState<Student[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchReport();
  }, [month]);

  const fetchReport = async () => {
    setLoading(true);
    const range = getMonthRange(month);

    const [studentsRes, ordersRes, transactionsRes] = await Promise.all([
      supabase.from("students").select("id, name, grade, balance"),
      supabase
        .from("orders")
        .select("id, student_id, order_date, received, charged, menus(name, price)")
        .gte("order_date", range.firstDate)
        .lte("order_date", range.lastDate),
      supabase
        .from("transactions")
        .select("id, student_id, type, amount, balance_after, description, created_at")
        .gte("created_at", range.startIso)
        .lt("created_at", range.endIso)
        .order("created_at", { ascending: false }),
    ]);

    if (studentsRes.data) setStudents(studentsRes.data as Student[]);
    if (ordersRes.data) setOrders(ordersRes.data as OrderRow[]);
    if (transactionsRes.data) setTransactions(transactionsRes.data as TransactionRow[]);
    setLoading(false);
  };

  const studentReports = useMemo(() => {
    const studentMap = new Map(students.map((student) => [student.id, student]));
    const reportMap = new Map<string, StudentReport>();

    const ensureReport = (studentId: string) => {
      if (!reportMap.has(studentId)) {
        const student = studentMap.get(studentId);
        reportMap.set(studentId, {
          id: studentId,
          name: student?.name || "未知學生",
          grade: student?.grade || "未分級",
          balance: Number(student?.balance || 0),
          orderCount: 0,
          receivedCount: 0,
          chargedCount: 0,
          mealCharge: 0,
          topup: 0,
          refund: 0,
          adjustment: 0,
          net: 0,
        });
      }
      return reportMap.get(studentId)!;
    };

    orders.forEach((order) => {
      const report = ensureReport(order.student_id);
      report.orderCount += 1;
      if (order.received) report.receivedCount += 1;
      if (order.charged) report.chargedCount += 1;
    });

    transactions.forEach((tx) => {
      const report = ensureReport(tx.student_id);
      const amount = Number(tx.amount || 0);
      report.net += amount;

      if (tx.type === "order") report.mealCharge += Math.abs(amount);
      else if (tx.type === "topup") report.topup += amount;
      else if (tx.type === "refund") report.refund += amount;
      else if (tx.type === "adjustment") report.adjustment += amount;
    });

    return Array.from(reportMap.values()).sort((a, b) => {
      const gradeA = gradeOrder.indexOf(a.grade);
      const gradeB = gradeOrder.indexOf(b.grade);
      return (gradeA === -1 ? 99 : gradeA) - (gradeB === -1 ? 99 : gradeB) || a.name.localeCompare(b.name, "zh-TW");
    });
  }, [orders, students, transactions]);

  const summary = useMemo(() => {
    const mealCharge = transactions
      .filter((tx) => tx.type === "order")
      .reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
    const topup = transactions
      .filter((tx) => tx.type === "topup")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const refund = transactions
      .filter((tx) => tx.type === "refund")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const adjustment = transactions
      .filter((tx) => tx.type === "adjustment")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    return {
      students: studentReports.length,
      orders: orders.length,
      received: orders.filter((order) => order.received).length,
      chargedOrders: orders.filter((order) => order.charged).length,
      mealCharge,
      topup,
      refund,
      adjustment,
      currentBalance: students.reduce((sum, student) => sum + Number(student.balance || 0), 0),
    };
  }, [orders, studentReports.length, students, transactions]);

  const exportCsv = () => {
    const headers = ["月份", "年級", "學生", "訂餐", "領餐", "已扣款訂單", "餐費扣款", "儲值", "退款", "調帳", "本月淨變動", "目前餘額"];
    const rows = studentReports.map((report) => [
      month,
      report.grade,
      report.name,
      report.orderCount,
      report.receivedCount,
      report.chargedCount,
      report.mealCharge,
      report.topup,
      report.refund,
      report.adjustment,
      report.net,
      report.balance,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `monthly-report-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const cards = [
    { label: "本月訂餐", value: summary.orders, note: `領餐 ${summary.received} · 已扣款 ${summary.chargedOrders}`, tone: "blue" },
    { label: "餐費扣款", value: formatCurrency(summary.mealCharge), note: "以交易紀錄 order 計算", tone: "rose" },
    { label: "本月儲值", value: formatCurrency(summary.topup), note: "管理員與現金儲值", tone: "green" },
    { label: "退款 / 調帳", value: formatCurrency(summary.refund + summary.adjustment), note: `退款 ${formatCurrency(summary.refund)} · 調帳 ${formatCurrency(summary.adjustment)}`, tone: "amber" },
    { label: "目前總餘額", value: formatCurrency(summary.currentBalance), note: `${students.length} 位學生錢包`, tone: "slate" },
  ];

  const toneClass: Record<string, string> = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    rose: "border-rose-100 bg-rose-50 text-rose-700",
    green: "border-green-100 bg-green-50 text-green-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };

  return (
    <div className="app-card overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50/70 p-6 md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-blue-500">Monthly Report</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">月結報表</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">彙整每月訂餐、餐費扣款、儲值、退款與調帳</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="app-input px-4 py-3 text-base font-black"
            />
            <button onClick={fetchReport} disabled={loading} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:bg-slate-300">
              {loading ? "整理中..." : "重新整理"}
            </button>
            <button onClick={exportCsv} disabled={studentReports.length === 0} className="rounded-2xl bg-green-600 px-5 py-3 text-sm font-black text-white transition hover:bg-green-700 disabled:bg-slate-300">
              匯出 CSV
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 md:p-8">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => (
            <div key={card.label} className={`rounded-3xl border p-5 ${toneClass[card.tone]}`}>
              <p className="text-xs font-black">{card.label}</p>
              <p className="mt-2 text-3xl font-black tracking-tight">{card.value}</p>
              <p className="mt-1 text-xs font-bold opacity-70">{card.note}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
            <div>
              <h3 className="text-lg font-black text-slate-900">學生月結明細</h3>
              <p className="text-xs font-bold text-slate-500">只顯示本月有訂餐或交易的學生，共 {summary.students} 位</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-xs uppercase tracking-widest text-slate-400">
                  <th className="px-5 py-4 font-black">學生</th>
                  <th className="px-5 py-4 font-black">訂餐</th>
                  <th className="px-5 py-4 font-black">領餐</th>
                  <th className="px-5 py-4 font-black">扣款訂單</th>
                  <th className="px-5 py-4 font-black">餐費扣款</th>
                  <th className="px-5 py-4 font-black">儲值</th>
                  <th className="px-5 py-4 font-black">退款</th>
                  <th className="px-5 py-4 font-black">調帳</th>
                  <th className="px-5 py-4 font-black">淨變動</th>
                  <th className="px-5 py-4 font-black">目前餘額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-5 py-16 text-center text-sm font-bold text-slate-400">報表整理中...</td>
                  </tr>
                ) : studentReports.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-5 py-16 text-center text-sm font-bold text-slate-400">這個月份沒有訂餐或交易資料</td>
                  </tr>
                ) : (
                  studentReports.map((report) => (
                    <tr key={report.id} className="hover:bg-blue-50/40">
                      <td className="px-5 py-4">
                        <p className="font-black text-slate-900">{report.name}</p>
                        <p className="text-xs font-bold text-blue-500">{report.grade}</p>
                      </td>
                      <td className="px-5 py-4 font-black text-slate-700">{report.orderCount}</td>
                      <td className="px-5 py-4 font-black text-green-600">{report.receivedCount}</td>
                      <td className="px-5 py-4 font-black text-purple-600">{report.chargedCount}</td>
                      <td className="px-5 py-4 font-black text-rose-600">{formatCurrency(report.mealCharge)}</td>
                      <td className="px-5 py-4 font-black text-green-600">{formatCurrency(report.topup)}</td>
                      <td className="px-5 py-4 font-black text-blue-600">{formatCurrency(report.refund)}</td>
                      <td className={`px-5 py-4 font-black ${report.adjustment < 0 ? "text-rose-600" : "text-amber-600"}`}>{formatCurrency(report.adjustment)}</td>
                      <td className={`px-5 py-4 font-black ${report.net < 0 ? "text-rose-600" : "text-green-600"}`}>{formatCurrency(report.net)}</td>
                      <td className="px-5 py-4 font-black text-slate-900">{formatCurrency(report.balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
