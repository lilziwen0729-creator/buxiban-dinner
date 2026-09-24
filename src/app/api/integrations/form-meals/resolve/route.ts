import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { applyFormMealSubmission } from "@/lib/formMealSync";

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const db = getSupabaseAdmin();
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  try {
    const body = await request.json() as { responseId?: string; studentId?: string };
    if (!body.responseId || !body.studentId) return NextResponse.json({ error: "缺少回覆或學生" }, { status: 400 });
    const result = await applyFormMealSubmission(body.responseId, body.studentId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("表單訂餐核對失敗", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "核對失敗" }, { status: 500 });
  }
}
