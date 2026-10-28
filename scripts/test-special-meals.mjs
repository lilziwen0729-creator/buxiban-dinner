import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const sql = (file) => readFileSync(new URL(`../database/${file}.sql`, import.meta.url), 'utf8');
const scalar = async (query, args = []) => (await db.query(query, args)).rows[0]?.value;
let today, saturday, weekday;
const roster = (date = saturday) => scalar('select get_special_meal_day($1) as value', [date]);
const rowsFor = (data, ids) => data.students.filter((s) => ids.includes(s.id)).map((s) => ({ student_id: s.id, expected_order: s.order }));
const update = (action, data, ids = [id(21)], menu = id(11), date = saturday) => scalar('select update_special_meal_day($1,$2,$3,$4,$5,$6::jsonb) as value', [date, 'Weekend mock exam', data.day?.version || 0, action, menu, JSON.stringify(action === 'save' ? [] : rowsFor(data, ids))]);
before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor', true), '')::uuid $$;
    create table vendors(id uuid primary key,name text);
    create table menus(id uuid primary key,vendor_id uuid references vendors(id),name text,price numeric,is_active boolean default true);
    create table weekly_schedule(weekday text primary key,vendor_id uuid references vendors(id),menu_id uuid references menus(id));
    create table students(id uuid primary key,name text,grade text,enrollment_status text default 'active',auto_order boolean default false,fixed_days_off text[] default '{}',balance numeric default 500);
    create table orders(id uuid primary key default gen_random_uuid(),student_id uuid references students(id),order_date date,meal_id uuid references menus(id),ordered boolean,cancelled boolean,received boolean,charged boolean,unique(student_id,order_date));
    create table leave_records(student_id uuid,leave_date date,kept_order boolean);
  `);
  await db.exec(sql('meal_order_overrides'));
  await db.exec(sql('meal_schedule_groups'));
  await db.exec(sql('special_meals'));
  await db.exec(sql('special_meals'));
  today = await scalar("select (now() at time zone 'Asia/Taipei')::date::text as value");
  saturday = await scalar("select ($1::date + ((6-extract(dow from $1::date)::int+7)%7))::text as value", [today]);
  weekday = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][new Date(`${today}T00:00:00Z`).getUTCDay()];
  await db.query("insert into vendors values($1,'Vendor')", [id(1)]);
  await db.query("insert into menus(id,vendor_id,name,price) values($1,$3,'Primary meal',100),($2,$3,'Junior meal',120)", [id(11), id(12), id(1)]);
});
beforeEach(async () => {
  await db.exec('truncate orders,leave_records,meal_order_overrides,students,special_meal_days,weekly_schedule');
  await db.query("select set_config('test.actor',$1,false)", [id(99)]);
  for (const [n, grade] of [[21,'小四'],[22,'國一'],[23,'小四']]) await db.query("insert into students(id,name,grade) values($1,$2,$3)", [id(n),`Student ${n}`,grade]);
});
after(() => db.close());
test('weekend adds immediate future orders, distinct meals, no duplicate or recurring setting, no money/arrival changes', async () => {
  assert.deepEqual(await update('add', await roster(), [id(21)]), { changed: 1, skipped: [] });
  await update('add', await roster(), [id(22)], id(12));
  assert.equal((await update('add', await roster(), [id(21)])).skipped.length, 1);
  assert.equal(await scalar('select count(*)::int as value from orders'), 2);
  assert.equal(await scalar('select count(*)::int as value from orders where received or charged'), 0);
  assert.equal(await scalar('select sum(balance)::int as value from students'), 1500);
  assert.equal(await scalar('select count(*)::int as value from students where auto_order'), 0);
  assert.equal(await scalar('select count(*)::int as value from weekly_schedule'), 0);
  assert.equal(await scalar('select count(distinct meal_id)::int as value from orders'), 2);
});
test('cancel is date-only and preserved; restore reuses same order ID with explicit meal', async () => {
  await update('add', await roster());
  const oldId = (await roster()).students.find((s) => s.id === id(21)).order.id;
  await update('cancel', await roster());
  assert.equal(await scalar('select should_order as value from meal_order_overrides'), false);
  assert.equal((await update('add', await roster())).changed, 0);
  await update('restore', await roster(), [id(21)], id(12));
  const order = (await roster()).students.find((s) => s.id === id(21)).order;
  assert.equal(order.id, oldId); assert.equal(order.meal_id, id(12)); assert.equal(order.cancelled, false);
  assert.equal(await scalar('select should_order as value from meal_order_overrides'), true);
});
test('fixed existing order remains unique, different meal can be explicitly assigned', async () => {
  await db.query('insert into orders(student_id,order_date,meal_id) values($1,$2,$3)', [id(21), saturday, id(12)]);
  assert.equal((await update('add', await roster())).changed, 0);
  assert.equal(await scalar('select meal_id::text as value from orders'), id(12));
  await update('menu', await roster());
  assert.equal(await scalar('select special_meal as value from orders'), true);
});
test('processed meals, inactive students and leave are skipped', async () => {
  await update('add', await roster());
  await db.query('update orders set received=true');
  assert.equal((await update('cancel', await roster())).changed, 0);
  await db.query('update orders set received=false,charged=true');
  assert.equal((await update('menu', await roster())).changed, 0);
  await db.query('insert into leave_records values($1,$2,false)', [id(22), saturday]);
  await db.query("update students set enrollment_status='inactive' where id=$1", [id(23)]);
  const data = await roster();
  data.students.push({ id: id(23), order: null });
  const result = await update('add', data, [id(22), id(23)]);
  assert.equal(result.changed, 0); assert.equal(result.skipped.length, 2);
});
test('version and row fingerprints reject stale batches atomically', async () => {
  const stale = await roster();
  await update('save', stale);
  await assert.rejects(update('add', stale), /已被更新/);
  const data = await roster();
  await db.query('insert into orders(student_id,order_date,meal_id) values($1,$2,$3)', [id(22), saturday, id(11)]);
  await assert.rejects(update('add', data, [id(21), id(22)]), /已變更/);
  assert.equal(await scalar('select count(*)::int as value from orders'), 1);
});
test('temporary meal is protected from weekly sync and normal weekday reordering', async (t) => {
  if (['星期六','星期日'].includes(weekday)) return t.skip('weekday integration');
  await update('add', await roster(today), [id(21)], id(12), today);
  await db.query('insert into weekly_schedule(weekday,vendor_id,menu_id,primary_vendor_id,primary_menu_id,junior_vendor_id,junior_menu_id) values($1,$2,$3,$2,$3,$2,$3)', [weekday,id(1),id(11)]);
  await scalar('select save_grouped_meal_schedule($1::jsonb,true) as value', [JSON.stringify([{weekday,meal_group:'primary',vendor_id:id(1),menu_id:id(11),expected_vendor_id:id(1),expected_menu_id:id(11)}])]);
  await scalar('select set_meal_order_dates($1,array[$2::date],true) as value', [id(21),today]);
  assert.equal(await scalar('select meal_id::text as value from orders'),id(12));
});
test('authentication, permissions and date validation', async () => {
  assert.equal(await scalar("select has_table_privilege('anon','special_meal_days','SELECT') as value"),false);
  assert.equal(await scalar("select has_function_privilege('anon','get_special_meal_day(date)','EXECUTE') as value"),false);
  await assert.rejects(update('add', await roster(), [id(21)], id(11), '2020-01-01'), /180/);
  await db.query("select set_config('test.actor','',false)");
  await assert.rejects(roster(), /登入/);
});
