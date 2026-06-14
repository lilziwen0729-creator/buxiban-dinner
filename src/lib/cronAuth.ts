import { NextResponse } from "next/server";

export const validateCronRequest = (req: Request) => {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) return null;

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
