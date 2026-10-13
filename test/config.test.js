'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempDir } = require('./helpers');
const { loadConfig, updateConfigFile, ConfigError, defaultDataDir } = require('../server/config');

test('defaults when there is no config file', () => {
  const c = loadConfig({ file: path.join(tempDir(), 'config.json'), env: {} });
  assert.equal(c.port, 4173);
  assert.equal(c.dataDir, defaultDataDir());
  assert.equal(c.backupDir, path.join(defaultDataDir(), 'Backups'));
  assert.equal(c.stopAt, null);
  assert.equal(c.openAtStart, false);
});

test('file values apply, and environment variables win over them', () => {
  const dir = tempDir();
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, JSON.stringify({ dataDir: path.join(dir, 'data'), port: 4300, backupDir: path.join(dir, 'bk'), stopAt: '21:00' }));
  const c = loadConfig({ file, env: {} });
  assert.equal(c.dataDir, path.join(dir, 'data'));
  assert.equal(c.port, 4300);
  assert.equal(c.backupDir, path.join(dir, 'bk'));
  assert.equal(c.stopAt, '21:00');
  const e = loadConfig({ file, env: { HOME_BASE_DATA_DIR: path.join(dir, 'other'), HOME_BASE_PORT: '4400' } });
  assert.equal(e.dataDir, path.join(dir, 'other'));
  assert.equal(e.port, 4400);
});

test('bad JSON names the file and mentions backslashes', () => {
  const file = path.join(tempDir(), 'config.json');
  fs.writeFileSync(file, '{ "dataDir": "C:\\Data" }');
  assert.throws(() => loadConfig({ file, env: {} }), (e) => e instanceof ConfigError && e.message.includes(file) && /backslash/.test(e.message));
});

test('bad port and bad stopAt are refused', () => {
  const file = path.join(tempDir(), 'config.json');
  fs.writeFileSync(file, JSON.stringify({ port: 'abc' }));
  assert.throws(() => loadConfig({ file, env: {} }), ConfigError);
  fs.writeFileSync(file, JSON.stringify({ stopAt: '9pm' }));
  assert.throws(() => loadConfig({ file, env: {} }), ConfigError);
  assert.throws(() => loadConfig({ file: path.join(tempDir(), 'none.json'), env: { HOME_BASE_PORT: '70000' } }), ConfigError);
});

test('updateConfigFile keeps the other keys', () => {
  const file = path.join(tempDir(), 'config.json');
  fs.writeFileSync(file, JSON.stringify({ dataDir: 'D:\\x', port: 4173 }));
  updateConfigFile({ backupDir: 'E:\\bk' }, { file });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { dataDir: 'D:\\x', port: 4173, backupDir: 'E:\\bk' });
});
