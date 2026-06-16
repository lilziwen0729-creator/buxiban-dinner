"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type NotificationLog = {
  id: string;
  created_at: string;
  notification_type: string;
  channel: string;
  recipient_name: string | null;
  recipient_id: string | null;
  student_name: string | null;
  status: string;
  message: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
};

const typeLabels: Record<string, string> = {
  low_balance: "低餘額",
  arrived: "到班",
  homework_done: "作業完成",
  left: "離班",
  leave: "請假",
  settlement: "扣款",
};

const statusLabels: Record<string, string> = {
  sent: "成功",
  failed: "失敗",
  skipped: "略過",
};

const statusClass: Record<string, string> = {
  sent: "bg-green-50 text-green-600",
  failed: "bg-red-50 text-red-600",
  skipped: "bg-amber-50 text-amber-700",
};

export default function NotificationCenterTab() {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchLogs();
  }, [typeFilter, statusFilter]);

  const fetchLogs = async () => {
    setLoading(true);

    let query = supabase
      .from("notification_logs")
      .select("id, created_at, notification_type, channel, recipient_name, recipient_id, student_name, status, message, error_message, metadata")
      .order("created_at", { ascending: false })
      .limit(150);

    if (typeFilter !== "all") query = query.eq("notification_type", typeFilter);
    if (statusFilter !== "all") query = query.eq("status", statusFilter);

    const { data, error } = await query;

    if (error) {
      console.warn("讀取通知紀錄失敗:", error.message);
      setLoadError(error.message);
      setLogs([]);
    } else {
      setLoadError(null);
      setLogs((data || []) as NotificationLog[]);
    }

    setLoading(false);
  };

  const stats = useMemo(() => ({
    total: logs.length,
    sent: logs.filter((log) => log.status === "sent").length,
    failed: logs.filter((log) => log.status === "failed").length,
    skipped: logs.filter((log) => log.status === "skipped").length,
  }), [logs]);

  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] bg-slate-950 p-7 text-white shadow-xl shadow-slate-200">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold text-blue-200">Notification Center</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight">通知中心</h2>
            <p className="mt-2 text-sm font-bold text-slate-300">查看 LINE 通知成功、失敗與略過原因</p>
          </div>
          <button onClick={fetchLogs} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15">
            重新整理
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
          <p className="text-xs font-black text-blue-500">通知筆數</p>
          <p className="mt-2 text-3xl font-black text-blue-700">{stats.total}</p>
        </div>
        <div className="rounded-3xl border border-green-100 bg-green-50 p-5">
          <p className="text-xs font-black text-green-500">成功</p>
          <p className="mt-2 text-3xl font-black text-green-700">{stats.sent}</p>
        </div>
        <div className="rounded-3xl border border-red-100 bg-red-50 p-5">
          <p className="text-xs font-black text-red-500">失敗</p>
          <p className="mt-2 text-3xl font-black text-red-700">{stats.failed}</p>
        </div>
        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
          <p className="text-xs font-black text-amber-600">略過</p>
          <p className="mt-2 text-3xl font-black text-amber-700">{stats.skipped}</p>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">通知類型</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="app-input px-4 py-3 font-bold">
                <option value="all">全部</option>
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">狀態</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="app-input px-4 py-3 font-bold">
                <option value="all">全部</option>
                <option value="sent">成功</option>
                <option value="failed">失敗</option>
                <option value="skipped">略過</option>
              </select>
            </label>
            <button onClick={() => { setTypeFilter("all"); setStatusFilter("all"); }} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">
              清除篩選
            </button>
          </div>
        </div>

        <div className="min-h-[420px] overflow-x-auto">
          {loading ? (
            <div className="p-20 text-center font-bold text-slate-400">通知紀錄載入中...</div>
          ) : loadError ? (
            <div className="p-20 text-center font-bold text-red-500">
              通知紀錄讀取失敗：{loadError}
            </div>
          ) : logs.length === 0 ? (
            <div className="p-20 text-center font-bold text-slate-400">
              目前沒有通知紀錄。之後發送 LINE 通知、低餘額提醒或略過通知時，紀錄會出現在這裡。
            </div>
          ) : (
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-xs uppercase tracking-widest text-slate-400">
                  <th className="px-6 py-4 font-black">時間</th>
                  <th className="px-6 py-4 font-black">類型</th>
                  <th className="px-6 py-4 font-black">狀態</th>
                  <th className="px-6 py-4 font-black">學生</th>
                  <th className="px-6 py-4 font-black">對象</th>
                  <th className="px-6 py-4 font-black">訊息</th>
                  <th className="px-6 py-4 font-black">失敗原因</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="transition hover:bg-blue-50/50">
                    <td className="px-6 py-4 text-sm font-bold text-slate-500">
                      {new Date(log.created_at).toLocaleString("zh-TW")}
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-600">
                        {typeLabels[log.notification_type] || log.notification_type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass[log.status] || "bg-slate-100 text-slate-500"}`}>
                        {statusLabels[log.status] || log.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700">{log.student_name || "-"}</td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-500">{log.recipient_name || log.recipient_id || "-"}</td>
                    <td className="max-w-[22rem] px-6 py-4 text-xs font-bold text-slate-500">
                      <span className="line-clamp-3 whitespace-pre-line">{log.message || "-"}</span>
                    </td>
                    <td className="max-w-[18rem] px-6 py-4 text-xs font-bold text-red-500">
                      <span className="line-clamp-3">{log.error_message || "-"}</span>
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
