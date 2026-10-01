export type ParentCourse = {
  id: string;
  name: string;
  grade: string | null;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  current: boolean;
  startDate: string | null;
};

export type ParentCourseGroup = {
  key: string;
  name: string;
  grade: string | null;
  current: boolean;
  days: number[];
  times: string[];
};

export function groupParentCourses(courses: ParentCourse[]): ParentCourseGroup[] {
  const groups = new Map<string, ParentCourseGroup>();
  for (const course of courses) {
    const key = JSON.stringify([course.grade, course.name]);
    const group = groups.get(key) || {
      key, name: course.name, grade: course.grade, current: false, days: [], times: [],
    };
    group.current ||= course.current;
    if (course.dayOfWeek !== null && !group.days.includes(course.dayOfWeek)) group.days.push(course.dayOfWeek);
    const time = course.startTime?.slice(0, 5);
    if (time && !group.times.includes(time)) group.times.push(time);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, days: group.days.sort((a, b) => a - b), times: group.times.sort() }))
    .sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name, "zh-TW"));
}

export type AttendanceDay = {
  date: string;
  status: "present" | "leave" | "pending";
  details: string[];
};

export type ParentContactBook = {
  id: string;
  courseName: string;
  entryDate: string;
  lessonContent: string | null;
  homework: string | null;
  quizScope: string | null;
};

export type ParentScore = {
  courseName: string;
  examDate: string;
  subject: string;
  scope: string | null;
  score: number;
};

export type ScoreTrend = {
  subject: string;
  latest: number;
  previous: number | null;
  change: number | null;
  changePercent: number | null;
  latestDate: string;
};

export type ParentLeave = {
  date: string;
  reason: string | null;
  cancelledOrder: boolean;
};

export type ParentStudentInfo = {
  studentId: string;
  month: string;
  courses: ParentCourse[];
  attendance: AttendanceDay[];
  contactBooks: ParentContactBook[];
  scores: ParentScore[];
  trends: ScoreTrend[];
  leaves: ParentLeave[];
};

type AttendanceSource = {
  date: string;
  status: string;
  course_id: string | null;
};

export function summarizeAttendance(
  logs: AttendanceSource[],
  leaveDates: string[],
  courseNames: Map<string, string>,
): AttendanceDay[] {
  const days = new Map<string, AttendanceDay>();
  const getDay = (date: string) => {
    const existing = days.get(date);
    if (existing) return existing;
    const day: AttendanceDay = { date, status: "pending", details: [] };
    days.set(date, day);
    return day;
  };

  for (const date of leaveDates) getDay(date).status = "leave";
  for (const log of logs) {
    const day = getDay(log.date);
    const present = ["arrived", "homework_done", "left"].includes(log.status);
    if (present) day.status = "present";
    else if (log.status === "leave" && day.status !== "present") day.status = "leave";

    const course = log.course_id ? courseNames.get(log.course_id) || "課程" : "課輔";
    const label = log.status === "leave" ? "請假" : present ? "到班" : "未到";
    const detail = `${course}・${label}`;
    if (!day.details.includes(detail)) day.details.push(detail);
  }

  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

type ScoreSource = {
  course_id: string;
  exam_date: string;
  score_1: number | string | null;
  score_2: number | string | null;
  score_1_subject: string | null;
  score_2_subject: string | null;
  score_1_scope: string | null;
  score_2_scope: string | null;
};

export function flattenScores(rows: ScoreSource[], courseNames: Map<string, string>): ParentScore[] {
  const scores: ParentScore[] = [];
  for (const row of rows) {
    const courseName = courseNames.get(row.course_id) || "課程";
    for (const slot of [1, 2] as const) {
      const raw = row[`score_${slot}`];
      if (raw === null || raw === undefined || String(raw).trim() === "") continue;
      const score = Number(raw);
      if (!Number.isFinite(score)) continue;
      scores.push({
        courseName,
        examDate: row.exam_date,
        subject: row[`score_${slot}_subject`]?.trim() || `${courseName}・項目${slot === 1 ? "一" : "二"}`,
        scope: row[`score_${slot}_scope`]?.trim() || null,
        score,
      });
    }
  }
  return scores.sort((a, b) => b.examDate.localeCompare(a.examDate));
}

export function buildScoreTrends(scores: ParentScore[]): ScoreTrend[] {
  const bySubject = new Map<string, ParentScore[]>();
  for (const score of scores) {
    const rows = bySubject.get(score.subject) || [];
    if (!rows.some((row) => row.examDate === score.examDate)) rows.push(score);
    bySubject.set(score.subject, rows);
  }

  return [...bySubject.entries()].map(([subject, rows]) => {
    const [latest, previous] = rows.sort((a, b) => b.examDate.localeCompare(a.examDate));
    const change = previous ? latest.score - previous.score : null;
    return {
      subject,
      latest: latest.score,
      previous: previous?.score ?? null,
      change,
      changePercent: previous && previous.score !== 0
        ? Math.round((change! / Math.abs(previous.score)) * 1000) / 10
        : null,
      latestDate: latest.examDate,
    };
  }).sort((a, b) => b.latestDate.localeCompare(a.latestDate) || a.subject.localeCompare(b.subject, "zh-TW"));
}
