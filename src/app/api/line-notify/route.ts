import { NextResponse } from "next/server";
import { logNotification, type NotificationType } from "@/lib/notificationLog";
import { renderNotificationTemplate } from "@/lib/notificationTemplate";
import { validateAuthenticatedRequest } from "@/lib/apiAuth";

export async function POST(req: Request) {
  const unauthorized = await validateAuthenticatedRequest(req);
  if (unauthorized) return unauthorized;

  try {
    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      return NextResponse.json({ error: "伺服器尚未設定 LINE_CHANNEL_ACCESS_TOKEN" }, { status: 503 });
    }

    const { token, message, notificationType = "left", studentId, studentName, recipientName, metadata } = await req.json();

    if (!token || !message) {
      await logNotification({
        notificationType: notificationType as NotificationType,
        recipientId: token,
        recipientName,
        studentId,
        studentName,
        status: "skipped",
        message,
        errorMessage: "缺少 Token 或訊息內容",
        metadata: metadata || {},
      });
      return NextResponse.json({ error: "缺少 Token 或訊息內容" }, { status: 400 });
    }

    const finalMessage = await renderNotificationTemplate(notificationType, message, {
      message,
      studentId,
      studentName,
      recipientName,
      ...(metadata || {}),
    });

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
        messages: [{ type: "text", text: finalMessage }],
      }),
    });

    const result = await response.json();

    await logNotification({
      notificationType: notificationType as NotificationType,
      recipientId: token,
      recipientName,
      studentId,
      studentName,
      status: response.ok ? "sent" : "failed",
      message: finalMessage,
      errorMessage: response.ok ? undefined : JSON.stringify(result),
      metadata: metadata || {},
    });

    return NextResponse.json(result, { status: response.status });
  } catch (err: any) {
    await logNotification({
      notificationType: "left",
      status: "failed",
      errorMessage: err.message,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
