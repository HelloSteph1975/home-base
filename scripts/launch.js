'use strict';
// Starts Home Base if it isn't running, waits for it, then opens it.
// --no-open starts it without opening a browser (the morning task).
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { loadConfig, APP_DIR } = require('../server/config');
const { isUp } = require('./health');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function openBrowser(url, openWith) {
  const options = { detached: true, stdio: 'ignore', windowsHide: true };
  if (openWith) { spawn(openWith.replaceAll('{url}', url), { ...options, shell: true }).unref(); return; }
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], options).unref();
  else if (process.platform === 'darwin') spawn('open', [url], options).unref();
  else spawn('xdg-open', [url], options).unref();
}

async function main() {
  const config = loadConfig();
  const url = `http://127.0.0.1:${config.port}/`;
  if (!(await isUp(config.port))) {
    const log = fs.openSync(path.join(APP_DIR, 'server.log'), 'a');
    spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(APP_DIR, 'server', 'index.js')], {
      cwd: APP_DIR, detached: true, stdio: ['ignore', 'ignore', log], windowsHide: true,
    }).unref();
    let up = false;
    for (let i = 0; i < 30 && !up; i += 1) { await sleep(500); up = await isUp(config.port); }
    if (!up) {
      console.error(`Home Base didn't start within 15 seconds. Read the last lines of ${path.join(APP_DIR, 'server.log')}.`);
      process.exit(1);
    }
  }
  if (!process.argv.includes('--no-open')) openBrowser(url, config.openWith);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
