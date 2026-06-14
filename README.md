# 方華補習班管理系統 V2.0

補習班營運管理系統，包含管理員網頁後台、老師操作端與家長 LINE LIFF 手機端。系統核心涵蓋學生資料、點名、作業檢查、訂餐、排餐、錢包儲值與交易紀錄。

## 技術架構

- Next.js App Router
- React
- Tailwind CSS
- Supabase PostgreSQL / Auth
- LINE LIFF
- LINE Messaging API

## 核心規則

- 所有日期與排程判定必須以 `Asia/Taipei` 台灣時間為準。
- 前端與 API 需共用 `src/lib/date.ts` 的日期工具，避免 Vercel 伺服器時區造成日期落差。
- Supabase 查詢找不到資料時，優先使用 `.maybeSingle()`，避免正常空資料被當成錯誤。
- 請假、取消訂餐、扣款與退費必須保持資料一致性，操作時需同步處理 `orders`、`students.balance` 與 `transactions`。
- 學生與家長關聯更新建議採 Replace Pattern：先刪除舊關聯，再插入新關聯。

## 主要資料表

- `students`：學生主表，包含餘額、每週固定訂餐日與自動訂餐開關。
- `parents`：家長主表，包含 LINE LIFF 綁定用的 `line_user_id`。
- `student_parent_relations`：學生與家長多對多關聯，包含稱謂。
- `orders`：便當訂單，包含日期、餐點、領餐與扣款狀態。
- `attendance_logs`：出缺席紀錄，狀態包含 `pending`、`arrived`、`leave`、`left`、`homework_done`。
- `transactions`：錢包交易紀錄，包含儲值、扣款、退款與調帳。
- `weekly_schedule`：週一至週五排餐設定。
- `vendors` / `menus`：商家與餐點資料。
- `courses` / `student_courses` / `exam_scores`：國中課程、修課關聯與成績紀錄。

## 已實作功能

### 管理員端 `/admin`

- 管理員登入與登出。
- 今日訂餐：查看今日餐數、各年級領餐統計、未領名單與取消訂餐。
- 點名系統：
  - 國小課輔：年級切換、批次到班、作業完成、離班、請假狀態顯示。
  - 國中單科：依課程點名、批次到班、全班離班、成績登錄與 CSV 匯出。
- 本週排餐：設定週一至週五的商家與餐點。
- 學生管理：新增/編輯學生、家長聯絡資料、搜尋、儲值、調帳與交易明細。
- 商家管理：新增/刪除商家，新增/編輯/刪除餐點與價格。
- 歷史紀錄：依日期查詢訂餐與領餐狀態。

### 老師端 `/teacher`

- 點名與作業操作入口。
- 領餐扣款：依年級查看今日訂餐名單，標記已領餐時扣款，取消領餐時退款。
- 統計今日簽到、領餐與作業未完數。
- 國中年級可執行全體統一離班。

### 家長端 `/parent`

- LINE LIFF 登入。
- 以手機號碼綁定家長資料。
- 多學生切換。
- 顯示餐費餘額、今日訂餐狀態與交易紀錄。
- 中午 12:00 前可切換今日訂餐。
- 中午 12:00 前可一鍵請假，系統會標記出缺席、取消今日訂單，若已扣款則自動退費並寫入交易紀錄。
- 可設定週一至週五固定訂餐日。

### API

- `GET /api/generate-orders`：依台灣時間、每週排餐與學生固定訂餐日自動產生今日訂單，會排除週末與已存在訂單。
- `GET /api/settle-orders`：結算指定日期已領餐但尚未扣款的訂單，更新學生餘額、寫入交易紀錄，並將訂單標記為已扣款。
- `POST /api/line-notify`：透過 LINE Messaging API 發送文字通知。

自動化 API 若有設定 `CRON_SECRET`，呼叫時需帶 `Authorization: Bearer <CRON_SECRET>`，或在手動測試時使用 `?secret=<CRON_SECRET>`。

## 待整理與優化

- 餐費自動批次扣款排程：`/api/settle-orders` 已完成，待設定正式排程與實測。
- LINE 推播正式驗證：到班、作業完成、離班與餘額不足通知。
- 飲食禁忌欄位：需確認資料表欄位後加入學生表單。
- 部別與年級分頁：目前主要以年級與搜尋為主，可再整理成國小、國中、幼兒分頁。

## 開發

安裝依賴：

```bash
npm install
```

啟動開發伺服器：

```bash
npm run dev
```

檢查程式碼：

```bash
npm run lint
```

## 環境變數

請在 `.env.local` 設定：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_LIFF_ID=
LINE_CHANNEL_ACCESS_TOKEN=
CRON_SECRET=
```
