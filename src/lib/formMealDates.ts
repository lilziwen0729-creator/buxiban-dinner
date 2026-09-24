export const FORM_MEAL_ID = "1jm6EyKIZfxVl9Thh5bQ6SUfqG-Ry4eigTfYYCM7atUo";

export type FormGradeGroup = "middle" | "upper";

const formDates: Record<FormGradeGroup, Record<string, string>> = {
  middle: {
    "10/2": "2026-10-02", "10/5": "2026-10-05", "10/12": "2026-10-12",
    "10/16": "2026-10-16", "10/19": "2026-10-19", "10/23": "2026-10-23",
    "10/30": "2026-10-30", "11/2": "2026-11-02",
  },
  upper: {
    "9/30": "2026-09-30", "10/2": "2026-10-02", "10/7": "2026-10-07",
    "10/14": "2026-10-14", "10/16": "2026-10-16", "10/21": "2026-10-21",
    "10/23": "2026-10-23", "10/28": "2026-10-28", "10/30": "2026-10-30",
  },
};

export const normalizeFormName = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").trim();

export function getFormGradeGroup(value: string): FormGradeGroup | null {
  const normalized = value.normalize("NFKC").replace(/\s+/g, "");
  if (normalized.startsWith("中年級")) return "middle";
  if (normalized.startsWith("高年級")) return "upper";
  return null;
}

export function gradeMatchesGroup(grade: string | null, group: FormGradeGroup) {
  return (group === "middle" ? ["小三", "小四"] : ["小五", "小六"]).includes(grade || "");
}

export function parseFormMealDates(labels: string[], group: FormGradeGroup) {
  if (labels.length > 20 || labels.some((label) => typeof label !== "string" || label.length > 40)) {
    throw new Error("表單日期格式不正確");
  }
  const dates = labels.map((label) => {
    const normalized = label.normalize("NFKC").replace(/\s+/g, "");
    const match = normalized.match(/^(\d{1,2})\/?(\d{1,2})\([一二三四五六日]\)[、，,]?$/);
    const key = match ? `${Number(match[1])}/${Number(match[2])}` : "";
    const date = formDates[group][key];
    if (!date) throw new Error(`表單日期不在可訂範圍：${label}`);
    return date;
  });
  return [...new Set(dates)].sort();
}

export function selectFormMealDates(
  dates: string[], today: string,
  stopped: Set<string>, absent: Set<string>, cancelled: Set<string>,
) {
  const appliedDates = dates.filter((date) => date >= today
    && !stopped.has(date) && !absent.has(date) && !cancelled.has(date));
  const skippedDates = dates.filter((date) => !appliedDates.includes(date));
  return { appliedDates, skippedDates };
}
