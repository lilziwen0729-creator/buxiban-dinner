import React from "react";

export default function JuniorAttendance({
  dayOfWeek, selectedCourseId, setSelectedCourseId, setSelectedIds, courses,
  juniorTab, setJuniorTab, loading, courseStudents, j_pending, j_arrived,
  j_left, j_leave, selectedIds, toggleSelection, handleBatchArrive,
  handleBulkLeaveJunior, currentScores, handleScoreChange, saveScores, exportToCSV,
  scoreRecords = [], scoreHistoryRecords = [], sendScoreNotifications
}: any) {
  const weekdayLabel = (value: number) => `週${["日", "一", "二", "三", "四", "五", "六", "日"][value] || value}`;
  const todaysCourses = courses.filter((c: any) => c.day_of_week === dayOfWeek);
  const otherCourses = courses.filter((c: any) => c.day_of_week !== dayOfWeek);
  const scoreMap = new Map(scoreRecords.map((score: any) => [score.student_id, score]));
  const average = (field: "score_1" | "score_2") => {
    const values = scoreRecords
      .map((score: any) => Number(score[field]))
      .filter((value: number) => Number.isFinite(value));
    if (values.length === 0) return "-";
    return (values.reduce((sum: number, value: number) => sum + value, 0) / values.length).toFixed(1);
  };
  const rankByField = (field: "score_1" | "score_2") => {
    const sorted = scoreRecords
      .map((score: any) => ({ studentId: score.student_id, value: Number(score[field]) }))
      .filter((item: any) => Number.isFinite(item.value))
      .sort((a: any, b: any) => b.value - a.value);
    const ranks = new Map<string, number>();
    let previousValue: number | null = null;
    let previousRank = 0;
    sorted.forEach((item: any, index: number) => {
      const rank = previousValue === item.value ? previousRank : index + 1;
      ranks.set(item.studentId, rank);
      previousValue = item.value;
      previousRank = rank;
    });
    return ranks;
  };
  const score1Ranks = rankByField("score_1");
  const score2Ranks = rankByField("score_2");
  const [historyStudentId, setHistoryStudentId] = React.useState("all");
  const studentNameMap = new Map<string, string>(courseStudents.map((student: any) => [student.id, student.name]));
  const scoreAverage = (records: any[], field: "score_1" | "score_2") => {
    const values = records.map((score: any) => Number(score[field])).filter((value: number) => Number.isFinite(value));
    if (values.length === 0) return "-";
    return (values.reduce((sum: number, value: number) => sum + value, 0) / values.length).toFixed(1);
  };
  const historyGroups = (scoreHistoryRecords as any[]).reduce((groups: Map<string, any[]>, score: any) => {
      const date = score.exam_date || "未設定日期";
      groups.set(date, [...(groups.get(date) || []), score]);
      return groups;
    }, new Map<string, any[]>());
  const historyByDate: [string, any[]][] = Array.from(historyGroups.entries()).sort(([dateA], [dateB]) => dateB.localeCompare(dateA));
  const selectedStudentHistory = scoreHistoryRecords
    .filter((score: any) => historyStudentId === "all" || score.student_id === historyStudentId)
    .sort((a: any, b: any) => String(b.exam_date).localeCompare(String(a.exam_date)));

  return (
    <>
      <div className="app-card space-y-4 p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-amber-500">Junior</p>
          <label className="mb-2 mt-1 block text-xl font-black text-slate-950">今日課程 <span className="text-sm text-slate-400">{weekdayLabel(dayOfWeek)}</span></label>
          <select value={selectedCourseId} onChange={(e) => { setSelectedCourseId(e.target.value); setSelectedIds([]); }} className="app-input px-4 py-3 text-lg font-black focus:border-amber-400">
            {todaysCourses.length > 0 ? (
              <optgroup label={`今日課程 - ${weekdayLabel(dayOfWeek)}`}>
                {todaysCourses.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({weekdayLabel(c.day_of_week)})</option>)}
              </optgroup>
            ) : <option value="">今日無排定課程 - {weekdayLabel(dayOfWeek)}</option>}
            {otherCourses.length > 0 && (
              <optgroup label="其他天課程">
                {otherCourses.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({weekdayLabel(c.day_of_week)})</option>)}
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
                      <div className="flex-1 bg-white p-4 rounded-2xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 mb-2">已離班</p>
                        <p className="font-black text-slate-600">{j_left.length} 人</p>
                        {j_left.length > 0 && (
                          <p className="mt-1 text-xs font-bold leading-relaxed text-slate-400">
                            {j_left.map((s: any) => s.name).join("、")}
                          </p>
                        )}
                      </div>
                      <div className="flex-1 bg-white p-4 rounded-2xl border border-slate-100">
                        <p className="text-xs font-bold text-red-400 mb-2">今日請假</p>
                        <p className="font-black text-red-500">{j_leave.length} 人</p>
                        {j_leave.length > 0 && (
                          <p className="mt-1 text-xs font-bold leading-relaxed text-red-400">
                            {j_leave.map((s: any) => s.name).join("、")}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 國中 - 成績登錄模式 */}
          {juniorTab === "grading" && (
            <div className="space-y-4">
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

            <div className="app-card overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/70 p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-blue-500">Score Records</p>
                    <h3 className="mt-1 text-xl font-black text-slate-950">今日成績紀錄</h3>
                    <p className="mt-1 text-sm font-bold text-slate-500">儲存後自動計算班級平均與排名。</p>
                  </div>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-2xl bg-blue-50 px-4 py-3">
                        <p className="text-xs font-black text-blue-500">成績一平均</p>
                        <p className="mt-1 text-xl font-black text-blue-700">{average("score_1")}</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                        <p className="text-xs font-black text-emerald-600">成績二平均</p>
                        <p className="mt-1 text-xl font-black text-emerald-700">{average("score_2")}</p>
                      </div>
                    </div>
                    <button
                      onClick={sendScoreNotifications}
                      disabled={scoreRecords.length === 0}
                      className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:bg-slate-300 disabled:shadow-none"
                    >
                      發送成績通知
                    </button>
                  </div>
                </div>
              </div>

              {scoreRecords.length === 0 ? (
                <div className="p-10 text-center text-sm font-bold text-slate-400">今天尚未儲存成績。</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-white text-xs uppercase tracking-widest text-slate-400">
                        <th className="px-5 py-4 font-black">學生</th>
                        <th className="px-5 py-4 font-black">成績一</th>
                        <th className="px-5 py-4 font-black">排名一</th>
                        <th className="px-5 py-4 font-black">成績二</th>
                        <th className="px-5 py-4 font-black">排名二</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {courseStudents.map((student: any) => {
                        const score: any = scoreMap.get(student.id);
                        if (!score) return null;
                        const score1 = Number(score.score_1);
                        const score2 = Number(score.score_2);

                        return (
                          <tr key={student.id} className="hover:bg-blue-50/40">
                            <td className="px-5 py-4 font-black text-slate-800">{student.name}</td>
                            <td className="px-5 py-4 font-bold text-slate-700">{Number.isFinite(score1) ? score1 : "-"}</td>
                            <td className="px-5 py-4 font-bold text-blue-700">{score1Ranks.get(student.id) ? `第 ${score1Ranks.get(student.id)} 名` : "-"}</td>
                            <td className="px-5 py-4 font-bold text-slate-700">{Number.isFinite(score2) ? score2 : "-"}</td>
                            <td className="px-5 py-4 font-bold text-emerald-700">{score2Ranks.get(student.id) ? `第 ${score2Ranks.get(student.id)} 名` : "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="app-card overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/70 p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-purple-500">History</p>
                    <h3 className="mt-1 text-xl font-black text-slate-950">歷史成績紀錄</h3>
                    <p className="mt-1 text-sm font-bold text-slate-500">可看全班每次考試，也可篩選單一學生。</p>
                  </div>
                  <select
                    value={historyStudentId}
                    onChange={(event) => setHistoryStudentId(event.target.value)}
                    className="app-input px-4 py-3 text-sm font-black md:w-56"
                  >
                    <option value="all">全班紀錄</option>
                    {courseStudents.map((student: any) => (
                      <option key={student.id} value={student.id}>{student.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {scoreHistoryRecords.length === 0 ? (
                <div className="p-10 text-center text-sm font-bold text-slate-400">這門課目前沒有歷史成績。</div>
              ) : historyStudentId === "all" ? (
                <div className="space-y-3 p-5">
                  {historyByDate.map(([date, records]: any) => (
                    <div key={date} className="rounded-2xl border border-slate-100 bg-white p-4">
                      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h4 className="font-black text-slate-900">{date}</h4>
                          <p className="mt-1 text-sm font-bold text-slate-400">{records.length} 筆成績</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">成績一平均 {scoreAverage(records, "score_1")}</span>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">成績二平均 {scoreAverage(records, "score_2")}</span>
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {records.map((score: any) => (
                          <div key={`${date}-${score.student_id}`} className="rounded-xl bg-slate-50 px-3 py-2">
                            <p className="text-sm font-black text-slate-800">{studentNameMap.get(score.student_id) || "未知學生"}</p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              成績一 {score.score_1 ?? "-"} · 成績二 {score.score_2 ?? "-"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-white text-xs uppercase tracking-widest text-slate-400">
                        <th className="px-5 py-4 font-black">日期</th>
                        <th className="px-5 py-4 font-black">成績一</th>
                        <th className="px-5 py-4 font-black">成績二</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedStudentHistory.map((score: any) => (
                        <tr key={`${score.exam_date}-${score.student_id}`} className="hover:bg-purple-50/40">
                          <td className="px-5 py-4 font-black text-slate-800">{score.exam_date}</td>
                          <td className="px-5 py-4 font-bold text-blue-700">{score.score_1 ?? "-"}</td>
                          <td className="px-5 py-4 font-bold text-emerald-700">{score.score_2 ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
