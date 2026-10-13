'use strict';
// Starts Home Base. "npm start" uses config.json; "npm run demo" uses a sample household.
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { loadConfig, ConfigError, APP_DIR } = require('./config');
const { createHomeBase } = require('./app');
const { ensureTodaySnapshot } = require('./backup');
const { makeDemoFolder, DEMO_PORT } = require('../scripts/demo-data');

const LOG_FILE = path.join(APP_DIR, 'server.log');

function log(message) {
  console.log(message);
  try { fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${message}\n`); } catch { /* the console still has it */ }
}

function fail(message) {
  log(`Home Base can't start: ${message}`);
  process.exit(1);
}

// True when something already listens on the port. Checked before the demo
// folder is rebuilt, so a second demo never wipes the folder the first one uses.
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

function busyMessage(port) {
  return `Port ${port} is busy; Home Base is probably already running at http://127.0.0.1:${port}/ . If it isn't, set another "port" in config.json.`;
}

async function main() {
  const demo = process.argv.includes('--demo');
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    if (e instanceof ConfigError) fail(e.message);
    throw e;
  }
  // Check the port before anything else: a second copy must not rebuild the
  // demo folder or the shared index while the first copy is using them.
  const port = demo ? Number(process.env.HOME_BASE_PORT) || DEMO_PORT : config.port;
  if (await portInUse(port)) { log(busyMessage(port)); process.exit(0); }
  if (demo) {
    const dir = makeDemoFolder();
    config = {
      ...config,
      dataDir: dir,
      backupDir: path.join(dir, 'Backups'),
      port,
      stopAt: null,
      file: path.join(dir, '.home-base', 'demo-config.json'),
    };
  }
  if (!fs.existsSync(config.dataDir) || !fs.statSync(config.dataDir).isDirectory()) {
    fail(`the data folder ${config.dataDir} doesn't exist or can't be reached. For a new install, run "npm run setup". `
      + "If the folder is on another drive or in a cloud folder, connect it and try again. Home Base won't create an empty folder in its place.");
  }

  const hb = createHomeBase(config, { log });
  ensureTodaySnapshot(hb.backups.current());
  // A copy left running overnight still gets one backup per day.
  setInterval(() => ensureTodaySnapshot(hb.backups.current()), 30 * 60 * 1000).unref();

  hb.server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      log(busyMessage(config.port));
      hb.close();
      process.exit(0);
    }
    fail(e.message);
  });
  hb.server.listen(config.port, '127.0.0.1', () => {
    log(`Home Base is running at http://127.0.0.1:${config.port}/ with notes in ${config.dataDir}${demo ? ' (demo)' : ''}.`);
  });

  process.on('SIGINT', () => hb.shutdown('SIGINT'));
  process.on('SIGTERM', () => hb.shutdown('SIGTERM'));

  if (config.stopAt) {
    setInterval(() => {
      const now = new Date();
      const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (hm === config.stopAt) hb.shutdown(`scheduled stop at ${config.stopAt}`);
    }, 30000).unref();
  }
}

main().catch((e) => fail(e.message));
