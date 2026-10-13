'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempDir, writeFile, readFile, startApp } = require('./helpers');

test('back up now, see changes, restore, move the backup folder', async (t) => {
  const root = tempDir();
  writeFile(root, 'Homes/Maple St.md', '---\nname: Maple St\n---\nold notes\n');
  const app = await startApp(root, { today: '2026-10-13' });
  t.after(() => app.close());
  assert.equal((await app.post('/api/backups', {})).status, 200);
  const list = (await app.get('/api/backups')).json;
  assert.equal(list.days.length, 1);
  assert.equal(list.location, path.join(root, 'Backups'));

  await app.patch('/api/homes/Maple St', { notes: 'new notes' });
  const day = list.days[0].taken_on;
  assert.deepEqual((await app.get(`/api/backups/${day}`)).json, [{ path: 'Homes/Maple St.md', status: 'changed' }]);
  assert.equal((await app.post(`/api/backups/${day}/restore`, { paths: ['Homes/Maple St.md'] })).status, 200);
  assert.equal((await app.get('/api/homes')).json[0].notes, 'old notes');

  const elsewhere = tempDir();
  assert.equal((await app.put('/api/backups/location', { dir: elsewhere })).status, 200);
  assert.ok(fs.existsSync(path.join(elsewhere, 'home-base-backups.sqlite')));
  assert.equal(JSON.parse(readFile(root, '.home-base/test-config.json')).backupDir, elsewhere);
  const moved = (await app.get('/api/backups')).json;
  assert.equal(moved.location, elsewhere);
  assert.equal(moved.days.length, 1);

  assert.equal((await app.put('/api/backups/location', { dir: 'relative/folder' })).status, 400);
  writeFile(root, 'blocker', 'x');
  assert.equal((await app.put('/api/backups/location', { dir: path.join(root, 'blocker', 'sub') })).status, 400);
});

test('moving backups to a folder that already has a backup file is refused', async (t) => {
  const root = tempDir();
  const app = await startApp(root, { today: '2026-10-13' });
  t.after(() => app.close());
  await app.post('/api/backups', {});
  const other = tempDir();
  writeFile(other, 'home-base-backups.sqlite', 'someone else');
  const r = await app.put('/api/backups/location', { dir: other });
  assert.equal(r.status, 409);
  assert.equal((await app.get('/api/backups')).json.location, path.join(root, 'Backups'));
  assert.equal(readFile(other, 'home-base-backups.sqlite'), 'someone else');
});
