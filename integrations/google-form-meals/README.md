# Google Form meal sync

This integration is bound to the `115-1期中考留班通知及訂餐需求統計` Google Form.

1. Run `database/form_meal_submissions.sql` in the Supabase SQL editor.
2. Deploy the app with `FORM_MEAL_WEBHOOK_SECRET` in the production environment.
3. Paste `Code.gs` into the form-bound Apps Script project. Under Project Settings > Script Properties, set:
   - `MEAL_SYNC_URL` = `https://buxiban-dinner-6y9x.vercel.app/api/integrations/form-meals`
   - `MEAL_SYNC_SECRET` = the same private value as `FORM_MEAL_WEBHOOK_SECRET`.
4. Run `installMealFormTrigger` once and authorize access to this form and external requests.
5. After checking the form responses, run `syncExistingMealResponses` once to import prior replies. Re-running is idempotent by response ID.

The form only adds selected dates. It never cancels unselected dates or overwrites manual stops, leave, or cancelled orders. A response without a unique name/grade match appears in Admin > 訂餐設定 > 表單回覆 for review. Existing fixed meal plans and the unique `(student_id, order_date)` order constraint remain in effect.
