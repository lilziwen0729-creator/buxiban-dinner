import assert from 'node:assert/strict';
import test from 'node:test';
import { balanceDraft, canSendLowBalanceLine, defaultBalanceTemplate } from '../src/lib/lowBalanceDraft.ts';

const student = { student_id: 'a', student_name: '測試宥翔', balance: -860 };
test('manual reminders use the exact student, signed balance and supplied transfer account', () => {
  const text = balanceDraft(defaultBalanceTemplate(' 0012345678\n'), student);
  assert.match(text, /測試宥翔 餐費目前餘額為 \$ -860，/);
  assert.match(text, /元大銀行：806\n帳號：0012345678\n\n/);
  assert.match(text, /匯款金額.*轉帳末五碼/);
  assert.doesNotMatch(text, /\{\{/);
});
test('cash-only fallback never asks parents to transfer without an account', () => {
  assert.doesNotMatch(defaultBalanceTemplate(' '), /帳號|線上匯款|末五碼/);
});
test('edited templates preserve literal text, line breaks, repeated tokens and zero or positive balances', () => {
  const template = '{{學生姓名}}：\n{{餘額}} / {{餘額}}';
  for (const balance of [0, 199]) {
    assert.equal(balanceDraft(template, { ...student, student_name: '$&同學', balance }), `$&同學：\n${balance} / ${balance}`);
  }
  assert.equal(balanceDraft('自訂內容', student), '自訂內容');
});
test('LINE eligibility does not restrict manual drafts', () => {
  const unbound = { ...student, parent_count: 0, reason: '沒有已綁定 LINE 的家長' };
  assert.equal(canSendLowBalanceLine(unbound), false);
  assert.equal(balanceDraft('{{學生姓名}}', unbound), student.student_name);
  assert.equal(canSendLowBalanceLine({ ...unbound, parent_count: 1, reason: 'dryRun 未發送' }), true);
});
