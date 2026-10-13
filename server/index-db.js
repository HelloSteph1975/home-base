'use strict';
// A SQLite copy of the notes, rebuilt from them on every start. The notes are
// the source of truth: routes write a note first, then call refresh(rel).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { parseNote } = require('./notes');
const { isDate } = require('./dates');
const { RECURRING } = require('./recurrence');
const { parseMoney, paymentsFromBody } = require('./logic/bills');
const C = require('./constants');

const TABLES = ['homes', 'chores', 'projects', 'project_tasks', 'events', 'appointments', 'bills', 'bill_payments', 'problems'];

const SCHEMA = `
${TABLES.map((t) => `DROP TABLE IF EXISTS ${t};`).join('\n')}
CREATE TABLE homes (file_path TEXT PRIMARY KEY, id TEXT, name TEXT, kind TEXT, color TEXT, body TEXT);
CREATE TABLE chores (file_path TEXT PRIMARY KEY, name TEXT, frequency TEXT, freq_days INTEGER, last_done TEXT, notes TEXT, home TEXT);
CREATE TABLE projects (file_path TEXT PRIMARY KEY, folder TEXT, name TEXT, status TEXT, start_date TEXT, due_date TEXT, notes TEXT, home TEXT);
CREATE TABLE project_tasks (file_path TEXT PRIMARY KEY, project_folder TEXT, name TEXT, due_date TEXT, status TEXT, notes TEXT);
CREATE TABLE events (file_path TEXT PRIMARY KEY, name TEXT, date TEXT, time TEXT, category TEXT, location TEXT, notes TEXT, recurring TEXT);
CREATE TABLE appointments (file_path TEXT PRIMARY KEY, name TEXT, date TEXT, time TEXT, provider TEXT, reason TEXT, status TEXT);
CREATE TABLE bills (file_path TEXT PRIMARY KEY, name TEXT, due_date TEXT, amount REAL, category TEXT, recurring TEXT, status TEXT, account TEXT, paid_through TEXT);
CREATE TABLE bill_payments (file_path TEXT, paid_on TEXT, amount REAL, for_date TEXT);
CREATE TABLE problems (file_path TEXT PRIMARY KEY, message TEXT);
`;

function kindFor(rel) {
  if (typeof rel !== 'string' || !rel.endsWith('.md')) return null;
  const parts = rel.split('/');
  const file = parts[parts.length - 1];
  if (file.startsWith('_') || file.startsWith('.') || file.toLowerCase() === 'claude.md') return null;
  switch (parts[0]) {
    case 'Homes': return parts.length === 2 ? 'home' : null;
    case 'Home Maintenance': return parts.length === 3 && C.CHORE_FOLDERS[parts[1]] ? 'chore' : null;
    case 'Projects':
      if (parts.length === 3 && file === 'Project Info.md') return 'project';
      return parts.length === 4 && parts[2] === 'Tasks' ? 'task' : null;
    case 'Events': return parts.length >= 2 ? 'event' : null;
    case 'Appointments': return parts.length === 2 ? 'appointment' : null;
    case 'Bills': return parts.length === 2 ? 'bill' : null;
    default: return null;
  }
}

const baseName = (rel) => path.posix.basename(rel, '.md');
const posInt = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : 0; };
const dateOr = (v) => (isDate(v) ? v : '');
const recurringOf = (v) => (RECURRING.includes(v) ? v : 'none');

// How each kind of note becomes a row. Missing or odd values get safe defaults.
const ROWS = {
  home: (rel, d, body) => ['homes', {
    file_path: rel, id: baseName(rel), name: d.name || baseName(rel),
    kind: C.HOME_KINDS.includes(d.kind) ? d.kind : 'home',
    color: C.HOME_COLORS.includes(d.color) ? d.color : 'terracotta',
    body: body || '',
  }],
  chore: (rel, d) => {
    const [folderFreq] = C.CHORE_FOLDERS[rel.split('/')[1]];
    const frequency = C.FREQUENCIES[d.frequency] ? d.frequency : folderFreq;
    return ['chores', {
      file_path: rel, name: d.name || baseName(rel), frequency,
      freq_days: posInt(d.freq_days) || C.FREQUENCIES[frequency].days,
      last_done: dateOr(d.last_done), notes: d.notes || '', home: d.home || '',
    }];
  },
  project: (rel, d) => {
    const folder = rel.split('/')[1];
    return ['projects', {
      file_path: rel, folder, name: d.name || folder,
      status: C.PROJECT_STATUSES.includes(d.status) ? d.status : 'active',
      start_date: dateOr(d.start_date), due_date: dateOr(d.due_date), notes: d.notes || '', home: d.home || '',
    }];
  },
  task: (rel, d) => ['project_tasks', {
    file_path: rel, project_folder: rel.split('/')[1], name: d.name || baseName(rel),
    due_date: dateOr(d.due_date), status: d.status === 'done' ? 'done' : 'todo', notes: d.notes || '',
  }],
  event: (rel, d) => {
    const parts = rel.split('/');
    const folderCategory = parts.length >= 3 && C.EVENT_CATEGORIES.includes(parts[1]) ? parts[1] : 'Other';
    return ['events', {
      file_path: rel, name: d.name || baseName(rel), date: dateOr(d.date), time: d.time || '',
      category: C.EVENT_CATEGORIES.includes(d.category) ? d.category : folderCategory,
      location: d.location || '', notes: d.notes || '', recurring: recurringOf(d.recurring),
    }];
  },
  appointment: (rel, d) => ['appointments', {
    file_path: rel, name: d.name || baseName(rel), date: dateOr(d.date), time: d.time || '',
    provider: d.provider || '', reason: d.reason || '',
    status: C.APPOINTMENT_STATUSES.includes(d.status) ? d.status : 'upcoming',
  }],
  bill: (rel, d) => ['bills', {
    file_path: rel, name: d.name || baseName(rel), due_date: dateOr(d.due_date), amount: parseMoney(d.amount),
    category: d.category || '', recurring: recurringOf(d.recurring), status: d.status === 'paid' ? 'paid' : 'due',
    account: d.account || '', paid_through: dateOr(d.paid_through),
  }],
};

