import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const dirname = path.dirname(fileURLToPath(import.meta.url));

function loadActivity(result) {
  const calls = [];
  const query = {
    update(payload) { calls.push(["update", payload]); return this; },
    in(column, ids) { calls.push(["in", column, ids]); return this; },
    async select(columns) { calls.push(["select", columns]); return result; },
  };
  const source = fs.readFileSync(path.join(dirname, "../src/lib/courseActivity.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      assert.equal(name, "@/lib/supabase");
      return { supabase: { from(table) { calls.push(["from", table]); return query; } } };
    },
  });
  return { ...exports, calls };
}

test("old courses stay active and series status covers every weekday", () => {
  const activity = loadActivity({});
  assert.equal(activity.isCourseActive({}), true);
  assert.equal(activity.isCourseActive({ is_active: null }), true);
  assert.equal(activity.isCourseActive({ is_active: true }), true);
  assert.equal(activity.isCourseActive({ is_active: false }), false);
  assert.equal(activity.isCourseSeriesActive([{ is_active: false }, {}]), true);
  assert.equal(activity.isCourseSeriesActive([{ is_active: false }, { is_active: false }]), false);
});

for (const isActive of [false, true]) {
  test(`${isActive ? "enable" : "disable"} changes the full week in one update without deleting relations`, async () => {
    const ids = [1, 2, 3, 4, 5].map((day) => `course-${day}`);
    const activity = loadActivity({ data: ids.map((id) => ({ id, is_active: isActive })), error: null });
    await activity.setCourseSeriesActive([...ids, ids[0]], isActive);
    assert.deepEqual(JSON.parse(JSON.stringify(activity.calls)), [
      ["from", "courses"], ["update", { is_active: isActive }],
      ["in", "id", ids], ["select", "id, is_active"],
    ]);
  });
}

test("empty, partial, wrong-ID and wrong-status responses are not reported as success", async () => {
  for (const data of [[], null, [{ id: "a", is_active: false }],
    [{ id: "a", is_active: false }, { id: "other", is_active: false }],
    [{ id: "a", is_active: false }, { id: "b", is_active: true }]]) {
    const activity = loadActivity({ data, error: null });
    await assert.rejects(activity.setCourseSeriesActive(["a", "b"], false));
  }
});

test("database errors are surfaced and missing migrations are identified", async () => {
  for (const code of ["42703", "PGRST204"]) {
    const activity = loadActivity({ error: { code, message: "Missing is_active" } });
    await assert.rejects(activity.setCourseSeriesActive(["a"], false), /course_active_status\.sql/);
  }
  const error = { code: "42501", message: "Permission denied" };
  const activity = loadActivity({ error });
  await assert.rejects(activity.setCourseSeriesActive(["a"], false), (actual) => actual === error);
});

test("an empty series never writes to the database", async () => {
  const activity = loadActivity({});
  await assert.rejects(activity.setCourseSeriesActive([], false));
  assert.equal(activity.calls.length, 0);
});
