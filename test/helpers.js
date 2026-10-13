'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function tempDir(prefix = 'hb-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root, rel, text) {
  const file = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

function readFile(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8');
}

async function startApp(root, { today } = {}) {
  const { createHomeBase } = require('../server/app');
  const config = {
    dataDir: root,
    backupDir: path.join(root, 'Backups'),
    port: 0,
    stopAt: null,
    file: path.join(root, '.home-base', 'test-config.json'),
  };
  const hb = createHomeBase(config, { today: today ? () => today : undefined, watch: false, onExit: () => {} });
  await new Promise((resolve) => hb.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${hb.server.address().port}`;
  const call = async (method, p, body) => {
    const res = await fetch(base + p, {
      method,
      headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  return {
    base,
    hb,
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    patch: (p, b) => call('PATCH', p, b),
    put: (p, b) => call('PUT', p, b),
    del: (p) => call('DELETE', p),
    close: () => hb.close(),
  };
}

module.exports = { tempDir, writeFile, readFile, startApp };
