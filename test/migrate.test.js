'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempDir, writeFile, readFile } = require('./helpers');
const { migrate } = require('../scripts/migrate');

const HOMES = [{ name: 'Maple St', kind: 'home' }, { name: 'Hilltop', kind: 'land' }, { name: 'Pine Cabin', kind: 'cabin' }, { name: 'Family home', kind: 'family' }];

function oldVault() {
  const root = tempDir();
  writeFile(root, "Health & Fitness/Doctor's Appointments/2026-11-02 Eye exam.md", '---\nname: Eye exam\ndate: 2026-11-02\n---\n');
  writeFile(root, 'Personal Finance/Bills/Electric.md', '---\nname: Electric\namount: 142\ndue_date: 2026-01-15\nrecurring: monthly\nstatus: paid\n---\n');
  writeFile(root, 'Personal Finance/Bills/Tax.md', '---\nname: Tax\namount: 900\ndue_date: 2026-12-01\nrecurring: none\n---\n');
  writeFile(root, 'Personal Finance/Bills/Card.md', '---\nname: Card\namount: 50\ndue_date: 2026-10-05\nrecurring: monthly\nstatus: due\n---\n');
  writeFile(root, 'Personal Finance/2026/Groceries.md', '---\nname: Groceries\n---\n');
  return root;
}

test('a dry run reports and changes nothing', () => {
  const root = oldVault();
  const r = migrate({ root, homes: HOMES, dryRun: true, today: '2026-10-13' });
  assert.ok(r.actions.some((a) => a.includes('Appointments/2026-11-02 Eye exam.md')));
  assert.ok(r.actions.some((a) => a.includes('paid_through 2026-10-12') && a.includes('Electric')));
  assert.ok(fs.existsSync(path.join(root, 'Personal Finance', 'Bills', 'Electric.md')));
  assert.ok(!fs.existsSync(path.join(root, 'Homes')));
});

test('the real run moves notes, marks old repeating bills, creates homes, and is safe to repeat', () => {
  const root = oldVault();
  const r = migrate({ root, homes: HOMES, today: '2026-10-13' });
  assert.deepEqual(r.conflicts, []);
  assert.match(r.actions[0], /^Backed up 5 notes/);
  assert.ok(fs.existsSync(path.join(root, 'Appointments', '2026-11-02 Eye exam.md')));
  assert.match(readFile(root, 'Bills/Electric.md'), /^paid_through: 2026-10-12$/m);
  assert.doesNotMatch(readFile(root, 'Bills/Tax.md'), /paid_through/);
  // A repeating bill Home Base 1 still showed as due keeps its unpaid due date.
  assert.doesNotMatch(readFile(root, 'Bills/Card.md'), /paid_through/);
  assert.match(readFile(root, 'Homes/Hilltop.md'), /^kind: land$/m);
  assert.match(readFile(root, 'Home Base Settings.md'), /^default_home: Maple St$/m);
  assert.ok(fs.existsSync(path.join(root, 'Personal Finance', '2026', 'Groceries.md')));
  assert.ok(fs.existsSync(path.join(root, '.home-base', 'migration-2026-10-13.log')));
  assert.ok(fs.existsSync(path.join(root, 'Backups', 'home-base-backups.sqlite')));

  const again = migrate({ root, homes: HOMES, today: '2026-10-14' });
  assert.deepEqual(again.actions.filter((a) => !a.startsWith('Backed up')), []);
  assert.match(readFile(root, 'Bills/Electric.md'), /^paid_through: 2026-10-12$/m);
});

test('a note that already exists at the destination is left in place', () => {
  const root = oldVault();
  writeFile(root, 'Bills/Electric.md', '---\nname: Electric (new)\n---\n');
  const r = migrate({ root, homes: [], today: '2026-10-13' });
  assert.equal(r.conflicts.length, 1);
  assert.ok(fs.existsSync(path.join(root, 'Personal Finance', 'Bills', 'Electric.md')));
  assert.match(readFile(root, 'Bills/Electric.md'), /Electric \(new\)/);
});

test('a practice run on another folder backs up into that folder, not the configured one', () => {
  const { backupDirFor } = require('../scripts/migrate');
  const root = tempDir();
  assert.equal(backupDirFor({ dataArg: root, root, config: { backupDir: 'C:\Real\Backups' } }), path.join(root, 'Backups'));
  assert.equal(backupDirFor({ dataArg: undefined, root, config: { backupDir: 'C:\Real\Backups' } }), 'C:\Real\Backups');
});

test('the backup taken before the move survives later backups that day', () => {
  const { DatabaseSync } = require('node:sqlite');
  const { createBackup } = require('../server/backup');
  const { writeAtomic } = require('../server/notes');
  const root = oldVault();
  migrate({ root, homes: [], today: '2026-10-13' });
  const later = createBackup(root, { dir: path.join(root, 'Backups'), stateDir: path.join(root, '.home-base'), writeFile: writeAtomic, trashFile: () => {} });
  later.snapshot();
  later.close();
  const saved = fs.readdirSync(path.join(root, 'Backups')).filter((f) => f.startsWith('before-migration-2026-10-13'));
  assert.equal(saved.length, 1);
  const db = new DatabaseSync(path.join(root, 'Backups', saved[0]));
  const row = db.prepare('SELECT path FROM snapshots WHERE path = ?').get('Personal Finance/Bills/Electric.md');
  db.close();
  assert.ok(row, 'the old bill location is in the saved copy');
});
