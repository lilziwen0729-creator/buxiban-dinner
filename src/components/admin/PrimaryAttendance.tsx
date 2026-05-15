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
  updateStudentStatus,
  attendanceLogs = []
}: any) {
  return (
    <>
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
        <div className="mb-4 text-slate-500 font-bold text-sm">負責年級：</div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {primaryGrades.map((g: string) => (
            <button
              key={g}
              onClick={() => { setSelectedGrade?.(g); setSelectedIds?.([]); }}
              className={`whitespace-nowrap px-5 py-2.5 rounded-xl font-black text-sm transition-all ${selectedGrade === g ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              {g}
            </button>
          ))}
        </div>
        
        {/* 這裡就是你截圖裡不見的統計區塊 */}
        <div className="flex gap-3 mt-4">
          <div className="flex-1 bg-blue-50 border border-blue-100 rounded-2xl p-3 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-blue-600 mb-1">今日簽到</span>
            <div className="font-black text-blue-600"><span className="text-2xl">{p_stats?.signedIn || 0}</span><span className="text-sm opacity-50"> / {p_stats?.total || 0}</span></div>
          </div>
          <div className="flex-1 bg-green-50 border border-green-100 rounded-2xl p-3 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-green-600 mb-1">今日領餐</span>
            <div className="font-black text-green-600"><span className="text-2xl">{p_stats?.meals || 0}</span></div>
          </div>
          <div className="flex-1 bg-red-50 border border-red-100 rounded-2xl p-3 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-red-500 mb-1">作業未完</span>
            <div className="font-black text-red-500 text-2xl">{p_stats?.homeworkPending || 0}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400 font-bold animate-pulse">資料同步中...</div>
      ) : (
        <div className="space-y-4">
          {/* 1. 待簽到區 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
              待簽到 <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md text-xs">{p_pending.length}</span>
            </h3>
            <div className="space-y-3">
              {p_pending.map((s: any) => {
                const isChecked = selectedIds.includes(s.id);
                return (
                  <label key={s.id} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${isChecked ? "border-blue-500 bg-blue-50/50" : "border-slate-100 hover:border-slate-200"}`}>
                    <span className="text-lg font-black text-slate-700">{s.name}</span>
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center border-2 transition-all ${isChecked ? "bg-blue-500 border-blue-500 text-white" : "border-slate-300"}`}>{isChecked && "✓"}</div>
                    <input type="checkbox" className="hidden" checked={isChecked} onChange={() => toggleSelection?.(s.id)} />
                  </label>
                );
              })}
              {p_pending.length === 0 && <div className="text-center py-4 text-sm text-slate-300 font-bold">無待簽到學生</div>}
              <button onClick={() => handleBatchArrive?.(null)} disabled={selectedIds.length === 0} className={`w-full py-4 rounded-xl font-black text-white transition-all mt-2 ${selectedIds.length > 0 ? "bg-blue-600 shadow-lg active:scale-95" : "bg-slate-300"}`}>
                批次確認到班 ({selectedIds.length})
              </button>
            </div>
          </div>

          {/* 2. 作業檢查區 */}
          <div className="bg-orange-50/50 p-5 rounded-3xl border border-orange-100">
            <h3 className="text-lg font-black text-orange-700 mb-4 flex items-center gap-2">
              作業檢查區 <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-md text-xs">{p_working.length}</span>
            </h3>
            <div className="space-y-3">
              {p_working.map((s: any) => {
                const isHomeworkDone = attendanceLogs.find((l: any) => l.student_id === s.id)?.status === 'homework_done';
                return (
                  <div key={s.id} className="bg-white p-4 rounded-2xl border border-orange-100 shadow-sm flex flex-col gap-3">
                    <div className="flex justify-between items-center"><span className="text-lg font-black text-slate-700">{s.name}</span>{isHomeworkDone && <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded font-bold">作業✅</span>}</div>
                    <div className="flex gap-2">
                      <button onClick={() => updateStudentStatus?.(s.id, 'homework_done')} disabled={isHomeworkDone} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${isHomeworkDone ? "bg-slate-100 text-slate-400" : "bg-orange-100 text-orange-600 hover:bg-orange-200"}`}>作業完成</button>
                      <button onClick={() => { if (window.confirm(`確定要將【${s.name}】設為已離班並通知家長嗎？`)) updateStudentStatus?.(s.id, 'left'); }} className="flex-1 py-2 bg-slate-800 text-white rounded-xl text-sm font-bold shadow-md hover:bg-slate-700 active:scale-95 transition-all">確認離班</button>
                    </div>
                  </div>
                );
              })}
              {p_working.length === 0 && <div className="text-center py-6 text-sm text-orange-300 font-bold">無人在班</div>}
            </div>
          </div>

          {/* 3 & 4. 已離班與請假 */}
          {(p_left.length > 0 || p_leave.length > 0) && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-100 p-5 rounded-3xl border border-slate-200">
                <h3 className="text-lg font-black text-slate-500 mb-2 flex items-center gap-2">今日已離班 <span className="text-sm">({p_left.length})</span></h3>
                <div className="flex flex-wrap gap-2 mt-3">{p_left.map((s: any) => <span key={s.id} className="bg-white px-3 py-1.5 rounded-lg text-sm font-bold text-slate-400 shadow-sm">{s.name}</span>)}</div>
              </div>
              <div className="bg-red-50 p-5 rounded-3xl border border-red-100">
                <h3 className="text-lg font-black text-red-500 mb-2 flex items-center gap-2">今日請假 <span className="text-sm">({p_leave.length})</span></h3>
                <div className="flex flex-wrap gap-2 mt-3">{p_leave.map((s: any) => <span key={s.id} className="bg-white px-3 py-1.5 rounded-lg text-sm font-bold text-red-400 shadow-sm">{s.name}</span>)}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}