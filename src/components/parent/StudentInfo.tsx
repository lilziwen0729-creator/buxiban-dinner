"use client";

import { useState } from "react";
import { getToday } from "@/lib/date";
import { groupParentCourses, type ParentStudentInfo, type ScoreTrend } from "@/lib/parentStudentInfo";

type View = "overview" | "attendance" | "learning";
type LearningView = "courses" | "contact" | "scores";

type Props = {
  view: View;
  info: ParentStudentInfo | null;
  loading: boolean;
  error: string;
  month: string;
  onMonthChange: (month: string) => void;
  onNavigate: (view: View) => void;
  onRetry: () => void;
};

const attendanceLabels = { present: "已到班", leave: "請假", pending: "未到" };
const attendanceTones = {
  present: "bg-emerald-50 text-emerald-700",
  leave: "bg-amber-50 text-amber-700",
  pending: "bg-slate-100 text-slate-600",
};
const weekdays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六", "週日"];

const MonthPicker = ({ month, onChange }: { month: string; onChange: (month: string) => void }) => (
  <label className="flex items-center gap-2 text-sm font-bold text-slate-500">
    月份
    <input type="month" value={month} max={getToday().slice(0, 7)} onChange={(event) => onChange(event.target.value)} className="app-input w-40 px-3 py-2 text-sm font-bold" />
  </label>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="py-10 text-center text-sm font-bold text-slate-400">{children}</p>
);

const TrendValue = ({ trend }: { trend: ScoreTrend }) => {
  if (trend.previous === null) return <span className="text-xs font-bold text-slate-400">首次記錄</span>;
  const tone = (trend.change || 0) > 0 ? "text-emerald-700" : (trend.change || 0) < 0 ? "text-rose-600" : "text-slate-500";
  return (
    <span className={`text-sm font-black ${tone}`}>
      {trend.change! > 0 ? "+" : ""}{trend.change} 分
      {trend.changePercent !== null ? `（${trend.changePercent > 0 ? "+" : ""}${trend.changePercent}%）` : "（前次為 0 分）"}
    </span>
  );
};

