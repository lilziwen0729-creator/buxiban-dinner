import test from "node:test";
import assert from "node:assert/strict";
import {
  getFormGradeGroup, gradeMatchesGroup, normalizeFormName,
  parseFormMealDates, selectFormMealDates,
} from "../src/lib/formMealDates.ts";

test("parses both form branches and known option typos", () => {
  assert.deepEqual(parseFormMealDates(["10/2(五)", "1016(五)", "10/2(五)"], "middle"),
    ["2026-10-02", "2026-10-16"]);
  assert.deepEqual(parseFormMealDates(["10/7(三)、", "9/30(三)"], "upper"),
    ["2026-09-30", "2026-10-07"]);
  assert.deepEqual(parseFormMealDates([], "middle"), []);
  assert.throws(() => parseFormMealDates(["11/2(一)"], "upper"));
});

test("matches students by normalized name and grade group", () => {
  assert.equal(normalizeFormName(" 王 子 弘 "), "王子弘");
  assert.equal(getFormGradeGroup("中年級(三四年級時間統一)"), "middle");
  assert.equal(gradeMatchesGroup("小四", "middle"), true);
  assert.equal(gradeMatchesGroup("小五", "middle"), false);
});

test("only selected, future, non-conflicting dates are added", () => {
  assert.deepEqual(selectFormMealDates(
    ["2026-09-24", "2026-10-02", "2026-10-05", "2026-10-16"], "2026-09-25",
    new Set(["2026-10-05"]), new Set(["2026-10-16"]), new Set(),
  ), { appliedDates: ["2026-10-02"], skippedDates: ["2026-09-24", "2026-10-05", "2026-10-16"] });
});
