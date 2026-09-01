import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(dirname, "../src/lib/courseCategory.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
} }).outputText;
const category = {};
vm.runInNewContext(compiled, { exports: category });

test("explicit course category always wins", () => {
  assert.equal(category.resolveCourseCategory({ name: "數學班", course_category: "primary_english" }), "primary_english");
});

test("legacy elementary courses are sorted by useful name rules", () => {
  assert.equal(category.resolveCourseCategory({ name: "五年級數學素養" }), "primary_math");
  assert.equal(category.resolveCourseCategory({ name: "兒童美語班" }), "primary_english");
  assert.equal(category.resolveCourseCategory({ name: "小一全科班", grade: "小一" }), "primary_tutoring");
});

test("legacy junior placement and hidden attendance are preserved", () => {
  assert.equal(category.resolveCourseCategory({ grade: "國二" }), "junior");
  assert.equal(category.resolveCourseCategory({ grade: "高一" }), "junior");
  assert.equal(category.resolveCourseCategory({ attendance_section: "junior", grade: "小六" }), "junior");
  assert.equal(category.getCourseAttendanceSection({ course_category: "primary_math", attendance_section: "hidden" }), "hidden");
});

test("database migration classifies legacy courses and stays idempotent", async () => {
  const db = new PGlite();
  const migration = fs.readFileSync(path.join(dirname, "../database/course_categories.sql"), "utf8");

  await db.exec(`
    create schema if not exists public;
    create table public.courses (
      id bigint generated always as identity primary key,
      name text not null,
      grade text,
      attendance_section text default 'auto'
    );
    insert into public.courses (name, grade, attendance_section) values
      ('小五數學素養班', '小五', 'auto'),
      ('小三美語班', '小三', 'auto'),
      ('小一全科班', '小一', 'auto'),
      ('國二英文班', '國二', 'auto'),
      ('高中數學班', '高一', 'auto');
  `);
  await db.exec(migration);

  const result = await db.query("select name, course_category from public.courses order by id");
  assert.deepEqual(
    result.rows.map(({ name, course_category }) => [name, course_category]),
    [
      ["小五數學素養班", "primary_math"],
      ["小三美語班", "primary_english"],
      ["小一全科班", "primary_tutoring"],
      ["國二英文班", "junior"],
      ["高中數學班", "junior"],
    ],
  );

  await db.exec("update public.courses set course_category = 'primary_tutoring' where name = '小五數學素養班'");
  await db.exec(migration);
  const preserved = await db.query("select course_category from public.courses where name = '小五數學素養班'");
  assert.equal(preserved.rows[0].course_category, "primary_tutoring");
  await assert.rejects(
    db.exec("insert into public.courses (name, course_category) values ('錯誤分類', 'invalid')"),
  );
  await db.close();
});
