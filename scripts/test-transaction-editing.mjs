import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, after, test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const db = new PGlite();
const student = "10000000-0000-0000-0000-000000000001";
const otherStudent = "10000000-0000-0000-0000-000000000002";
const order = "20000000-0000-0000-0000-000000000001";
const meal = "30000000-0000-0000-0000-000000000001";
const tx = (index) => "40000000-0000-0000-0000-" + String(index).padStart(12, "0");
const sql = read("../database/transaction_editing.sql");
const scalar = async (query, args = []) => (await db.query(query, args)).rows[0]?.value;
const balance = () => scalar("select balance::float8 as value from students where id=$1", [student]);
const entry = (id) => scalar("select to_jsonb(t) as value from transactions t where id=$1", [id]);
const edit = (id, amount, description = "Corrected", version = 0, studentId = student) => scalar(
  "select edit_transaction_atomic($1,$2,$3,$4,$5) as value", [id, studentId, version, amount, description]);
const seedEntry = (id, amount, afterBalance, time, type = "adjustment", orderId = null) => db.query(
  "insert into transactions(id,student_id,type,amount,balance_after,description,created_at,order_id) values($1,$2,$3,$4,$5,'Original',$6,$7)",
  [id, student, type, amount, afterBalance, time, orderId]);
const seedOrder = async () => {
  await db.query("insert into menus values($1,'Lunch',120)", [meal]);
  await db.query("insert into orders(id,student_id,meal_id,order_date,received) values($1,$2,$3,'2026-09-23',true)", [order, student, meal]);
};
const settle = () => scalar("select settle_order_atomic($1) as value", [order]);
const preview = () => scalar("select preview_order_cancellation($1) as value", [order]);
const cancel = (amount) => scalar("select cancel_order_atomic($1,true,true,$2,'Test') as value", [order, amount]);

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select '{"email":"admin@example.test"}'::jsonb $$;
    create table students(id uuid primary key,name text,balance integer);
    create table menus(id uuid primary key,name text,price integer);
    create table orders(id uuid primary key default gen_random_uuid(),student_id uuid,meal_id uuid,
      order_date date,received boolean default false,charged boolean default false,ordered boolean default true);
    create table transactions(id uuid primary key default gen_random_uuid(),student_id uuid,type text,
      amount integer,balance_after integer,description text,created_at timestamptz default now());
    create table attendance_logs(id uuid primary key default gen_random_uuid(),student_id uuid,date date,course_id uuid,status text);
    create table leave_records(leave_date date,student_id uuid,student_name text,source text,cancelled_order boolean,
      refunded boolean,refund_amount numeric,kept_order boolean,metadata jsonb,unique(leave_date,student_id));
  `);
  await db.exec(read("../database/operation_logs.sql"));
  await db.exec(read("../database/accounting_atomic.sql"));
  await db.exec(sql);
});
beforeEach(async () => {
  await db.exec("truncate students,menus,orders,transactions,operation_logs,attendance_logs,leave_records;");
  await db.query("select set_config('test.actor',$1,false)", [otherStudent]);
  await db.query("insert into students values($1,'Student',1000),($2,'Other',500)", [student, otherStudent]);
});
after(() => db.close());

test("editing an old debit corrects current balance and subsequent snapshots, preserving imported opening balance", async () => {
  await db.query("update students set balance=170 where id=$1", [student]);
  await seedEntry(tx(1), 50, 375, "2026-09-01T00:00Z");
  await seedEntry(tx(2), -105, 270, "2026-09-02T00:00Z");
  await seedEntry(tx(3), -100, 170, "2026-09-03T00:00Z");
  const result = await edit(tx(2), -100);
  assert.equal(result.delta, 5);
  assert.equal(await balance(), 175);
  assert.deepEqual(await Promise.all([1,2,3].map(async (n) => (await entry(tx(n))).balance_after)), [375,275,175]);
  assert.equal(await scalar("select balance::float8 as value from students where id=$1", [otherStudent]), 500);
  const audit = await scalar("select metadata as value from operation_logs");
  assert.equal(audit.amount_before, -105);
  assert.equal(audit.amount_after, -100);
  assert.equal(audit.description_before, "Original");
  assert.equal(audit.balance_before, 170);
});

test("description only, amount increase and zero-valued adjustment are editable", async () => {
  await seedEntry(tx(1), 100, 1000, "2026-09-01T00:00Z", "topup");
  await edit(tx(1), 100, "New receipt");
  assert.equal(await balance(), 1000);
  await edit(tx(1), 150, "New receipt", 1);
  assert.equal(await balance(), 1050);
  await edit(tx(1), 0, "Void incorrect top-up", 2);
  assert.equal(await balance(), 900);
  const unchanged = await edit(tx(1), 0, "Void incorrect top-up", 3);
  assert.equal(unchanged.status, "unchanged");
  assert.equal(await scalar("select count(*)::int as value from operation_logs"), 3);
});

test("stale retries, another student's ID and simultaneous edits cannot apply the difference twice", async () => {
  await seedEntry(tx(1), -100, 1000, "2026-09-01T00:00Z");
  await assert.rejects(edit(tx(1), -90, "Wrong", 0, otherStudent), /找不到/);
  const results = await Promise.allSettled([edit(tx(1), -90), edit(tx(1), -80)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await balance(), 1010);
  await assert.rejects(edit(tx(1), -90), /已被修改/);
  assert.equal(await balance(), 1010);
});

test("invalid amounts, empty descriptions and wrong transaction direction roll back", async () => {
  await seedEntry(tx(1), -100, 1000, "2026-09-01T00:00Z", "order");
  for (const value of [null, "NaN", "Infinity", "-Infinity", 1.5, 2147483648]) {
    await assert.rejects(edit(tx(1), value), /整數/);
  }
  await assert.rejects(edit(tx(1), 5), /負數/);
  await assert.rejects(edit(tx(1), -90, "  "), /明細/);
  await seedEntry(tx(2), 100, 1000, "2026-09-02T00:00Z", "refund");
  await assert.rejects(edit(tx(2), -5), /正數/);
  assert.equal(await balance(), 1000);
  assert.equal(await scalar("select count(*)::int as value from operation_logs"), 0);
});

test("edited active meal charge is the amount refunded, independent of menu price", async () => {
  await seedOrder(); await settle();
  const id = await scalar("select id as value from transactions where type='order'");
  await edit(id, -95);
  await db.exec("update menus set price=999");
  assert.equal(await balance(), 905);
  assert.equal((await preview()).refund_amount, 95);
  await cancel(95);
  assert.equal(await balance(), 1000);
});

test("zero charge keeps settlement idempotent and cancellation refunds zero", async () => {
  await seedOrder(); await settle();
  const id = await scalar("select id as value from transactions where type='order'");
  await edit(id, 0);
  assert.equal(await balance(), 1000);
  assert.equal((await settle()).status, "skipped");
  assert.equal((await preview()).refund_amount, 0);
  assert.equal((await cancel(0)).refund_amount, 0);
  assert.equal(await balance(), 1000);
});

for (const amount of [95, 0]) {
  test(`parent leave refunds the corrected charge of ${amount}, not the menu price`, async () => {
    await seedOrder(); await settle();
    const id = await scalar("select id as value from transactions where type='order'");
    await edit(id, -amount);
    await db.exec("update menus set price=999");
    const result = await scalar("select register_parent_leave_atomic($1,'2026-09-23',true,null) as value", [student]);
    assert.equal(result.refund_amount, amount);
    assert.equal(await balance(), 1000);
    await scalar("select register_parent_leave_atomic($1,'2026-09-23',true,null) as value", [student]);
    assert.equal(await balance(), 1000);
  });
}

test("editing a refunded earlier order cycle cannot alter the current cycle refund amount", async () => {
  await seedOrder(); await settle();
  const oldId = await scalar("select id as value from transactions where type='order'");
  await db.query("update transactions set created_at='2026-09-01T00:00Z' where id=$1", [oldId]);
  await cancel(120);
  await db.exec("update orders set cancelled=false,ordered=true,received=true; update menus set price=150;");
  await settle();
  await edit(oldId, -100);
  assert.equal((await preview()).refund_amount, 150);
  assert.equal(await balance(), 870);
});

test("legacy debit links to a unique active order using Taipei dates", async () => {
  await seedOrder();
  await db.exec("update orders set charged=true,charged_amount=120");
  await seedEntry(tx(1), -120, 1000, "2026-09-22T17:00Z", "order");
  await edit(tx(1), -90);
  assert.equal((await entry(tx(1))).order_id, order);
  assert.equal((await preview()).refund_amount, 90);
});

test("ambiguous legacy debit can change description but cannot silently corrupt an order snapshot", async () => {
  await seedOrder(); await db.exec("update orders set charged=true,charged_amount=120");
  await seedEntry(tx(1), -120, 1000, "2026-09-22T17:00Z", "order");
  await seedEntry(tx(2), -50, 950, "2026-09-22T18:00Z", "order");
  await assert.rejects(edit(tx(1), -90), /唯一/);
  await edit(tx(1), -120, "Checked receipt");
  assert.equal((await preview()).refund_amount, 120);
  assert.equal(await balance(), 1000);
});

test("same-timestamp entries use stable ID ordering and preserve null snapshots", async () => {
  await seedEntry(tx(1), 100, 1100, "2026-09-01T00:00Z");
  await seedEntry(tx(2), -100, 1000, "2026-09-01T00:00Z");
  await seedEntry(tx(3), 10, null, "2026-09-02T00:00Z");
  await edit(tx(2), -80);
  assert.equal((await entry(tx(1))).balance_after, 1100);
  assert.equal((await entry(tx(2))).balance_after, 1020);
  assert.equal((await entry(tx(3))).balance_after, null);
});

test("failed audit insert rolls back wallet, edited entry and linked order snapshot together", async () => {
  await seedOrder(); await settle();
  const id = await scalar("select id as value from transactions where type='order'");
  await db.exec("alter table operation_logs add constraint reject_test check(action <> 'transaction_edit')");
  try {
    await assert.rejects(edit(id, -95), /reject_test/);
    assert.equal(await balance(), 880);
    assert.equal((await entry(id)).amount, -120);
    assert.equal((await entry(id)).edit_version, 0);
    assert.equal((await preview()).refund_amount, 120);
  } finally { await db.exec("alter table operation_logs drop constraint reject_test"); }
});

test("migration is repeatable and edit RPC is restricted to logged-in admins", async () => {
  await db.exec(sql);
  const fn = "edit_transaction_atomic(uuid,uuid,integer,numeric,text)";
  assert.equal(await scalar("select has_function_privilege('anon',$1,'EXECUTE') as value", [fn]), false);
  assert.equal(await scalar("select has_function_privilege('authenticated',$1,'EXECUTE') as value", [fn]), true);
  await seedEntry(tx(1), -100, 1000, "2026-09-01T00:00Z");
  await db.exec("select set_config('test.actor','',false)");
  await assert.rejects(edit(tx(1), -90), /登入/);
  assert.equal(await balance(), 1000);
});

function client(result) {
  const calls = [];
  const exports = {};
  const source = ts.transpileModule(read("../src/lib/transactionEditing.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, require() { return { supabase: { async rpc(...args) { calls.push(args); return result; } } }; } });
  return { ...exports, calls };
}
const fixture = { id: tx(1), student_id: student, type: "order", amount: -105, edit_version: 2 };
test("client sends an atomic versioned update, validates signed amount and trims description", async () => {
  const api = client({ data: { status: "updated", transaction_id: tx(1), balance_after: 175, delta: 5, edit_version: 3 } });
  await api.editTransaction(fixture, "-100", " Corrected ");
  assert.deepEqual(JSON.parse(JSON.stringify(api.calls)), [["edit_transaction_atomic", {
    p_transaction_id: tx(1), p_student_id: student, p_expected_version: 2, p_amount: -100, p_description: "Corrected",
  }]]);
  for (const value of ["", " ", "NaN", "1", "-1.5", "Infinity"]) await assert.rejects(api.editTransaction(fixture, value, "Test"));
  assert.equal(api.calls.length, 1);
});
test("client never claims success after RPC failure or malformed response", async () => {
  for (const result of [{ data: null }, { data: { status: "updated" } }, { error: { message: "conflict" } }]) {
    await assert.rejects(client(result).editTransaction(fixture, "-100", "Test"));
  }
});