export default function StudentInfo({ view, info, loading, error, month, onMonthChange, onNavigate, onRetry }: Props) {
  const [learningView, setLearningView] = useState<LearningView>("courses");

  if (loading && !info) return <section className="app-card p-6"><p className="py-10 text-center text-sm font-bold text-slate-500">學生資料讀取中...</p></section>;
  if (error) return <section className="app-card p-6 text-center"><p role="alert" className="py-5 text-sm font-bold text-rose-600">{error}</p><button onClick={onRetry} className="rounded-md bg-rose-500 px-4 py-2 text-sm font-black text-white">重新載入</button></section>;
  if (!info) return null;

  const courses = groupParentCourses(info.courses);
  const currentCourses = courses.filter((course) => course.current);
  const present = info.attendance.filter((day) => day.status === "present").length;
  const leave = info.attendance.filter((day) => day.status === "leave").length;
  const pending = info.attendance.filter((day) => day.status === "pending").length;

  if (view === "overview") return (
    <div className="app-card divide-y divide-slate-100">
      <section className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-black text-slate-950">出缺席</h2>
          <MonthPicker month={month} onChange={onMonthChange} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-y border-slate-100 py-4 text-center">
          <div><p className="text-xs font-bold text-slate-500">已到班</p><p className="mt-1 text-2xl font-black text-emerald-700">{present}</p></div>
          <div><p className="text-xs font-bold text-slate-500">請假</p><p className="mt-1 text-2xl font-black text-amber-700">{leave}</p></div>
          <div><p className="text-xs font-bold text-slate-500">未到</p><p className="mt-1 text-2xl font-black text-slate-700">{pending}</p></div>
        </div>
        <button onClick={() => onNavigate("attendance")} className="mt-3 text-sm font-black text-blue-700">查看出缺席紀錄 →</button>
      </section>

      <section className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-slate-950">參加課程</h2>
          <button onClick={() => { setLearningView("courses"); onNavigate("learning"); }} className="text-sm font-black text-blue-700">查看全部 →</button>
        </div>
        {currentCourses.length ? <div className="mt-3 divide-y divide-slate-100">
          {currentCourses.slice(0, 4).map((course) => <div key={course.key} className="py-3 text-sm font-bold text-slate-700">{course.name}</div>)}
          {currentCourses.length > 4 && <p className="pt-3 text-xs font-bold text-slate-400">另有 {currentCourses.length - 4} 門課程</p>}
        </div> : <Empty>目前沒有綁定的課程</Empty>}
      </section>

      <section className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-slate-950">近期聯絡簿</h2>
          <button onClick={() => { setLearningView("contact"); onNavigate("learning"); }} className="text-sm font-black text-blue-700">查看歷史 →</button>
        </div>
        {info.contactBooks.length ? <div className="mt-3 divide-y divide-slate-100">
          {info.contactBooks.slice(0, 2).map((book) => <div key={book.id} className="py-3">
            <p className="text-xs font-black text-blue-700">{book.entryDate} · {book.courseName}</p>
            <p className="mt-1 line-clamp-2 text-sm font-bold text-slate-700">{book.lessonContent || book.homework || book.quizScope || "已更新聯絡簿"}</p>
          </div>)}
        </div> : <Empty>這個月尚無聯絡簿紀錄</Empty>}
      </section>

      <section className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-slate-950">各科成績起伏率</h2>
          <button onClick={() => { setLearningView("scores"); onNavigate("learning"); }} className="text-sm font-black text-blue-700">查看成績 →</button>
        </div>
        {info.trends.length ? <div className="mt-3 divide-y divide-slate-100">
          {info.trends.slice(0, 4).map((trend) => <div key={trend.subject} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="truncate font-black text-slate-800">{trend.subject}</p><p className="text-xs font-bold text-slate-400">{trend.latestDate} · 最新 {trend.latest} 分</p></div>
            <TrendValue trend={trend} />
          </div>)}
        </div> : <Empty>尚無成績紀錄</Empty>}
      </section>
    </div>
  );

  if (view === "attendance") return (
    <section className="app-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-black text-slate-950">出缺席紀錄</h2><p className="mt-1 text-xs font-bold text-slate-500">依日期統計，同一天多門課只計一次</p></div>
        <MonthPicker month={month} onChange={onMonthChange} />
      </div>
      <div className="mt-4 flex gap-4 border-y border-slate-100 py-3 text-sm font-black">
        <span className="text-emerald-700">到班 {present}</span><span className="text-amber-700">請假 {leave}</span><span className="text-slate-600">未到 {pending}</span>
      </div>
      {info.attendance.length ? <div className="divide-y divide-slate-100">
        {info.attendance.map((day) => <div key={day.date} className="flex items-start justify-between gap-3 py-4">
          <div className="min-w-0"><p className="font-black text-slate-800">{day.date}</p><p className="mt-1 text-xs font-bold text-slate-500">{day.details.join("、") || "已登記請假"}</p></div>
          <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-black ${attendanceTones[day.status]}`}>{attendanceLabels[day.status]}</span>
        </div>)}
      </div> : <Empty>這個月尚無出缺席紀錄</Empty>}
    </section>
  );

  return (
    <section className="app-card p-5">
      <h2 className="text-xl font-black text-slate-950">學習紀錄</h2>
      <div className="mt-4 flex rounded-md bg-slate-100 p-1" role="tablist" aria-label="學習紀錄">
        {([ ["courses", "課程"], ["contact", "聯絡簿"], ["scores", "成績"] ] as const).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={learningView === key} onClick={() => setLearningView(key)} className={`min-w-0 flex-1 rounded px-2 py-2 text-sm font-black ${learningView === key ? "bg-white text-rose-600 shadow-sm" : "text-slate-500"}`}>{label}</button>
        ))}
      </div>

      {learningView === "courses" && (courses.length ? <div className="mt-3 divide-y divide-slate-100">
        {courses.map((course) => <div key={course.key} className="py-4">
          <div className="flex items-center justify-between gap-3"><h3 className="font-black text-slate-800">{course.name}</h3><span className={`shrink-0 text-xs font-black ${course.current ? "text-emerald-700" : "text-slate-400"}`}>{course.current ? "目前參加" : "曾參加"}</span></div>
          <p className="mt-1 text-xs font-bold text-slate-500">{[course.grade, course.days.map((day) => weekdays[day]).filter(Boolean).join("、"), course.times.join("、")].filter(Boolean).join(" · ")}</p>
        </div>)}
      </div> : <Empty>尚無參加課程紀錄</Empty>)}

      {learningView !== "courses" && <div className="mt-4 flex justify-end"><MonthPicker month={month} onChange={onMonthChange} /></div>}
      {learningView === "contact" && (info.contactBooks.length ? <div className="mt-2 divide-y divide-slate-100">
        {info.contactBooks.map((book) => <article key={book.id} className="py-4">
          <p className="text-xs font-black text-blue-700">{book.entryDate} · {book.courseName}</p>
          {book.lessonContent && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700"><b>上課內容：</b>{book.lessonContent}</p>}
          {book.homework && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700"><b>作業：</b>{book.homework}</p>}
          {book.quizScope && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700"><b>考試範圍：</b>{book.quizScope}</p>}
        </article>)}
      </div> : <Empty>這個月尚無聯絡簿紀錄</Empty>)}

      {learningView === "scores" && <>
        <div className="mt-5 border-b border-slate-100 pb-3"><h3 className="font-black text-slate-950">各科成績起伏率</h3><p className="mt-1 text-xs text-slate-500">最近兩次比較，百分比以前一次分數為基準；不同考試範圍僅供參考</p></div>
        {info.trends.length ? <div className="divide-y divide-slate-100">
          {info.trends.map((trend) => <div key={trend.subject} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="font-black text-slate-800">{trend.subject}</p><p className="text-xs font-bold text-slate-500">{trend.previous === null ? "最新" : `${trend.previous} →`} {trend.latest} 分 · {trend.latestDate}</p></div>
            <TrendValue trend={trend} />
          </div>)}
        </div> : <Empty>尚無成績紀錄</Empty>}
        <h3 className="mt-5 border-b border-slate-100 pb-3 font-black text-slate-950">{month} 成績明細</h3>
        {info.scores.length ? <div className="divide-y divide-slate-100">
          {info.scores.map((score, index) => <div key={`${score.examDate}-${score.subject}-${index}`} className="flex items-start justify-between gap-3 py-4">
            <div className="min-w-0"><p className="font-black text-slate-800">{score.subject}</p><p className="mt-1 text-xs font-bold text-slate-500">{score.examDate} · {score.courseName}{score.scope ? ` · ${score.scope}` : ""}</p></div>
            <strong className="shrink-0 text-lg text-blue-700">{score.score}</strong>
          </div>)}
        </div> : <Empty>這個月尚無成績紀錄</Empty>}
      </>}
    </section>
  );
}

export function ParentLeavePanel({ name, todayLeave, info, month, onMonthChange, onLeave, loading, error, onRetry }: {
  name: string;
  todayLeave: boolean;
  info: ParentStudentInfo | null;
  month: string;
  onMonthChange: (month: string) => void;
  onLeave: () => void;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  return <section className="app-card p-5">
    <h2 className="text-xl font-black text-slate-950">請假</h2>
    <p className="mt-2 text-sm font-bold text-slate-500">{name} · 今日請假</p>
    <p className="mt-4 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">全天都可登記請假；13:00 前請假會同步取消今日訂餐，13:00 起保留已訂的餐。</p>
    <button onClick={onLeave} disabled={todayLeave || loading} className="mt-5 w-full rounded-md bg-amber-500 px-4 py-3 font-black text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
      {todayLeave ? "今日已請假" : "登記今日請假"}
    </button>
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
      <h3 className="font-black text-slate-950">請假紀錄</h3>
      <MonthPicker month={month} onChange={onMonthChange} />
    </div>
    {error ? <div className="py-6"><p role="alert" className="text-sm font-bold text-rose-600">{error}</p><button onClick={onRetry} className="mt-3 rounded-md bg-rose-500 px-4 py-2 text-sm font-black text-white">重新載入</button></div> : info?.leaves.length ? <div className="divide-y divide-slate-100">
      {info.leaves.map((leave) => <div key={leave.date} className="py-4">
        <p className="font-black text-slate-800">{leave.date}</p>
        <p className="mt-1 text-xs font-bold text-slate-500">{leave.reason || "已登記請假"}{leave.cancelledOrder ? " · 已同步取消訂餐" : ""}</p>
      </div>)}
    </div> : <Empty>{loading ? "請假紀錄讀取中..." : "這個月尚無請假紀錄"}</Empty>}
  </section>;
}
