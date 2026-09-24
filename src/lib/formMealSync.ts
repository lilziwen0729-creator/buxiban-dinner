import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getToday } from "@/lib/date";
import { gradeMatchesGroup, normalizeFormName, selectFormMealDates, type FormGradeGroup } from "@/lib/formMealDates";

type Submission = {
  response_id: string;
  student_name: string;
  grade_group: FormGradeGroup;
  selected_dates: string[];
  student_id: string | null;
  status: string;
};

type Student = { id: string; name: string; grade: string | null };

export async function applyFormMealSubmission(responseId: string, selectedStudentId?: string) {
  const db = getSupabaseAdmin();
  const { data: submission, error: submissionError } = await db.from("form_meal_submissions")
    .select("response_id, student_name, grade_group, selected_dates, student_id, status")
    .eq("response_id", responseId).single();
  if (submissionError) throw submissionError;
  const record = submission as Submission;
  if (record.status === "applied") return { status: "applied", alreadyProcessed: true };
  if (selectedStudentId && record.student_id && selectedStudentId !== record.student_id) {
    throw new Error("已套用過訂餐日期的回覆不能改綁其他學生");
  }

  const { data: studentRows, error: studentError } = await db.from("students")
    .select("id, name, grade").eq("enrollment_status", "active");
  if (studentError) throw studentError;
  const students = (studentRows || []) as Student[];
  const matches = students.filter((student) =>
    gradeMatchesGroup(student.grade, record.grade_group)
    && normalizeFormName(student.name) === normalizeFormName(record.student_name));
  const student = selectedStudentId
    ? students.find((item) => item.id === selectedStudentId && gradeMatchesGroup(item.grade, record.grade_group))
    : record.student_id
      ? students.find((item) => item.id === record.student_id)
      : matches.length === 1 ? matches[0] : undefined;

  if (!student) {
    const note = selectedStudentId ? "指定學生不在表單年級組內" : matches.length > 1
      ? "同名學生不只一位，請手動核對" : "找不到姓名與年級都相符的在班學生";
    const { error } = await db.from("form_meal_submissions").update({
      status: "unmatched", note, updated_at: new Date().toISOString(),
    }).eq("response_id", responseId);
    if (error) throw error;
    return { status: "unmatched", note };
  }

  const dates = record.selected_dates || [];
  const today = getToday();
  const eligibleDates = dates.filter((date) => date >= today);
  const [overridesResult, leavesResult, ordersResult] = eligibleDates.length ? await Promise.all([
    db.from("meal_order_overrides").select("order_date, should_order")
      .eq("student_id", student.id).in("order_date", eligibleDates),
    db.from("leave_records").select("leave_date, kept_order")
      .eq("student_id", student.id).in("leave_date", eligibleDates),
    db.from("orders").select("order_date, cancelled")
      .eq("student_id", student.id).in("order_date", eligibleDates),
  ]) : [
    { data: [], error: null }, { data: [], error: null }, { data: [], error: null },
  ];
  if (overridesResult.error || leavesResult.error || ordersResult.error) {
    throw overridesResult.error || leavesResult.error || ordersResult.error;
  }

  const stopped = new Set((overridesResult.data || []).filter((row) => !row.should_order).map((row) => row.order_date));
  const absent = new Set((leavesResult.data || []).filter((row) => !row.kept_order).map((row) => row.leave_date));
  const cancelled = new Set((ordersResult.data || []).filter((row) => row.cancelled).map((row) => row.order_date));
  const { appliedDates, skippedDates } = selectFormMealDates(dates, today, stopped, absent, cancelled);

  if (appliedDates.length) {
    const { error } = await db.from("meal_order_overrides").upsert(
      appliedDates.map((date) => ({ student_id: student.id, order_date: date, should_order: true })),
      { onConflict: "student_id,order_date", ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  const status = skippedDates.length ? "review" : "applied";
  const note = skippedDates.length ? "部分日期已過、請假、停訂或訂單已取消，未覆蓋原設定" : null;
  const { error: updateError } = await db.from("form_meal_submissions").update({
    student_id: student.id, status, applied_dates: appliedDates, skipped_dates: skippedDates,
    note, updated_at: new Date().toISOString(),
  }).eq("response_id", responseId);
  if (updateError) throw updateError;
  return { status, appliedDates, skippedDates };
}
