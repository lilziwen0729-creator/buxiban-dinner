import React from "react";

export default function PrimaryAttendance({
  primaryGrades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六"],
  selectedGrade = "小一",
  setSelectedGrade,
  setSelectedIds,
  p_stats = { total: 0, signedIn: 0, meals: 0, homeworkPending: 0 },
  loading = false,
  p_pending = [],
  p_working = [],
  p_left = [],
  p_leave = [],
  selectedIds = [],
  toggleSelection,
  handleBatchArrive,
  handleBatchLeave,
  cancelLeave,
  updateStudentStatus,
  attendanceLogs = []
}: any) {
  return (
    <>
      <div className="app-card p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-blue-500">Primary</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">國小課輔點名</h3>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{selectedGrade}</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {primaryGrades.map((g: string) => (
            <button
              key={g}
              onClick={() => { setSelectedGrade?.(g); setSelectedIds?.([]); }}
              className={`whitespace-nowrap rounded-2xl px-5 py-2.5 text-sm font-black transition-all ${selectedGrade === g ? "bg-rose-500 text-white shadow-md shadow-rose-100" : "border border-rose-100 bg-white text-slate-500 hover:bg-rose-50"}`}
            >
              {g}
            </button>
          ))}
        </div>
        
        {/* 這裡就是你截圖裡不見的統計區塊 */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 p-3">
            <span className="text-[10px] font-bold text-blue-600 mb-1">今日簽到</span>
            <div className="font-black text-blue-600"><span className="text-2xl">{p_stats?.signedIn || 0}</span><span className="text-sm opacity-50"> / {p_stats?.total || 0}</span></div>
          </div>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-green-100 bg-green-50 p-3">
            <span className="text-[10px] font-bold text-green-600 mb-1">今日領餐</span>
            <div className="font-black text-green-600"><span className="text-2xl">{p_stats?.meals || 0}</span></div>
          </div>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-red-50 p-3">
            <span className="text-[10px] font-bold text-red-500 mb-1">作業未完</span>
            <div className="font-black text-red-500 text-2xl">{p_stats?.homeworkPending || 0}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center font-bold text-slate-400 animate-pulse">資料同步中...</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(24rem,0.85fr)]">
          {/* 1. 待簽到區 */}
          <div className="app-card p-5">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-800">
              待簽到 <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md text-xs">{p_pending.length}</span>
            </h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {p_pending.map((s: any) => {
                const isChecked = selectedIds.includes(s.id);
                return (
                  <label key={s.id} className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all ${isChecked ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"}`}>
                    <span className="text-lg font-black text-slate-700">{s.name}</span>
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center border-2 transition-all ${isChecked ? "bg-blue-500 border-blue-500 text-white" : "border-slate-300"}`}>{isChecked && "✓"}</div>
                    <input type="checkbox" className="hidden" checked={isChecked} onChange={() => toggleSelection?.(s.id)} />
                  </label>
                );
              })}
              {p_pending.length === 0 && <div className="py-4 text-center text-sm font-bold text-slate-300 md:col-span-2 xl:col-span-1 2xl:col-span-2">無待簽到學生</div>}
              <div className={`mt-2 grid gap-2 md:col-span-2 xl:col-span-1 2xl:col-span-2 ${handleBatchLeave ? "md:grid-cols-2" : ""}`}>
                <button onClick={() => handleBatchArrive?.(null)} disabled={selectedIds.length === 0} className={`w-full rounded-2xl py-4 font-black text-white transition-all ${selectedIds.length > 0 ? "bg-rose-500 shadow-lg shadow-rose-100 active:scale-95" : "bg-slate-300"}`}>
                  批次確認到班 ({selectedIds.length})
                </button>
                {handleBatchLeave && (
                  <button onClick={() => handleBatchLeave?.(null)} disabled={selectedIds.length === 0} className={`w-full rounded-2xl py-4 font-black transition-all ${selectedIds.length > 0 ? "bg-amber-100 text-amber-700 hover:bg-amber-200 active:scale-95" : "bg-slate-100 text-slate-300"}`}>
                    登記請假 ({selectedIds.length})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 2. 作業檢查區 */}
          <div className="rounded-3xl border border-orange-100 bg-orange-50/80 p-5">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-orange-700">
              作業檢查區 <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-md text-xs">{p_working.length}</span>
            </h3>
            <div className="space-y-3">
              {p_working.map((s: any) => {
                const isHomeworkDone = attendanceLogs.find((l: any) => l.student_id === s.id)?.status === 'homework_done';
                return (
                  <div key={s.id} className="flex flex-col gap-3 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                    <div className="flex justify-between items-center"><span className="text-lg font-black text-slate-700">{s.name}</span>{isHomeworkDone && <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded font-bold">作業✅</span>}</div>
                    <div className="flex gap-2">
                      <button onClick={() => updateStudentStatus?.(s.id, 'homework_done')} disabled={isHomeworkDone} className={`flex-1 rounded-xl py-2 text-sm font-black transition-all ${isHomeworkDone ? "bg-slate-100 text-slate-400" : "bg-orange-100 text-orange-700 hover:bg-orange-200"}`}>作業完成</button>
                      <button onClick={() => { if (window.confirm(`確定要將【${s.name}】設為已離班並通知家長嗎？`)) updateStudentStatus?.(s.id, 'left'); }} className="flex-1 rounded-xl bg-slate-900 py-2 text-sm font-black text-white shadow-md transition-all hover:bg-slate-800 active:scale-95">確認離班</button>
                    </div>
                  </div>
                );
              })}
              {p_working.length === 0 && <div className="text-center py-6 text-sm text-orange-300 font-bold">無人在班</div>}
            </div>
          </div>

          {/* 3 & 4. 已離班與請假 */}
          {(p_left.length > 0 || p_leave.length > 0) && (
            <div className="grid grid-cols-2 gap-4 xl:col-span-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-100 p-5">
                <h3 className="text-lg font-black text-slate-500 mb-2 flex items-center gap-2">今日已離班 <span className="text-sm">({p_left.length})</span></h3>
                <div className="flex flex-wrap gap-2 mt-3">{p_left.map((s: any) => <span key={s.id} className="bg-white px-3 py-1.5 rounded-lg text-sm font-bold text-slate-400 shadow-sm">{s.name}</span>)}</div>
              </div>
              <div className="rounded-3xl border border-red-100 bg-red-50 p-5">
                <h3 className="text-lg font-black text-red-500 mb-2 flex items-center gap-2">今日請假 <span className="text-sm">({p_leave.length})</span></h3>
                <div className="flex flex-wrap gap-2 mt-3">
                  {p_leave.map((s: any) => (
                    <span key={s.id} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-red-400 shadow-sm">
                      {s.name}
                      {cancelLeave && (
                        <button type="button" onClick={() => cancelLeave?.(s.id, null)} className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-black text-red-500 hover:bg-red-100">
                          取消
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
