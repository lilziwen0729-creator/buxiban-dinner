import test from "node:test";
import assert from "node:assert/strict";
import { summarizeAttendance, flattenScores, buildScoreTrends, groupParentCourses } from "../src/lib/parentStudentInfo.ts";

test("weekday rows of the same class appear as one course", () => {
  const base = { name: "小一全科班", grade: "小一", startTime: "12:00:00", endTime: "18:00:00", current: true, startDate: "2026-09-01" };
  const groups = groupParentCourses([
    { ...base, id: "one", dayOfWeek: 1 },
    { ...base, id: "three", dayOfWeek: 3 },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].days, [1, 3]);
});

test("attendance counts each day once and keeps a leave without a course log", () => {
  const courseNames = new Map([["english", "英文班"], ["math", "數學班"]]);
  const days = summarizeAttendance([
    { date: "2026-09-30", status: "arrived", course_id: "english" },
    { date: "2026-09-30", status: "left", course_id: "math" },
    { date: "2026-09-29", status: "pending", course_id: "english" },
    { date: "2026-09-28", status: "arrived", course_id: "english" },
    { date: "2026-09-28", status: "leave", course_id: "math" },
  ], ["2026-09-27", "2026-09-28"], courseNames);

  assert.deepEqual(days.map(({ date, status }) => [date, status]), [
    ["2026-09-30", "present"], ["2026-09-29", "pending"],
    ["2026-09-28", "present"], ["2026-09-27", "leave"],
  ]);
  assert.deepEqual(days[0].details, ["英文班・到班", "數學班・到班"]);
});

test("score trends use comparable subjects and handle a zero previous score", () => {
  const courses = new Map([["english", "英文班"]]);
  const rows = [
    { course_id: "english", exam_date: "2026-09-30", score_1: 80, score_2: 10,
      score_1_subject: "英文", score_2_subject: "聽力", score_1_scope: null, score_2_scope: null },
    { course_id: "english", exam_date: "2026-09-20", score_1: 64, score_2: 0,
      score_1_subject: "英文", score_2_subject: "聽力", score_1_scope: null, score_2_scope: null },
    { course_id: "english", exam_date: "2026-09-10", score_1: 50, score_2: null,
      score_1_subject: "英文", score_2_subject: null, score_1_scope: null, score_2_scope: null },
  ];
  const scores = flattenScores(rows, courses);
  const trends = buildScoreTrends(scores);
  assert.deepEqual(trends.find((trend) => trend.subject === "英文"), {
    subject: "英文", latest: 80, previous: 64, change: 16, changePercent: 25, latestDate: "2026-09-30",
  });
  assert.equal(trends.find((trend) => trend.subject === "聽力").changePercent, null);
});
