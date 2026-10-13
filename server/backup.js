'use strict';
// Dated copies of every note in one SQLite file (ported from Body Lab). The
// notes folder stays the source of truth; this rolls a note, or the whole
// folder, back to an earlier day.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { HttpError } = require('./errors');
const { localDate, isDate } = require('./dates');

const BACKUP_FILE = 'home-base-backups.sqlite';
const SKIP_TOP = ['Backups', '_Trash', '_legacy', 'App', 'node_modules'];
const WEEK_MS = 7 * 86400000;
const shaOf = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

// skipPaths are folders (relative, with /) to leave out wherever they sit,
// such as a backup folder the person chose inside the data folder.
function listNotes(root, skipPaths = []) {
  const skipTop = new Set(SKIP_TOP);
  const skipExact = new Set(skipPaths);
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if ((!rel && skipTop.has(entry.name)) || skipExact.has(childRel)) continue;
        walk(path.join(dir, entry.name), childRel);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(childRel);
      }
    }
  };
  walk(root, '');
  return out.sort();
}

function createBackup(root, { dir, stateDir, writeFile, trashFile, keepDays = 30 }) {
  const file = path.join(dir, BACKUP_FILE);
  const inside = path.relative(root, dir);
  const extraSkip = inside && !inside.startsWith('..') && !path.isAbsolute(inside) ? [inside.split(path.sep).join('/')] : [];
  const errorFile = path.join(stateDir, 'backup-last-error.txt');
  const readNote = (rel) => fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8');
  let db = null;

  function open() {
    if (db) return db;
    fs.mkdirSync(dir, { recursive: true });
    const d = new DatabaseSync(file);
    try {
      d.exec(`
        PRAGMA journal_mode = DELETE;
        CREATE TABLE IF NOT EXISTS snapshots (
          taken_on TEXT NOT NULL, path TEXT NOT NULL, content TEXT NOT NULL,
          sha TEXT NOT NULL, size INTEGER NOT NULL, PRIMARY KEY (taken_on, path));
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
        INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');`);
    } catch (e) {
      try { d.close(); } catch { /* ignore */ }
      throw e;
    }
    db = d;
    return db;
  }

  const getMeta = (key) => open().prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
  const setMeta = (key, value) => open()
    .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);

  // The last failure is kept in the data folder, which is reachable even when the backup folder isn't.
  function recordError(message) {
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(errorFile, `${new Date().toISOString()} ${String(message).replace(/\r?\n/g, ' ')}\n`);
    } catch (e) {
      console.error('Could not record the backup failure:', e.message);
    }
  }
  const clearError = () => { try { fs.rmSync(errorFile, { force: true }); } catch (e) { console.error('Could not clear the backup failure note:', e.message); } };
  const lastError = () => { try { return fs.readFileSync(errorFile, 'utf8').trim().replace(/^\S+ /, '') || null; } catch { return null; } };

  function snapshot(now = new Date()) {
    const takenOn = localDate(now);
    try {
      const d = open();
      const rows = listNotes(root, extraSkip).map((rel) => {
        const content = readNote(rel);
        return [rel, content, shaOf(content), Buffer.byteLength(content)];
      });
      d.exec('BEGIN');
      try {
        d.prepare('DELETE FROM snapshots WHERE taken_on = ?').run(takenOn);
        const insert = d.prepare('INSERT INTO snapshots (taken_on, path, content, sha, size) VALUES (?, ?, ?, ?, ?)');
        for (const [rel, content, sha, size] of rows) insert.run(takenOn, rel, content, sha, size);
        const days = d.prepare('SELECT DISTINCT taken_on FROM snapshots ORDER BY taken_on DESC').all().map((r) => r.taken_on);
        const drop = d.prepare('DELETE FROM snapshots WHERE taken_on = ?');
        for (const old of days.slice(keepDays)) drop.run(old);
        d.exec('COMMIT');
      } catch (e) {
        try { d.exec('ROLLBACK'); } catch (rollbackErr) { console.error('ROLLBACK failed:', rollbackErr.message); }
        throw e;
      }
      setMeta('last_snapshot_at', now.toISOString());
      const lastVacuum = Date.parse(getMeta('last_vacuum_at') || '') || 0;
      if (now.getTime() - lastVacuum > WEEK_MS) {
        try { d.exec('VACUUM'); setMeta('last_vacuum_at', now.toISOString()); } catch (e) { console.error('VACUUM failed:', e.message); }
      }
      clearError();
      return { taken_on: takenOn, count: rows.length };
    } catch (e) {
      recordError(e.message);
      console.error('Home Base backup failed:', e.message);
      return { error: e.message };
    }
  }

  function hasSnapshotFor(day) {
    try { return Boolean(open().prepare('SELECT 1 FROM snapshots WHERE taken_on = ? LIMIT 1').get(day)); } catch { return false; }
  }

  function list() {
    try {
      const days = open().prepare('SELECT taken_on, COUNT(*) AS count FROM snapshots GROUP BY taken_on ORDER BY taken_on DESC').all()
        .map((r) => ({ taken_on: r.taken_on, count: Number(r.count) }));
      return { last_snapshot_at: getMeta('last_snapshot_at'), last_error: lastError(), days };
    } catch (e) {
      return { last_snapshot_at: null, last_error: lastError() || e.message, days: [] };
    }
  }

  function snapshotRows(day) {
    if (!isDate(day)) throw new HttpError(400, `Not a date: ${day}`);
    let rows;
    try {
      rows = open().prepare('SELECT path, sha, content FROM snapshots WHERE taken_on = ?').all(day);
    } catch (e) {
      throw new HttpError(503, `The backup file couldn't be read: ${e.message}`);
    }
    if (!rows.length) throw new HttpError(404, `No backup from ${day}.`);
    return rows;
  }

  function diff(day) {
    const saved = new Map(snapshotRows(day).map((r) => [r.path, r.sha]));
    const current = new Map(listNotes(root, extraSkip).map((rel) => [rel, shaOf(readNote(rel))]));
    const out = [];
    for (const [rel, sha] of saved) {
      if (!current.has(rel)) out.push({ path: rel, status: 'missing' });
      else if (current.get(rel) !== sha) out.push({ path: rel, status: 'changed' });
    }
    for (const rel of current.keys()) if (!saved.has(rel)) out.push({ path: rel, status: 'added' });
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  // Refuse to write through a linked folder that points outside the data folder.
  function checkSymlinkEscape(target, rel) {
    const refuse = () => new HttpError(400, `Won't restore through a linked folder: ${rel}`);
    const rootPath = path.resolve(root);
    const parts = path.relative(rootPath, target).split(path.sep);
    let current = rootPath;
    let nearest = rootPath;
    for (let i = 0; i < parts.length - 1; i += 1) {
      current = path.join(current, parts[i]);
      let st;
      try { st = fs.lstatSync(current); } catch (e) { if (e.code === 'ENOENT') break; throw refuse(); }
      if (st.isSymbolicLink() || !st.isDirectory()) throw refuse();
      nearest = current;
    }
    let real;
    let realRoot;
    try { real = fs.realpathSync(nearest); realRoot = fs.realpathSync(rootPath); } catch { throw refuse(); }
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw refuse();
  }

  function restore(day, { paths, all } = {}) {
    const rows = new Map(snapshotRows(day).map((r) => [r.path, r.content]));
    const restorable = diff(day).filter((x) => x.status !== 'added').map((x) => x.path);
    let chosen;
    if (all === true) {
      chosen = restorable;
    } else {
      if (!Array.isArray(paths) || !paths.length) throw new HttpError(400, 'Pick at least one note to restore.');
      for (const p of paths) if (!restorable.includes(p)) throw new HttpError(400, `${p} has nothing to restore from ${day}.`);
      chosen = [...new Set(paths)];
    }
    const restored = [];
    for (const rel of chosen) {
      const target = path.resolve(root, rel);
      if (!target.startsWith(path.resolve(root) + path.sep)) throw new HttpError(400, `Bad path: ${rel}`);
      checkSymlinkEscape(target, rel);
      if (fs.existsSync(target)) trashFile(target, { copy: true });
      writeFile(target, rows.get(rel));
      restored.push(rel);
    }
    return { restored };
  }

  function close() {
    if (db) { db.close(); db = null; }
  }

  return { file, dir, snapshot, hasSnapshotFor, list, diff, restore, close };
}

function ensureTodaySnapshot(backup, now = new Date()) {
  if (!backup.hasSnapshotFor(localDate(now))) backup.snapshot(now);
}

module.exports = { createBackup, listNotes, ensureTodaySnapshot, BACKUP_FILE };
