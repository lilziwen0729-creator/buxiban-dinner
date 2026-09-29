import { getTaipeiNow, getToday } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type { TransactionEntry } from "@/lib/transactionEditing";

export const transactionPeriods = [
  ["this_year", "今年"],
  ["this", "本月"],
  ["last", "上月"],
  ["all", "全部"],
] as const;

export type TransactionPeriod = (typeof transactionPeriods)[number][0];

export function getTransactionPeriodBounds(period: TransactionPeriod) {
  const now = getTaipeiNow();
  const boundary = (year: number, month: number) => {
    const date = new Date(Date.UTC(year, month, 1));
    return date.toISOString().slice(0, 10) + "T00:00:00+08:00";
  };
  if (period === "this_year") return { from: boundary(now.getFullYear(), 0), to: boundary(now.getFullYear() + 1, 0) };
  if (period === "this") return { from: boundary(now.getFullYear(), now.getMonth()), to: boundary(now.getFullYear(), now.getMonth() + 1) };
  if (period === "last") return { from: boundary(now.getFullYear(), now.getMonth() - 1), to: boundary(now.getFullYear(), now.getMonth()) };
  return { from: null, to: null };
}

export async function fetchAllTransactionEntries(studentId: string, period: TransactionPeriod) {
  const { from, to } = getTransactionPeriodBounds(period);
  const rows: TransactionEntry[] = [];
  const batchSize = 500;
  for (let offset = 0; ; offset += batchSize) {
    let query = supabase.from("transactions")
      .select("id, student_id, type, amount, balance_after, description, created_at")
      .eq("student_id", studentId);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lt("created_at", to);
    const { data, error } = await query.order("created_at", { ascending: false })
      .order("id", { ascending: false }).range(offset, offset + batchSize - 1);
    if (error) throw error;
    const batch = (data || []) as TransactionEntry[];
    rows.push(...batch);
    if (batch.length < batchSize) break;
  }
  return rows;
}

const formatDate = (value: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
};

const typeLabels: Record<string, string> = {
  topup: "儲值", order: "餐費", refund: "退款", adjustment: "調整",
};

const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "學生";
const periodLabel = (period: TransactionPeriod) => transactionPeriods.find(([key]) => key === period)?.[1] || "全部";
const fileName = (name: string, period: TransactionPeriod, extension: string) =>
  `${safeFileName(name)}_存摺明細_${periodLabel(period)}_${getToday()}.${extension}`;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function exportTransactionsExcel(name: string, period: TransactionPeriod, balance: number, rows: TransactionEntry[]) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const header = ["日期時間", "類型", "明細內容", "收支金額", "交易後餘額"].map((value) => ({
    value, fontWeight: "bold" as const, backgroundColor: "#EAF2F8", textColor: "#16324F",
  }));
  const data = [
    [{ value: `${name} · 存摺明細`, fontWeight: "bold" as const }, null, null, null, null],
    [`期間：${periodLabel(period)}`, `匯出時間：${formatDate(new Date().toISOString())}`, null, "目前餘額", balance],
    ["", "", "", "", ""],
    header,
    ...rows.map((row) => [
      formatDate(row.created_at), typeLabels[row.type] || row.type,
      row.description || "未填寫明細", Number(row.amount),
      row.balance_after === null ? "未記錄" : Number(row.balance_after),
    ]),
  ];
  const blob = await writeExcelFile(data, {
    sheet: "存摺明細",
    columns: [{ width: 22 }, { width: 12 }, { width: 56 }, { width: 17 }, { width: 18 }],
    stickyRowsCount: 4,
    showGridLines: false,
  }).toBlob();
  download(blob, fileName(name, period, "xlsx"));
}

