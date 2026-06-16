"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type LeaveRecord = {
  id: string;
  created_at: string;
  leave_date: string;
  student_id: string;
  student_name: string | null;
  source: string;
  reason: string | null;
  cancelled_order: boolean;
  refunded: boolean;
  refund_amount: number;
  kept_order: boolean;
  metadata: Record<string, unknown> | null;
};

const sourceLabels: Record<string, string> = {
  parent: "家長",
  admin: "管理員",
  teacher: "老師",
  system: "系統",
};

const getMonthStart = (monthOffset = 0) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function LeaveRecordsTab() {
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [fromDate, setFromDate] = useState(toDateInputValue(getMonthStart(0)));
  const [toDate, setToDate] = useState(toDateInputValue(new Date()));

  useEffect(() => {
    fetchRecords();
  }, [sourceFilter, fromDate, toDate]);

  const fetchRecords = async () => {
    setLoading(true);

    let query = supabase
      .from("leave_records")
      .select("*")
      .gte("leave_date", fromDate)
      .lte("leave_date", toDate)
      .order("leave_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (sourceFilter !== "all") {
      query = query.eq("source", sourceFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.warn("讀取請假紀錄失敗:", error.message);
      setLoadError(error.message);
      setRecords([]);
    } else {
      setLoadError(null);
      setRecords((data || []) as LeaveRecord[]);
    }

    setLoading(false);
  };

  const stats = useMemo(() => {
    const cancelled = records.filter((record) => record.cancelled_order).length;
    const kept = records.filter((record) => record.kept_order).length;
    const refunded = records.filter((record) => record.refunded).length;
    const refundAmount = records.reduce((sum, record) => sum + Number(record.refund_amount || 0), 0);

    return { total: records.length, cancelled, kept, refunded, refundAmount };
  }, [records]);

  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] bg-slate-950 p-7 text-white shadow-xl shadow-slate-200">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold text-amber-200">Leave Records</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight">請假紀錄</h2>
            <p className="mt-2 text-sm font-bold text-slate-300">追蹤請假來源、取消餐與退款狀態</p>
          </div>
          <button onClick={fetchRecords} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15">
            重新整理
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
          <p className="text-xs font-black text-blue-500">請假筆數</p>
          <p className="mt-2 text-3xl font-black text-blue-700">{stats.total}</p>
        </div>
        <div className="rounded-3xl border border-green-100 bg-green-50 p-5">
          <p className="text-xs font-black text-green-500">已取消餐</p>
          <p className="mt-2 text-3xl font-black text-green-700">{stats.cancelled}</p>
        </div>
        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
          <p className="text-xs font-black text-amber-600">保留餐</p>
          <p className="mt-2 text-3xl font-black text-amber-700">{stats.kept}</p>
        </div>
        <div className="rounded-3xl border border-purple-100 bg-purple-50 p-5">
          <p className="text-xs font-black text-purple-500">退款筆數</p>
          <p className="mt-2 text-3xl font-black text-purple-700">{stats.refunded}</p>
        </div>
        <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5">
          <p className="text-xs font-black text-rose-500">退款總額</p>
          <p className="mt-2 text-3xl font-black text-rose-700">${stats.refundAmount}</p>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">起始日期</span>
              <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="app-input px-4 py-3 font-bold" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">結束日期</span>
              <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="app-input px-4 py-3 font-bold" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">來源</span>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="app-input px-4 py-3 font-bold">
                <option value="all">全部</option>
                <option value="parent">家長</option>
                <option value="admin">管理員</option>
                <option value="teacher">老師</option>
                <option value="system">系統</option>
              </select>
            </label>
            <button onClick={() => { setFromDate(toDateInputValue(getMonthStart(0))); setToDate(toDateInputValue(new Date())); }} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">
              回本月
            </button>
          </div>
        </div>

        <div className="min-h-[420px] overflow-x-auto">
          {loading ? (
            <div className="p-20 text-center font-bold text-slate-400">請假紀錄載入中...</div>
          ) : loadError ? (
            <div className="p-20 text-center font-bold text-red-500">
              請假紀錄讀取失敗：{loadError}
            </div>
          ) : records.length === 0 ? (
            <div className="p-20 text-center font-bold text-slate-400">
              目前沒有請假紀錄。之後家長或後台登記請假時，紀錄會出現在這裡。
            </div>
          ) : (
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-xs uppercase tracking-widest text-slate-400">
                  <th className="px-6 py-4 font-black">請假日</th>
                  <th className="px-6 py-4 font-black">學生</th>
                  <th className="px-6 py-4 font-black">來源</th>
                  <th className="px-6 py-4 font-black">餐務</th>
                  <th className="px-6 py-4 font-black">退款</th>
                  <th className="px-6 py-4 font-black">原因/備註</th>
                  <th className="px-6 py-4 font-black">建立時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((record) => (
                  <tr key={record.id} className="transition hover:bg-amber-50/50">
                    <td className="px-6 py-4 font-black text-slate-800">{record.leave_date}</td>
                    <td className="px-6 py-4 font-black text-slate-800">{record.student_name || "未知學生"}</td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                        {sourceLabels[record.source] || record.source}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {record.cancelled_order ? (
                        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-600">已取消餐</span>
                      ) : record.kept_order ? (
                        <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-600">保留餐</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">無訂餐</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-600">
                      {record.refunded ? `$${record.refund_amount || 0}` : "-"}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-500">{record.reason || "-"}</td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-400">
                      {new Date(record.created_at).toLocaleString("zh-TW")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