// Database safety standard carried over from Home Base 1 (and Control Center):
// journal mode DELETE, not WAL. On Windows/node:sqlite a fresh connection after
// an ungraceful exit has failed to see WAL frames and shown empty tables. DELETE
// keeps every commit in the one main file, which also suits folders in OneDrive.
function applyDatabaseStandard(db) {
  const prior = db.prepare('PRAGMA journal_mode').get();
  db.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;');
  const applied = db.prepare('PRAGMA journal_mode').get();
  return { priorMode: prior?.journal_mode || 'unknown', appliedMode: applied?.journal_mode || 'unknown' };
}

// Every open is recorded with its path, PID and row counts, so "where did my
// data go" can be answered in seconds.
function logDatabaseOpen(db, standard, dbPath, openLog) {
  const record = { app: 'home-base', pid: process.pid, path: dbPath, journal: standard.appliedMode, priorJournal: standard.priorMode };
  try {
    record.rows = TABLES.reduce((n, t) => n + db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0);
  } catch (e) {
    record.countError = e.message;
  }
  try {
    fs.mkdirSync(path.dirname(openLog), { recursive: true });
    fs.appendFileSync(openLog, `${new Date().toISOString()} ${JSON.stringify(record)}\n`, 'utf8');
  } catch (e) {
    console.error(`The database open log could not be written: ${e.message}`);
  }
}

function createIndex({ root, dbPath, openLog }) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  const standard = applyDatabaseStandard(db);
  db.exec(SCHEMA);
  logDatabaseOpen(db, standard, dbPath, openLog);

  const statements = new Map();
  const prep = (sql) => {
    if (!statements.has(sql)) statements.set(sql, db.prepare(sql));
    return statements.get(sql);
  };
  const insert = (table, row) => {
    const cols = Object.keys(row);
    prep(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((k) => row[k]));
  };
  const fileOf = (rel) => path.join(root, ...rel.split('/'));
  const forget = (rel) => { for (const t of TABLES) prep(`DELETE FROM ${t} WHERE file_path = ?`).run(rel); };

  function refresh(rel) {
    const kind = kindFor(rel);
    if (!kind) return;
    forget(rel);
    let text;
    try {
      text = fs.readFileSync(fileOf(rel), 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') insert('problems', { file_path: rel, message: `Couldn't read it: ${e.message}` });
      return;
    }
    const note = parseNote(text);
    if (note.problem) { insert('problems', { file_path: rel, message: note.problem }); return; }
    const [table, row] = ROWS[kind](rel, note.data, note.body);
    insert(table, row);
    if (table === 'bills') {
      for (const p of paymentsFromBody(note.body)) {
        prep('INSERT INTO bill_payments (file_path, paid_on, amount, for_date) VALUES (?, ?, ?, ?)').run(rel, p.paid_on, p.amount, p.for_date);
      }
    }
  }

  function walk(relDir, out) {
    let entries;
    try { entries = fs.readdirSync(fileOf(relDir), { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const rel = `${relDir}/${e.name}`;
      if (e.isDirectory()) walk(rel, out);
      else if (e.isFile()) out.push(rel);
    }
    return out;
  }

  function rescan() {
    const rels = C.TOP_FOLDERS.flatMap((f) => walk(f, []));
    db.exec('BEGIN');
    try {
      for (const t of TABLES) db.exec(`DELETE FROM ${t}`);
      for (const rel of rels) refresh(rel);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  function removePrefix(prefix) {
    const like = `${prefix.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    for (const t of TABLES) prep(`DELETE FROM ${t} WHERE file_path LIKE ? ESCAPE '\\'`).run(like);
  }

  // Picks up edits made in Obsidian or any editor while the app runs.
  function watch() {
    const timers = new Map();
    const schedule = (key) => {
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(() => {
        timers.delete(key);
        try { if (key === '*') rescan(); else refresh(key); } catch (e) { console.error('Refreshing the index failed:', e.message); }
      }, 300));
    };
    let watcher;
    try {
      watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
        if (!filename) { schedule('*'); return; }
        const rel = String(filename).split(path.sep).join('/');
        if (!C.TOP_FOLDERS.includes(rel.split('/')[0])) return;
        schedule(rel.endsWith('.md') ? rel : '*');
      });
      watcher.on('error', (e) => console.error('Watching the notes stopped:', e.message));
    } catch (e) {
      console.error(`Can't watch ${root} for changes (${e.message}). Edits made outside the app show after a restart.`);
      return () => {};
    }
    return () => { for (const t of timers.values()) clearTimeout(t); watcher.close(); };
  }

  let closed = false;
  return {
    rescan,
    refresh,
    removePrefix,
    watch,
    // node:sqlite rows have no prototype; copy them into plain objects for callers.
    all: (sql, ...params) => prep(sql).all(...params).map((row) => ({ ...row })),
    get: (sql, ...params) => { const row = prep(sql).get(...params); return row ? { ...row } : row; },
    problems: () => prep('SELECT * FROM problems ORDER BY file_path').all().map((row) => ({ ...row })),
    close() { if (closed) return; closed = true; db.close(); },
  };
}

module.exports = { kindFor, createIndex };
