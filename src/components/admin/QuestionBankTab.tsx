"use client";

import { useMemo, useState } from "react";

const portals = [
  {
    id: "testgo",
    name: "TestGo",
    subtitle: "翰林雲端題庫",
    description: "進入 TestGo 做題庫出卷、成卷與測驗相關操作。",
    url: "https://www.testgo.com.tw/",
    color: "blue",
  },
  {
    id: "knsh",
    name: "康軒出題高手",
    subtitle: "康軒國教資源",
    description: "使用康軒教師帳號登入出題高手，進行命題與組卷。",
    url: "https://quiz.knsh.com.tw/teacher-login",
    color: "emerald",
  },
  {
    id: "upad12",
    name: "UPAD12 命題",
    subtitle: "南一 UPAD12",
    description: "進入 UPAD12 平台，使用雲端題庫、派卷與測驗功能。",
    url: "https://s124640.upad12.com/user/login",
    color: "amber",
  },
];

const colorClasses: Record<string, { card: string; pill: string; active: string }> = {
  blue: {
    card: "border-blue-100 bg-blue-50 text-blue-700",
    pill: "bg-blue-100 text-blue-700",
    active: "bg-blue-600 text-white shadow-blue-100",
  },
  emerald: {
    card: "border-emerald-100 bg-emerald-50 text-emerald-700",
    pill: "bg-emerald-100 text-emerald-700",
    active: "bg-emerald-600 text-white shadow-emerald-100",
  },
  amber: {
    card: "border-amber-100 bg-amber-50 text-amber-700",
    pill: "bg-amber-100 text-amber-700",
    active: "bg-amber-500 text-white shadow-amber-100",
  },
};

export default function QuestionBankTab() {
  const [activePortalId, setActivePortalId] = useState(portals[0].id);
  const activePortal = useMemo(
    () => portals.find((portal) => portal.id === activePortalId) || portals[0],
    [activePortalId],
  );

  const openPortal = (url = activePortal.url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] bg-slate-950 p-7 text-white shadow-xl shadow-slate-200">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Question Bank Portals</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">題庫入口中心</h2>
            <p className="mt-2 text-sm font-bold text-slate-300">
              集中開啟 TestGo、康軒出題高手與 UPAD12 命題平台，題庫操作保留在各平台完成。
            </p>
          </div>

          <button
            onClick={() => openPortal()}
            className="rounded-2xl bg-emerald-500 px-6 py-4 text-sm font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-400"
          >
            開啟目前入口
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {portals.map((portal) => {
          const isActive = portal.id === activePortal.id;
          const classes = colorClasses[portal.color];

          return (
            <button
              key={portal.id}
              onClick={() => setActivePortalId(portal.id)}
              className={`rounded-3xl border p-5 text-left transition ${
                isActive ? `${classes.active} shadow-lg` : `${classes.card} hover:-translate-y-0.5 hover:shadow-md`
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-xs font-black ${isActive ? "text-white/80" : ""}`}>{portal.subtitle}</p>
                  <h3 className="mt-2 text-xl font-black">{portal.name}</h3>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${isActive ? "bg-white/20 text-white" : classes.pill}`}>
                  {isActive ? "目前" : "切換"}
                </span>
              </div>
              <p className={`mt-3 text-sm font-bold leading-relaxed ${isActive ? "text-white/80" : "text-slate-500"}`}>
                {portal.description}
              </p>
            </button>
          );
        })}
      </section>

      <section className="app-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-blue-500">Browser View</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">{activePortal.name}</h3>
            <p className="mt-1 text-sm font-bold text-slate-500">
              如果下方顯示空白或拒絕連線，代表該平台禁止嵌入，請改用右側按鈕開啟新分頁。
            </p>
          </div>
          <button
            onClick={() => openPortal()}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800"
          >
            另開視窗
          </button>
        </div>

        <div className="h-[72vh] min-h-[620px] bg-slate-100">
          <iframe
            key={activePortal.id}
            title={activePortal.name}
            src={activePortal.url}
            className="h-full w-full border-0 bg-white"
            referrerPolicy="no-referrer"
          />
        </div>
      </section>
    </div>
  );
}
