"use client";

const lineManagerUrl = "https://manager.line.biz/";

export default function LineOfficialTab() {
  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] bg-slate-950 p-7 text-white shadow-xl shadow-slate-200">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold text-green-200">LINE Official Account</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight">LINE 官方後台</h2>
            <p className="mt-2 text-sm font-bold text-slate-300">
              可用來查看官方帳號訊息、好友與群發設定。
            </p>
          </div>
          <a
            href={lineManagerUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl bg-green-500 px-5 py-3 text-center text-sm font-black text-white shadow-lg shadow-green-900/20 transition hover:bg-green-600"
          >
            開啟 LINE 官方後台
          </a>
        </div>
      </div>

      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-5">
          <h3 className="text-xl font-black text-slate-950">內建瀏覽視窗</h3>
          <p className="mt-1 text-sm font-bold text-slate-500">
            若畫面空白或顯示無法連線，代表 LINE 官方後台禁止被嵌入，請改用右上角按鈕開新分頁。
          </p>
        </div>

        <div className="h-[720px] bg-slate-100">
          <iframe
            title="LINE 官方帳號後台"
            src={lineManagerUrl}
            className="h-full w-full border-0 bg-white"
            referrerPolicy="no-referrer"
          />
        </div>
      </section>
    </div>
  );
}
