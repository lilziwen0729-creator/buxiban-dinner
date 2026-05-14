import React from "react";

export default function JuniorAttendance({
  dayOfWeek, selectedCourseId, setSelectedCourseId, setSelectedIds, courses,
  juniorTab, setJuniorTab, loading, courseStudents, j_pending, j_arrived,
  j_left, j_leave, selectedIds, toggleSelection, handleBatchArrive,
  handleBulkLeaveJunior, currentScores, handleScoreChange, saveScores, exportToCSV
}: any) {
  return (
    <>
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        <div>
          <label className="block text-slate-500 font-bold mb-2 text-sm">今日課程 (星期{["無", "一", "二", "三", "四", "五", "六", "日"][dayOfWeek]})：</label>
          <select value={selectedCourseId} onChange={(e) => { setSelectedCourseId(e.target.value); setSelectedIds([]); }} className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-slate-800 font-black text-lg outline-none bg-slate-50 focus:border-amber-400">
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
        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
          <button onClick={() => setJuniorTab("attendance")} className={`flex-1 py-2.5 rounded-lg font-black text-sm transition-all ${juniorTab === "attendance" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"}`}>點名清單</button>
          <button onClick={() => setJuniorTab("grading")} className={`flex-1 py-2.5 rounded-lg font-black text-sm transition-all ${juniorTab === "grading" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"}`}>成績登錄</button>
        </div>
      </div>

      {loading ? <div className="text-center py-20 text-slate-400 font-bold animate-pulse">資料同步中...</div> : (
        <>
          {/* 國中 - 點名模式 */}
          {juniorTab === "attendance" && (
            <div className="space-y-4">
              {courseStudents.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 font-bold">此課程目前無綁定學生<br /><span className="text-xs">請至資料庫新增</span></div>
              ) : (
                <>
                  <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                    <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">待簽到 <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md text-xs">{j_pending.length}</span></h3>
                    <div className="space-y-3">
                      {j_pending.map((s: any) => {
                        const isChecked = selectedIds.includes(s.id);
                        return (
                          <label key={s.id} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${isChecked ? "border-amber-500 bg-amber-50/50" : "border-slate-100 hover:border-slate-200"}`}>
                            <span className="text-lg font-black text-slate-700">{s.name}</span>
                            <div className={`w-6 h-6 rounded-md flex items-center justify-center border-2 transition-all ${isChecked ? "bg-amber-500 border-amber-500 text-white" : "border-slate-300"}`}>{isChecked && "✓"}</div>
                            <input type="checkbox" className="hidden" checked={isChecked} onChange={() => toggleSelection(s.id)} />
                          </label>
                        );
                      })}
                      <button onClick={() => handleBatchArrive(selectedCourseId)} disabled={selectedIds.length === 0} className={`w-full py-4 rounded-xl font-black text-white transition-all mt-2 ${selectedIds.length > 0 ? "bg-amber-500 shadow-lg active:scale-95" : "bg-slate-300"}`}>批次確認到班 ({selectedIds.length})</button>
                    </div>
                  </div>

                  <div className="bg-slate-100 p-5 rounded-3xl border border-slate-200">
                    <h3 className="text-lg font-black text-slate-500 mb-4 flex items-center gap-2">上課中 (已到班) <span className="bg-white text-slate-600 px-2 py-0.5 rounded-md text-xs">{j_arrived.length}</span></h3>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {j_arrived.map((s: any) => <span key={s.id} className="bg-white px-4 py-2 rounded-xl text-sm font-bold text-slate-600 shadow-sm">{s.name}</span>)}
                      {j_arrived.length === 0 && <span className="text-sm text-slate-400">尚無人到班</span>}
                    </div>
                    <button onClick={handleBulkLeaveJunior} disabled={j_arrived.length === 0} className={`w-full py-4 rounded-2xl font-black text-white transition-all mt-2 ${j_arrived.length > 0 ? "bg-slate-800 shadow-lg hover:bg-slate-900 active:scale-95" : "bg-slate-300"}`}>🔥 全班統一離班下課</button>
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
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-slate-800">成績登錄 (今日)</h3>
                <button onClick={exportToCSV} className="bg-green-100 text-green-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-200 transition">📥 匯出 Excel</button>
              </div>
              <div className="space-y-4 mb-6">
                {courseStudents.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between border-b border-slate-50 pb-4">
                    <span className="font-black text-slate-700 w-20">{s.name}</span>
                    <div className="flex gap-2 flex-1">
                      <input type="number" placeholder="成績一" value={currentScores[s.id]?.score_1 || ""} onChange={(e) => handleScoreChange(s.id, "score_1", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-amber-400 font-bold text-center" />
                      <input type="number" placeholder="成績二" value={currentScores[s.id]?.score_2 || ""} onChange={(e) => handleScoreChange(s.id, "score_2", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-amber-400 font-bold text-center" />
                    </div>
                  </div>
                ))}
                {courseStudents.length === 0 && <p className="text-center text-slate-400 py-4 font-bold">此課程無學生</p>}
              </div>
              <button onClick={saveScores} disabled={courseStudents.length === 0} className="w-full bg-amber-500 text-white py-4 rounded-xl font-black shadow-lg shadow-amber-200 active:scale-95 transition-all">💾 儲存今日成績</button>
            </div>
          )}
        </>
      )}
    </>
  );
}