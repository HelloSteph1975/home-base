'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tempDir, writeFile, startApp } = require('./helpers');

function household() {
  const root = tempDir();
  writeFile(root, 'Home Base Settings.md', '---\nname: Sam\ndefault_home: Main house\n---\n');
  writeFile(root, 'Homes/Main house.md', '---\nname: Main house\n---\n');
  writeFile(root, 'Homes/Cabin.md', '---\nname: Cabin\n---\n');
  writeFile(root, 'Home Maintenance/Monthly Cleaning/Air filter.md', '---\nname: Change air filter\nlast_done: 2026-09-01\n---\n');
  writeFile(root, 'Home Maintenance/Weekly Cleaning/Sweep.md', '---\nname: Sweep porch\nlast_done: 2026-10-12\nhome: Cabin\n---\n');
  writeFile(root, 'Home Maintenance/Weekly Cleaning/Mop.md', '---\nname: Mop\nhome: Old Place\nlast_done: 2026-10-12\n---\n');
  writeFile(root, 'Events/Birthdays/Mom.md', '---\nname: Mom\ndate: 1960-10-17\nrecurring: annual\n---\n');
  writeFile(root, 'Appointments/Dentist.md', '---\nname: Dentist\ndate: 2026-10-13\ntime: 14:30\n---\n');
  writeFile(root, 'Appointments/Old.md', '---\nname: Old checkup\ndate: 2026-10-14\nstatus: done\n---\n');
  writeFile(root, 'Bills/Electric.md', '---\nname: Electric\namount: 142\ndue_date: 2026-09-16\nrecurring: monthly\n---\n\n## Payments\n- 2026-09-15: paid 142.00 for 2026-09-16\n');
  writeFile(root, 'Bills/Car insurance.md', '---\nname: Car insurance\namount: 610\ndue_date: 2026-11-30\nrecurring: annual\n---\n');
  writeFile(root, 'Projects/Porch/Project Info.md', '---\nname: Paint the porch\n---\n');
  writeFile(root, 'Projects/Porch/Tasks/Buy paint.md', '---\nname: Buy paint\ndue_date: 2026-10-15\n---\n');
  writeFile(root, 'Bills/Broken.md', '---\nname: Broken\n');
  return root;
}

test('today gathers what needs attention', async (t) => {
  const app = await startApp(household(), { today: '2026-10-13' });
  t.after(() => app.close());
  const today = (await app.get('/api/today')).json;
  assert.equal(today.name, 'Sam');
  assert.deepEqual(today.chores.map((c) => [c.name, c.home_name, c.days_until]), [['Change air filter', 'Main house', -12]]);
  assert.deepEqual(today.bills.map((b) => [b.name, b.next_due, b.days_until]), [['Electric', '2026-10-16', 3]]);
  assert.deepEqual(today.coming_up.map((i) => [i.date, i.type, i.label]), [
    ['2026-10-13', 'appointment', 'Dentist'],
    ['2026-10-15', 'task', 'Buy paint'],
    ['2026-10-17', 'event', 'Mom'],
  ]);
  assert.deepEqual(today.homes.map((h) => [h.id, h.due_count]), [['Cabin', 0], ['Main house', 1]]);
});

test('calendar lists every day and every kind of item', async (t) => {
  const app = await startApp(household(), { today: '2026-10-13' });
  t.after(() => app.close());
  const { days } = (await app.get('/api/calendar?from=2026-10-12&to=2026-10-18')).json;
  assert.equal(days.length, 7);
  const on = (date) => days.find((d) => d.date === date).items.map((i) => `${i.type}:${i.label}`);
  assert.deepEqual(on('2026-10-13'), ['appointment:Dentist', 'chore:Change air filter']);
  assert.deepEqual(on('2026-10-14'), []);
  assert.deepEqual(on('2026-10-15'), ['task:Buy paint']);
  assert.deepEqual(on('2026-10-16'), ['bill:Electric']);
  assert.deepEqual(on('2026-10-17'), ['event:Mom']);
  const overdue = days.find((d) => d.date === '2026-10-13').items.find((i) => i.type === 'chore');
  assert.equal(overdue.overdue, true);
  assert.equal((await app.get('/api/calendar?from=2026-10-01&to=2026-12-31')).status, 400);
  assert.equal((await app.get('/api/calendar?from=2026-10-18&to=2026-10-12')).status, 400);
  assert.equal((await app.get('/api/calendar?from=soon&to=2026-10-12')).status, 400);
});

test('settings: read, change name and default home', async (t) => {
  const app = await startApp(household(), { today: '2026-10-13' });
  t.after(() => app.close());
  const s = (await app.get('/api/settings')).json;
  assert.deepEqual([s.name, s.default_home], ['Sam', 'Main house']);
  assert.equal((await app.patch('/api/settings', { name: 'Sammy', default_home: 'Cabin' })).status, 200);
  assert.deepEqual(Object.values((await app.get('/api/settings')).json).slice(0, 2), ['Sammy', 'Cabin']);
  assert.equal((await app.patch('/api/settings', { default_home: 'Nowhere' })).status, 400);
});

test('problems lists broken notes and missing homes', async (t) => {
  const app = await startApp(household(), { today: '2026-10-13' });
  t.after(() => app.close());
  const problems = (await app.get('/api/problems')).json;
  assert.deepEqual(problems.map((p) => p.path).sort(), ['Bills/Broken.md', 'Home Maintenance/Weekly Cleaning/Mop.md']);
  assert.match(problems.find((p) => p.path.endsWith('Mop.md')).message, /"Old Place".*Main house/);
});
