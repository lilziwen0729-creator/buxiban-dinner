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
  orders_generate: "補產固定訂餐",
  order_mark_received: "標記領餐",
  orders_settle: "餐費結算",
  admin_task_create: "新增行政待辦",
  admin_task_update: "更新行政待辦",
  admin_task_complete: "完成行政待辦",
  admin_task_delete: "刪除行政待辦",
  course_create: "新增課程",
  course_update: "編輯課程",
  course_delete: "刪除課程",
  course_roster_export: "匯出課程名冊",
  course_roster_print: "列印課程名冊",
  question_generate: "AI 產生題目",
  question_create: "新增題目",
  question_update: "編輯題目",
  question_delete: "刪除題目",
  low_balance_notify: "低餘額通知",
};

const actionGroups = [
  { id: "all", label: "全部", description: "所有操作", actions: [] },
  { id: "student", label: "學生資料", description: "新增、編輯、儲值、調帳", actions: ["student_topup", "student_adjust_balance", "student_create", "student_update"] },
  { id: "meal", label: "訂餐餐費", description: "訂餐、領餐、結算", actions: ["orders_generate", "order_cancel", "order_mark_received", "orders_settle"] },
  { id: "attendance", label: "出缺席", description: "請假與到離班相關", actions: ["leave_create"] },
  { id: "admin", label: "行政待辦", description: "櫃台提醒事項", actions: ["admin_task_create", "admin_task_update", "admin_task_complete", "admin_task_delete"] },
  { id: "course", label: "課程排班", description: "課程新增、調整與名冊", actions: ["course_create", "course_update", "course_delete", "course_roster_export", "course_roster_print"] },
  { id: "question", label: "題庫", description: "AI 產題、新增與調整", actions: ["question_generate", "question_create", "question_update", "question_delete"] },
  { id: "notification", label: "通知", description: "LINE 與餘額通知", actions: ["low_balance_notify"] },
];

const metadataLabels: Record<string, string> = {
  date: "日期",
  weekday: "星期",
  generated: "新增",
  already_exists: "已存在",
  fixed_students: "固定訂餐",
  total: "總數",
  amount: "金額",
  charged: "已扣款",
  skipped: "略過",
  failed: "失敗",
  count: "題數",
  subject: "科目",
  grade: "年級",
  unit: "單元",
  difficulty: "難度",
  question_type: "題型",
  students: "學生數",
  format: "格式",
};

const formatMetadataValue = (value: unknown) => {
  if (Array.isArray(value)) return value.join("、");
  if (typeof value === "boolean") return value ? "是" : "否";
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
};

export default function OperationLogsTab() {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("all");

  useEffect(() => {
    fetchLogs();
  }, [groupFilter]);

  const fetchLogs = async () => {
    setLoading(true);

    let query = supabase
      .from("operation_logs")
      .select("id, created_at, actor_name, action, target_type, target_name, student_name, metadata")
      .order("created_at", { ascending: false })
      .limit(120);

    const selectedGroup = actionGroups.find((group) => group.id === groupFilter);
    if (selectedGroup && selectedGroup.actions.length > 0) {
      query = query.in("action", selectedGroup.actions);
    }

    const { data, error } = await query;

    if (error) {
      console.warn("讀取操作紀錄失敗:", error.message);
      setLoadError(error.message);
      setLogs([]);
    } else {
      setLoadError(null);
      setLogs((data || []) as OperationLog[]);
    }

    setLoading(false);
  };

  return (
    <div className="app-card overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50/70 p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-blue-500">Audit</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">操作紀錄</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">追蹤學生、訂餐、行政待辦、課程與通知操作</p>
          </div>
          <button onClick={fetchLogs} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800">
            重新整理
          </button>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {actionGroups.map((group) => (
            <button
              key={group.id}
              onClick={() => setGroupFilter(group.id)}
              className={`rounded-2xl px-4 py-3 text-left transition ${groupFilter === group.id ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "bg-white text-slate-500 hover:bg-blue-50"}`}
            >
              <span className="block text-sm font-black">{group.label}</span>
              <span className={`mt-1 block text-[11px] font-bold ${groupFilter === group.id ? "text-blue-100" : "text-slate-400"}`}>{group.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[420px] overflow-x-auto">
        {loading ? (
          <div className="p-20 text-center font-bold text-slate-400">操作紀錄載入中...</div>
        ) : loadError ? (
          <div className="p-20 text-center font-bold text-red-500">
            操作紀錄讀取失敗：{loadError}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-20 text-center font-bold text-slate-400">
            目前沒有操作紀錄。之後新增學生、儲值、調帳、通知或結算時，紀錄會出現在這裡。
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
                  <td className="px-6 py-4 text-xs font-bold text-slate-500">
                    {log.metadata ? (
                      <div className="flex max-w-xl flex-wrap gap-1.5">
                        {Object.entries(log.metadata).slice(0, 8).map(([key, value]) => (
                          <span key={key} className="rounded-full bg-slate-100 px-2.5 py-1">
                            {metadataLabels[key] || key}：{formatMetadataValue(value)}
                          </span>
                        ))}
                      </div>
                    ) : "-"}
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
