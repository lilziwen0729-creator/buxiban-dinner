export const courseCategoryOptions = [
  { value: "primary_tutoring", label: "國小課輔" },
  { value: "primary_math", label: "國小數學素養班" },
  { value: "primary_english", label: "國小美語班" },
  { value: "junior", label: "國中單科" },
] as const;

export type CourseCategory = typeof courseCategoryOptions[number]["value"];

type CourseLike = {
  name?: string | null;
  grade?: string | null;
  course_category?: string | null;
  attendance_section?: string | null;
};

const categoryValues = new Set<string>(courseCategoryOptions.map((option) => option.value));
export function resolveCourseCategory(course: CourseLike): CourseCategory {
  if (course.course_category && categoryValues.has(course.course_category)) {
    return course.course_category as CourseCategory;
  }
  if (course.attendance_section === "junior" || /^(國|高)/.test(course.grade || "")) return "junior";
  const name = course.name || "";
  if (/數學|數理|素養/.test(name)) return "primary_math";
  if (/美語|英語|英文/.test(name)) return "primary_english";
  return "primary_tutoring";
}

export function getCourseCategoryLabel(course: CourseLike) {
  const category = resolveCourseCategory(course);
  return courseCategoryOptions.find((option) => option.value === category)?.label || "國小課輔";
}

export function getCourseAttendanceSection(course: CourseLike) {
  if (course.attendance_section === "hidden") return "hidden" as const;
  return resolveCourseCategory(course) === "junior" ? "junior" as const : "primary" as const;
}

export function isPrimaryCategory(category: CourseCategory) {
  return category !== "junior";
}
