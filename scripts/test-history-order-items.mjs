import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

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
