import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { FORM_MEAL_ID, getFormGradeGroup, normalizeFormName, parseFormMealDates } from "@/lib/formMealDates";
import { applyFormMealSubmission } from "@/lib/formMealSync";

type FormMealRequest = {
  formId?: unknown;
  responseId?: unknown;
  studentName?: unknown;
  gradeGroup?: unknown;
  selectedDateLabels?: unknown;
  submittedAt?: unknown;
};

function authorized(request: Request) {
  const secret = process.env.FORM_MEAL_WEBHOOK_SECRET;
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !token) return false;
  const tokenBytes = Buffer.from(token);
  const secretBytes = Buffer.from(secret);
  return tokenBytes.length === secretBytes.length && timingSafeEqual(tokenBytes, secretBytes);
}

export async function POST(request: Request) {
  if (!process.env.FORM_MEAL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "表單同步尚未設定" }, { status: 503 });
  }
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const raw = await request.text();
    if (raw.length > 8192) return NextResponse.json({ error: "資料過長" }, { status: 413 });
    const body = JSON.parse(raw) as FormMealRequest;
    if (body.formId !== FORM_MEAL_ID || typeof body.responseId !== "string"
      || !/^[^\s]{1,256}$/.test(body.responseId)
      || typeof body.studentName !== "string" || body.studentName.length > 100
      || !normalizeFormName(body.studentName)
      || typeof body.gradeGroup !== "string"
      || !Array.isArray(body.selectedDateLabels)
      || !body.selectedDateLabels.every((item) => typeof item === "string")) {
      return NextResponse.json({ error: "表單資料不完整" }, { status: 400 });
    }
    const group = getFormGradeGroup(body.gradeGroup);
    if (!group) return NextResponse.json({ error: "未知年級組" }, { status: 400 });
    const dates = parseFormMealDates(body.selectedDateLabels, group);
    const submittedAt = typeof body.submittedAt === "string" && !Number.isNaN(Date.parse(body.submittedAt))
      ? new Date(body.submittedAt).toISOString() : null;
    const db = getSupabaseAdmin();
    const { error: insertError } = await db.from("form_meal_submissions").upsert({
      response_id: body.responseId, form_id: FORM_MEAL_ID,
      student_name: normalizeFormName(body.studentName), grade_group: group,
      selected_dates: dates, submitted_at: submittedAt, status: "received",
    }, { onConflict: "response_id", ignoreDuplicates: true });
    if (insertError) throw insertError;

    const result = await applyFormMealSubmission(body.responseId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("表單訂餐同步失敗", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "同步失敗" }, { status: 500 });
  }
}
