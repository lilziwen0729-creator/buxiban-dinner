import test from 'node:test';
import assert from 'node:assert/strict';
import { learningTaskClasses, learningTaskClassLabel, matchesLearningTask, taskProgress, shiftLearningDate } from '../src/lib/learningTasks.ts';
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

const rosterTask = { ...task, learning_task_students: task.learning_task_students.map((entry,i)=>({...entry,student_id:String(i+1)})) };
const rosters = [{name:'小四全科班',studentIds:['1','2']},{name:'小四美語班',studentIds:['1','2','3']}];
test('legacy tasks show the unique exact class roster, excluding removed task pupils',()=>{
  assert.deepEqual(learningTaskClasses(rosterTask,rosters),['小四全科班']);
  assert.equal(learningTaskClassLabel(rosterTask,rosters),'小四全科班');
  assert.ok(matchesLearningTask(rosterTask,'全科班','小四',learningTaskClassLabel(rosterTask,rosters)));
});
test('ambiguous, partial and deleted-student rosters use grade labels instead of guessing a class',()=>{
  assert.equal(learningTaskClassLabel(rosterTask,[...rosters,{name:'小四數學班',studentIds:['1','2']}]),'小四 · 學生名單');
  assert.equal(learningTaskClassLabel(rosterTask,[rosters[1]]),'小四 · 學生名單');
  assert.deepEqual(learningTaskClasses({...rosterTask,learning_task_students:[{active:true,student_id:null,grade:'小四'}]},rosters),[]);
});
test('saved class names survive course roster changes and explicit individual selection does not infer a class',()=>{
  const saved = {...rosterTask,class_names:['小四全科班','小四美語班']};
  assert.equal(learningTaskClassLabel(saved,[]),'小四全科班、小四美語班');
  assert.equal(learningTaskClassLabel({...rosterTask,class_names:[]},rosters),'小四 · 學生名單');
  assert.ok(matchesLearningTask(saved,'美語班',''));
});
test('mixed grades are clearly marked and sorted; empty tasks have a safe fallback',()=>{
  const mixed = {...task,learning_task_students:[{active:true,student_id:'a',grade:'國一'},{active:true,student_id:'b',grade:'小四'}]};
  assert.equal(learningTaskClassLabel(mixed),'小四、國一 · 跨班任務');
  assert.equal(learningTaskClassLabel({...task,learning_task_students:[]}),'個別學生');
});
