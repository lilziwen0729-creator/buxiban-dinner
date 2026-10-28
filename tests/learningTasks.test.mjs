import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesLearningTask, taskProgress, shiftLearningDate } from '../src/lib/learningTasks.ts';
const task = { subject:'英文',task_kind:'recite',scope:'Unit 2',note:'',learning_task_students:[
  { active:true,completed:true,student_name:'學生甲',grade:'小四' },
  { active:true,completed:false,student_name:'學生乙',grade:'小四' },
  { active:false,completed:false,student_name:'學生丙',grade:'國一' },
] };
test('progress counts only the assigned roster and excludes removed pupils',()=>{
  assert.deepEqual(taskProgress(task),{total:2,completed:1,pending:1});
});
test('search finds subject, type, scope and student, and filters by grade snapshot',()=>{
  for (const query of ['英文','抽背','unit 2','學生甲']) assert.ok(matchesLearningTask(task,query,'小四'));
  assert.equal(matchesLearningTask(task,'學生丙',''),false);
  assert.equal(matchesLearningTask(task,'','國一'),false);
});
test('date navigation crosses month and year boundaries without local timezone drift',()=>{
  assert.equal(shiftLearningDate('2026-12-31',1),'2027-01-01');
  assert.equal(shiftLearningDate('2026-03-01',-1),'2026-02-28');
});
