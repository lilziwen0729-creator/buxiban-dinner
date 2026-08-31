import { supabase } from "@/lib/supabase";

type CourseActivity = { is_active?: boolean | null };

// Older course rows without this field remain active until the migration runs.
export const isCourseActive = (course: CourseActivity) => course.is_active !== false;

export const isCourseSeriesActive = (courses: CourseActivity[]) => courses.some(isCourseActive);

export async function setCourseSeriesActive(courseIds: string[], isActive: boolean) {
  const ids = Array.from(new Set(courseIds));
  if (ids.length === 0) throw new Error("請先選擇課程。");

  const { data, error } = await supabase.from("courses")
    .update({ is_active: isActive })
    .in("id", ids)
    .select("id, is_active");
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      throw new Error("課程停用功能尚未完成資料庫設定，請先執行 database/course_active_status.sql。");
    }
    throw error;
  }

  const updatedIds = new Set((data || [])
    .filter((course) => course.is_active === isActive)
    .map((course) => course.id));
  if (updatedIds.size !== ids.length || ids.some((id) => !updatedIds.has(id))) {
    throw new Error("未能確認整門課程的狀態，請重新整理後再試。");
  }
}
