import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const validateAuthenticatedRequest = async (req: Request) => {
  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return NextResponse.json({ error: "請先登入管理員帳號" }, { status: 401 });
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return NextResponse.json({ error: "登入狀態已失效，請重新登入" }, { status: 401 });
  }

  return null;
};
