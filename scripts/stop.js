'use strict';
// Asks Home Base to stop (so it can back up and close its database), and only
// forces it if it doesn't stop within 10 seconds.
const { execFileSync } = require('node:child_process');
const { loadConfig } = require('../server/config');
const { isUp } = require('./health');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listeningPids(port) {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true });
      return [...new Set(out.split(/\r?\n/)
        .filter((line) => /LISTENING/i.test(line) && line.includes(`:${port} `))
        .map((line) => Number(line.trim().split(/\s+/).pop())))];
    }
    return execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).split(/\s+/).filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

async function main() {
  const { port } = loadConfig();
  if (!(await isUp(port))) { console.log("Home Base wasn't running."); return; }
  try {
    await fetch(`http://127.0.0.1:${port}/api/shutdown`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000) });
  } catch { /* it may already be on its way down */ }
  for (let i = 0; i < 20; i += 1) {
    await sleep(500);
    if (!(await isUp(port))) { console.log('Home Base stopped.'); return; }
  }
  const pids = listeningPids(port);
  for (const pid of pids) { try { process.kill(pid); } catch { /* already gone */ } }
  console.log(pids.length ? 'Home Base stopped (it had to be forced).' : "Home Base didn't stop. Close it from Task Manager or Activity Monitor.");
}

main();
