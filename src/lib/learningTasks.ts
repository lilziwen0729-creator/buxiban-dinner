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
};
export const learningKindLabel = (kind: string) => learningKinds.find((item) => item.value === kind)?.label || "其他";
export const taskProgress = (task: LearningTask) => {
  const entries = task.learning_task_students.filter((entry) => entry.active);
  const completed = entries.filter((entry) => entry.completed).length;
  return { total: entries.length, completed, pending: entries.length - completed };
};
export const matchesLearningTask = (task: LearningTask, search: string, grade: string) => {
  const entries = task.learning_task_students.filter((entry) => entry.active);
  if (grade && !entries.some((entry) => entry.grade === grade)) return false;
  const query = search.trim().toLocaleLowerCase();
  return !query || [task.subject, task.scope, task.note, learningKindLabel(task.task_kind), ...entries.map((entry) => entry.student_name)]
    .some((text) => text.toLocaleLowerCase().includes(query));
};
export const shiftLearningDate = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
