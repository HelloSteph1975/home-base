'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const b = require('../server/logic/bills');

test('parseMoney reads what people type', () => {
  assert.equal(b.parseMoney('142'), 142);
  assert.equal(b.parseMoney('$1,234.50'), 1234.5);
  assert.equal(b.parseMoney(''), 0);
  assert.equal(b.parseMoney('abc'), 0);
  assert.equal(b.parseMoney('-5'), 0);
});

test('payments are read from and written to the note body', () => {
  let body = '\nSome notes.\n';
  body = b.addPayment(body, { paid_on: '2026-10-13', amount: 142, for_date: '2026-10-15' });
  body = b.addPayment(body, { paid_on: '2026-11-12', amount: 150.5, for_date: '2026-11-15' });
  assert.equal(body, '\nSome notes.\n\n## Payments\n- 2026-10-13: paid 142.00 for 2026-10-15\n- 2026-11-12: paid 150.50 for 2026-11-15\n');
  assert.deepEqual(b.paymentsFromBody(body), [
    { paid_on: '2026-10-13', amount: 142, for_date: '2026-10-15' },
    { paid_on: '2026-11-12', amount: 150.5, for_date: '2026-11-15' },
  ]);
  const removed = b.removePayment(body, '2026-10-15');
  assert.equal(removed.count, 1);
  assert.deepEqual(b.paymentsFromBody(removed.body).map((p) => p.for_date), ['2026-11-15']);
});

test('lines that only look like payments are ignored', () => {
  assert.deepEqual(b.paymentsFromBody('- 2026-02-30: paid 5.00 for 2026-02-30\n- paid it\n'), []);
});

const bill = (over = {}) => ({ file_path: 'Bills/Rent.md', name: 'Rent', amount: 1200, due_date: '2026-01-31', recurring: 'monthly', status: 'due', paid_through: '', payments: [], ...over });

test('nextDue skips paid dates and never drifts at month end', () => {
  assert.equal(b.nextDue(bill()), '2026-01-31');
  const paid = bill({ payments: [{ paid_on: '2026-01-30', amount: 1200, for_date: '2026-01-31' }] });
  assert.equal(b.nextDue(paid), '2026-02-28');
  assert.equal(b.nextDue(bill({ paid_through: '2026-02-28' })), '2026-03-31');
});

test('one-time bills: paid by a payment line or by the old status field', () => {
  assert.equal(b.nextDue(bill({ recurring: 'none', due_date: '2026-10-20' })), '2026-10-20');
  assert.equal(b.nextDue(bill({ recurring: 'none', due_date: '2026-10-20', status: 'paid' })), null);
  assert.equal(b.nextDue(bill({ recurring: 'none', due_date: '2026-10-20', payments: [{ paid_on: '2026-10-19', amount: 5, for_date: '2026-10-20' }] })), null);
  assert.equal(b.nextDue(bill({ due_date: '' })), null);
});

test('monthView totals what is still due and what was paid', () => {
  const rent = bill({ payments: [{ paid_on: '2026-02-27', amount: 1150, for_date: '2026-02-28' }] });
  const water = bill({ file_path: 'Bills/Water.md', name: 'Water', amount: 48.2, due_date: '2026-02-10', recurring: 'monthly' });
  const view = b.monthView([rent, water], '2026-02');
  assert.equal(view.due_total, 48.2);
  assert.equal(view.paid_total, 1150);
  assert.deepEqual(view.items.map((i) => [i.name, i.date, i.paid, i.amount]), [['Water', '2026-02-10', false, 48.2], ['Rent', '2026-02-28', true, 1150]]);
});
