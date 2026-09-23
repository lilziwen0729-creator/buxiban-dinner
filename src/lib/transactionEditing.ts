import { supabase } from "@/lib/supabase";

export type TransactionEntry = {
  id: string;
  student_id: string;
  type: string;
  amount: number;
  balance_after: number | null;
  description: string | null;
  created_at: string;
  edit_version?: number;
};

export function validateTransactionEdit(type: string, amountText: string, description: string) {
  const amount = Number(amountText);
  if (!amountText.trim() || !Number.isSafeInteger(amount) || Math.abs(amount) > 2147483647) {
    throw new Error("請輸入有效的整數金額");
  }
  if (!description.trim()) throw new Error("請填寫明細內容");
  if (type === "order" && amount > 0) throw new Error("餐費扣款請填負數或 0");
  if (["topup", "refund"].includes(type) && amount < 0) throw new Error("儲值與退款請填正數或 0");
  return { amount, description: description.trim() };
}

export async function editTransaction(entry: TransactionEntry, amountText: string, description: string) {
  const values = validateTransactionEdit(entry.type, amountText, description);
  const { data, error } = await supabase.rpc("edit_transaction_atomic", {
    p_transaction_id: entry.id,
    p_student_id: entry.student_id,
    p_expected_version: entry.edit_version ?? 0,
    p_amount: values.amount,
    p_description: values.description,
  });
  if (error) {
    if (["PGRST202", "PGRST204", "42703"].includes(error.code || "")) {
      throw new Error("帳務編輯功能尚未完成資料庫更新，請稍後再試。");
    }
    throw new Error(error.message);
  }
  if (!["updated", "unchanged"].includes(data?.status) || data.transaction_id !== entry.id
    || !Number.isFinite(data.balance_after) || data.delta !== values.amount - entry.amount
    || !Number.isSafeInteger(data.edit_version)) {
    throw new Error("未能確認儲存結果，請重新載入明細確認後再操作。");
  }
  return data as { status: "updated" | "unchanged"; balance_after: number; delta: number; edit_version: number };
}
