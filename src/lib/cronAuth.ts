import { NextResponse } from "next/server";

export const validateCronRequest = (req: Request) => {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "伺服器尚未設定 CRON_SECRET，排程已停止以避免未授權執行" },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const queryToken = url.searchParams.get("secret");

  if (bearerToken === cronSecret || queryToken === cronSecret) {
    return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
};
