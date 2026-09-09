export type TeacherLanguage = "zh" | "en";

type StudentNameLike = {
  name?: string | null;
  english_name?: string | null;
};

const gradeLabels: Record<string, string> = {
  "大班": "Kindergarten",
  "小一": "Grade 1",
  "小二": "Grade 2",
  "小三": "Grade 3",
  "小四": "Grade 4",
  "小五": "Grade 5",
  "小六": "Grade 6",
  "國一": "Grade 7",
  "國二": "Grade 8",
  "國三": "Grade 9",
  "高一": "Grade 10",
  "無": "Not set",
};

export function teacherText(language: TeacherLanguage, zh: string, en: string) {
  return language === "en" ? en : zh;
}

export function formatTeacherStudentName(
  student: StudentNameLike,
  language: TeacherLanguage,
  alwaysShowEnglishName = false,
) {
  const chineseName = String(student.name || "").trim();
  const englishName = String(student.english_name || "").trim();
  if ((language === "en" || alwaysShowEnglishName) && englishName) {
    return `${chineseName} (${englishName})`;
  }
  return chineseName;
}

export function formatTeacherGrade(grade: string | null | undefined, language: TeacherLanguage) {
  const original = String(grade || "").trim();
  if (language !== "en") return original;
  return gradeLabels[original] || original;
}

export function formatTeacherWeekday(day: number, language: TeacherLanguage) {
  const zh = ["", "週一", "週二", "週三", "週四", "週五", "週六", "週日"];
  const en = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return language === "en" ? en[day] || String(day) : zh[day] || `週${day}`;
}
