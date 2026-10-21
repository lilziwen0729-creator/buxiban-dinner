export const mealGroups = [
  { value: "primary", label: "國小" },
  { value: "junior", label: "國中" },
  { value: "other", label: "其他年級" },
] as const;
export type MealGroup = typeof mealGroups[number]["value"];
export type MealPlan = { vendor_id: string | null; menu_id: string | null };
export type MealSchedule = MealPlan & {
  weekday: string;
  primary_vendor_id?: string | null;
  primary_menu_id?: string | null;
  junior_vendor_id?: string | null;
  junior_menu_id?: string | null;
};
export const mealWeekdays = ["星期一", "星期二", "星期三", "星期四", "星期五"];
export const normalizeMealWeekday = (value: string) => value.normalize("NFKC").replace(/\s/g, "").replace(/周/g, "週").replace(/^星期/, "週");

export function getMealGroup(grade: string | null | undefined): MealGroup {
  const value = (grade || "").normalize("NFKC").replace(/\s/g, "");
  if (/^(小|國小)/.test(value)) return "primary";
  if (/^國/.test(value)) return "junior";
  return "other";
}

export function getGroupMealPlan(schedule: MealSchedule | undefined, group: MealGroup): MealPlan {
  if (!schedule) return { vendor_id: null, menu_id: null };
  // A missing column means the legacy schema; an explicit null means no meal for this group.
  if (group !== "other" && `${group}_menu_id` in schedule) {
    return { vendor_id: schedule[`${group}_vendor_id`] || null, menu_id: schedule[`${group}_menu_id`] || null };
  }
  return { vendor_id: schedule.vendor_id || null, menu_id: schedule.menu_id || null };
}

export function findMealSchedule(schedules: MealSchedule[], weekday: string) {
  return schedules.find((schedule) => normalizeMealWeekday(schedule.weekday) === normalizeMealWeekday(weekday));
}

export function planMealOrders<T extends { id: string; grade: string | null }>(students: T[], schedule: MealSchedule | undefined, date: string) {
  const missing: T[] = [];
  const orders: { student_id: string; order_date: string; meal_id: string; ordered: true; cancelled: false; received: false; charged: false }[] = [];
  for (const student of students) {
    const meal = getGroupMealPlan(schedule, getMealGroup(student.grade));
    if (!meal.menu_id) { missing.push(student); continue; }
    orders.push({ student_id: student.id, order_date: date, meal_id: meal.menu_id, ordered: true, cancelled: false, received: false, charged: false });
  }
  return { orders, missing };
}
