import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import vm from "node:vm";
import ts from "typescript";

const db = new PGlite();
const student = "10000000-0000-0000-0000-000000000001";
const actor = "20000000-0000-0000-0000-000000000001";
const menu = "30000000-0000-0000-0000-000000000001";
let nextDay;
let today;

const scalar = async (sql, values = []) => (await db.query(sql, values)).rows[0]?.value;
const update = (dates, decision) => scalar(
  "select set_meal_order_dates($1,$2::date[],$3) as value", [student, dates, decision]);
const order = (date) => scalar(
  "select to_jsonb(o) as value from orders o where student_id=$1 and order_date=$2", [student, date]);
const override = (date) => scalar(
  "select should_order as value from meal_order_overrides where student_id=$1 and order_date=$2", [student, date]);

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('test.actor', true), '')::uuid $$;
    create table students(id uuid primary key, name text, enrollment_status text,
      auto_order boolean, fixed_days_off text[]);
    create table orders(id uuid primary key default gen_random_uuid(), student_id uuid,
      order_date date, meal_id uuid, ordered boolean, cancelled boolean,
      received boolean, charged boolean, unique(student_id, order_date));
    create table weekly_schedule(weekday text, menu_id uuid);
    create table leave_records(student_id uuid, leave_date date, kept_order boolean);
  `);
  await db.exec(readFileSync(new URL("../database/meal_order_overrides.sql", import.meta.url), "utf8"));
  today = await scalar("select (now() at time zone 'Asia/Taipei')::date::text as value");
  nextDay = await scalar(`select (base.day + n)::text as value
    from (select (now() at time zone 'Asia/Taipei')::date as day) base,
    generate_series(0, 7) as n
    where extract(isodow from base.day + n) between 1 and 5 limit 1`);
});
beforeEach(async () => {
  await db.exec("truncate students, orders, weekly_schedule, leave_records, meal_order_overrides;");
  await db.query("select set_config('test.actor',$1,false)", [actor]);
  await db.query("insert into students values($1,'Test','active',true,array['週一','週二','週三','週四','週五'])", [student]);
  await db.query("insert into weekly_schedule values($1,$2)", [
    `星期${"日一二三四五六"[new Date(`${nextDay}T12:00:00Z`).getUTCDay()]}`, menu,
  ]);
});
after(() => db.close());

test("date overrides and leave take precedence over the weekly plan", () => {
  const source = readFileSync(new URL("../src/lib/mealOrderPlanning.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: () => ({ supabase: {} }) });
  const pick = module.exports.selectMealOrderStudents;
  const students = [
    { id: "fixed", enrollment_status: "active", auto_order: true, fixed_days_off: ["週四"] },
    { id: "extra", enrollment_status: "active", auto_order: false, fixed_days_off: [] },
    { id: "absent", enrollment_status: "active", auto_order: true, fixed_days_off: ["週四"] },
    { id: "inactive", enrollment_status: "inactive", auto_order: true, fixed_days_off: ["週四"] },
  ];
  const result = pick(students, "週四", [
    { student_id: "fixed", should_order: false },
    { student_id: "extra", should_order: true },
    { student_id: "absent", should_order: true },
    { student_id: "inactive", should_order: true },
  ], [{ student_id: "absent", kept_order: false }]);
  assert.equal(result.map((item) => item.id).join(","), "extra");
});

test("future stop and restore keep the order and override in sync", async () => {
  await db.query("insert into orders(student_id,order_date,meal_id,ordered,cancelled,received,charged) values($1,$2,$3,true,false,false,false)", [student, nextDay, menu]);
  assert.equal((await update([nextDay], false)).updated, 1);
  assert.equal(await override(nextDay), false);
  assert.equal((await order(nextDay)).cancelled, true);
  await update([nextDay], null);
  assert.equal(await override(nextDay), undefined);
  assert.equal((await order(nextDay)).cancelled, false);
});

test("ad hoc future orders can be scheduled without a weekly plan", async () => {
  await db.query("update students set auto_order=false, fixed_days_off='{}' where id=$1", [student]);
  await update([nextDay], true);
  assert.equal(await override(nextDay), true);
  if (nextDay === today) assert.equal((await order(nextDay)).cancelled, false);
  else assert.equal(await order(nextDay), undefined);
  await update([nextDay], null);
  assert.equal(await override(nextDay), undefined);
  if (nextDay === today) assert.equal((await order(nextDay)).cancelled, true);
});

test("leave and processed orders reject unsafe changes without partial writes", async () => {
  await db.query("insert into leave_records values($1,$2,false)", [student, nextDay]);
  await assert.rejects(update([nextDay], true), /請假/);
  assert.equal(await override(nextDay), undefined);
  await update([nextDay], false);
  await update([nextDay], null);
  assert.equal(await override(nextDay), undefined);
  await db.exec("truncate leave_records;");
  await db.query("insert into orders(student_id,order_date,meal_id,ordered,cancelled,received,charged) values($1,$2,$3,true,false,true,false)", [student, nextDay, menu]);
  await assert.rejects(update([nextDay], false), /已領餐或扣款/);
  assert.equal(await override(nextDay), undefined);
});
