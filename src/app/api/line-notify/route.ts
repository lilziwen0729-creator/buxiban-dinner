import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { token, message } = await req.json();

    if (!token || !message) {
      return NextResponse.json({ error: "缺少 Token 或訊息內容" }, { status: 400 });
    }

    // 這裡使用 LINE Messaging API 發送 Push Message
    // 確保你的環境變數中有 LINE_CHANNEL_ACCESS_TOKEN
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: token,
        messages: [{ type: "text", text: message }],
      }),
    });

    const result = await response.json();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}