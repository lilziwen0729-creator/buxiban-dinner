import { supabase } from "@/lib/supabase";

export type CancellationPreview = {
  status: "ready";
  order_id: string;
  order_date: string;
  received: boolean;
  charged: boolean;
  refund_amount: number | null;
};

export type CancellationResult = {
  status: "cancelled" | "already_cancelled" | "missing";
  refund_amount: number;
  balance_after?: number;
  manual_refund?: boolean;
};

function throwRpcError(error: { code?: string; message: string }) {
  if (["PGRST202", "PGRST204", "42703"].includes(error.code || "")) {
    throw new Error("取消與退款功能尚未完成資料庫設定，請執行 database/accounting_atomic.sql。");
  }
  throw new Error(error.message);
}

export async function previewOrderCancellation(orderId: string): Promise<CancellationPreview> {
  const { data, error } = await supabase.rpc("preview_order_cancellation", { p_order_id: orderId });
  if (error) throwRpcError(error);
  if (data?.status === "missing" || data?.status === "already_cancelled") {
    throw new Error("這筆訂餐已取消或不存在，請重新整理名單。");
  }
  if (data?.status !== "ready" || data.order_id !== orderId
    || typeof data.received !== "boolean" || typeof data.charged !== "boolean"
    || (data.refund_amount !== null && !Number.isFinite(data.refund_amount))
    || (!data.charged && data.refund_amount !== 0)
    || (data.charged && data.refund_amount !== null && data.refund_amount <= 0)) {
    throw new Error("無法確認訂單及退款資料，未取消訂餐。");
  }
  return data;
}

export async function cancelOrderWithRefund(
  preview: CancellationPreview, refundAmount: number, reason: string,
): Promise<CancellationResult> {
  if (!Number.isSafeInteger(refundAmount) || refundAmount < 0
    || (preview.charged && refundAmount === 0) || (!preview.charged && refundAmount !== 0)) {
    throw new Error("請填寫正確的退款金額。");
  }
  if (preview.refund_amount === null && !reason.trim()) {
    throw new Error("請填寫人工確認退款的原因。");
  }
  const { data, error } = await supabase.rpc("cancel_order_atomic", {
    p_order_id: preview.order_id,
    p_expected_received: preview.received,
    p_expected_charged: preview.charged,
    p_refund_amount: refundAmount,
    p_reason: reason.trim(),
  });
  if (error) throwRpcError(error);
  if (!["cancelled", "already_cancelled", "missing"].includes(data?.status)) {
    throw new Error("未能確認取消結果，請重新整理名單後確認。");
  }
  if (data.status === "cancelled"
    && (data.order_id !== preview.order_id || !Number.isFinite(data.refund_amount)
      || data.refund_amount !== refundAmount)) {
    throw new Error("退款結果需重新確認，請重新整理名單與交易明細。");
  }
  return { ...data, refund_amount: data.refund_amount ?? 0 };
}
