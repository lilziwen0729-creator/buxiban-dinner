export type HistoryItemContext = {
  order_id: string;
  order_date: string;
  meal_id: string | null;
  meal_name: string;
  price: number | null;
  charged: boolean;
  charged_amount: number | null;
  received: boolean;
};
export type HistoryBatchOrder = { id: string; name: string; grade: string };
export type HistoryBatchRow = HistoryBatchOrder & { context?: HistoryItemContext; error?: string };
export type HistoryBatchFilter = { grade: string; charge: string; meal: string };

export function filterHistoryBatchRows(rows: HistoryBatchRow[], filter: HistoryBatchFilter) {
  return rows.filter((row) => (filter.grade === "all" || row.grade === filter.grade
    || (filter.grade === "primary" && row.grade.startsWith("小"))
    || (filter.grade === "junior" && row.grade.startsWith("國")))
    && (filter.charge === "all" || (row.context && row.context.charged === (filter.charge === "charged")))
    && (filter.meal === "all" || (row.context?.meal_id || "missing") === filter.meal));
}

export function summarizeHistoryBatch(contexts: HistoryItemContext[], mealId: string, price: number) {
  const changed = contexts.filter((context) => context.meal_id !== mealId);
  return {
    changed: changed.length,
    unchanged: contexts.length - changed.length,
    unpaid: changed.filter((context) => !context.charged).length,
    extraCharge: changed.reduce((sum, context) => sum + (context.charged ? Math.max(price - Number(context.charged_amount), 0) : 0), 0),
    refund: changed.reduce((sum, context) => sum + (context.charged ? Math.max(Number(context.charged_amount) - price, 0) : 0), 0),
  };
}
