import { resolveCourseCategory } from "./courseCategory";

type SeriesCourse = {
  name: string;
  grade: string | null;
  start_time: string | null;
  end_time: string | null;
  attendance_section?: string | null;
  course_category?: string | null;
};

export const courseSeriesKey = (course: SeriesCourse) => [
  course.name || "",
  course.grade || "",
  course.start_time?.slice(0, 5) || "",
  course.end_time?.slice(0, 5) || "",
  course.attendance_section || "auto",
  resolveCourseCategory(course),
].join("::");
