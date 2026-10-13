'use strict';
// Builds one Home Base: the notes service, the index, backups, the routes and
// an http.Server that isn't listening yet. server/index.js decides the port.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createNotes, writeAtomic } = require('./notes');
const { createIndex } = require('./index-db');
const { readSettings, writeSettings, resolveHomes } = require('./settings');
const { createBackup, BACKUP_FILE } = require('./backup');
const { updateConfigFile } = require('./config');
const { createApp } = require('./http');
const { HttpError } = require('./errors');
const { localDate } = require('./dates');
const { TOP_FOLDERS, EVENT_CATEGORIES, STATE_FOLDER } = require('./constants');
const { version } = require('../package.json');

const ROUTES = ['system', 'homes', 'chores', 'projects', 'events', 'appointments', 'bills', 'today', 'calendar', 'settings', 'backups'];

function createHomeBase(config, { today = () => localDate(), watch = true, log = console.log, onExit = (code) => process.exit(code) } = {}) {
  const root = path.resolve(config.dataDir);
  const stateDir = path.join(root, STATE_FOLDER);
  for (const folder of TOP_FOLDERS) fs.mkdirSync(path.join(root, folder), { recursive: true });
  for (const category of EVENT_CATEGORIES) fs.mkdirSync(path.join(root, 'Events', category), { recursive: true });

  const notes = createNotes(root);
  const index = createIndex({ root, dbPath: path.join(stateDir, 'index.sqlite'), openLog: path.join(stateDir, 'database-opens.log') });
  index.rescan();
  const stopWatching = watch ? index.watch() : () => {};
  const settings = { read: () => readSettings(notes), write: (changes) => writeSettings(notes, changes) };
  const homesInfo = () => resolveHomes(index, settings.read());

  const makeBackup = (dir) => createBackup(root, {
    dir,
    stateDir,
    writeFile: writeAtomic,
    trashFile: (file, opts) => notes.trash(notes.toRel(file), opts),
  });
  let backup = makeBackup(path.resolve(config.backupDir));
  const backups = {
    current: () => backup,
    // Moves backups to another folder: checks it can be written, copies the
    // existing file there (so history isn't lost), then saves it in config.json.
    switchTo(dir) {
      const target = path.resolve(dir);
      try {
        fs.mkdirSync(target, { recursive: true });
        const probe = path.join(target, `.home-base-write-test-${process.pid}`);
        fs.writeFileSync(probe, 'ok');
        fs.rmSync(probe);
      } catch (e) {
        throw new HttpError(400, `Home Base can't save backups in ${target}: ${e.message}`);
      }
      const oldFile = backup.file;
      const newFile = path.join(target, BACKUP_FILE);
      if (path.resolve(oldFile) === path.resolve(newFile)) return backup.snapshot();
      // Another history there would silently replace this one, so refuse.
      if (fs.existsSync(newFile)) {
        throw new HttpError(409, `${target} already has a Home Base backup file. Pick an empty folder, or move that file somewhere else first.`);
      }
      backup.close();
      if (fs.existsSync(oldFile)) fs.copyFileSync(oldFile, newFile, fs.constants.COPYFILE_EXCL);
      backup = makeBackup(target);
      updateConfigFile({ backupDir: target }, { file: config.file });
      config.backupDir = target;
      return backup.snapshot();
    },
  };

  const app = createApp({ publicDir: path.join(__dirname, '..', 'public') });
  const server = http.createServer(app.handler);
  const deps = { notes, index, settings, homesInfo, today, config, version, backups, shutdown };
  for (const name of ROUTES) require(`./routes/${name}`)(app, deps);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    stopWatching();
    try { backup.close(); } catch (e) { console.error('Closing the backup file failed:', e.message); }
    index.close();
    server.close();
  }

  let stopping = false;
  function shutdown(reason) {
    if (stopping) return;
    stopping = true;
    log(`Stopping (${reason}).`);
    const r = backup.snapshot();
    if (r.error) log(`The backup on stop failed: ${r.error}`);
    close();
    setTimeout(() => onExit(0), 100);
  }

  return { server, index, notes, settings, backups, close, shutdown };
}

module.exports = { createHomeBase };
