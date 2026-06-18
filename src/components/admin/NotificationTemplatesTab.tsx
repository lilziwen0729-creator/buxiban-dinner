"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Template = {
  id?: string;
  notification_type: string;
  title: string;
  body: string;
  variables: string[];
  is_active: boolean;
};

const defaults: Template[] = [
  {
    notification_type: "arrived",
    title: "到班通知",
    body: "方華補習班通知\n學生：{{studentName}}\n狀態：已安全抵達補習班",
    variables: ["studentName"],
    is_active: true,
  },
  {
    notification_type: "left",
    title: "離班通知",
    body: "方華補習班通知\n學生：{{studentName}}\n狀態：已下課離班\n提醒：請留意接送安全",
    variables: ["studentName"],
    is_active: true,
  },
  {
    notification_type: "homework_done",
    title: "作業完成通知",
    body: "方華補習班通知\n學生：{{studentName}}\n事項：今日作業已檢查完成",
    variables: ["studentName"],
    is_active: true,
  },
  {
    notification_type: "score",
    title: "成績通知",
    body: "{{message}}",
    variables: ["message"],
    is_active: true,
  },
  {
    notification_type: "low_balance",
    title: "低餘額通知",
    body: "方華補習班餐費提醒\n{{studentName}} 目前餐費餘額為 ${{balance}}，已低於提醒門檻 ${{threshold}}。\n請方便時協助安排儲值，謝謝您。",
    variables: ["studentName", "balance", "threshold"],
    is_active: true,
  },
  {
    notification_type: "broadcast",
    title: "廣播通知",
    body: "{{message}}",
    variables: ["message"],
    is_active: true,
  },
];

export default function NotificationTemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>(defaults);
  const [selectedType, setSelectedType] = useState(defaults[0].notification_type);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoadError("");
    const { data, error } = await supabase
      .from("notification_templates")
      .select("id, notification_type, title, body, variables, is_active")
      .order("notification_type");

    if (error) {
      setLoadError(error.message);
      setTemplates(defaults);
      return;
    }

    const map = new Map((data || []).map((item: any) => [item.notification_type, item as Template]));
    setTemplates(defaults.map((item) => ({ ...item, ...(map.get(item.notification_type) || {}) })));
  };

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.notification_type === selectedType) || templates[0],
    [selectedType, templates]
  );

  const updateSelected = (field: keyof Template, value: string | boolean) => {
    setTemplates((current) => current.map((template) =>
      template.notification_type === selectedType ? { ...template, [field]: value } : template
    ));
  };

  const saveTemplate = async () => {
    setSaving(true);
    setLoadError("");

    const payload = {
      notification_type: selectedTemplate.notification_type,
      title: selectedTemplate.title,
      body: selectedTemplate.body,
      variables: selectedTemplate.variables,
      is_active: selectedTemplate.is_active,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("notification_templates")
      .upsert(payload, { onConflict: "notification_type" });

    setSaving(false);

    if (error) {
      setLoadError(error.message);
      alert("儲存失敗：" + error.message);
      return;
    }

    alert("通知模板已儲存。");
    fetchTemplates();
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <p className="text-sm font-black uppercase tracking-widest text-fuchsia-500">Notification Templates</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">通知模板管理</h2>
          <p className="mt-2 text-sm font-bold text-slate-500">
            可修改 LINE 推播文字。支援變數格式如 {"{{studentName}}"}、{"{{balance}}"}。
          </p>
        </div>

        {loadError && (
          <div className="border-b border-amber-100 bg-amber-50 px-6 py-4 text-sm font-bold text-amber-800">
            目前讀不到模板資料表。若尚未建立，請先到 Supabase 執行 database/notification_templates.sql。
          </div>
        )}

        <div className="grid gap-0 lg:grid-cols-[320px_1fr]">
          <aside className="border-b border-slate-100 bg-white p-4 lg:border-b-0 lg:border-r">
            <div className="space-y-2">
              {templates.map((template) => (
                <button
                  key={template.notification_type}
                  onClick={() => setSelectedType(template.notification_type)}
                  className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                    selectedType === template.notification_type
                      ? "bg-slate-950 text-white shadow-md"
                      : "bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                >
                  <span className="block text-sm font-black">{template.title}</span>
                  <span className={`mt-1 block text-xs font-bold ${selectedType === template.notification_type ? "text-slate-300" : "text-slate-400"}`}>
                    {template.notification_type}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <div className="space-y-5 p-5">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <label className="space-y-2">
                <span className="text-xs font-black text-slate-500">模板名稱</span>
                <input
                  value={selectedTemplate.title}
                  onChange={(event) => updateSelected("title", event.target.value)}
                  className="app-input px-4 py-3 font-bold"
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-600">
                <input
                  type="checkbox"
                  checked={selectedTemplate.is_active}
                  onChange={(event) => updateSelected("is_active", event.target.checked)}
                  className="h-5 w-5"
                />
                啟用模板
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-xs font-black text-slate-500">通知內容</span>
              <textarea
                value={selectedTemplate.body}
                onChange={(event) => updateSelected("body", event.target.value)}
                rows={10}
                className="app-input min-h-72 px-4 py-3 font-mono text-sm leading-7"
              />
            </label>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm font-black text-blue-700">可用變數</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedTemplate.variables.map((variable) => (
                  <span key={variable} className="rounded-xl bg-white px-3 py-1.5 text-xs font-black text-blue-700">
                    {"{{"}{variable}{"}}"}
                  </span>
                ))}
              </div>
              {selectedTemplate.notification_type === "score" && (
                <p className="mt-2 text-xs font-bold text-blue-600">
                  成績通知目前可用 {"{{message}}"} 保留系統自動組好的成績、平均與排名內容。
                </p>
              )}
            </div>

            <button
              onClick={saveTemplate}
              disabled={saving}
              className="w-full rounded-2xl bg-blue-600 py-4 text-sm font-black text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:bg-slate-300"
            >
              {saving ? "儲存中..." : "儲存通知模板"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
