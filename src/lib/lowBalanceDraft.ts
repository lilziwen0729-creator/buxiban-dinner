export type BalanceRecipient = { student_id: string; student_name: string; balance: number };
export type LowBalancePreviewRow = BalanceRecipient & { parent_count: number; reason?: string };

export const canSendLowBalanceLine = (row: LowBalancePreviewRow) =>
  row.parent_count > 0 && row.reason === "dryRun 未發送";

export function defaultBalanceTemplate(account?: string) {
  const bank = account?.trim();
  return [
    "家長您好：",
    "{{學生姓名}} 餐費目前餘額為 $ {{餘額}}，",
    bank ? "再麻煩家長抽空至櫃檯繳費或線上匯款。" : "再麻煩家長抽空至櫃檯繳費。",
    "【長期訂餐建議多儲值 $2000-3000】",
    "",
    "若之前已繳款過或有任何疑問都可以跟我們說喔~",
    ...(bank ? ["", "如需使用匯款方式繳費，以下為匯款資訊：", "元大銀行：806", `帳號：${bank}`, "",
      "轉帳完成，再麻煩提供「匯款金額」以及「轉帳末五碼」，謝謝！"] : []),
  ].join("\n");
}

export function balanceDraft(template: string, row: BalanceRecipient) {
  return template.replace(/\{\{(學生姓名|餘額)\}\}/g, (_, token: string) =>
    token === "學生姓名" ? row.student_name : String(row.balance));
}
