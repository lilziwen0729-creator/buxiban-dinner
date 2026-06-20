import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

type LineSource = {
  type?: "user" | "group" | "room";
  groupId?: string;
};

type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: LineSource;
  message?: {
    type?: string;
    text?: string;
  };
};

const verifySignature = (body: string, signature: string, secret: string) => {
  const expected = createHmac("sha256", secret).update(body).digest("base64");
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
};

const getGroupName = async (groupId: string, accessToken: string) => {
  const response = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) return null;
  const data = await response.json() as { groupName?: string };
  return data.groupName || null;
};

const replyText = async (replyToken: string, text: string, accessToken: string) => {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });
};

const bindStaffGroup = async (groupId: string, accessToken: string) => {
  const groupName = await getGroupName(groupId, accessToken);
  const { error } = await supabase.from("line_staff_groups").upsert({
    group_id: groupId,
    group_name: groupName,
    is_active: true,
    bound_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "group_id" });

  if (error) throw error;
  return groupName;
};

export async function POST(req: Request) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelSecret || !accessToken) {
    return NextResponse.json({ error: "LINE Webhook 環境變數尚未設定" }, { status: 503 });
  }

  const body = await req.text();
  const signature = req.headers.get("x-line-signature") || "";

  if (!signature || !verifySignature(body, signature, channelSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body) as { events?: LineEvent[] };

  for (const event of payload.events || []) {
    const groupId = event.source?.type === "group" ? event.source.groupId : null;
    if (!groupId) continue;

    const isJoin = event.type === "join";
    const isBindCommand = event.type === "message"
      && event.message?.type === "text"
      && event.message.text?.trim() === "#綁定老師群";

    if (!isJoin && !isBindCommand) continue;

    try {
      const groupName = await bindStaffGroup(groupId, accessToken);
      if (event.replyToken) {
        await replyText(
          event.replyToken,
          `老師群綁定成功${groupName ? `：${groupName}` : ""}\n之後行政待辦可推播到此群組。`,
          accessToken,
        );
      }
    } catch (error) {
      console.error("老師群綁定失敗", error);
      if (event.replyToken) {
        await replyText(event.replyToken, "老師群綁定失敗，請確認資料庫設定後再試一次。", accessToken);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

