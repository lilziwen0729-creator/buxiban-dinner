import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildScoreTrends, flattenScores, summarizeAttendance,
  type ParentCourse, type ParentStudentInfo,
} from "@/lib/parentStudentInfo";

type LineProfile = { userId: string };

const monthBounds = (month: string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, number] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  return { start: `${month}-01`, end };
};

export async function GET(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "請重新登入 LINE" }, { status: 401 });

    const profileResponse = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!profileResponse.ok) return NextResponse.json({ error: "LINE 登入已失效" }, { status: 401 });
    const profile = (await profileResponse.json()) as LineProfile;
    if (!profile.userId) return NextResponse.json({ error: "無法驗證 LINE 身分" }, { status: 401 });

    const url = new URL(req.url);
    const studentId = url.searchParams.get("studentId")?.trim();
    const month = url.searchParams.get("month") || "";
    const bounds = monthBounds(month);
    if (!studentId || !bounds) return NextResponse.json({ error: "學生或月份格式不正確" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: relation, error: relationError } = await supabase
      .from("student_parent_relations")
      .select("student_id, parents!inner(line_user_id)")
      .eq("student_id", studentId)
      .eq("parents.line_user_id", profile.userId)
      .maybeSingle();
    if (relationError) throw relationError;
    if (!relation) return NextResponse.json({ error: "無權查看這位學生的資料" }, { status: 403 });

    const [enrollmentsResult, attendanceResult, historyResult, leaveResult, scoresResult, trendResult] = await Promise.all([
      supabase.from("student_courses").select("course_id,start_date,created_at").eq("student_id", studentId),
      supabase.from("attendance_logs").select("date,status,course_id")
        .eq("student_id", studentId).gte("date", bounds.start).lte("date", bounds.end).limit(1000),
      supabase.from("attendance_logs").select("date,course_id")
        .eq("student_id", studentId).not("course_id", "is", null)
        .order("date", { ascending: false }).limit(1000),
      supabase.from("leave_records").select("leave_date,reason,cancelled_order")
        .eq("student_id", studentId).gte("leave_date", bounds.start).lte("leave_date", bounds.end)
        .order("leave_date", { ascending: false }).limit(1000),
      supabase.from("exam_scores")
        .select("course_id,exam_date,score_1,score_2,score_1_subject,score_2_subject,score_1_scope,score_2_scope")
        .eq("student_id", studentId).gte("exam_date", bounds.start).lte("exam_date", bounds.end)
        .order("exam_date", { ascending: false }).limit(1000),
      supabase.from("exam_scores")
        .select("course_id,exam_date,score_1,score_2,score_1_subject,score_2_subject,score_1_scope,score_2_scope")
        .eq("student_id", studentId).order("exam_date", { ascending: false }).limit(1000),
    ]);
    let enrollmentRows = enrollmentsResult.data;
    let enrollmentError = enrollmentsResult.error;
    if (enrollmentError && /start_date/i.test(enrollmentError.message)) {
      const fallback = await supabase.from("student_courses")
        .select("course_id,created_at").eq("student_id", studentId);
      enrollmentRows = fallback.data?.map((row) => ({ ...row, start_date: null })) || null;
      enrollmentError = fallback.error;
    }
    const queryError = [{ error: enrollmentError }, attendanceResult, historyResult, leaveResult, scoresResult, trendResult]
      .find((result) => result.error)?.error;
    if (queryError) throw queryError;

    const enrollmentDates = new Map<string, string>();
    for (const row of enrollmentRows || []) {
      enrollmentDates.set(row.course_id, row.start_date || row.created_at?.slice(0, 10) || "0000-01-01");
    }
    const visibleCourseDates = new Map(enrollmentDates);
    const historicalCourseEnds = new Map<string, string>();
    for (const row of historyResult.data || []) {
      if (!row.course_id) continue;
      const previous = visibleCourseDates.get(row.course_id);
      if (!previous || row.date < previous) visibleCourseDates.set(row.course_id, row.date);
      const lastDate = historicalCourseEnds.get(row.course_id);
      if (!lastDate || row.date > lastDate) historicalCourseEnds.set(row.course_id, row.date);
    }
    const courseIds = [...new Set([
      ...visibleCourseDates.keys(),
      ...(scoresResult.data || []).map((row) => row.course_id),
      ...(trendResult.data || []).map((row) => row.course_id),
    ])];
    const [coursesResult, contactResult] = await Promise.all([
      courseIds.length
        ? supabase.from("courses").select("id,name,grade,day_of_week,start_time,end_time,is_active").in("id", courseIds)
        : Promise.resolve({ data: [], error: null }),
      visibleCourseDates.size
        ? supabase.from("contact_books")
          .select("id,course_id,entry_date,lesson_content,homework,quiz_scope")
          .in("course_id", [...visibleCourseDates.keys()])
          .gte("entry_date", bounds.start).lte("entry_date", bounds.end)
          .order("entry_date", { ascending: false }).limit(1000)
        : Promise.resolve({ data: [], error: null }),
    ]);
    let courseRows = coursesResult.data;
    let courseError = coursesResult.error;
    if (courseError && /is_active/i.test(courseError.message)) {
      const fallback = await supabase.from("courses")
        .select("id,name,grade,day_of_week,start_time,end_time").in("id", courseIds);
      courseRows = fallback.data?.map((row) => ({ ...row, is_active: true })) || null;
      courseError = fallback.error;
    }
    if (courseError || contactResult.error) throw courseError || contactResult.error;

    const courseNames = new Map((courseRows || []).map((row) => [row.id, row.name]));
    const courses: ParentCourse[] = (courseRows || [])
      .filter((row) => visibleCourseDates.has(row.id))
      .map((row) => ({
        id: row.id,
        name: row.name,
        grade: row.grade,
        dayOfWeek: row.day_of_week,
        startTime: row.start_time,
        endTime: row.end_time,
        current: enrollmentDates.has(row.id) && row.is_active !== false,
        startDate: visibleCourseDates.get(row.id) || null,
      }))
      .sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name, "zh-TW"));
    const leaves = (leaveResult.data || []).map((row) => ({
      date: row.leave_date,
      reason: row.reason,
      cancelledOrder: Boolean(row.cancelled_order),
    }));
    const monthlyScores = flattenScores(scoresResult.data || [], courseNames);
    const recentScores = flattenScores(trendResult.data || [], courseNames);
    const info: ParentStudentInfo = {
      studentId,
      month,
      courses,
      attendance: summarizeAttendance(attendanceResult.data || [], leaves.map((row) => row.date), courseNames),
      contactBooks: (contactResult.data || [])
        .filter((row) => row.entry_date >= (visibleCourseDates.get(row.course_id) || "9999-12-31")
          && (enrollmentDates.has(row.course_id) || row.entry_date <= (historicalCourseEnds.get(row.course_id) || "0000-01-01")))
        .map((row) => ({
          id: row.id,
          courseName: courseNames.get(row.course_id) || "課程",
          entryDate: row.entry_date,
          lessonContent: row.lesson_content,
          homework: row.homework,
          quizScope: row.quiz_scope,
        })),
      scores: monthlyScores,
      trends: buildScoreTrends(recentScores),
      leaves,
    };

    return NextResponse.json(info, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("家長學生資訊 API 失敗", error);
    return NextResponse.json({ error: "讀取學生資料失敗，請稍後重試" }, { status: 500 });
  }
}
