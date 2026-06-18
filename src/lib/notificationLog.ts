import { supabase } from "@/lib/supabase";

export type NotificationType = "low_balance" | "arrived" | "homework_done" | "left" | "leave" | "settlement" | "score" | "broadcast";
export type NotificationStatus = "sent" | "failed" | "skipped";

type NotificationLogInput = {
  notificationType: NotificationType;
  channel?: "line";
  recipientType?: string;
  recipientId?: string;
  recipientName?: string;
  studentId?: string;
  studentName?: string;
  status: NotificationStatus;
  message?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

export const logNotification = async ({
  notificationType,
  channel = "line",
  recipientType = "parent",
  recipientId,
  recipientName,
  studentId,
  studentName,
  status,
  message,
  errorMessage,
  metadata = {},
}: NotificationLogInput) => {
  try {
    const { error } = await supabase.from("notification_logs").insert([{
      notification_type: notificationType,
      channel,
      recipient_type: recipientType,
      recipient_id: recipientId || null,
      recipient_name: recipientName || null,
      student_id: studentId || null,
      student_name: studentName || null,
      status,
      message: message || null,
      error_message: errorMessage || null,
      metadata,
    }]);

    if (error) {
      console.warn("通知紀錄寫入失敗:", error.message);
    }
  } catch (err) {
    console.warn("通知紀錄寫入失敗:", err);
  }
};
