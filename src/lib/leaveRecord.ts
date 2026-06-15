import { supabase } from "@/lib/supabase";

export type LeaveSource = "parent" | "admin" | "teacher" | "system";

type LeaveRecordInput = {
  leaveDate: string;
  studentId: string;
  studentName?: string;
  source: LeaveSource;
  reason?: string | null;
  cancelledOrder?: boolean;
  refunded?: boolean;
  refundAmount?: number;
  keptOrder?: boolean;
  metadata?: Record<string, unknown>;
};

export const saveLeaveRecord = async ({
  leaveDate,
  studentId,
  studentName,
  source,
  reason = null,
  cancelledOrder = false,
  refunded = false,
  refundAmount = 0,
  keptOrder = false,
  metadata = {},
}: LeaveRecordInput) => {
  try {
    const { error } = await supabase.from("leave_records").upsert({
      leave_date: leaveDate,
      student_id: studentId,
      student_name: studentName || null,
      source,
      reason,
      cancelled_order: cancelledOrder,
      refunded,
      refund_amount: refundAmount,
      kept_order: keptOrder,
      metadata,
    }, { onConflict: "leave_date,student_id" });

    if (error) {
      console.warn("請假紀錄寫入失敗:", error.message);
    }
  } catch (err) {
    console.warn("請假紀錄寫入失敗:", err);
  }
};
