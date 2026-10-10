import { courseSeriesKey } from "./courseSeries";

export type ContactBookCourse = {
  id: string;
  name: string;
  grade: string | null;
  day_of_week: number;
  start_date?: string | null;
  start_time: string | null;
  end_time: string | null;
  is_active?: boolean | null;
  attendance_section?: string | null;
  course_category?: string | null;
};

export type ContactBookRecord = {
  id: string;
  course_id: string;
  entry_date: string;
  lesson_content: string | null;
  homework: string | null;
  quiz_scope: string | null;
};

export const contactBookFields = [
  { key: "lesson_content", label: "上課內容" },
  { key: "homework", label: "今日作業" },
  { key: "quiz_scope", label: "下次週考範圍" },
] as const;

export const weekdayLabels = ["", "週一", "週二", "週三", "週四", "週五", "週六", "週日"];

export function entryWeekday(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0;
  const value = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== date) return 0;
  return value.getUTCDay() || 7;
}

export function availableContactCourses(courses: ContactBookCourse[], date: string, scope: "scheduled" | "all") {
  const weekday = entryWeekday(date);
  if (!weekday) return [];
  return courses.filter((course) => course.is_active !== false
    && (!course.start_date || course.start_date <= date)
    && (scope === "all" || course.day_of_week === weekday))
    .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")
      || a.name.localeCompare(b.name, "zh-Hant") || a.day_of_week - b.day_of_week);
}

export function pickContactCourse(courses: ContactBookCourse[], date: string, scope: "scheduled" | "all", currentId = "") {
  const available = availableContactCourses(courses, date, scope);
  const current = courses.find((course) => course.id === currentId);
  // Prefer the same class's matching weekday row when changing dates.
  const sameSeries = current ? available.filter((course) => courseSeriesKey(course) === courseSeriesKey(current)) : [];
  return sameSeries.find((course) => course.day_of_week === entryWeekday(date))?.id
    || sameSeries.find((course) => course.id === currentId)?.id
    || sameSeries[0]?.id || available[0]?.id || "";
}

export function groupContactCourses(courses: ContactBookCourse[]) {
  const groups = new Map<string, ContactBookCourse[]>();
  for (const course of courses) {
    const key = courseSeriesKey(course);
    groups.set(key, [...(groups.get(key) || []), course]);
  }
  return [...groups.entries()].map(([key, rows]) => ({ key, courses: rows, representative: rows[0] }))
    .sort((a, b) => a.representative.name.localeCompare(b.representative.name, "zh-Hant"));
}

export function recordContents(record: ContactBookRecord) {
  return contactBookFields.filter(({ key }) => record[key]?.trim()).map(({ key, label }) => ({
    key, label, text: record[key]!.trim(),
  }));
}

export function matchesContactSearch(record: ContactBookRecord, course: ContactBookCourse | undefined, search: string) {
  const text = [course?.name, course?.grade, record.entry_date, ...recordContents(record).map((field) => field.text)]
    .join(" ").toLocaleLowerCase();
  return search.trim().toLocaleLowerCase().split(/\s+/).every((term) => text.includes(term));
}
