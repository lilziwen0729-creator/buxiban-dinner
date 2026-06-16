import { supabase } from "@/lib/supabase";

export type OperationAction =
  | "student_topup"
  | "student_adjust_balance"
  | "student_create"
  | "student_update"
  | "leave_create"
  | "order_cancel"
  | "order_mark_received"
  | "orders_settle"
  | "admin_task_create"
  | "admin_task_update"
  | "admin_task_complete"
  | "admin_task_delete"
  | "course_create"
  | "course_update"
  | "course_delete"
  | "low_balance_notify";

type OperationLogInput = {
  action: OperationAction;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  studentId?: string;
  studentName?: string;
  metadata?: Record<string, unknown>;
};

export const logOperation = async ({
  action,
  targetType,
  targetId,
  targetName,
  studentId,
  studentName,
  metadata = {},
}: OperationLogInput) => {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    const { error } = await supabase.from("operation_logs").insert([{
      actor_id: user?.id || null,
      actor_name: user?.email || "系統/未識別",
      action,
      target_type: targetType || null,
      target_id: targetId || null,
      target_name: targetName || null,
      student_id: studentId || null,
      student_name: studentName || null,
      metadata,
    }]);

    if (error) {
      console.warn("操作紀錄寫入失敗:", error.message);
    }
  } catch (err) {
    console.warn("操作紀錄寫入失敗:", err);
  }
};
