import React from "react";

export default function JuniorAttendance({
  dayOfWeek, selectedCourseId, setSelectedCourseId, setSelectedIds, courses,
  juniorTab, setJuniorTab, loading, courseStudents, j_pending, j_arrived,
  j_left, j_leave, selectedIds, toggleSelection, handleBatchArrive,
  handleBulkLeaveJunior, currentScores, handleScoreChange, saveScores, exportToCSV,
  scoreMeta = {}, handleScoreMetaChange, scoreRecords = [], scoreHistoryRecords = [], sendScoreNotifications, mode = "attendance"
}: any) {
  const weekdayLabel = (value: number) => `週${["日", "一", "二", "三", "四", "五", "六", "日"][value] || value}`;
  const todaysCourses = courses.filter((c: any) => c.day_of_week === dayOfWeek);
  const otherCourses = courses.filter((c: any) => c.day_of_week !== dayOfWeek);
  React.useEffect(() => {
    if (mode !== "scores") return;
    const isTodayCourse = todaysCourses.some((course: any) => course.id === selectedCourseId);
    if (!isTodayCourse) {
      setSelectedCourseId(todaysCourses[0]?.id || "");
      setSelectedIds([]);
    }
  }, [mode, dayOfWeek, selectedCourseId, setSelectedCourseId, setSelectedIds, todaysCourses]);
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
  const score1Label = scoreMeta.score_1_subject || "成績一";
  const score2Label = scoreMeta.score_2_subject || "成績二";
  const [historyStudentId, setHistoryStudentId] = React.useState("all");
  const [scorePanel, setScorePanel] = React.useState<"entry" | "today" | "history" | "trend">("entry");
  const selectedCourse = courses.find((course: any) => course.id === selectedCourseId);
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
  const trendStudentId = historyStudentId === "all" ? courseStudents[0]?.id || "all" : historyStudentId;
  const trendStudent = courseStudents.find((student: any) => student.id === trendStudentId);
  const sortedHistoryAsc = [...scoreHistoryRecords].sort((a: any, b: any) => String(a.exam_date).localeCompare(String(b.exam_date)));
  const scoreDates = Array.from(new Set(sortedHistoryAsc.map((score: any) => score.exam_date))).filter(Boolean);
  const getScoreValue = (score: any, field: "score_1" | "score_2") => {
    const value = Number(score?.[field]);
    return Number.isFinite(value) ? value : null;
  };
  const averageNumber = (values: number[]) => values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const buildClassTrend = (field: "score_1" | "score_2") => scoreDates.map((date: string) => {
    const values = sortedHistoryAsc
      .filter((score: any) => score.exam_date === date)
      .map((score: any) => getScoreValue(score, field))
      .filter((value: number | null): value is number => value !== null);
    return { date, value: averageNumber(values) };
  }).filter((point: any): point is { date: string; value: number } => point.value !== null);
  const buildStudentTrend = (field: "score_1" | "score_2") => sortedHistoryAsc
    .filter((score: any) => score.student_id === trendStudentId)
    .map((score: any) => ({ date: score.exam_date, value: getScoreValue(score, field) }))
    .filter((point: any): point is { date: string; value: number } => point.value !== null);
  const buildMovementRows = (field: "score_1" | "score_2") => courseStudents.map((student: any) => {
    const records = sortedHistoryAsc
      .filter((score: any) => score.student_id === student.id)
      .map((score: any) => ({ date: score.exam_date, value: getScoreValue(score, field) }))
      .filter((point: any): point is { date: string; value: number } => point.value !== null);
    if (records.length < 2) return null;
    const previous = records[records.length - 2];
    const latest = records[records.length - 1];
    return { student, previous, latest, diff: Number((latest.value - previous.value).toFixed(1)) };
  }).filter(Boolean).sort((a: any, b: any) => b.diff - a.diff);
  const score1ClassTrend = buildClassTrend("score_1");
  const score2ClassTrend = buildClassTrend("score_2");
  const score1StudentTrend = buildStudentTrend("score_1");
  const score2StudentTrend = buildStudentTrend("score_2");
  const score1MovementRows = buildMovementRows("score_1");
  const score2MovementRows = buildMovementRows("score_2");
  const getImprovedRows = (rows: any[]) => rows.filter((row: any) => row.diff > 0).slice(0, 5);
  const getDeclinedRows = (rows: any[]) => [...rows].filter((row: any) => row.diff < 0).sort((a: any, b: any) => a.diff - b.diff).slice(0, 5);
  const renderTrendChart = (points: { date: string; value: number }[], tone: "blue" | "emerald") => {
    if (points.length < 2) {
      return <div className="flex h-56 items-center justify-center rounded-3xl border border-dashed border-slate-200 text-sm font-bold text-slate-400">至少需要兩筆歷史成績才會形成趨勢。</div>;
    }
    const width = 680;
    const height = 220;
    const padding = 28;
    const values = points.map((point) => point.value);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 100);
    const range = Math.max(max - min, 1);
    const coordinates = points.map((point, index) => {
      const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
      return { ...point, x, y };
    });
    const stroke = tone === "blue" ? "#2563eb" : "#059669";
    const fill = tone === "blue" ? "#dbeafe" : "#d1fae5";

    return (
      <div className="overflow-x-auto rounded-3xl border border-slate-100 bg-white p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-56 min-w-[520px]">
          {[0, 25, 50, 75, 100].map((mark) => {
            const y = height - padding - ((mark - min) / range) * (height - padding * 2);
            if (y < padding || y > height - padding) return null;
            return (
              <g key={mark}>
                <line x1={padding} x2={width - padding} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                <text x="4" y={y + 4} className="fill-slate-400 text-[10px] font-bold">{mark}</text>
              </g>
            );
          })}
          <polyline
            points={coordinates.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke={stroke}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {coordinates.map((point) => (
            <g key={`${point.date}-${point.value}`}>
              <circle cx={point.x} cy={point.y} r="6" fill={fill} stroke={stroke} strokeWidth="3" />
              <text x={point.x} y={point.y - 12} textAnchor="middle" className="fill-slate-700 text-[11px] font-black">{point.value.toFixed(1)}</text>
              <text x={point.x} y={height - 6} textAnchor="middle" className="fill-slate-400 text-[10px] font-bold">{String(point.date).slice(5)}</text>
            </g>
          ))}
        </svg>
      </div>
    );
  };

  return (
    <>
      <div className="app-card space-y-4 p-5">
        {mode === "scores" ? (
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-amber-500">Junior</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">成績管理</h3>
          </div>
        ) : (
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-amber-500">Junior</p>
            <label className="mb-2 mt-1 block text-xl font-black text-slate-950">
              今日課程 <span className="text-sm text-slate-400">{weekdayLabel(dayOfWeek)}</span>
            </label>
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
        )}
        {mode === "scores" && (
          <>
            <div className="grid gap-2 rounded-2xl bg-slate-100 p-1 md:grid-cols-4">
              <button onClick={() => setScorePanel("entry")} className={`rounded-xl py-3 text-sm font-black transition-all ${scorePanel === "entry" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>成績課程</button>
              <button onClick={() => setScorePanel("today")} className={`rounded-xl py-3 text-sm font-black transition-all ${scorePanel === "today" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>今日成績紀錄</button>
              <button onClick={() => setScorePanel("history")} className={`rounded-xl py-3 text-sm font-black transition-all ${scorePanel === "history" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>歷史成績紀錄</button>
              <button onClick={() => setScorePanel("trend")} className={`rounded-xl py-3 text-sm font-black transition-all ${scorePanel === "trend" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>成績趨勢</button>
            </div>
            <div>
              <label className="mb-2 block text-sm font-black text-slate-500">
                選擇班級課程 <span className="text-xs text-slate-400">{weekdayLabel(dayOfWeek)}</span>
              </label>
              <select value={selectedCourseId} onChange={(e) => { setSelectedCourseId(e.target.value); setSelectedIds([]); }} className="app-input px-4 py-3 text-lg font-black focus:border-amber-400">
                {todaysCourses.length > 0 ? (
                  <optgroup label={`今日課程 - ${weekdayLabel(dayOfWeek)}`}>
                    {todaysCourses.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({weekdayLabel(c.day_of_week)})</option>)}
                  </optgroup>
                ) : <option value="">今日無排定課程 - {weekdayLabel(dayOfWeek)}</option>}
              </select>
            </div>
          </>
        )}
        {mode === "mixed" && <div className="flex gap-2 rounded-2xl bg-slate-100 p-1">
          <button onClick={() => setJuniorTab("attendance")} className={`flex-1 rounded-xl py-3 text-sm font-black transition-all ${juniorTab === "attendance" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>點名清單</button>
          <button onClick={() => setJuniorTab("grading")} className={`flex-1 rounded-xl py-3 text-sm font-black transition-all ${juniorTab === "grading" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>成績登錄</button>
        </div>}
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
            {(mode !== "scores" || scorePanel === "entry") && (
            <div className="app-card p-5">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-amber-500">Scores</p>
                  <h3 className="mt-1 font-black text-slate-900">今日成績登錄</h3>
                </div>
                <button onClick={exportToCSV} className="rounded-xl bg-green-100 px-4 py-2 text-sm font-black text-green-700 transition hover:bg-green-200">匯出 CSV</button>
              </div>
              <div className="mb-6 grid gap-4 rounded-2xl border border-amber-100 bg-amber-50/60 p-4 md:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-xs font-black uppercase tracking-widest text-amber-600">成績一設定</p>
                  <input
                    value={scoreMeta.score_1_subject || ""}
                    onChange={(event) => handleScoreMetaChange?.("score_1_subject", event.target.value)}
                    placeholder="科目，例如：英文、數學"
                    className="app-input px-4 py-3 text-sm font-bold"
                  />
                  <input
                    value={scoreMeta.score_1_scope || ""}
                    onChange={(event) => handleScoreMetaChange?.("score_1_scope", event.target.value)}
                    placeholder="範圍，例如：L1-L3、一次方程式"
                    className="app-input px-4 py-3 text-sm font-bold"
                  />
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-black uppercase tracking-widest text-amber-600">成績二設定</p>
                  <input
                    value={scoreMeta.score_2_subject || ""}
                    onChange={(event) => handleScoreMetaChange?.("score_2_subject", event.target.value)}
                    placeholder="科目，例如：理化、國文"
                    className="app-input px-4 py-3 text-sm font-bold"
                  />
                  <input
                    value={scoreMeta.score_2_scope || ""}
                    onChange={(event) => handleScoreMetaChange?.("score_2_scope", event.target.value)}
                    placeholder="範圍，例如：段考複習、B2 U4"
                    className="app-input px-4 py-3 text-sm font-bold"
                  />
                </div>
              </div>
              <div className="mb-6 space-y-4">
                {courseStudents.map((s: any) => (
                  <div key={s.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <span className="mb-3 block font-black text-slate-700">{s.name}</span>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" placeholder={score1Label} value={currentScores[s.id]?.score_1 || ""} onChange={(e) => handleScoreChange(s.id, "score_1", e.target.value)} className="app-input px-3 py-2 text-center font-bold focus:border-amber-400" />
                      <input type="number" placeholder={score2Label} value={currentScores[s.id]?.score_2 || ""} onChange={(e) => handleScoreChange(s.id, "score_2", e.target.value)} className="app-input px-3 py-2 text-center font-bold focus:border-amber-400" />
                    </div>
                  </div>
                ))}
                {courseStudents.length === 0 && <p className="text-center text-slate-400 py-4 font-bold">此課程無學生</p>}
              </div>
              <button onClick={saveScores} disabled={courseStudents.length === 0} className="w-full rounded-2xl bg-amber-500 py-4 font-black text-white shadow-lg shadow-amber-100 transition-all active:scale-95 disabled:bg-slate-300 disabled:shadow-none">儲存今日成績</button>
            </div>
            )}

            {(mode !== "scores" || scorePanel === "today") && (
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
                        <p className="text-xs font-black text-blue-500">{score1Label}平均</p>
                        <p className="mt-1 text-xl font-black text-blue-700">{average("score_1")}</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                        <p className="text-xs font-black text-emerald-600">{score2Label}平均</p>
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
                        <th className="px-5 py-4 font-black">{score1Label}</th>
                        <th className="px-5 py-4 font-black">排名一</th>
                        <th className="px-5 py-4 font-black">{score2Label}</th>
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
            )}

            {(mode !== "scores" || scorePanel === "history") && (
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
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{records[0]?.score_1_subject || "成績一"}平均 {scoreAverage(records, "score_1")}</span>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{records[0]?.score_2_subject || "成績二"}平均 {scoreAverage(records, "score_2")}</span>
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {records.map((score: any) => (
                          <div key={`${date}-${score.student_id}`} className="rounded-xl bg-slate-50 px-3 py-2">
                            <p className="text-sm font-black text-slate-800">{studentNameMap.get(score.student_id) || "未知學生"}</p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {score.score_1_subject || "成績一"} {score.score_1 ?? "-"} · {score.score_2_subject || "成績二"} {score.score_2 ?? "-"}
                            </p>
                            {(score.score_1_scope || score.score_2_scope) && (
                              <p className="mt-1 text-[11px] font-bold text-slate-400">
                                {[score.score_1_scope && `一：${score.score_1_scope}`, score.score_2_scope && `二：${score.score_2_scope}`].filter(Boolean).join(" · ")}
                              </p>
                            )}
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
                        <th className="px-5 py-4 font-black">{score1Label}</th>
                        <th className="px-5 py-4 font-black">{score2Label}</th>
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
            )}

            {mode === "scores" && scorePanel === "trend" && (
            <div className="space-y-4">
              <div className="app-card overflow-hidden">
                <div className="border-b border-slate-100 bg-slate-50/70 p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-blue-500">Trend</p>
                      <h3 className="mt-1 text-xl font-black text-slate-950">成績趨勢</h3>
                      <p className="mt-1 text-sm font-bold text-slate-500">成績一、成績二分開分析，避免不同科目被混合計算。</p>
                    </div>
                    <select
                      value={trendStudentId}
                      onChange={(event) => setHistoryStudentId(event.target.value)}
                      className="app-input px-4 py-3 text-sm font-black md:w-56"
                    >
                      {courseStudents.map((student: any) => (
                        <option key={student.id} value={student.id}>{student.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 p-5 xl:grid-cols-2">
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="font-black text-slate-900">{trendStudent?.name || "學生"} {score1Label}趨勢</h4>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{score1StudentTrend.length} 筆</span>
                    </div>
                    {renderTrendChart(score1StudentTrend as any, "blue")}
                  </div>
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="font-black text-slate-900">{trendStudent?.name || "學生"} {score2Label}趨勢</h4>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{score2StudentTrend.length} 筆</span>
                    </div>
                    {renderTrendChart(score2StudentTrend as any, "emerald")}
                  </div>
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="font-black text-slate-900">{score1Label}班級平均</h4>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{score1ClassTrend.length} 次</span>
                    </div>
                    {renderTrendChart(score1ClassTrend as any, "blue")}
                  </div>
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="font-black text-slate-900">{score2Label}班級平均</h4>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{score2ClassTrend.length} 次</span>
                    </div>
                    {renderTrendChart(score2ClassTrend as any, "emerald")}
                  </div>
                </div>
              </div>

              {[
                { label: score1Label, rows: score1MovementRows, tone: "blue" },
                { label: score2Label, rows: score2MovementRows, tone: "emerald" },
              ].map((group: any) => {
                const improvedRows = getImprovedRows(group.rows);
                const declinedRows = getDeclinedRows(group.rows);
                return (
              <div key={group.label} className="grid gap-4 xl:grid-cols-2">
                <div className="app-card p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-emerald-500">Improved</p>
                      <h3 className="mt-1 text-xl font-black text-slate-950">{group.label} 最近進步</h3>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{improvedRows.length} 人</span>
                  </div>
                  <div className="space-y-2">
                    {improvedRows.length === 0 ? <p className="rounded-2xl bg-slate-50 py-8 text-center text-sm font-bold text-slate-400">目前沒有足夠資料或尚無進步名單。</p> : improvedRows.map((row: any) => (
                      <div key={row.student.id} className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                        <div>
                          <p className="font-black text-slate-950">{row.student.name}</p>
                          <p className="mt-1 text-xs font-bold text-slate-500">{row.previous.date} {row.previous.value.toFixed(1)} → {row.latest.date} {row.latest.value.toFixed(1)}</p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-emerald-700">+{row.diff}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="app-card p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-red-500">Declined</p>
                      <h3 className="mt-1 text-xl font-black text-slate-950">{group.label} 最近退步</h3>
                    </div>
                    <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600">{declinedRows.length} 人</span>
                  </div>
                  <div className="space-y-2">
                    {declinedRows.length === 0 ? <p className="rounded-2xl bg-slate-50 py-8 text-center text-sm font-bold text-slate-400">目前沒有足夠資料或尚無退步名單。</p> : declinedRows.map((row: any) => (
                      <div key={row.student.id} className="flex items-center justify-between rounded-2xl border border-red-100 bg-red-50/70 p-4">
                        <div>
                          <p className="font-black text-slate-950">{row.student.name}</p>
                          <p className="mt-1 text-xs font-bold text-slate-500">{row.previous.date} {row.previous.value.toFixed(1)} → {row.latest.date} {row.latest.value.toFixed(1)}</p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-red-600">{row.diff}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
                );
              })}
            </div>
            )}
            </div>
          )}
        </>
      )}
    </>
  );
}
