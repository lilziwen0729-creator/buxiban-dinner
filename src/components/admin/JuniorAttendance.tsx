import React from "react";

export default function JuniorAttendance({
  dayOfWeek, selectedCourseId, setSelectedCourseId, setSelectedIds, courses,
  juniorTab, setJuniorTab, loading, courseStudents, j_pending, j_arrived,
  j_left, j_leave, selectedIds, toggleSelection, handleBatchArrive,
  handleBulkLeaveJunior, currentScores, handleScoreChange, saveScores, exportToCSV
}: any) {
  return (
    <>
      <div className="app-card space-y-4 p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-amber-500">Junior</p>
          <label className="mb-2 mt-1 block text-xl font-black text-slate-950">今日課程 <span className="text-sm text-slate-400">星期{["無", "一", "二", "三", "四", "五", "六", "日"][dayOfWeek]}</span></label>
          <select value={selectedCourseId} onChange={(e) => { setSelectedCourseId(e.target.value); setSelectedIds([]); }} className="app-input px-4 py-3 text-lg font-black focus:border-amber-400">
            {courses.filter((c: any) => c.day_of_week === dayOfWeek).length > 0 ? (
              courses.filter((c: any) => c.day_of_week === dayOfWeek).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)
            ) : <option value="">今日無排定課程</option>}
            {courses.filter((c: any) => c.day_of_week !== dayOfWeek).length > 0 && (
              <optgroup label="--- 其他天課程 ---">
                {courses.filter((c: any) => c.day_of_week !== dayOfWeek).map((c: any) => <option key={c.id} value={c.id}>{c.name} (週{c.day_of_week})</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <div className="flex gap-2 rounded-2xl bg-slate-100 p-1">
          <button onClick={() => setJuniorTab("attendance")} className={`flex-1 rounded-xl py-3 text-sm font-black transition-all ${juniorTab === "attendance" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>點名清單</button>
          <button onClick={() => setJuniorTab("grading")} className={`flex-1 rounded-xl py-3 text-sm font-black transition-all ${juniorTab === "grading" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>成績登錄</button>
        </div>
      </div>

      {loading ? <div className="py-20 text-center font-bold text-slate-400 animate-pulse">資料同步中...</div> : (
        <>
          {/* 國中 - 點名模式 */}
          {juniorTab === "attendance" && (
            <div className="space-y-4">
              {courseStudents.length === 0 ? (
                <div className="rounded-3xl border-2 border-dashed border-slate-200 py-10 text-center font-bold text-slate-400">此課程目前無綁定學生<br /><span className="text-xs">請至資料庫新增</span></div>
              ) : (
                <>
                  <div className="app-card p-5">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-800">待簽到 <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{j_pending.length}</span></h3>
                    <div className="space-y-3">
                      {j_pending.map((s: any) => {
                        const isChecked = selectedIds.includes(s.id);
                        return (
                          <label key={s.id} className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all ${isChecked ? "border-amber-500 bg-amber-50" : "border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/40"}`}>
                            <span className="text-lg font-black text-slate-700">{s.name}</span>
                            <div className={`w-6 h-6 rounded-md flex items-center justify-center border-2 transition-all ${isChecked ? "bg-amber-500 border-amber-500 text-white" : "border-slate-300"}`}>{isChecked && "✓"}</div>
                            <input type="checkbox" className="hidden" checked={isChecked} onChange={() => toggleSelection(s.id)} />
                          </label>
                        );
                      })}
                      <button onClick={() => handleBatchArrive(selectedCourseId)} disabled={selectedIds.length === 0} className={`mt-2 w-full rounded-2xl py-4 font-black text-white transition-all ${selectedIds.length > 0 ? "bg-amber-500 shadow-lg shadow-amber-100 active:scale-95" : "bg-slate-300"}`}>批次確認到班 ({selectedIds.length})</button>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-100 p-5">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-600">上課中 <span className="rounded-md bg-white px-2 py-0.5 text-xs text-slate-600">{j_arrived.length}</span></h3>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {j_arrived.map((s: any) => <span key={s.id} className="bg-white px-4 py-2 rounded-xl text-sm font-bold text-slate-600 shadow-sm">{s.name}</span>)}
                      {j_arrived.length === 0 && <span className="text-sm text-slate-400">尚無人到班</span>}
                    </div>
                    <button onClick={handleBulkLeaveJunior} disabled={j_arrived.length === 0} className={`mt-2 w-full rounded-2xl py-4 font-black text-white transition-all ${j_arrived.length > 0 ? "bg-slate-900 shadow-lg hover:bg-slate-800 active:scale-95" : "bg-slate-300"}`}>全班統一離班下課</button>
                  </div>
                  {(j_left.length > 0 || j_leave.length > 0) && (
                    <div className="flex gap-2">
                      <div className="flex-1 bg-white p-4 rounded-2xl border border-slate-100"><p className="text-xs font-bold text-slate-400 mb-2">已離班</p><p className="font-black text-slate-600">{j_left.length} 人</p></div>
                      <div className="flex-1 bg-white p-4 rounded-2xl border border-slate-100"><p className="text-xs font-bold text-red-400 mb-2">今日請假</p><p className="font-black text-red-500">{j_leave.length} 人</p></div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 國中 - 成績登錄模式 */}
          {juniorTab === "grading" && (
            <div className="app-card p-5">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-amber-500">Scores</p>
                  <h3 className="mt-1 font-black text-slate-900">今日成績登錄</h3>
                </div>
                <button onClick={exportToCSV} className="rounded-xl bg-green-100 px-4 py-2 text-sm font-black text-green-700 transition hover:bg-green-200">匯出 CSV</button>
              </div>
              <div className="mb-6 space-y-4">
                {courseStudents.map((s: any) => (
                  <div key={s.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <span className="mb-3 block font-black text-slate-700">{s.name}</span>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" placeholder="成績一" value={currentScores[s.id]?.score_1 || ""} onChange={(e) => handleScoreChange(s.id, "score_1", e.target.value)} className="app-input px-3 py-2 text-center font-bold focus:border-amber-400" />
                      <input type="number" placeholder="成績二" value={currentScores[s.id]?.score_2 || ""} onChange={(e) => handleScoreChange(s.id, "score_2", e.target.value)} className="app-input px-3 py-2 text-center font-bold focus:border-amber-400" />
                    </div>
                  </div>
                ))}
                {courseStudents.length === 0 && <p className="text-center text-slate-400 py-4 font-bold">此課程無學生</p>}
              </div>
              <button onClick={saveScores} disabled={courseStudents.length === 0} className="w-full rounded-2xl bg-amber-500 py-4 font-black text-white shadow-lg shadow-amber-100 transition-all active:scale-95 disabled:bg-slate-300 disabled:shadow-none">儲存今日成績</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
