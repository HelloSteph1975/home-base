'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tempDir, writeFile, readFile, startApp } = require('./helpers');

test('a monthly bill on the 31st: pay, double-pay refused, undo', async (t) => {
  const root = tempDir();
  const app = await startApp(root, { today: '2026-02-27' });
  t.after(() => app.close());
  const made = await app.post('/api/bills', { name: 'Rent', amount: 1200, due_date: '2026-01-31', recurring: 'monthly' });
  assert.equal(made.status, 201);
  const { id } = made.json;

  let feb = (await app.get('/api/bills?month=2026-02')).json;
  assert.deepEqual(feb.items.map((i) => [i.date, i.paid]), [['2026-02-28', false]]);
  assert.equal(feb.bills[0].next_due, '2026-01-31');
  assert.equal(feb.bills[0].days_until, -27);

  assert.equal((await app.post(`/api/bills/${id}/paid`, { for: '2026-01-31' })).status, 200);
  const second = await app.post(`/api/bills/${id}/paid`, {});
  assert.deepEqual(second.json, { ok: true, for: '2026-02-28' });
  assert.match(readFile(root, 'Bills/Rent.md'), /^- 2026-02-27: paid 1200\.00 for 2026-02-28$/m);

  feb = (await app.get('/api/bills?month=2026-02')).json;
  assert.deepEqual([feb.due_total, feb.paid_total], [0, 1200]);
  assert.equal(feb.bills[0].next_due, '2026-03-31');

  assert.equal((await app.post(`/api/bills/${id}/paid`, { for: '2026-02-28' })).status, 409);
  assert.equal((await app.post(`/api/bills/${id}/paid`, { for: '2026-02-15' })).status, 400);
  assert.equal((await app.post(`/api/bills/${id}/unpaid`, { for: '2026-02-28' })).status, 200);
  assert.equal((await app.get('/api/bills?month=2026-02')).json.due_total, 1200);
  assert.equal((await app.post(`/api/bills/${id}/unpaid`, { for: '2026-02-28' })).status, 404);
});

test('a one-time bill is done once paid', async (t) => {
  const app = await startApp(tempDir(), { today: '2026-10-13' });
  t.after(() => app.close());
  const { json } = await app.post('/api/bills', { name: 'Property tax', amount: 1840, due_date: '2026-11-02' });
  await app.post(`/api/bills/${json.id}/paid`, {});
  const view = (await app.get('/api/bills?month=2026-11')).json;
  assert.equal(view.bills[0].next_due, '');
  assert.equal(view.items[0].paid, true);
  assert.equal((await app.post(`/api/bills/${json.id}/paid`, {})).status, 409);
});

test('old notes: dollar signs, paid_through, bad month', async (t) => {
  const root = tempDir();
  writeFile(root, 'Bills/Internet.md', '---\nname: Internet\namount: $1,065.00\ndue_date: 2026-01-05\nrecurring: monthly\npaid_through: 2026-10-12\n---\n');
  const app = await startApp(root, { today: '2026-10-13' });
  t.after(() => app.close());
  const view = (await app.get('/api/bills?month=2026-10')).json;
  assert.equal(view.bills[0].amount, 1065);
  assert.equal(view.bills[0].next_due, '2026-11-05');
  assert.equal(view.items[0].paid, true);
  assert.equal((await app.get('/api/bills?month=2026-13')).status, 400);
  assert.equal((await app.post('/api/bills', { name: 'X', amount: 'lots', due_date: '2026-10-01' })).status, 400);
});
