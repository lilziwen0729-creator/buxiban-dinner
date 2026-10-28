import type { SupabaseClient } from "@supabase/supabase-js";

export async function undoAttendanceDeparture(client: SupabaseClient, studentId: string, date: string, courseId: string | null, english = false) {
  const conflict = english ? "Attendance changed. Refresh and try again." : "點名狀態已變更，請重新整理後再試。";
  let query = client.from("attendance_logs").select("*").eq("student_id", studentId).eq("date", date);
  query = courseId ? query.eq("course_id", courseId) : query.is("course_id", null);
  const { data: before, error } = await query.maybeSingle();
  if (error) throw error;
  if (!before || before.status !== "left") throw new Error(conflict);
  // Keep the original arrival and homework timestamps; only reverse departure.
  let update = client.from("attendance_logs").update({ status: before.homework_time ? "homework_done" : "arrived", leave_time: null })
    .eq("id", before.id).eq("status", "left");
  update = before.leave_time ? update.eq("leave_time", before.leave_time) : update.is("leave_time", null);
  update = before.homework_time ? update.eq("homework_time", before.homework_time) : update.is("homework_time", null);
  const { data: after, error: failure } = await update.select("*").maybeSingle();
  if (failure) throw failure;
  if (!after) throw new Error(conflict);
  return after;
}
