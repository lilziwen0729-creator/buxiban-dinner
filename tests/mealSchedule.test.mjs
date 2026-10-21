import test from "node:test";
import assert from "node:assert/strict";
import { getMealGroup, getGroupMealPlan, findMealSchedule, planMealOrders } from "../src/lib/mealSchedule.ts";

const legacy = { weekday: "星期三", vendor_id: "v0", menu_id: "m0" };
const grouped = { ...legacy, primary_vendor_id: "v1", primary_menu_id: "m1", junior_vendor_id: "v2", junior_menu_id: "m2" };
test("school group mapping never assigns an unknown grade to elementary or junior", () => {
  for (const grade of ["小一", "小六", "國小三年級", " 小 四 "]) assert.equal(getMealGroup(grade), "primary");
  for (const grade of ["國一", "國三", "國中二年級"]) assert.equal(getMealGroup(grade), "junior");
  for (const grade of [null, "", "高一", "大班", "未分級"]) assert.equal(getMealGroup(grade), "other");
});
test("legacy schema retains existing meals, explicit empty group is never replaced by another meal", () => {
  assert.deepEqual(getGroupMealPlan(legacy, "primary"), { vendor_id: "v0", menu_id: "m0" });
  assert.deepEqual(getGroupMealPlan(grouped, "primary"), { vendor_id: "v1", menu_id: "m1" });
  assert.deepEqual(getGroupMealPlan(grouped, "junior"), { vendor_id: "v2", menu_id: "m2" });
  assert.equal(getGroupMealPlan({ ...grouped, junior_menu_id: null }, "junior").menu_id, null);
  assert.equal(getGroupMealPlan(grouped, "other").menu_id, "m0");
});
test("weekday lookup supports stored weekday aliases", () => {
  assert.equal(findMealSchedule([grouped], "周三"), grouped);
  assert.equal(findMealSchedule([grouped], " 週 三 "), grouped);
  assert.equal(findMealSchedule([grouped], "星期五"), undefined);
});
test("daily generation assigns each student their own group and skips only unconfigured groups", () => {
  const students = [{ id: "p", grade: "小三" }, { id: "j", grade: "國二" }, { id: "o", grade: null }];
  const result = planMealOrders(students, grouped, "2026-10-21");
  assert.deepEqual(result.orders.map((order) => [order.student_id, order.meal_id]), [["p", "m1"], ["j", "m2"], ["o", "m0"]]);
  assert.ok(result.orders.every((order) => !order.received && !order.charged && !order.cancelled && order.ordered));
  const missing = planMealOrders(students, { ...grouped, primary_menu_id: null }, "2026-10-21");
  assert.deepEqual(missing.missing.map((student) => student.id), ["p"]);
  assert.equal(missing.orders.length, 2);
  assert.equal(planMealOrders(students, undefined, "2026-10-21").orders.length, 0);
});
