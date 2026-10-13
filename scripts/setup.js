'use strict';
// "npm run setup": writes config.json if it's missing and creates the data folder.
// "npm run install-windows" also adds the scheduled tasks and the Desktop shortcut.
const fs = require('node:fs');
const { CONFIG_PATH, DEFAULT_PORT, defaultDataDir, loadConfig } = require('../server/config');

const [major] = process.versions.node.split('.').map(Number);
if (major < 24) {
  console.error(`Home Base needs Node 24 or newer, and this is Node ${process.versions.node}. Install the current LTS from https://nodejs.org, then run "npm run setup" again.`);
  process.exit(1);
}

if (fs.existsSync(CONFIG_PATH)) {
  console.log(`Kept your existing ${CONFIG_PATH}.`);
} else {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify({ dataDir: defaultDataDir(), port: DEFAULT_PORT }, null, 2)}\n`);
  console.log(`Wrote ${CONFIG_PATH}.`);
}

const config = loadConfig();
if (fs.existsSync(config.dataDir)) {
  console.log(`Using your data folder: ${config.dataDir}`);
} else {
  fs.mkdirSync(config.dataDir, { recursive: true });
  console.log(`Created your data folder: ${config.dataDir}`);
}

if (process.argv.includes('--windows')) require('./windows').install(config);

console.log(`\nDone. Start Home Base with "npm start", then open http://127.0.0.1:${config.port}/`);
