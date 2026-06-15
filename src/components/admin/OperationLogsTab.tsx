"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type OperationLog = {
  id: string;
  created_at: string;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_name: string | null;
  student_name: string | null;
  metadata: Record<string, unknown> | null;
};

const actionLabels: Record<string, string> = {
  student_topup: "學生儲值",
  student_adjust_balance: "手動調帳",
  student_create: "新增學生",
  student_update: "編輯學生",
  leave_create: "登記請假",
  order_cancel: "取消訂餐",
  order_mark_received: "標記領餐",
  orders_settle: "餐費結算",
  low_balance_notify: "低餘額通知",
};

export default function OperationLogsTab() {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const fetchLogs = async () => {
    setLoading(true);

    let query = supabase
      .from("operation_logs")
      .select("id, created_at, actor_name, action, target_type, target_name, student_name, metadata")
      .order("created_at", { ascending: false })
      .limit(120);

    if (actionFilter !== "all") {
      query = query.eq("action", actionFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.warn("讀取操作紀錄失敗:", error.message);
      setLogs([]);
    } else {
      setLogs((data || []) as OperationLog[]);
    }

    setLoading(false);
  };

  const actions = Object.keys(actionLabels);

  return (
    <div className="app-card overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50/70 p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-blue-500">Audit</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">操作紀錄</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">追蹤取消訂餐、儲值、調帳、通知與結算紀錄</p>
          </div>
          <button onClick={fetchLogs} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800">
            重新整理
          </button>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActionFilter("all")}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-black transition ${actionFilter === "all" ? "bg-blue-600 text-white" : "bg-white text-slate-500"}`}
          >
            全部
          </button>
          {actions.map((action) => (
            <button
              key={action}
              onClick={() => setActionFilter(action)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-black transition ${actionFilter === action ? "bg-blue-600 text-white" : "bg-white text-slate-500"}`}
            >
              {actionLabels[action]}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[420px] overflow-x-auto">
        {loading ? (
          <div className="p-20 text-center font-bold text-slate-400">操作紀錄載入中...</div>
        ) : logs.length === 0 ? (
          <div className="p-20 text-center font-bold text-slate-400">
            目前沒有紀錄。若剛建立功能，請先到 Supabase 執行 database/operation_logs.sql。
          </div>
        ) : (
          <table className="w-full min-w-[920px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-white text-xs uppercase tracking-widest text-slate-400">
                <th className="px-6 py-4 font-black">時間</th>
                <th className="px-6 py-4 font-black">動作</th>
                <th className="px-6 py-4 font-black">對象</th>
                <th className="px-6 py-4 font-black">學生</th>
                <th className="px-6 py-4 font-black">操作者</th>
                <th className="px-6 py-4 font-black">細節</th>
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
                      {actionLabels[log.action] || log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-700">{log.target_name || log.target_type || "-"}</td>
                  <td className="px-6 py-4 font-bold text-slate-700">{log.student_name || "-"}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-500">{log.actor_name || "未識別"}</td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-400">
                    {log.metadata ? JSON.stringify(log.metadata) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