export async function exportTransactionsPdf(name: string, period: TransactionPeriod, balance: number, rows: TransactionEntry[]) {
  const [{ PDFDocument, rgb }, { default: fontkit }, fontResponse] = await Promise.all([
    import("pdf-lib"), import("@pdf-lib/fontkit"), fetch("/fonts/NotoSansTC-Regular.otf"),
  ]);
  if (!fontResponse.ok) throw new Error("無法載入 PDF 繁中字型，請稍後再試。");
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await fontResponse.arrayBuffer(), { subset: true });
  const width = 595.28;
  const height = 841.89;
  const margin = 36;
  const ink = rgb(0.13, 0.2, 0.3);
  const muted = rgb(0.42, 0.49, 0.58);
  const lineColor = rgb(0.86, 0.89, 0.92);
  const columns = { date: margin, description: 138, amountRight: 477, balanceRight: width - margin };
  const pages: ReturnType<typeof pdf.addPage>[] = [];
  let page = pdf.addPage([width, height]);
  pages.push(page);
  let y = height - 50;

  const text = (value: string, x: number, baseline: number, size = 9, color = ink) =>
    page.drawText(value, { x, y: baseline, font, size, color });
  const rightText = (value: string, right: number, baseline: number, size = 9, color = ink) =>
    text(value, right - font.widthOfTextAtSize(value, size), baseline, size, color);
  const rule = (baseline: number) => page.drawLine({ start: { x: margin, y: baseline }, end: { x: width - margin, y: baseline }, thickness: 0.6, color: lineColor });
  const tableHeader = () => {
    page.drawRectangle({ x: margin, y: y - 8, width: width - margin * 2, height: 24, color: rgb(0.92, 0.95, 0.98) });
    text("日期時間", columns.date + 5, y, 9);
    text("明細內容", columns.description, y, 9);
    rightText("收支", columns.amountRight, y, 9);
    rightText("餘額", columns.balanceRight - 5, y, 9);
    y -= 28;
  };
  const wrap = (value: string, maxWidth: number) => {
    const lines: string[] = [];
    for (const paragraph of value.split(/\r?\n/)) {
      let line = "";
      for (const character of Array.from(paragraph)) {
        if (line && font.widthOfTextAtSize(line + character, 9) > maxWidth) {
          lines.push(line);
          line = character;
        } else line += character;
      }
      lines.push(line);
    }
    return lines;
  };

  text(`${name} · 存摺明細`, margin, y, 17);
  y -= 27;
  text(`期間：${periodLabel(period)}    匯出時間：${formatDate(new Date().toISOString())}`, margin, y, 9, muted);
  y -= 22;
  text(`目前餘額：$${balance.toLocaleString("zh-TW")}    共 ${rows.length} 筆`, margin, y, 10);
  y -= 24;
  tableHeader();

  for (const row of rows) {
    const remaining = wrap(row.description || "未填寫明細", 255);
    let firstPart = true;
    while (remaining.length) {
      const availableLines = Math.floor((y - 45 - 13) / 13);
      if (availableLines < 2) {
        page = pdf.addPage([width, height]);
        pages.push(page);
        y = height - 49;
        text(`${name} · 存摺明細（續）`, margin, y, 12);
        y -= 27;
        tableHeader();
        continue;
      }
      const lines = remaining.splice(0, availableLines);
      const firstLineY = y - 12;
      if (firstPart) {
        const [datePart, timePart] = formatDate(row.created_at).split(" ");
        text(datePart, columns.date + 5, firstLineY, 8);
        if (timePart) text(timePart, columns.date + 5, firstLineY - 12, 8, muted);
        rightText((row.amount > 0 ? "+" : "") + Number(row.amount).toLocaleString("zh-TW"), columns.amountRight, firstLineY, 9);
        rightText(row.balance_after === null ? "未記錄" : Number(row.balance_after).toLocaleString("zh-TW"), columns.balanceRight - 5, firstLineY, 9, muted);
      } else text("續", columns.date + 5, firstLineY, 8, muted);
      lines.forEach((part, index) => text(part, columns.description, firstLineY - index * 13, 9));
      y -= Math.max(32, lines.length * 13 + 13);
      rule(y);
      firstPart = false;
    }
  }
  pages.forEach((item, index) => item.drawText(`${index + 1} / ${pages.length}`, {
    x: width - 72, y: 23, font, size: 8, color: muted,
  }));
  const bytes = await pdf.save();
  download(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), fileName(name, period, "pdf"));
}
