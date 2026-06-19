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

- `students`：學生主表，包含餘額、每週固定訂餐日、自動訂餐開關、餐點偏好與飲食禁忌。
- `parents`：家長主表，包含 LINE LIFF 綁定用的 `line_user_id`。
- `student_parent_relations`：學生與家長多對多關聯，包含稱謂。
- `orders`：便當訂單，包含日期、餐點、領餐與扣款狀態。
- `attendance_logs`：出缺席紀錄，狀態包含 `pending`、`arrived`、`leave`、`left`、`homework_done`。
- `admin_tasks`：行政待辦事項，依日期、時間、學生與處理狀態排序。
- `leave_records`：請假紀錄，包含請假來源、是否取消餐、是否退款與保留餐狀態。
- `notification_logs`：LINE 通知紀錄，包含通知類型、狀態、對象、學生與失敗原因。
- `automation_runs`：自動化排程執行紀錄，包含產單、結算、成功/失敗與略過資訊。
- `transactions`：錢包交易紀錄，包含儲值、扣款、退款與調帳。
- `operation_logs`：後台操作紀錄，追蹤儲值、調帳、訂餐異動、通知與結算。
- `weekly_schedule`：週一至週五排餐設定。
- `vendors` / `menus`：商家與餐點資料。
- `courses` / `student_courses` / `exam_scores`：國中課程、修課關聯與成績紀錄。

## 已實作功能

### 管理員端 `/admin`

- 管理員登入與登出。
- 今日訂餐：查看今日餐數、各年級領餐統計、餐點偏好提醒、未領名單與取消訂餐。
- 今日總覽：查看到班、訂餐、請假、排程健康檢查與訂單異常。
- 行政待辦：建立櫃檯提醒事項，可指定時間、學生、類型、備註，並依時間排序。
- 點名系統：
  - 國小課輔：年級切換、批次到班、作業完成、離班、請假狀態顯示。
  - 國中單科：依課程點名、批次到班、全班離班、成績登錄與 CSV 匯出。
- 本週排餐：設定週一至週五的商家與餐點。
- 學生管理：新增/編輯學生、家長聯絡資料、餐點偏好、飲食禁忌、搜尋、儲值、調帳與交易明細。
- 課程排課：新增/編輯國中單科課程，設定星期、上課時間並綁定學生。
- 商家管理：新增/刪除商家，新增/編輯/刪除餐點與價格。
- 歷史紀錄：依日期查詢訂餐與領餐狀態。
- 月結報表：依月份彙整訂餐、領餐、餐費扣款、儲值、退款、調帳與 CSV 匯出。
- 請假紀錄：依日期與來源查詢請假、取消餐與退款狀態。
- 通知中心：查詢 LINE 通知成功、失敗、略過與錯誤原因。
- 操作紀錄：查看儲值、調帳、訂餐取消、通知與結算等重要異動。

### 老師端 `/teacher`

- 點名與作業操作入口。
- 領餐登記：依年級查看今日訂餐名單並標記是否領餐；餐費由管理員後台統一結算。
- 統計今日簽到、領餐與作業未完數。
- 國中年級可執行全體統一離班。

### 家長端 `/parent`

- LINE LIFF 登入。
- 使用後台產生的 6 位數一次性綁定碼連結家長 LINE；綁定成功後代碼立即失效。
- 多學生切換。
- 顯示餐費餘額、今日訂餐狀態與交易紀錄。
- 中午 12:00 前可切換今日訂餐。
- 全天皆可登記請假；中午 12:00 前會同步取消今日訂單並在需要時退款，12:00 後只登記請假。
- 可設定週一至週五固定訂餐日。

### API

- `GET /api/generate-orders`：依台灣時間、每週排餐與學生固定訂餐日自動產生今日訂單，會排除週末與已存在訂單。
- `GET /api/settle-orders`：結算指定日期已領餐但尚未扣款的訂單，更新學生餘額、寫入交易紀錄，並將訂單標記為已扣款。
- `POST /api/line-notify`：透過 LINE Messaging API 發送文字通知，限已登入管理員呼叫。
- `POST /api/low-balance-notify`：查詢低於指定門檻的固定訂餐學生並通知已綁定 LINE 的家長，限已登入管理員呼叫。

自動化 API 必須設定 `CRON_SECRET`，呼叫時需帶 `Authorization: Bearer <CRON_SECRET>`，或在手動測試時使用 `?secret=<CRON_SECRET>`。未設定時 API 會拒絕執行。

## 待整理與優化

- 自動化排程實測：Vercel Cron 已設定，待正式環境觀察產單與扣款結果。
- LINE 推播正式驗證：到班、作業完成、離班通知。
- 部別與年級分頁：目前主要以年級與搜尋為主，可再整理成國小、國中、幼兒分頁。

## 自動化排程

Vercel Cron 設定於 `vercel.json`，排程時間使用 UTC，API 內部日期判定仍固定使用台灣時間。

- `GET /api/generate-orders`：UTC 前一日 16:00，台灣時間平日 00:00，自動產生當日固定訂餐。
- `GET /api/settle-orders`：UTC 13:00，台灣時間平日 21:00，結算已領餐但尚未扣款的訂單。

正式環境必須設定 `CRON_SECRET`。Vercel Cron 會以 `Authorization: Bearer <CRON_SECRET>` 呼叫；手動測試也可使用：

```text
/api/generate-orders?secret=<CRON_SECRET>
/api/settle-orders?dryRun=true&secret=<CRON_SECRET>
```

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

建立操作紀錄資料表：

```sql
-- 在 Supabase SQL Editor 執行
-- database/operation_logs.sql
-- database/leave_records.sql
-- database/notification_logs.sql
-- database/automation_runs.sql
-- database/student_meal_preferences.sql
-- database/admin_tasks.sql
-- database/course_schedule.sql
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
