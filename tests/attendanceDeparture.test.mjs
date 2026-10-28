import assert from 'node:assert/strict';
import { test } from 'node:test';
import { undoAttendanceDeparture } from '../src/lib/attendanceDeparture.ts';
import { buildLearningRosters } from '../src/lib/learningRoster.ts';
import { nextMealSaturday, canSelectSpecialStudent, specialView } from '../src/lib/specialMeals.ts';

function fixture(homework = null, fail = false) {
  const row = { id: 'log', student_id: 's', course_id: 'c', date: '2026-10-28', status: 'left', arrival_time: '13:00', homework_time: homework, leave_time: '18:00' };
  const calls = [];
  let patch;
  const client = { from(table) {
    assert.equal(table, 'attendance_logs');
    const filters = [];
    let write = false;
    const builder = {
      select() { return builder; },
      eq(k, v) { filters.push([k, v]); return builder; },
      is(k, v) { filters.push([k, v]); return builder; },
      update(data) { patch = data; write = true; return builder; },
      maybeSingle() { calls.push(filters); return Promise.resolve({ data: write ? fail ? null : { ...row, ...patch } : row, error: null }); },
    };
    return builder;
  } };
  return { client, calls, row, patch: () => patch };
}
test('undo restores arrived without altering arrival and only targets the exact student/date/course', async () => {
  const f = fixture();
  const saved = await undoAttendanceDeparture(f.client, 's', '2026-10-28', 'c');
  assert.deepEqual(f.calls[0], [['student_id', 's'], ['date', '2026-10-28'], ['course_id', 'c']]);
  assert.deepEqual(f.patch(), { status: 'arrived', leave_time: null });
  assert.equal(saved.arrival_time, '13:00');
  assert.deepEqual(f.calls[1], [['id', 'log'], ['status', 'left'], ['leave_time', '18:00'], ['homework_time', null]]);
});
test('undo retains completed homework, handles null course scope, and refuses stale writes', async () => {
  const f = fixture('17:00');
  const saved = await undoAttendanceDeparture(f.client, 's', '2026-10-28', null);
  assert.equal(saved.status, 'homework_done');
  assert.equal(saved.homework_time, '17:00');
  assert.deepEqual(f.calls[0][2], ['course_id', null]);
  await assert.rejects(undoAttendanceDeparture(fixture(null, true).client, 's', '2026-10-28', 'c'), /已變更/);
  const changed = fixture(); changed.row.status = 'arrived';
  await assert.rejects(undoAttendanceDeparture(changed.client, 's', '2026-10-28', 'c', true), /Attendance changed/);
  assert.equal(changed.patch(), undefined);
});
test('course roster combines weekdays, deduplicates pupils, excludes inactive pupils and disabled series', () => {
  const courses = [
    { id: 'a', name: '小四全科班', grade: '小四', start_time: '12:00', is_active: true },
    { id: 'b', name: '小四全科班', grade: '小四', is_active: true },
    { id: 'c', name: '暑期班', grade: '小四', is_active: false },
    { id: 'd', name: '英文班', grade: '小四' },
  ];
  const links = [{ course_id: 'a', student_id: 's1' }, { course_id: 'b', student_id: 's1' }, { course_id: 'b', student_id: 's2' }, { course_id: 'a', student_id: 'inactive' }, { course_id: 'd', student_id: 's1' }];
  const result = buildLearningRosters(courses, links, ['s1', 's2'], (course) => course.name);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].studentIds, ['s1', 's2']);
  assert.deepEqual(result[1].studentIds, ['s1']);
  assert.equal(new Set(result.flatMap((group) => group.studentIds)).size, 2);
});
test('weekend default and meal selection protect processed orders and leave', () => {
  assert.equal(nextMealSaturday('2026-10-28'), '2026-10-31');
  assert.equal(nextMealSaturday('2026-10-31'), '2026-10-31');
  assert.equal(nextMealSaturday('2026-11-01'), '2026-11-07');
  const student = { active: true, absent: false, order: null };
  assert.equal(specialView(student), 'available');
  assert.equal(canSelectSpecialStudent(student, 'available'), true);
  assert.equal(canSelectSpecialStudent({ ...student, absent: true }, 'available'), false);
  assert.equal(canSelectSpecialStudent({ ...student, order: { received: true } }, 'ordered'), false);
});
