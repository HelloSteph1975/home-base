'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { tempDir, writeFile, readFile } = require('./helpers');
const { createNotes } = require('../server/notes');
const { createIndex } = require('../server/index-db');
const { readSettings, writeSettings, resolveHomes } = require('../server/settings');
const { withDue } = require('../server/logic/chores');
const { homeSummaries } = require('../server/logic/today');

function setup(t) {
  const root = tempDir();
  const notes = createNotes(root);
  const index = createIndex({ root, dbPath: path.join(root, '.home-base', 'i.sqlite'), openLog: path.join(root, '.home-base', 'log') });
  t.after(() => index.close());
  return { root, notes, index };
}

test('settings live in a note and keep other properties', (t) => {
  const { root, notes } = setup(t);
  assert.deepEqual(readSettings(notes), { name: '', default_home: '' });
  writeSettings(notes, { name: 'Sam' });
  writeSettings(notes, { default_home: 'Maple St' });
  assert.deepEqual(readSettings(notes), { name: 'Sam', default_home: 'Maple St' });
  assert.match(readFile(root, 'Home Base Settings.md'), /^type: home-base-settings$/m);
});

test('homes without a valid reference fall back to the default home', (t) => {
  const { root, index } = setup(t);
  writeFile(root, 'Homes/Pine Cabin.md', '---\nname: Pine Cabin\n---\n');
  writeFile(root, 'Homes/Maple St.md', '---\nname: Maple St\n---\n');
  index.rescan();
  const set = resolveHomes(index, { default_home: 'Maple St' });
  assert.deepEqual(set.homes.map((h) => h.id), ['Maple St', 'Pine Cabin']);
  assert.equal(set.homeOf(''), 'Maple St');
  assert.equal(set.homeOf('Gone'), 'Maple St');
  assert.equal(set.homeOf('Pine Cabin'), 'Pine Cabin');
  assert.equal(resolveHomes(index, { default_home: 'Gone' }).defaultHome, 'Maple St');
  assert.equal(set.nameOf('Pine Cabin'), 'Pine Cabin');
});

test('withDue counts from last done, and never-done chores are due today', () => {
  assert.deepEqual(
    withDue({ name: 'Vacuum', last_done: '2026-10-10', freq_days: 7 }, '2026-10-13'),
    { name: 'Vacuum', last_done: '2026-10-10', freq_days: 7, due_date: '2026-10-17', days_until: 4 },
  );
  assert.equal(withDue({ last_done: '', freq_days: 7 }, '2026-10-13').days_until, 0);
  assert.equal(withDue({ last_done: '2026-09-01', freq_days: 30 }, '2026-10-13').days_until, -12);
});

test('homeSummaries counts due chores and active projects per home', (t) => {
  const { root, index } = setup(t);
  writeFile(root, 'Homes/Maple St.md', '---\nname: Maple St\n---\nNotes here\n');
  writeFile(root, 'Homes/Pine Cabin.md', '---\nname: Pine Cabin\n---\n');
  writeFile(root, 'Home Maintenance/Weekly Cleaning/Vacuum.md', '---\nname: Vacuum\nlast_done: 2026-10-01\n---\n');
  writeFile(root, 'Home Maintenance/Weekly Cleaning/Sweep.md', '---\nname: Sweep\nlast_done: 2026-10-12\nhome: Pine Cabin\n---\n');
  writeFile(root, 'Projects/Roof/Project Info.md', '---\nname: Roof\nhome: Pine Cabin\n---\n');
  writeFile(root, 'Projects/Old/Project Info.md', '---\nname: Old\nstatus: done\nhome: Pine Cabin\n---\n');
  index.rescan();
  const out = homeSummaries(index, resolveHomes(index, { default_home: 'Maple St' }), '2026-10-13');
  assert.deepEqual(out.map(({ id, chore_count, due_count, active_projects, is_default, notes }) => ({ id, chore_count, due_count, active_projects, is_default, notes })), [
    { id: 'Maple St', chore_count: 1, due_count: 1, active_projects: 0, is_default: true, notes: 'Notes here' },
    { id: 'Pine Cabin', chore_count: 1, due_count: 0, active_projects: 1, is_default: false, notes: '' },
  ]);
});
