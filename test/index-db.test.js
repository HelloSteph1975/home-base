'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempDir, writeFile } = require('./helpers');
const { kindFor, createIndex } = require('../server/index-db');

function sampleRoot() {
  const root = tempDir();
  writeFile(root, 'Homes/Maple St.md', '---\nname: Maple St\nkind: home\ncolor: sage\n---\nGate code 1234\n');
  writeFile(root, 'Home Maintenance/Weekly Cleaning/Vacuum.md', '---\nname: Vacuum\nlast_done: 2026-10-10\nhome: Maple St\n---\n');
  writeFile(root, 'Home Maintenance/Seasonal Home Maintenance/Gutters.md', '---\nname: Gutters\n---\n');
  writeFile(root, 'Home Maintenance/Weekly Cleaning/_template.md', '---\nname: Template\n---\n');
  writeFile(root, 'Home Maintenance/Weekly Cleaning/CLAUDE.md', 'guidance');
  writeFile(root, 'Projects/Porch/Project Info.md', '---\nname: Paint the porch\nstatus: active\nhome: Maple St\n---\n');
  writeFile(root, 'Projects/Porch/Tasks/Buy paint.md', '---\nname: Buy paint\ndue_date: 2026-10-15\n---\n');
  writeFile(root, 'Events/Birthdays/Mom.md', '---\nname: Mom\ndate: 1960-08-15\nrecurring: annual\n---\n');
  writeFile(root, 'Appointments/Dentist.md', '---\nname: Dentist\ndate: 2026-10-13\ntime: 14:30\n---\n');
  writeFile(root, 'Bills/Electric.md', '---\nname: Electric\namount: $142.00\ndue_date: 2026-10-15\nrecurring: monthly\n---\n\n## Payments\n- 2026-09-14: paid 139.00 for 2026-09-15\n');
  writeFile(root, 'Bills/Broken.md', '---\nname: Broken\n');
  return root;
}

function open(root, t) {
  const index = createIndex({ root, dbPath: path.join(root, '.home-base', 'index.sqlite'), openLog: path.join(root, '.home-base', 'database-opens.log') });
  t.after(() => index.close());
  index.rescan();
  return index;
}

test('kindFor maps folders to kinds', () => {
  assert.equal(kindFor('Homes/Maple St.md'), 'home');
  assert.equal(kindFor('Home Maintenance/Daily Cleaning/Dishes.md'), 'chore');
  assert.equal(kindFor('Home Maintenance/Other/Dishes.md'), null);
  assert.equal(kindFor('Projects/Porch/Project Info.md'), 'project');
  assert.equal(kindFor('Projects/Porch/Tasks/Buy paint.md'), 'task');
  assert.equal(kindFor('Events/Birthdays/Mom.md'), 'event');
  assert.equal(kindFor('Appointments/Dentist.md'), 'appointment');
  assert.equal(kindFor('Bills/Electric.md'), 'bill');
  assert.equal(kindFor('Recipe Box/Dinner/Tacos.md'), null);
  assert.equal(kindFor('Bills/_draft.md'), null);
  assert.equal(kindFor('Bills/CLAUDE.md'), null);
});

test('rescan indexes every kind and lists broken notes', (t) => {
  const index = open(sampleRoot(), t);
  assert.deepEqual(index.all('SELECT id, name, color FROM homes'), [{ id: 'Maple St', name: 'Maple St', color: 'sage' }]);
  const chores = index.all('SELECT name, frequency, freq_days, home FROM chores ORDER BY name');
  assert.deepEqual(chores, [
    { name: 'Gutters', frequency: 'seasonal', freq_days: 90, home: '' },
    { name: 'Vacuum', frequency: 'weekly', freq_days: 7, home: 'Maple St' },
  ]);
  assert.equal(index.get('SELECT folder FROM projects').folder, 'Porch');
  assert.equal(index.get('SELECT project_folder FROM project_tasks').project_folder, 'Porch');
  assert.equal(index.get('SELECT category, recurring FROM events').category, 'Birthdays');
  assert.equal(index.get('SELECT status FROM appointments').status, 'upcoming');
  assert.equal(index.get('SELECT amount FROM bills').amount, 142);
  assert.deepEqual(index.all('SELECT for_date FROM bill_payments'), [{ for_date: '2026-09-15' }]);
  assert.deepEqual(index.problems().map((p) => p.file_path), ['Bills/Broken.md']);
});

test('refresh follows edits and deletions; removePrefix drops a folder', (t) => {
  const root = sampleRoot();
  const index = open(root, t);
  writeFile(root, 'Home Maintenance/Weekly Cleaning/Vacuum.md', '---\nname: Vacuum upstairs\n---\n');
  index.refresh('Home Maintenance/Weekly Cleaning/Vacuum.md');
  assert.ok(index.all('SELECT name FROM chores').some((c) => c.name === 'Vacuum upstairs'));
  fs.rmSync(path.join(root, 'Appointments', 'Dentist.md'));
  index.refresh('Appointments/Dentist.md');
  assert.equal(index.all('SELECT * FROM appointments').length, 0);
  index.removePrefix('Projects/Porch/');
  assert.equal(index.all('SELECT * FROM projects').length + index.all('SELECT * FROM project_tasks').length, 0);
});

test('the database open is logged', (t) => {
  const root = sampleRoot();
  open(root, t);
  const log = fs.readFileSync(path.join(root, '.home-base', 'database-opens.log'), 'utf8');
  assert.match(log, /"journal":"delete"/);
});
