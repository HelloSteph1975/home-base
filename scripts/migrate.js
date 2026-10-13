'use strict';
// One-time move for a data folder used by Home Base 1:
//   Health & Fitness/Doctor's Appointments/*.md -> Appointments/
//   Personal Finance/Bills/*.md                 -> Bills/
//   repeating bills Home Base 1 showed as paid get paid_through = yesterday
//   home notes are created from --homes; the first becomes the default
// It backs up first and stops if that fails. Running it again changes nothing.
const fs = require('node:fs');
const path = require('node:path');
const { createNotes, safeName, writeAtomic } = require('../server/notes');
const { createBackup } = require('../server/backup');
const { readSettings, writeSettings } = require('../server/settings');
const { localDate, addDays } = require('../server/dates');
const { HOME_COLORS, HOME_KINDS, STATE_FOLDER } = require('../server/constants');

const MOVES = [
  ["Health & Fitness/Doctor's Appointments", 'Appointments'],
  ['Personal Finance/Bills', 'Bills'],
];

const mdIn = (root, rel) => {
  const dir = path.join(root, ...rel.split('/'));
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort() : [];
};

function migrate({ root, homes = [], dryRun = false, today = localDate(), backupDir = path.join(root, 'Backups') }) {
  const notes = createNotes(root);
  const actions = [];
  const conflicts = [];

  if (!dryRun) {
    const backup = createBackup(root, { dir: backupDir, stateDir: path.join(root, STATE_FOLDER), writeFile: writeAtomic, trashFile: () => {} });
    const r = backup.snapshot();
    backup.close();
    if (r.error) throw new Error(`The backup failed, so nothing was changed: ${r.error}`);
    // Today's backup is replaced by later backups the same day, so keep a
    // separate copy of the state before the move.
    let keep = path.join(backupDir, `before-migration-${today}.sqlite`);
    for (let n = 2; fs.existsSync(keep); n += 1) keep = path.join(backupDir, `before-migration-${today} (${n}).sqlite`);
    fs.copyFileSync(backup.file, keep, fs.constants.COPYFILE_EXCL);
    actions.push(`Backed up ${r.count} notes (${r.taken_on}) and kept a copy in ${path.basename(keep)}.`);
  }

  const billRels = mdIn(root, 'Bills').map((n) => `Bills/${n}`);
  for (const [from, to] of MOVES) {
    for (const name of mdIn(root, from)) {
      const src = `${from}/${name}`;
      const dest = `${to}/${name}`;
      if (notes.exists(dest)) { conflicts.push(`${src} was left in place because ${dest} already exists.`); continue; }
      if (!dryRun) notes.move(src, dest);
      actions.push(`Moved ${src} -> ${dest}`);
      if (to === 'Bills') billRels.push(dryRun ? src : dest);
    }
  }

  const yesterday = addDays(today, -1);
  for (const rel of billRels) {
    const note = notes.read(rel);
    if (note.problem) { conflicts.push(`${rel} has a problem and was not changed: ${note.problem}`); continue; }
    // Home Base 1 marked a repeating bill paid by setting status: paid for good.
    // Those are current, so earlier dates count as paid. A bill it still showed as
    // due keeps its due date unpaid, so nothing that was owed disappears.
    const repeating = note.data.recurring && note.data.recurring !== 'none';
    if (!repeating || note.data.status !== 'paid' || note.data.paid_through) continue;
    if (!dryRun) notes.write(rel, { ...note.data, paid_through: yesterday }, note.body, note);
    actions.push(`Set paid_through ${yesterday} on ${note.data.name || rel}`);
  }

  homes.forEach((home, i) => {
    const id = safeName(home.name);
    const rel = `Homes/${id}.md`;
    if (notes.exists(rel)) return;
    const kind = HOME_KINDS.includes(home.kind) ? home.kind : 'home';
    if (!dryRun) notes.create(rel, { type: 'home', name: home.name, kind, color: HOME_COLORS[i % HOME_COLORS.length] }, '\n');
    actions.push(`Created home ${home.name} (${kind})`);
  });

  if (homes.length && !readSettings(notes).default_home) {
    const id = safeName(homes[0].name);
    if (!dryRun) writeSettings(notes, { default_home: id });
    actions.push(`Set the default home to ${id}`);
  }

  if (!dryRun) {
    const logFile = path.join(root, STATE_FOLDER, `migration-${today}.log`);
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, [...actions, ...conflicts.map((c) => `CONFLICT: ${c}`), ''].join('\n'));
  }
  return { actions, conflicts };
}

function parseHomes(value) {
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [name, kind] = s.split(':').map((x) => x.trim());
    return { name, kind: kind || 'home' };
  });
}

// With --data, back up into that folder, so a practice run on a copy never
// replaces today's backup of the real notes.
function backupDirFor({ dataArg, root, config }) {
  return dataArg ? path.join(root, 'Backups') : config.backupDir;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const valueOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const { loadConfig } = require('../server/config');
  const config = loadConfig();
  const dataArg = valueOf('--data');
  const root = path.resolve(dataArg || config.dataDir);
  if (!fs.existsSync(root)) { console.error(`No such folder: ${root}`); process.exit(1); }
  const dryRun = args.includes('--dry-run');
  const backupDir = backupDirFor({ dataArg, root, config });
  console.log(`Notes: ${root}\nBackup: ${backupDir}`);
  const { actions, conflicts } = migrate({ root, homes: parseHomes(valueOf('--homes')), dryRun, backupDir });
  console.log(dryRun ? 'Dry run. Nothing was changed. This is what would happen:' : 'Done:');
  for (const a of actions) console.log(`  ${a}`);
  for (const c of conflicts) console.log(`  CONFLICT: ${c}`);
  if (!actions.length && !conflicts.length) console.log('  Nothing to do.');
}

module.exports = { migrate, parseHomes, backupDirFor };
