import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';

const batchSource = readFileSync(new URL('../src/lib/historyOrderBatch.ts', import.meta.url), 'utf8');
const batchHelpers = await import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(batchSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText).toString('base64'));

const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const student = id(1), order = id(2), original = id(3), replacement = id(4);
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
const preview = () => scalar('select preview_history_order_item($1) as value', [order]);
const change = async (context, price = 150, meal = replacement) => scalar(
  'select change_history_order_item_atomic($1,$2,$3,$4) as value', [order, meal, JSON.stringify(context), price]);
const balance = () => scalar('select balance as value from students where id=$1', [student]);
const settle = () => scalar('select settle_order_atomic($1) as value', [order]);
const row = () => scalar('select to_jsonb(o) as value from orders o where id=$1', [order]);
const ledger = () => scalar("select to_jsonb(t) as value from transactions t where type='order' order by created_at desc,id desc limit 1");
const read = (file) => readFileSync(new URL('../database/' + file, import.meta.url), 'utf8');

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select '{"email":"admin@example.test"}'::jsonb $$;
    create table students(id uuid primary key,name text,balance integer);
    create table menus(id uuid primary key,name text,price numeric,vendor_id uuid,is_active boolean default true);
    create table orders(id uuid primary key default gen_random_uuid(),student_id uuid,meal_id uuid,
      order_date date,received boolean default false,charged boolean default false,ordered boolean default true,
      special_meal boolean not null default false);
    create table transactions(id uuid primary key default gen_random_uuid(),student_id uuid,type text,
      amount integer,balance_after integer,description text,created_at timestamptz default now());
    create table attendance_logs(id uuid primary key default gen_random_uuid(),student_id uuid,date date,course_id uuid,status text);
    create table leave_records(leave_date date,student_id uuid,student_name text,source text,cancelled_order boolean,
      refunded boolean,refund_amount numeric,kept_order boolean,metadata jsonb,unique(leave_date,student_id));
  `);
  for (const file of ['operation_logs.sql', 'accounting_atomic.sql', 'transaction_editing.sql', 'history_order_items.sql']) await db.exec(read(file));
  await db.exec(read('history_order_items.sql')); // Additive migration is repeatable.
  await db.exec(read('history_order_items_batch.sql'));
  await db.exec(read('history_order_items_batch.sql'));
});
beforeEach(async () => {
  await db.exec('truncate students,menus,orders,transactions,operation_logs,attendance_logs,leave_records');
  await db.query("select set_config('test.actor',$1,false)", [id(100)]);
  await db.query("insert into students values($1,'Test Student',1000),($2,'Unrelated',500)", [student, id(9)]);
  await db.query("insert into menus(id,name,price) values($1,'Old meal',105),($2,'New meal',150)", [original, replacement]);
  await db.query("insert into orders(id,student_id,meal_id,order_date,received) values($1,$2,$3,'2026-11-17',true)", [order, student, original]);
});
after(() => db.close());

test('uncharged changes preserve collection state and only the later settlement deducts the new price', async () => {
  await change(await preview());
  assert.equal(await balance(), 1000);
  assert.equal(await scalar('select count(*)::int as value from transactions'), 0);
  assert.equal((await row()).received, true);
  assert.equal((await row()).charged, false);
  assert.equal((await row()).special_meal, true);
  assert.equal((await row()).meal_id, replacement);
  assert.equal((await settle()).amount, -150);
  assert.equal(await balance(), 850);
  assert.equal((await settle()).status, 'skipped');
});
test('unreceived and missing original meal orders can be corrected without collection or charge', async () => {
  await db.query('update orders set received=false,meal_id=null where id=$1', [order]);
  await change(await preview());
  assert.equal((await row()).received, false);
  assert.equal((await row()).charged, false);
  assert.equal(await balance(), 1000);
});
for (const price of [150, 95, 105]) {
  test(`charged replacement at ${price} reconciles the original ledger and refund amount`, async () => {
    await settle();
    await db.query('update menus set price=$1 where id=$2', [price, replacement]);
    const result = await change(await preview(), price);
    assert.equal(result.delta, 105 - price);
    assert.equal(await balance(), 1000 - price);
    assert.equal((await row()).charged_amount, price);
    assert.equal((await row()).received, true);
    assert.equal((await ledger()).amount, -price);
    assert.equal((await ledger()).description, '餐費結算：New meal');
    assert.equal(await scalar("select count(*)::int as value from transactions where type='order'"), 1);
    assert.equal((await settle()).status, 'skipped');
    await scalar("select cancel_order_atomic($1,true,true,$2,'Test refund') as value", [order, price]);
    assert.equal(await balance(), 1000);
    assert.equal(await scalar('select balance as value from students where id=$1', [id(9)]), 500);
  });
}
test('a historical correction shifts all later balance snapshots and preserves prior entries', async () => {
  await settle();
  await db.exec("update transactions set created_at='2026-11-17T10:00Z'");
  await db.query("insert into transactions(student_id,type,amount,balance_after,description,created_at) values($1,'topup',200,1095,'Later','2026-11-18T10:00Z'),($1,'adjustment',10,1000,'Prior','2026-11-16T10:00Z')", [student]);
  await db.query('update students set balance=1095 where id=$1', [student]);
  await change(await preview());
  assert.equal(await balance(), 1050);
  assert.deepEqual((await db.query('select balance_after from transactions order by created_at')).rows.map((r) => r.balance_after), [1000, 850, 1050]);
});
test('duplicate and stale snapshots cannot apply a correction twice', async () => {
  await settle();
  const context = await preview();
  await change(context);
  await assert.rejects(change(context), /已變更/);
  assert.equal(await balance(), 850);
  const fresh = await preview();
  assert.equal((await change(fresh)).status, 'unchanged');
  assert.equal(await balance(), 850);
});
test('settlement, cancellation, collection and transaction editing invalidate old previews', async () => {
  let context = await preview();
  await settle();
  await assert.rejects(change(context), /已變更/);
  context = await preview();
  const tx = await ledger();
  await scalar("select edit_transaction_atomic($1,$2,0,-105,'Custom description') as value", [tx.id, student]);
  await assert.rejects(change(context), /已變更/);
  context = await preview();
  await db.exec('update orders set received=false');
  await assert.rejects(change(context), /已變更/);
  await db.exec('update orders set cancelled=true');
  await assert.rejects(change(context), /已取消/);
});
test('new menu price changes, disabled and invalid menus are rejected atomically', async () => {
  await settle();
  const context = await preview();
  await assert.rejects(change(context, 99), /價格已變更/);
  await assert.rejects(change(context, 150, id(999)), /不存在/);
  await db.query('update menus set is_active=false where id=$1', [replacement]);
  await assert.rejects(change(context), /已停用/);
  await db.query('update menus set is_active=true where id=$1', [replacement]);
  for (const price of [0, -1, 1.5, 2147483648, null, 'NaN', 'Infinity']) {
    await db.query('update menus set price=$1 where id=$2', [price, replacement]);
    await assert.rejects(change(context, price), /價格必須/);
  }
  assert.equal(await balance(), 895);
  assert.equal((await row()).meal_id, original);
});
test('legacy charges are linked only when unambiguous, including same-price corrections', async () => {
  await settle();
  await db.exec("update transactions set order_id=null,created_at='2026-11-17T10:00Z'; update orders set charged_amount=null");
  await db.query('update menus set price=105 where id=$1', [replacement]);
  await change(await preview(), 105);
  assert.equal((await ledger()).order_id, order);
  assert.equal((await row()).charged_amount, 105);
  assert.equal(await balance(), 895);
});
test('ambiguous or mismatched paid ledger is never guessed from the menu price', async () => {
  await settle();
  await db.exec("update transactions set order_id=null,created_at='2026-11-17T10:00Z'; update orders set charged_amount=null");
  await db.query("insert into transactions(student_id,type,amount,balance_after,created_at) values($1,'order',-10,885,'2026-11-17T11:00Z')", [student]);
  await assert.rejects(preview(), /無法唯一/);
  await db.query('update transactions set order_id=$1 where amount=-105', [order]);
  await db.exec('update orders set charged_amount=99');
  await assert.rejects(preview(), /金額不一致/);
  assert.equal(await balance(), 895);
});
test('zero-valued edited charge is supported, and a later manual ledger edit still refunds correctly', async () => {
  await settle();
  const tx = await ledger();
  await scalar("select edit_transaction_atomic($1,$2,0,0,'Waived') as value", [tx.id, student]);
  assert.equal((await preview()).charged_amount, 0);
  await change(await preview());
  assert.equal(await balance(), 850);
  await scalar("select edit_transaction_atomic($1,$2,2,-140,'Discount') as value", [tx.id, student]);
  assert.equal((await row()).charged_amount, 140);
  await scalar("select cancel_order_atomic($1,true,true,140,'Test refund') as value", [order]);
  assert.equal(await balance(), 1000);
});
test('audit records include both menu names and price changes', async () => {
  await change(await preview());
  const log = await scalar("select metadata as value from operation_logs where action='order_item_change'");
  assert.equal(log.meal_name_before, 'Old meal');
  assert.equal(log.meal_name_after, 'New meal');
  assert.equal(log.amount_before, 105);
  assert.equal(log.amount_after, 150);
  assert.equal(log.delta, 0);
});
test('anonymous callers cannot preview or update and private snapshot is not publicly executable', async () => {
  const context = await preview();
  await db.query("select set_config('test.actor','',false)");
  await assert.rejects(preview(), /請先登入/);
  await assert.rejects(change(context), /請先登入/);
  assert.equal(await scalar("select has_function_privilege('anon','public.preview_history_order_item(uuid)','EXECUTE') as value"), false);
  assert.equal(await scalar("select has_function_privilege('anon','public.change_history_order_item_atomic(uuid,uuid,jsonb,numeric)','EXECUTE') as value"), false);
  assert.equal(await scalar("select has_function_privilege('authenticated','public.history_order_item_context(uuid)','EXECUTE') as value"), false);
});

const secondOrder = id(12);
const seedSecond = async (charged = false, price = 105) => {
  await db.query("insert into menus(id,name,price) values($1,'Second meal',$2)", [id(13), price]);
  await db.query("insert into orders(id,student_id,meal_id,order_date,received) values($1,$2,$3,'2026-11-17',false)", [secondOrder, id(9), id(13)]);
  if (charged) {
    await db.query('update orders set received=true where id=$1', [secondOrder]);
    await scalar('select settle_order_atomic($1) as value', [secondOrder]);
  }
};
const batchPreview = (ids = [order, secondOrder]) => scalar('select preview_history_order_items($1) as value', [ids]);
const batchSave = (contexts, price = 150, date = '2026-11-17') => scalar(
  'select change_history_order_items_atomic($1,$2,$3,$4) as value', [date, replacement, JSON.stringify(contexts), price]);

test('batch updates selected paid and unpaid orders atomically without changing collection states', async () => {
  await seedSecond(); await settle();
  const result = await batchSave((await batchPreview()).orders);
  assert.deepEqual(result, {status:'updated',changed:2,unchanged:0,extra_charge:45,refund:0});
  assert.equal(await balance(),850);
  assert.equal(await scalar('select balance as value from students where id=$1',[id(9)]),500);
  assert.equal(await scalar('select received as value from orders where id=$1',[secondOrder]),false);
  assert.equal(await scalar("select count(*)::int as value from operation_logs where action='order_item_change'"),2);
});
test('batch totals keep charges and refunds separate instead of hiding them in a net total', async () => {
  await settle(); await seedSecond(true, 180);
  const contexts = (await batchPreview()).orders;
  const result = await batchSave(contexts);
  assert.equal(result.extra_charge,45);assert.equal(result.refund,30);
  assert.equal(batchHelpers.summarizeHistoryBatch(contexts,replacement,150).extraCharge,45);
  assert.equal(batchHelpers.summarizeHistoryBatch(contexts,replacement,150).refund,30);
});
test('a stale later row rolls back earlier order, wallet, ledger and audit changes', async () => {
  await settle(); await seedSecond();
  const contexts = (await batchPreview()).orders;
  await db.query('update orders set received=true where id=$1',[secondOrder]);
  await assert.rejects(batchSave(contexts),/整批未更改/);
  assert.equal(await balance(),895);
  assert.equal((await row()).meal_id,original);
  assert.equal((await ledger()).amount,-105);
  assert.equal(await scalar("select count(*)::int as value from operation_logs where action='order_item_change'"),0);
});
test('batch retries cannot change or charge the same orders twice', async () => {
  await settle(); await seedSecond();
  const contexts = (await batchPreview()).orders;
  await batchSave(contexts);await assert.rejects(batchSave(contexts),/已變更/);
  assert.equal(await balance(),850);
  const repeated = await batchSave((await batchPreview()).orders);
  assert.equal(repeated.changed,0);assert.equal(repeated.unchanged,2);
});
test('duplicate, missing, mixed-date, empty and oversized batches are rejected before writes', async () => {
  await seedSecond(); const contexts = (await batchPreview()).orders;
  await assert.rejects(batchSave([contexts[0],contexts[0]]),/重複/);
  await assert.rejects(batchSave([]),/1 至 500/);
  await assert.rejects(batchSave(null),/重新載入/);
  await assert.rejects(batchSave(Array(501).fill(contexts[0])),/1 至 500/);
  await assert.rejects(batchSave(contexts,150,'2026-11-16'),/所選日期/);
  await assert.rejects(batchSave([{...contexts[0],order_id:id(999)}]),/不存在/);
  await assert.rejects(batchSave(contexts,150,'2999-11-17'),/今天或之前/);
  assert.equal((await row()).meal_id,original);
  await assert.rejects(batchPreview([]),/1 至 500/);
  await assert.rejects(batchPreview([order,order]),/重複/);
});
test('preview exposes unsafe rows separately and only chosen valid rows are updated', async () => {
  await seedSecond();await db.query('update orders set charged=true where id=$1',[secondOrder]);
  const result = await batchPreview();
  assert.equal(result.orders.length,1);assert.equal(result.errors.length,1);
  assert.equal(result.errors[0].order_id,secondOrder);
  const changed = await batchSave(result.orders);
  assert.equal(changed.changed,1);
  assert.equal(await scalar('select meal_id as value from orders where id=$1',[secondOrder]),id(13));
});
test('menu price changes reject the entire batch and preserve all order versions', async () => {
  await seedSecond();await settle();
  await assert.rejects(batchSave((await batchPreview()).orders,140),/價格已變更/);
  assert.equal(await scalar('select sum(meal_edit_version)::int as value from orders'),0);
  assert.equal(await balance(),895);
});
test('batch RPCs require the existing administrator session', async () => {
  await seedSecond();const contexts=(await batchPreview()).orders;
  await db.query("select set_config('test.actor','',false)");
  await assert.rejects(batchPreview(),/請先登入/);await assert.rejects(batchSave(contexts),/請先登入/);
  for (const fn of ['preview_history_order_items(uuid[])','change_history_order_items_atomic(date,uuid,jsonb,numeric)']) {
    assert.equal(await scalar('select has_function_privilege($1,$2,$3) as value',['anon','public.'+fn,'EXECUTE']),false);
  }
});
test('batch filtering matches school, grade, original meal and payment status', () => {
  const context={meal_id:original,meal_name:'Original',price:105,charged:false,charged_amount:null,received:true,order_date:'2026-11-17'};
  const rows=[{id:'a',name:'A',grade:'小四',context:{...context,order_id:'a'}},
    {id:'b',name:'B',grade:'國一',context:{...context,order_id:'b',charged:true}},
    {id:'c',name:'C',grade:'小五',context:{...context,order_id:'c',meal_id:replacement}},
    {id:'d',name:'D',grade:'小四',error:'Unavailable'}];
  const filter=(grade,charge='all',meal='all')=>batchHelpers.filterHistoryBatchRows(rows,{grade,charge,meal}).map(r=>r.id).join(',');
  assert.equal(filter('primary','unpaid'),'a,c');assert.equal(filter('junior','charged'),'b');
  assert.equal(filter('小四'),'a,d');assert.equal(filter('all','all',replacement),'c');
  const summary=batchHelpers.summarizeHistoryBatch(rows.slice(0,3).map(r=>r.context),replacement,150);
  assert.equal(summary.changed,2);assert.equal(summary.unchanged,1);assert.equal(summary.unpaid,1);
});
