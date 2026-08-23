import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 1000;

export async function fetchAllStudentCourses<T>() {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("student_courses")
      .select("*")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}
