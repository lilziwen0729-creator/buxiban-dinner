import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = readFileSync(new URL('../database/learning_tasks.sql', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
const save = (task=10, version=0, students=[id(1),id(2)], date='2026-10-28', scope='第 3 課填空') => scalar(
  'select save_learning_task($1,$2,$3,$4,$5,$6,$7,$8::uuid[]) as value', [id(task),version,date,'社會','fill',scope,'',students]);
const entries = (task=10) => db.query('select * from learning_task_students where task_id=$1 order by student_name', [id(task)]).then((r)=>r.rows);
const update = (entry, completed, note='') => scalar('select update_learning_task_student($1,$2,$3,$4) as value',[entry.id,entry.version,completed,note]);
const list = (view='day', from='2026-10-28', to='2026-10-28', archived=false) => scalar('select list_learning_tasks($1,$2,$3,$4) as value',[view,from,to,archived]);
before(async()=>{
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated;
    create table students(id uuid primary key, name text, grade text, enrollment_status text);
    insert into students values('${id(1)}','學生甲','小四','active'),('${id(2)}','學生乙','小四',null),('${id(3)}','學生丙','國一','inactive');`);
  await db.exec(migration);
});
beforeEach(async()=>{
  await db.exec("reset role; truncate learning_task_students,learning_tasks; update students set enrollment_status='active',name='學生甲',grade='小四' where id='"+id(1)+"';");
  await db.query("select set_config('test.actor',$1,false)",[id(99)]);
});
after(()=>db.close());
test('multiple same-day tasks have independent completion, with reversible checkmarks',async()=>{
  await save(); await save(11);
  const first=(await entries())[0];
  const done=await update(first,true,'抽背通過');
  assert.equal(done.completed,true); assert.ok(done.completed_at);
  assert.equal((await entries(11))[0].completed,false);
  const undone=await update(done,false,'明天再抽背');
  assert.equal(undone.completed,false); assert.equal(undone.completed_at,null);
  assert.equal(undone.note,'明天再抽背'); assert.equal((await list()).length,2);
});
test('editing scope or roster preserves completed records and readding restores them',async()=>{
  await save(); const original=(await entries()).find((r)=>r.student_id===id(1)); await update(original,true,'完成');
  await save(10,1,[id(2)],'2026-10-28','新範圍');
  const removed=(await entries()).find((r)=>r.id===original.id);
  assert.equal(removed.active,false); assert.equal(removed.completed,true);
  await assert.rejects(update(removed,false),/移出/);
  await save(10,2,[id(1),id(2)]);
  const restored=(await entries()).find((r)=>r.id===original.id);
  assert.equal(restored.active,true); assert.equal(restored.completed,true); assert.equal(restored.note,'完成');
});
test('stale edits cannot overwrite another admin, create retries do not duplicate',async()=>{
  await save(); await assert.rejects(save(),/已被更新/);
  await save(10,1); await assert.rejects(save(10,1),/已被更新/);
  const row=(await entries())[0]; await update(row,true);
  await assert.rejects(update(row,false),/已被更新/);
  assert.equal(await scalar('select count(*)::int as value from learning_tasks'),1);
});
test('date history and pending include older unfinished tasks but exclude future and finished',async()=>{
  await save(10,0,[id(1)],'2026-10-01'); await save(11,0,[id(1)],'2026-10-28'); await save(12,0,[id(1)],'2026-10-29');
  await update((await entries(11))[0],true);
  assert.deepEqual((await list('pending')).map((r)=>r.id),[id(10)]);
  assert.equal((await list('history','2026-10-01','2026-10-28')).length,2);
  assert.equal((await list('day')).length,1);
});
test('archive and restore preserve contents and completion, archived tasks cannot be edited',async()=>{
  await save(); const done=await update((await entries())[0],true,'已訂正');
  await db.query('select archive_learning_task($1,1,true)',[id(10)]);
  assert.equal((await list()).length,0); assert.equal((await list('history','2026-10-01','2026-10-28',true)).length,1);
  await assert.rejects(save(10,2),/還原/); await assert.rejects(update(done,false),/封存/);
  await db.query('select archive_learning_task($1,2,false)',[id(10)]);
  assert.equal((await list())[0].learning_task_students[0].completed,true);
});
test('roster validation is atomic and duplicates collapse to one entry per student',async()=>{
  await assert.rejects(save(10,0,[]),/至少/); await assert.rejects(save(10,0,[id(3)]),/離班/);
  await assert.rejects(save(10,0,[id(999)]),/不存在/);
  assert.equal(await scalar('select count(*)::int as value from learning_tasks'),0);
  await save(10,0,[id(1),id(1),id(2)]); assert.equal((await entries()).length,2);
  await assert.rejects(save(10,1,[id(1)],'2026-10-28',' '),/範圍/);
  assert.equal((await entries()).filter((r)=>r.active).length,2);
});
test('student name and grade snapshots survive later changes and withdrawn pupils',async()=>{
  await save();
  await db.query("update students set name='更名學生',grade='小五',enrollment_status='inactive' where id=$1",[id(1)]);
  await save(10,1);
  const row=(await entries()).find((r)=>r.student_id===id(1));
  assert.equal(row.student_name,'學生甲'); assert.equal(row.grade,'小四');
});
test('anonymous parent and teacher clients cannot access tables or RPCs; admin cannot bypass mutation validation',async()=>{
  await save();
  for(const table of ['learning_tasks','learning_task_students']) {
    assert.equal(await scalar("select has_table_privilege('anon',$1,'select') as value",[table]),false);
    assert.equal(await scalar("select has_table_privilege('authenticated',$1,'update') as value",[table]),false);
  }
  await db.exec('set role anon');
  await assert.rejects(list(),/permission denied/);
  await assert.rejects(db.query('select * from learning_tasks'),/permission denied/);
  await assert.rejects(save(20),/permission denied/);
  await db.exec('reset role');
  await db.query("select set_config('test.actor','',false)");
  await assert.rejects(save(20),/登入/);
  await assert.rejects(list(),/登入/);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select * from learning_tasks')).rows.length,0);
  await db.exec('reset role');
  await db.query("select set_config('test.actor',$1,false)",[id(99)]);
  await db.exec('set role authenticated');
  assert.equal((await list()).length,1);
  await assert.rejects(db.query("update learning_tasks set archived=true"),/permission denied/);
});
test('rerunning migration is non-destructive',async()=>{
  await save(); await update((await entries())[0],true);
  await db.exec(migration);
  assert.equal((await list()).length,1); assert.equal((await entries())[0].completed,true);
});
test('deleted students retain historical snapshots, and completion remains editable',async()=>{
  await db.query("insert into students values($1,'保留紀錄學生','小六','active')",[id(4)]);
  await save(10,0,[id(4)]);
  const original=(await entries())[0];
  await db.query('delete from students where id=$1',[id(4)]);
  assert.equal((await list())[0].learning_task_students[0].student_name,'保留紀錄學生');
  assert.equal((await entries())[0].student_id,null);
  await save(10,1,[]);
  assert.equal((await update(original,true)).completed,true);
});
