'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempDir, writeFile, readFile } = require('./helpers');
const { createNotes, writeAtomic } = require('../server/notes');
const { createBackup } = require('../server/backup');

function setup(t, dirName = 'Backups') {
  const root = tempDir();
  const notes = createNotes(root);
  const backup = createBackup(root, {
    dir: path.join(root, dirName),
    stateDir: path.join(root, '.home-base'),
    writeFile: writeAtomic,
    trashFile: (file, opts) => notes.trash(notes.toRel(file), opts),
  });
  t.after(() => backup.close());
  return { root, backup };
}

test('a snapshot copies notes and skips trash, state and backup folders', (t) => {
  const { root, backup } = setup(t);
  writeFile(root, 'Homes/Maple St.md', 'a');
  writeFile(root, 'Notes.md', 'n');
  writeFile(root, '_Trash/old.md', 'x');
  writeFile(root, '.home-base/x.md', 'x');
  writeFile(root, 'Backups/y.md', 'y');
  const r = backup.snapshot(new Date(2026, 9, 13, 9));
  assert.deepEqual(r, { taken_on: '2026-10-13', count: 2 });
  assert.deepEqual(backup.list().days, [{ taken_on: '2026-10-13', count: 2 }]);
});

test('same-day snapshots replace each other; 30 days are kept', (t) => {
  const { root, backup } = setup(t);
  writeFile(root, 'a.md', 'a');
  for (let i = 0; i < 32; i += 1) backup.snapshot(new Date(2026, 8, 1 + i, 9));
  backup.snapshot(new Date(2026, 9, 2, 20));
  const days = backup.list().days;
  assert.equal(days.length, 30);
  assert.equal(days[days.length - 1].taken_on, '2026-09-03');
});

test('diff and restore bring notes back and keep the replaced version in _Trash', (t) => {
  const { root, backup } = setup(t);
  writeFile(root, 'Homes/Maple St.md', 'old');
  writeFile(root, 'Bills/Water.md', 'water');
  backup.snapshot(new Date(2026, 9, 12, 9));
  writeFile(root, 'Homes/Maple St.md', 'new');
  fs.rmSync(path.join(root, 'Bills', 'Water.md'));
  writeFile(root, 'Homes/New.md', 'added');
  assert.deepEqual(backup.diff('2026-10-12'), [
    { path: 'Bills/Water.md', status: 'missing' },
    { path: 'Homes/Maple St.md', status: 'changed' },
    { path: 'Homes/New.md', status: 'added' },
  ]);
  assert.throws(() => backup.restore('2026-10-12', { paths: ['Homes/New.md'] }), (e) => e.status === 400);
  assert.deepEqual(backup.restore('2026-10-12', { all: true }).restored.sort(), ['Bills/Water.md', 'Homes/Maple St.md']);
  assert.equal(readFile(root, 'Homes/Maple St.md'), 'old');
  assert.equal(readFile(root, 'Bills/Water.md'), 'water');
  assert.equal(readFile(root, 'Homes/New.md'), 'added');
  assert.ok(fs.readdirSync(path.join(root, '_Trash')).some((f) => f.endsWith('Maple St.md')));
  assert.throws(() => backup.diff('yesterday'), (e) => e.status === 400);
  assert.throws(() => backup.diff('2020-01-01'), (e) => e.status === 404);
});

test('a failed snapshot is reported, not thrown', (t) => {
  const root = tempDir();
  writeFile(root, 'blocker', 'a file where a folder should be');
  const backup = createBackup(root, { dir: path.join(root, 'blocker', 'sub'), stateDir: path.join(root, '.home-base'), writeFile: writeAtomic, trashFile: () => {} });
  t.after(() => backup.close());
  assert.ok(backup.snapshot().error);
  assert.ok(backup.list().last_error);
});

test('a backup folder inside a notes folder skips only itself', (t) => {
  const { root, backup } = setup(t, 'Projects/Backups');
  writeFile(root, 'Projects/Porch/Project Info.md', 'p');
  writeFile(root, 'Projects/Backups/stray.md', 's');
  assert.equal(backup.snapshot(new Date(2026, 9, 13, 9)).count, 1);
  assert.deepEqual(backup.diff('2026-10-13'), []);
});

test('ensureTodaySnapshot takes one backup per new day', (t) => {
  const { ensureTodaySnapshot } = require('../server/backup');
  const { root, backup } = setup(t);
  writeFile(root, 'a.md', 'a');
  ensureTodaySnapshot(backup, new Date(2026, 9, 13, 23, 50));
  ensureTodaySnapshot(backup, new Date(2026, 9, 13, 23, 55));
  ensureTodaySnapshot(backup, new Date(2026, 9, 14, 0, 20));
  assert.deepEqual(backup.list().days.map((d) => d.taken_on), ['2026-10-14', '2026-10-13']);
});
