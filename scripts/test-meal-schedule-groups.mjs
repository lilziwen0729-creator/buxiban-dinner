import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const migration = readFileSync(new URL("../database/meal_schedule_groups.sql", import.meta.url), "utf8");
const overrides = readFileSync(new URL("../database/meal_order_overrides.sql", import.meta.url), "utf8");
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
let today;
let weekday;
let isWeekday;
const change = (group, menu = id(12), vendor = id(2), expected = id(11), expectedVendor = id(1)) => ({
  weekday, meal_group: group, vendor_id: vendor, menu_id: menu,
  expected_vendor_id: expectedVendor, expected_menu_id: expected,
});
const save = (rows, sync = true) => scalar("select save_grouped_meal_schedule($1::jsonb,$2) as value", [JSON.stringify(rows), sync]);
const menuForOrder = (student) => scalar("select meal_id::text as value from orders where student_id=$1", [id(student)]);

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor', true), '')::uuid $$;
    create table vendors(id uuid primary key, name text);
    create table menus(id uuid primary key, vendor_id uuid references vendors(id), name text, price numeric, is_active boolean default true);
    create table weekly_schedule(weekday text primary key, vendor_id uuid references vendors(id) on delete cascade, menu_id uuid references menus(id) on delete cascade);
    create table students(id uuid primary key, grade text, enrollment_status text default 'active', auto_order boolean default false, fixed_days_off text[] default '{}', balance numeric default 500);
    create table orders(id uuid primary key default gen_random_uuid(), student_id uuid references students(id), order_date date, meal_id uuid references menus(id), ordered boolean, cancelled boolean, received boolean, charged boolean, unique(student_id, order_date));
    create table leave_records(student_id uuid, leave_date date, kept_order boolean);
  `);
  await db.query("insert into vendors values($1,'Vendor A'),($2,'Vendor B')", [id(1), id(2)]);
  await db.query("insert into menus(id,vendor_id,name,price) values($1,$2,'Meal A',100),($3,$4,'Meal B',120)", [id(11), id(1), id(12), id(2)]);
  today = await scalar("select (now() at time zone 'Asia/Taipei')::date::text as value");
  const day = Number(await scalar("select extract(isodow from (now() at time zone 'Asia/Taipei'))::int as value"));
  isWeekday = day <= 5;
  weekday = `星期${['一','二','三','四','五','六','日'][isWeekday ? day - 1 : 0]}`;
  await db.query("insert into weekly_schedule values($1,$2,$3)", [weekday, id(1), id(11)]);
  await db.exec(overrides);
  await db.exec(migration);
  assert.equal(await scalar("select primary_menu_id::text as value from weekly_schedule"), id(11));
  assert.equal(await scalar("select junior_menu_id::text as value from weekly_schedule"), id(11));
});

beforeEach(async () => {
  await db.exec("truncate orders, leave_records, meal_order_overrides, students;");
  await db.query("select set_config('test.actor',$1,false)", [id(99)]);
  await db.query("update weekly_schedule set vendor_id=$1,primary_vendor_id=$1,junior_vendor_id=$1,menu_id=$2,primary_menu_id=$2,junior_menu_id=$2", [id(1), id(11)]);
  for (const [student, grade, received, charged, cancelled] of [
    [21, '小四', false, false, false], [22, '國一', false, false, false],
    [23, '小四', true, false, false], [24, '小四', false, true, false],
    [25, '小四', false, false, true], [26, '高一', false, false, false],
    [27, '小四', true, true, false],
  ]) {
    await db.query("insert into students(id,grade) values($1,$2)", [id(student), grade]);
    await db.query("insert into orders(student_id,order_date,meal_id,ordered,received,charged,cancelled) values($1,$2,$3,true,$4,$5,$6)", [id(student), today, id(11), received, charged, cancelled]);
  }
});
after(() => db.close());

test("migration is repeatable and never resets custom or empty group settings", async () => {
  await db.query("update weekly_schedule set primary_menu_id=$1,primary_vendor_id=$2,junior_menu_id=null,junior_vendor_id=null", [id(12), id(2)]);
  await db.exec(migration);
  assert.equal(await scalar("select primary_menu_id::text as value from weekly_schedule"), id(12));
  assert.equal(await scalar("select junior_menu_id as value from weekly_schedule"), null);
  assert.equal(await menuForOrder(21), id(11));
});
test("save changes this group's uncharged orders including received, but preserves charged and cancelled orders", async (t) => {
  if (!isWeekday) return t.skip('No weekday meal sync on weekends');
  assert.deepEqual(await save([change('primary')]), { changed: 1, synced_orders: 2 });
  assert.equal(await menuForOrder(21), id(12));
  assert.equal(await menuForOrder(23), id(12));
  assert.equal(await scalar("select received as value from orders where student_id=$1", [id(23)]), true);
  assert.equal(await scalar("select charged as value from orders where student_id=$1", [id(23)]), false);
  for (const student of [22, 24, 25, 26, 27]) assert.equal(await menuForOrder(student), id(11));
  assert.equal(await scalar("select count(*)::int as value from orders"), 7);
  assert.equal(await scalar("select sum(balance)::int as value from students"), 3500);
  assert.deepEqual(await save([change('primary', id(12), id(2), id(12), id(2))]), { changed: 0, synced_orders: 0 });
});

test("unchanged schedules repair received unpaid orders and refresh their settlement price without charging", async (t) => {
  if (!isWeekday) return t.skip('No weekday meal sync on weekends');
  await save([change('primary')], false);
  assert.equal(await menuForOrder(23), id(11));
  const originalFlags = (await db.query("select id, received, charged, cancelled, ordered from orders order by id")).rows;
  assert.deepEqual(await save([change('primary', id(12), id(2), id(12), id(2))]), { changed: 0, synced_orders: 2 });
  assert.equal(await scalar("select m.price::int as value from orders o join menus m on m.id=o.meal_id where o.student_id=$1", [id(23)]), 120);
  assert.deepEqual((await db.query("select id, received, charged, cancelled, ordered from orders order by id")).rows, originalFlags);
  assert.equal(await scalar("select sum(balance)::int as value from students"), 3500);
  assert.deepEqual(await save([change('primary', id(12), id(2), id(12), id(2))]), { changed: 0, synced_orders: 0 });
});

test("sync never rewrites past or future orders, and received junior orders use only the junior plan", async (t) => {
  if (!isWeekday) return t.skip('No weekday meal sync on weekends');
  await db.query("update orders set received=true where student_id=$1", [id(22)]);
  await db.query("insert into orders(student_id,order_date,meal_id,ordered,received,charged,cancelled) values($1,$2::date-7,$3,true,true,false,false),($1,$2::date+7,$3,true,false,false,false)", [id(21), today, id(11)]);
  await save([change('junior')]);
  assert.equal(await menuForOrder(22), id(12));
  assert.equal(await menuForOrder(23), id(11));
  await save([change('primary')]);
  assert.equal(await scalar("select count(*)::int as value from orders where order_date <> $1::date and meal_id=$2", [today, id(11)]), 2);
});
test("sync can be disabled and secondary grade never receives primary changes", async () => {
  assert.deepEqual(await save([change('junior')], false), { changed: 1, synced_orders: 0 });
  assert.equal(await scalar("select primary_menu_id::text as value from weekly_schedule"), id(11));
  assert.equal(await menuForOrder(22), id(11));
});
test("stale edits, mismatched vendors and partial batch failures roll back", async () => {
  await assert.rejects(save([change('primary', id(12), id(1))]), /商家/);
  await assert.rejects(save([change('primary', id(12), id(2), id(12))]), /其他人更新/);
  await assert.rejects(save([change('junior'), change('primary', id(12), id(1))]), /商家/);
  assert.equal(await scalar("select junior_menu_id::text as value from weekly_schedule"), id(11));
  for (const student of [21, 22]) assert.equal(await menuForOrder(student), id(11));
  await assert.rejects(save([change('primary'), change('primary')]), /重複/);
  await db.query("select set_config('test.actor','',false)");
  await assert.rejects(save([change('primary')]), /登入/);
});
test("ad hoc ordering uses correct group, preserves processed meal, and does not duplicate orders", async (t) => {
  if (!isWeekday) return t.skip('No weekday ad hoc ordering on weekends');
  await save([change('junior')], false);
  for (const student of [21, 22, 23, 27]) await scalar("select set_meal_order_dates($1,array[$2::date],true) as value", [id(student), today]);
  assert.equal(await menuForOrder(22), id(12));
  assert.equal(await menuForOrder(21), id(11));
  await save([change('primary')], false);
  for (const student of [23, 27]) await scalar("select set_meal_order_dates($1,array[$2::date],true) as value", [id(student), today]);
  assert.equal(await menuForOrder(23), id(11));
  assert.equal(await menuForOrder(27), id(11));
  assert.equal(await scalar("select count(*)::int as value from orders"), 7);
});
test("an intentionally unconfigured group fails ad hoc ordering instead of borrowing another meal", async (t) => {
  if (!isWeekday) return t.skip('No weekday ad hoc ordering on weekends');
  await save([change('junior', null, null)], false);
  await assert.rejects(scalar("select set_meal_order_dates($1,array[$2::date],true) as value", [id(22), today]), /此年級今日尚未設定/);
  assert.equal(await scalar("select count(*)::int as value from meal_order_overrides"), 0);
  assert.equal(await menuForOrder(22), id(11));
});
test("removing a vendor or menu preserves the other group's plan", async () => {
  await db.exec("begin");
  try {
    await db.query("insert into vendors(id,name) values($1,'Disposable vendor')", [id(91)]);
    await db.query("insert into menus(id,vendor_id,name,price) values($1,$2,'Disposable menu',100)", [id(92), id(91)]);
    await db.query("update weekly_schedule set vendor_id=$1,primary_vendor_id=$1,menu_id=$2,primary_menu_id=$2", [id(91), id(92)]);
    await db.query("delete from menus where id=$1", [id(92)]);
    assert.equal(await scalar("select count(*)::int as value from weekly_schedule"), 1);
    assert.equal(await scalar("select primary_menu_id as value from weekly_schedule"), null);
    assert.equal(await scalar("select junior_menu_id::text as value from weekly_schedule"), id(11));
    await db.query("delete from vendors where id=$1", [id(91)]);
    assert.equal(await scalar("select primary_vendor_id as value from weekly_schedule"), null);
    assert.equal(await scalar("select junior_vendor_id::text as value from weekly_schedule"), id(1));
    assert.equal(await menuForOrder(21), id(11));
  } finally { await db.exec("rollback"); }
});
test("deployed override definition matches fresh-install script", () => {
  const extract = (sql) => sql.slice(sql.indexOf('create or replace function public.set_meal_order_dates'), sql.indexOf('notify pgrst')).trim();
  assert.equal(extract(migration), extract(overrides));
});
