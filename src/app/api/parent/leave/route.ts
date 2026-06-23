import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type LeaveRequest = {
  studentId?: string;
};

type LineProfile = {
  userId: string;
};

const getTaipeiDateTime = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
  };
};

const getLineProfile = async (accessToken: string) => {
  const response = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) return null;
  return (await response.json()) as LineProfile;
};

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const lineAccessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
    if (!lineAccessToken) {
      return NextResponse.json({ error: "LINE 登入狀態無效，請重新開啟頁面" }, { status: 401 });
    }

    const profile = await getLineProfile(lineAccessToken);
    if (!profile?.userId) {
      return NextResponse.json({ error: "無法驗證 LINE 身分，請重新登入" }, { status: 401 });
    }

    const body = (await req.json()) as LeaveRequest;
    const studentId = body.studentId?.trim();
    if (!studentId) {
      return NextResponse.json({ error: "缺少學生資料" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: relation, error: relationError } = await supabase
      .from("student_parent_relations")
      .select("student_id, students!inner(name, enrollment_status), parents!inner(line_user_id)")
      .eq("student_id", studentId)
      .eq("parents.line_user_id", profile.userId)
      .maybeSingle();

    if (relationError) throw relationError;
    if (!relation) {
      return NextResponse.json({ error: "您沒有權限替這位學生請假" }, { status: 403 });
    }

    const student = Array.isArray(relation.students) ? relation.students[0] : relation.students;
    if (!student || (student.enrollment_status || "active") !== "active") {
      return NextResponse.json({ error: "此學生目前不是在班狀態" }, { status: 409 });
    }

    const taipeiNow = getTaipeiDateTime();
    const beforeCutoff = taipeiNow.hour < 12;
    const { data, error } = await supabase.rpc("register_parent_leave_atomic", {
      p_student_id: studentId,
      p_leave_date: taipeiNow.date,
      p_before_cutoff: beforeCutoff,
      p_student_name: student.name,
    });
    if (error) throw error;

    return NextResponse.json({
      ...(data as Record<string, unknown>),
      before_cutoff: beforeCutoff,
      leave_date: taipeiNow.date,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "請假處理失敗";
    console.error("家長請假 API 失敗", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
