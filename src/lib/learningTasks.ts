import type { CourseRoster } from "./learningRoster";

export const learningKinds = [
  { value: "paper", label: "考卷" }, { value: "fill", label: "填空" },
  { value: "recite", label: "抽背" }, { value: "practice", label: "練習" },
  { value: "correction", label: "訂正" }, { value: "other", label: "其他" },
] as const;
export const learningGrades = ["小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三"];
export const learningSubjects = ["國語", "數學", "英文", "自然", "社會", "國文", "理化", "生物", "歷史", "地理", "公民"];
export type LearningStudent = { id: string; name: string; grade: string; enrollment_status?: string | null };
export type LearningEntry = {
  id: string; task_id: string; student_id: string | null; student_name: string; grade: string;
  active: boolean; completed: boolean; completed_at: string | null; note: string; version: number;
};
export type LearningTask = {
  id: string; task_date: string; subject: string; task_kind: string; scope: string; note: string;
  archived: boolean; version: number; learning_task_students: LearningEntry[];
  class_names?: string[] | null;
};
export const learningTaskClasses = (task: LearningTask, rosters: CourseRoster[] = []): string[] => {
  if (task.class_names != null) return task.class_names;
  const entries = task.learning_task_students.filter((entry) => entry.active);
  if (!entries.length || entries.some((entry) => !entry.student_id)) return [];
  const ids = new Set(entries.map((entry) => entry.student_id));
  // Legacy tasks did not save their source course. Infer only an unambiguous full roster.
  const matches = rosters.filter((roster) => roster.studentIds.length === ids.size && roster.studentIds.every((id) => ids.has(id)));
  return matches.length === 1 ? [matches[0].name] : [];
};
export const learningTaskClassLabel = (task: LearningTask, rosters: CourseRoster[] = []) => {
  const names = learningTaskClasses(task, rosters);
  if (names.length) return names.join("、");
  const grades = [...new Set(task.learning_task_students.filter((entry) => entry.active).map((entry) => entry.grade).filter(Boolean))]
    .sort((a, b) => (learningGrades.indexOf(a) < 0 ? 99 : learningGrades.indexOf(a)) - (learningGrades.indexOf(b) < 0 ? 99 : learningGrades.indexOf(b)) || a.localeCompare(b, "zh-Hant"));
  return grades.length ? `${grades.join("、")} · ${grades.length > 1 ? "跨班任務" : "學生名單"}` : "個別學生";
};
export const learningKindLabel = (kind: string) => learningKinds.find((item) => item.value === kind)?.label || "其他";
export const taskProgress = (task: LearningTask) => {
  const entries = task.learning_task_students.filter((entry) => entry.active);
  const completed = entries.filter((entry) => entry.completed).length;
  return { total: entries.length, completed, pending: entries.length - completed };
};
export const matchesLearningTask = (task: LearningTask, search: string, grade: string, classLabel = learningTaskClassLabel(task)) => {
  const entries = task.learning_task_students.filter((entry) => entry.active);
  if (grade && !entries.some((entry) => entry.grade === grade)) return false;
  const query = search.trim().toLocaleLowerCase();
  return !query || [classLabel, task.subject, task.scope, task.note, learningKindLabel(task.task_kind), ...entries.map((entry) => entry.student_name)]
    .some((text) => text.toLocaleLowerCase().includes(query));
};
export const shiftLearningDate = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
