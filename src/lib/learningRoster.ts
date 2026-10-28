export type RosterCourse = {
  id: string; name: string; grade: string | null; start_time: string | null;
  end_time: string | null; is_active?: boolean | null;
  attendance_section?: string | null; course_category?: string | null;
};
export type CourseRoster = { key: string; label: string; studentIds: string[] };

export function buildLearningRosters(
  courses: RosterCourse[],
  links: { course_id: string; student_id: string }[],
  activeStudentIds: string[],
  seriesKey: (course: RosterCourse) => string,
): CourseRoster[] {
  const active = new Set(activeStudentIds);
  const series = new Map<string, { course: RosterCourse; ids: Set<string>; enabled: boolean }>();
  for (const course of courses) {
    const key = seriesKey(course);
    const group = series.get(key) || { course, ids: new Set<string>(), enabled: false };
    group.ids.add(course.id);
    group.enabled ||= course.is_active !== false;
    series.set(key, group);
  }
  return [...series].filter(([, group]) => group.enabled).map(([key, group]) => ({
    key,
    label: `${group.course.grade || "跨年級"} · ${group.course.name}${group.course.start_time ? ` · ${group.course.start_time.slice(0, 5)}` : ""}`,
    studentIds: [...new Set(links.filter((link) => group.ids.has(link.course_id) && active.has(link.student_id)).map((link) => link.student_id))],
  }));
}
