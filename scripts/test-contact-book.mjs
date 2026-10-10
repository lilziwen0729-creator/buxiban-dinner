import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const source = fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => load(name.replace("./", "")) });
  modules.set(name, exports);
  return exports;
}
const { availableContactCourses, pickContactCourse, groupContactCourses, entryWeekday, recordContents, matchesContactSearch } = load("contactBook");
const { courseSeriesKey } = load("courseSeries");
const base = { name: "數學班(四年級)", grade: "小四", start_time: "17:30:00", end_time: "19:00:00", course_category: "primary_math" };
const courses = [
  { ...base, id: "summer", name: "暑期小四班", day_of_week: 1, is_active: false },
  { ...base, id: "wed", day_of_week: 3 },
  { ...base, id: "thu", day_of_week: 4 },
  { ...base, id: "future", name: "未開課", day_of_week: 4, start_date: "2026-11-01" },
  { ...base, id: "sun", name: "週日班", day_of_week: 7 },
];

test("calendar weekday handles Sunday and rejects invalid dates", () => {
  assert.equal(entryWeekday("2026-10-10"), 6);
  assert.equal(entryWeekday("2026-10-11"), 7);
  assert.equal(entryWeekday("2026-02-30"), 0);
  assert.equal(entryWeekday(""), 0);
});

test("today's choices exclude inactive, future and other weekdays", () => {
  assert.equal(JSON.stringify(availableContactCourses(courses, "2026-10-08", "scheduled").map((course) => course.id)), '["thu"]');
  assert.equal(pickContactCourse(courses, "2026-10-10", "scheduled"), "");
  assert.equal(pickContactCourse(courses, "2026-10-11", "scheduled"), "sun");
  assert.equal(availableContactCourses(courses, "", "all").length, 0);
});

test("changing date preserves the series but chooses the correct weekday row", () => {
  assert.equal(pickContactCourse(courses, "2026-10-08", "scheduled", "wed"), "thu");
  assert.equal(pickContactCourse(courses, "2026-10-08", "all", "wed"), "thu");
  assert.equal(pickContactCourse(courses, "2026-10-10", "all", "wed"), "wed");
});

test("all active choices allow makeup lessons but not inactive or future classes", () => {
  const ids = availableContactCourses(courses, "2026-10-10", "all").map((course) => course.id);
  assert.equal(ids.length, 3);
  assert.ok(!ids.includes("summer"));
  assert.ok(!ids.includes("future"));
  assert.ok(availableContactCourses(courses, "2026-11-01", "all").some((course) => course.id === "future"));
});

test("history merges weekday rows without merging different class series", () => {
  const groups = groupContactCourses([
    ...courses.slice(1, 3),
    { ...base, id: "other-time", day_of_week: 3, start_time: "18:00:00" },
    { ...base, id: "other-grade", day_of_week: 3, grade: "小五" },
    { ...base, id: "other-category", day_of_week: 3, course_category: "primary_english" },
  ]);
  assert.equal(groups.length, 4);
  assert.equal(groups.find((group) => group.key === courseSeriesKey(courses[1])).courses.length, 2);
  assert.equal(courseSeriesKey(courses[1]), courseSeriesKey({ ...courses[1], start_time: "17:30", is_active: false }));
});

const record = { id: "record", course_id: "thu", entry_date: "2026-10-08", lesson_content: "課本51-53，分數練習", homework: "  ", quiz_scope: null };
test("empty homework and quiz fields do not occupy history space", () => {
  assert.equal(recordContents(record).length, 1);
  assert.equal(recordContents(record)[0].key, "lesson_content");
});
test("search matches class, grade, date and content with multiple terms", () => {
  assert.equal(matchesContactSearch(record, courses[2], "小四 分數"), true);
  assert.equal(matchesContactSearch(record, courses[2], "2026-10-08"), true);
  assert.equal(matchesContactSearch(record, courses[2], "英文"), false);
  assert.equal(matchesContactSearch(record, undefined, "51-53"), true);
});
