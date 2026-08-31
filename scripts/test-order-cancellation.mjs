import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, after, test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const sql = readFileSync(new URL("../database/accounting_atomic.sql", import.meta.url), "utf8");
const db = new PGlite();
const student = "10000000-0000-0000-0000-000000000001";
const meal = "20000000-0000-0000-0000-000000000001";
const order = "30000000-0000-0000-0000-000000000001";
const date = "2026-08-31";
const scalar = async (query, params = []) => (await db.query(query, params)).rows[0]?.value;
const preview = () => scalar("select public.preview_order_cancellation($1) as value", [order]);
const settle = () => scalar("select public.settle_order_atomic($1) as value", [order]);
const cancel = (received = false, charged = false, amount = 0, reason = "") => scalar(
  "select public.cancel_order_atomic($1,$2,$3,$4,$5) as value", [order, received, charged, amount, reason],
);
const balance = () => scalar("select balance::float8 as value from students where id=$1", [student]);
const ledger = () => db.query("select type, amount::float8, balance_after::float8, order_id, description from transactions order by created_at");
const seed = async (received = false, charged = false) => db.query(
  "insert into orders(id,student_id,meal_id,order_date,received,charged) values($1,$2,$3,$4,$5,$6)",
  [order, student, meal, date, received, charged],
);
const legacyCharge = async (amount = 120, timestamp = "2026-08-30T17:00:00Z") => db.query(
  "insert into transactions(student_id,type,amount,created_at) values($1,'order',$2,$3)",
  [student, -amount, timestamp],
);

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table students(id uuid primary key, name text, balance integer);
    create table menus(id uuid primary key, name text, price integer);
    create table orders(id uuid primary key default gen_random_uuid(), student_id uuid,
      meal_id uuid, order_date date, received boolean default false, charged boolean default false,
      ordered boolean default true);
    create table transactions(id uuid primary key default gen_random_uuid(), student_id uuid,
      type text, amount integer, balance_after integer, description text, created_at timestamptz default now());
    create table attendance_logs(id uuid primary key default gen_random_uuid(), student_id uuid,
      date date, course_id uuid, status text);
    create table leave_records(leave_date date, student_id uuid, student_name text, source text,
      cancelled_order boolean, refunded boolean, refund_amount numeric, kept_order boolean,
      metadata jsonb, unique(leave_date,student_id));
  `);
  await db.exec(sql);
});
beforeEach(async () => {
  await db.exec("truncate orders,students,menus,transactions,attendance_logs,leave_records;");
  await db.query("insert into students values($1,'Test Student',1000)", [student]);
  await db.query("insert into menus values($1,'Test Meal',120)", [meal]);
});
after(() => db.close());

for (const received of [false, true]) {
  test(`cancel ${received ? "received" : "unreceived"} unpaid order without changing wallet`, async () => {
    await seed(received);
    assert.equal((await preview()).refund_amount, 0);
    assert.equal((await cancel(received)).status, "cancelled");
    assert.equal(await balance(), 1000);
    assert.equal((await ledger()).rows.length, 0);
    const { rows } = await db.query("select cancelled,ordered,received,charged from orders");
    assert.deepEqual(rows, [{ cancelled: true, ordered: false, received: false, charged: false }]);
  });
}

test("refund uses settled price snapshot, not a later menu price", async () => {
  await seed(true);
  assert.equal((await settle()).status, "charged");
  assert.equal((await settle()).status, "skipped");
  assert.equal(await balance(), 880);
  await db.exec("update menus set price=180");
  assert.equal((await preview()).refund_amount, 120);
  const result = await cancel(true, true, 120, "Wrong student");
  assert.equal(result.refund_amount, 120);
  assert.equal(result.balance_after, 1000);
  assert.equal(result.manual_refund, false);
  const { rows } = await ledger();
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => [row.type, row.amount, row.order_id]), [
    ["order", -120, order], ["refund", 120, order],
  ]);
});

test("retry or double cancellation never refunds twice", async () => {
  await seed(true);
  await settle();
  await cancel(true, true, 120);
  assert.equal((await cancel(true, true, 120)).status, "already_cancelled");
  assert.equal((await preview()).status, "already_cancelled");
  assert.equal(await balance(), 1000);
  assert.equal((await ledger()).rows.length, 2);
});

test("automatic meal generation cannot recreate a cancelled order", async () => {
  await seed();
  await cancel();
  await db.query(`insert into orders(student_id,meal_id,order_date) values($1,$2,$3)
    on conflict(student_id,order_date) do nothing`, [student, meal, date]);
  assert.equal(await scalar("select count(*)::int as value from orders"), 1);
  assert.equal((await preview()).status, "already_cancelled");
  await db.exec("update orders set received=true");
  assert.equal((await settle()).status, "skipped");
  assert.equal(await balance(), 1000);
});

test("explicit reorder can settle again at its new price and refund only that charge", async () => {
  await seed(true);
  await settle();
  await cancel(true, true, 120);
  await db.exec("update orders set cancelled=false,ordered=true,received=true; update menus set price=150;");
  await settle();
  assert.equal((await preview()).refund_amount, 150);
  await cancel(true, true, 150);
  assert.equal(await balance(), 1000);
  assert.equal((await ledger()).rows.length, 4);
});

test("linked ledger amount is used when the snapshot is absent", async () => {
  await seed(true);
  await settle();
  await db.exec("update orders set charged_amount=null; update menus set price=999;");
  assert.equal((await preview()).refund_amount, 120);
  await cancel(true, true, 120);
  assert.equal(await balance(), 1000);
});

test("legacy refund matches Taipei date and original debit, not current price", async () => {
  await seed(false, true);
  await legacyCharge(95);
  await legacyCharge(80, "2026-08-29T17:00:00Z");
  assert.equal((await preview()).refund_amount, 95);
  await cancel(false, true, 95);
  assert.equal(await balance(), 1095);
});

test("ambiguous legacy charges require manual amount and explanation", async () => {
  await seed(true, true);
  await legacyCharge(90);
  await legacyCharge(120);
  assert.equal((await preview()).refund_amount, null);
  await assert.rejects(cancel(true, true, 120), /人工/);
  for (const amount of [null, 0, -1, 0.001, 95.5, "NaN", "Infinity"]) {
    await assert.rejects(cancel(true, true, amount, "Checked receipt"), /金額/);
  }
  assert.equal(await balance(), 1000);
  assert.equal((await ledger()).rows.length, 2);
  assert.equal((await cancel(true, true, 120, "Checked receipt")).manual_refund, true);
  assert.equal(await balance(), 1120);
  assert.match((await ledger()).rows.at(-1).description, /Checked receipt/);
});

test("missing legacy ledger is never guessed from the menu", async () => {
  await seed(true, true);
  assert.equal((await preview()).refund_amount, null);
  await assert.rejects(cancel(true, true, 120), /人工/);
  assert.equal(await balance(), 1000);
});

test("changed received or charged state and mismatched amount reject the whole operation", async () => {
  await seed(true);
  await assert.rejects(cancel(false), /狀態已變更/);
  await assert.rejects(cancel(true, false, 120), /未扣款/);
  await settle();
  await assert.rejects(cancel(true, false, 0), /狀態已變更/);
  await assert.rejects(cancel(true, true, 90), /金額已變更/);
  assert.equal(await balance(), 880);
  assert.equal((await preview()).status, "ready");
  assert.equal((await ledger()).rows.length, 1);
});

test("failed ledger insertion rolls back wallet and order changes", async () => {
  await seed(true);
  await settle();
  await db.exec("alter table transactions add constraint test_no_refund check(type <> 'refund');");
  try {
    await assert.rejects(cancel(true, true, 120), /test_no_refund/);
    assert.equal(await balance(), 880);
    assert.equal((await preview()).charged, true);
    assert.equal((await preview()).status, "ready");
    assert.equal((await ledger()).rows.length, 1);
  } finally {
    await db.exec("alter table transactions drop constraint test_no_refund;");
  }
});

test("missing order does not mutate any wallet", async () => {
  assert.equal((await cancel()).status, "missing");
  assert.equal((await preview()).status, "missing");
  assert.equal(await balance(), 1000);
});

test("parent leave does not remove a previously cancelled order or refund it again", async () => {
  await seed(true);
  await settle();
  await cancel(true, true, 120);
  const result = await scalar("select register_parent_leave_atomic($1,$2,true,null) as value", [student, date]);
  assert.equal(result.refunded, false);
  assert.equal((await preview()).status, "already_cancelled");
  assert.equal(await balance(), 1000);
});

test("refund RPCs require authenticated role and migration is repeatable", async () => {
  for (const fn of ["preview_order_cancellation(uuid)", "cancel_order_atomic(uuid,boolean,boolean,numeric,text)"]) {
    assert.equal(await scalar("select has_function_privilege('anon',$1,'EXECUTE') as value", [fn]), false);
    assert.equal(await scalar("select has_function_privilege('authenticated',$1,'EXECUTE') as value", [fn]), true);
  }
  assert.equal(await scalar("select has_function_privilege('authenticated','order_refund_amount(uuid)','EXECUTE') as value"), false);
  await seed();
  await db.exec(sql);
  assert.equal((await preview()).status, "ready");
});

function loadClient(result) {
  const calls = [];
  const source = readFileSync(new URL("../src/lib/orderCancellation.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      assert.equal(name, "@/lib/supabase");
      return { supabase: { async rpc(name, args) { calls.push([name, args]); return result; } } };
    },
  });
  return { ...exports, calls };
}

const ready = { status: "ready", order_id: order, order_date: date, received: true, charged: true, refund_amount: 120 };

test("client uses one atomic RPC with confirmed state and amount", async () => {
  const client = loadClient({ data: { status: "cancelled", order_id: order, refund_amount: 120 } });
  await client.cancelOrderWithRefund(ready, 120, " Mistake ");
  assert.deepEqual(JSON.parse(JSON.stringify(client.calls)), [["cancel_order_atomic", {
    p_order_id: order, p_expected_received: true, p_expected_charged: true, p_refund_amount: 120, p_reason: "Mistake",
  }]]);
});

test("client surfaces database failure instead of reporting success", async () => {
  const client = loadClient({ error: { message: "Permission denied" } });
  await assert.rejects(client.previewOrderCancellation(order), /Permission denied/);
  await assert.rejects(client.cancelOrderWithRefund(ready, 120, ""), /Permission denied/);
  const missingMigration = loadClient({ error: { code: "PGRST202", message: "Missing function" } });
  await assert.rejects(missingMigration.previewOrderCancellation(order), /accounting_atomic\.sql/);
});

test("client rejects malformed preview and cancellation responses", async () => {
  for (const data of [null, {}, { ...ready, order_id: "other" }, { ...ready, refund_amount: "120" },
    { ...ready, charged: false }, { ...ready, refund_amount: -1 }]) {
    await assert.rejects(loadClient({ data }).previewOrderCancellation(order));
  }
  for (const data of [null, { status: "ok" }, { status: "cancelled", order_id: order, refund_amount: 90 }]) {
    await assert.rejects(loadClient({ data }).cancelOrderWithRefund(ready, 120, ""));
  }
});

test("client prevents invalid refunds or undocumented manual refunds before a write", async () => {
  const client = loadClient({});
  for (const amount of [-1, 0, 0.001, 95.5, NaN, Infinity]) {
    await assert.rejects(client.cancelOrderWithRefund(ready, amount, ""));
  }
  await assert.rejects(client.cancelOrderWithRefund({ ...ready, refund_amount: null }, 120, " "));
  await assert.rejects(client.cancelOrderWithRefund({ ...ready, charged: false }, 120, ""));
  assert.equal(client.calls.length, 0);
});
