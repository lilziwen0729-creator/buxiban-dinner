"use client";

const testGoUrl = "https://www.testgo.com.tw/";

export default function QuestionBankTab() {
  const openTestGo = () => {
    window.open(testGoUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] bg-slate-950 p-7 text-white shadow-xl shadow-slate-200">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-emerald-300">External Question Bank</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">TestGo 題庫系統</h2>
            <p className="mt-2 text-sm font-bold text-slate-300">
              直接連到外部題庫平台，保留登入、出卷與題庫操作在 TestGo 內完成。
            </p>
          </div>

          <button
            onClick={openTestGo}
            className="rounded-2xl bg-emerald-500 px-6 py-4 text-sm font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-400"
          >
            開啟 TestGo
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
          <p className="text-xs font-black text-blue-600">題庫入口</p>
          <p className="mt-2 text-lg font-black text-slate-950">登入後選擇題庫系統</p>
          <p className="mt-1 text-sm font-bold text-slate-500">使用 TestGo 原本的帳號與權限。</p>
        </div>
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
          <p className="text-xs font-black text-emerald-600">出卷流程</p>
          <p className="mt-2 text-lg font-black text-slate-950">在外部平台完成</p>
          <p className="mt-1 text-sm font-bold text-slate-500">不用再維護本系統內建題庫。</p>
        </div>
        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
          <p className="text-xs font-black text-amber-600">內嵌限制</p>
          <p className="mt-2 text-lg font-black text-slate-950">若空白請開新分頁</p>
          <p className="mt-1 text-sm font-bold text-slate-500">部分網站會禁止被其他系統嵌入。</p>
        </div>
      </section>

      <section className="app-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-black text-slate-950">內建瀏覽視窗</h3>
            <p className="mt-1 text-sm font-bold text-slate-500">
              如果下方顯示空白或拒絕連線，代表 TestGo 禁止嵌入，請改用右上角按鈕開啟。
            </p>
          </div>
          <button
            onClick={openTestGo}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800"
          >
            另開視窗
          </button>
        </div>

        <div className="h-[72vh] min-h-[620px] bg-slate-100">
          <iframe
            title="TestGo 題庫系統"
            src={testGoUrl}
            className="h-full w-full border-0 bg-white"
            referrerPolicy="no-referrer"
          />
        </div>
      </section>
    </div>
  );
}
