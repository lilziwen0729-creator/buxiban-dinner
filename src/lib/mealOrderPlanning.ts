import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

type MealStudent = {
  id: string;
  name: string;
  grade: string | null;
  fixed_days_off: string[] | null;
  auto_order: boolean | null;
  enrollment_status: string | null;
};

const normalizeDay = (value: string) =>
  value.normalize("NFKC").replace(/\s/g, "").replace(/周/g, "週").replace(/^星期/, "週");

export function selectMealOrderStudents(
  students: MealStudent[],
  weekday: string,
  overrides: { student_id: string; should_order: boolean }[],
  leaves: { student_id: string; kept_order: boolean }[],
) {
  const decisions = new Map(overrides.map((row) => [row.student_id, row.should_order]));
  const absent = new Set(leaves.filter((row) => !row.kept_order).map((row) => row.student_id));

  return students.filter((student) => {
    if ((student.enrollment_status || "active") !== "active" || absent.has(student.id)) return false;
    const fixed = Boolean(student.auto_order) && (student.fixed_days_off || [])
      .some((day) => normalizeDay(String(day)) === normalizeDay(weekday));
    return decisions.get(student.id) ?? fixed;
  });
}

export async function getMealOrderCandidates(date: string, weekday: string, client: SupabaseClient = supabase) {
  const [studentsResult, overridesResult, leavesResult] = await Promise.all([
    client.from("students").select("id, name, grade, fixed_days_off, auto_order, enrollment_status"),
    client.from("meal_order_overrides").select("student_id, should_order").eq("order_date", date),
    client.from("leave_records").select("student_id, kept_order").eq("leave_date", date),
  ]);
  if (studentsResult.error) throw studentsResult.error;
  if (overridesResult.error) throw overridesResult.error;
  if (leavesResult.error) throw leavesResult.error;

  const students = (studentsResult.data || []) as MealStudent[];
  return {
    students,
    eligibleStudents: selectMealOrderStudents(
      students, weekday, overridesResult.data || [], leavesResult.data || [],
    ),
  };
}
