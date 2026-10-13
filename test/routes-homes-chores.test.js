'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempDir, writeFile, readFile, startApp } = require('./helpers');

async function setup(t, today = '2026-10-13') {
  const root = tempDir();
  const app = await startApp(root, { today });
  t.after(() => app.close());
  return { root, app };
}

test('health answers', async (t) => {
  const { app } = await setup(t);
  const r = await app.get('/api/health');
  assert.deepEqual({ ok: r.json.ok, app: r.json.app }, { ok: true, app: 'home-base' });
});

test('the first home becomes the default; chores attach to homes', async (t) => {
  const { root, app } = await setup(t);
  assert.equal((await app.post('/api/homes', { name: 'Maple St', kind: 'home' })).status, 201);
  assert.equal((await app.post('/api/homes', { name: 'Pine Cabin', kind: 'cabin' })).status, 201);
  assert.match(readFile(root, 'Home Base Settings.md'), /^default_home: Maple St$/m);
  assert.equal((await app.post('/api/chores', { name: 'Check the roof', frequency: 'seasonal', home: 'Pine Cabin' })).status, 201);
  assert.equal((await app.post('/api/chores', { name: 'Vacuum' })).status, 201);
  assert.deepEqual((await app.get('/api/chores?home=Pine Cabin')).json.map((c) => c.name), ['Check the roof']);
  assert.deepEqual((await app.get('/api/chores?home=Maple St')).json.map((c) => c.name), ['Vacuum']);
  assert.match(readFile(root, 'Home Maintenance/Seasonal Home Maintenance/Check the roof.md'), /^home: Pine Cabin$/m);
  const homes = (await app.get('/api/homes')).json;
  assert.deepEqual(homes.map((h) => [h.id, h.is_default, h.due_count]), [['Maple St', true, 1], ['Pine Cabin', false, 1]]);
});

test('marking a chore done moves its due date', async (t) => {
  const { root, app } = await setup(t);
  await app.post('/api/chores', { name: 'Vacuum', frequency: 'weekly' });
  const [chore] = (await app.get('/api/chores')).json;
  assert.equal(chore.days_until, 0);
  assert.equal((await app.post(`/api/chores/${chore.id}/done`, {})).status, 200);
  const [after] = (await app.get('/api/chores')).json;
  assert.equal(after.last_done, '2026-10-13');
  assert.equal(after.days_until, 7);
  assert.match(readFile(root, 'Home Maintenance/Weekly Cleaning/Vacuum.md'), /^last_done: 2026-10-13$/m);
  assert.equal((await app.post(`/api/chores/${chore.id}/done`, { date: '2026-10-20' })).status, 400);
});

test('editing a chore changes only what was sent and keeps other properties', async (t) => {
  const { root, app } = await setup(t);
  writeFile(root, 'Home Maintenance/Weekly Cleaning/Mop.md', '---\nname: Mop\ntags:\n  - floors\nnotes: kitchen too\n---\nBody\n');
  app.hb.index.rescan();
  const [mop] = (await app.get('/api/chores')).json;
  assert.equal((await app.patch(`/api/chores/${mop.id}`, { frequency: 'monthly' })).status, 200);
  assert.equal(readFile(root, 'Home Maintenance/Weekly Cleaning/Mop.md'), '---\nname: Mop\ntags:\n  - floors\nnotes: kitchen too\nfrequency: monthly\nfreq_days: 30\n---\nBody\n');
});

test('a chore pointing at a missing home shows under the default home', async (t) => {
  const root = tempDir();
  writeFile(root, 'Homes/Maple St.md', '---\nname: Maple St\n---\n');
  writeFile(root, 'Home Maintenance/Weekly Cleaning/Mop.md', '---\nname: Mop\nhome: Old Place\n---\n');
  const app = await startApp(root, { today: '2026-10-13' });
  t.after(() => app.close());
  assert.equal((await app.get('/api/chores')).json[0].home, 'Maple St');
});

test('deleting a home that still has chores is refused; an empty one goes to _Trash', async (t) => {
  const { root, app } = await setup(t);
  await app.post('/api/homes', { name: 'Maple St' });
  await app.post('/api/homes', { name: 'Empty lot' });
  await app.post('/api/chores', { name: 'Vacuum', home: 'Maple St' });
  const refused = await app.del('/api/homes/Maple St');
  assert.equal(refused.status, 409);
  assert.match(refused.json.error, /1 chore and 0 projects/);
  assert.ok(fs.existsSync(path.join(root, 'Homes', 'Maple St.md')));
  assert.equal((await app.del(`/api/homes/${encodeURIComponent('Empty lot')}`)).status, 200);
  assert.ok(fs.readdirSync(path.join(root, '_Trash')).some((f) => f.endsWith('Empty lot.md')));
});

test('names are made safe, duplicates are refused, bad input is explained', async (t) => {
  const { root, app } = await setup(t);
  assert.equal((await app.post('/api/chores', { name: 'Clean A/C: filter' })).status, 201);
  assert.ok(fs.existsSync(path.join(root, 'Home Maintenance', 'Weekly Cleaning', 'Clean AC filter.md')));
  assert.equal((await app.post('/api/chores', { name: 'Clean A/C: filter' })).status, 409);
  assert.equal((await app.post('/api/chores', { name: '' })).status, 400);
  assert.equal((await app.post('/api/chores', { name: 'X', frequency: 'hourly' })).status, 400);
  assert.equal((await app.post('/api/chores', { name: 'X', home: 'Nowhere' })).status, 400);
});

test('a hand-broken chore note is skipped and never overwritten', async (t) => {
  const root = tempDir();
  writeFile(root, 'Home Maintenance/Weekly Cleaning/Broken.md', '---\nname: Broken\n');
  const app = await startApp(root, { today: '2026-10-13' });
  t.after(() => app.close());
  assert.equal((await app.get('/api/chores')).json.length, 0);
  assert.equal(readFile(root, 'Home Maintenance/Weekly Cleaning/Broken.md'), '---\nname: Broken\n');
});

test('unknown and malformed ids give 404 or 400, never 500', async (t) => {
  const { app } = await setup(t);
  assert.equal((await app.patch('/api/chores/abc', { name: 'x' })).status, 404);
  assert.equal((await app.post('/api/chores/%E0%A4%A/done', {})).status, 400);
  assert.equal((await app.del('/api/homes/Nope')).status, 404);
});

test('two homes can have chores and projects with the same name', async (t) => {
  const { app } = await setup(t);
  await app.post('/api/homes', { name: 'Maple St' });
  await app.post('/api/homes', { name: 'Pine Cabin' });
  assert.equal((await app.post('/api/chores', { name: 'Vacuum', home: 'Maple St' })).status, 201);
  assert.equal((await app.post('/api/chores', { name: 'Vacuum', home: 'Pine Cabin' })).status, 201);
  assert.equal((await app.post('/api/chores', { name: 'Vacuum', home: 'Pine Cabin' })).status, 409);
  assert.deepEqual((await app.get('/api/chores?home=Pine Cabin')).json.map((c) => c.name), ['Vacuum']);
  assert.equal((await app.post('/api/projects', { name: 'Roof', home: 'Maple St' })).status, 201);
  assert.equal((await app.post('/api/projects', { name: 'Roof', home: 'Pine Cabin' })).status, 201);
  assert.equal((await app.post('/api/projects', { name: 'Roof', home: 'Pine Cabin' })).status, 409);
  assert.equal((await app.get('/api/projects?home=Pine Cabin')).json.length, 1);
});

test('a home called Claude stays visible, and Obsidian-made home names can be edited', async (t) => {
  const { root, app } = await setup(t);
  assert.equal((await app.post('/api/homes', { name: 'Claude' })).status, 201);
  assert.ok((await app.get('/api/homes')).json.some((h) => h.name === 'Claude'));
  writeFile(root, 'Homes/Main  House.md', '---\nname: Main  House\n---\n');
  app.hb.index.rescan();
  assert.equal((await app.patch(`/api/homes/${encodeURIComponent('Main  House')}`, { notes: 'hi' })).status, 200);
  assert.equal((await app.del(`/api/homes/${encodeURIComponent('Main  House')}`)).status, 200);
  assert.equal((await app.patch('/api/homes/..%2FBills%2FX', { notes: 'x' })).status, 404);
});

test('a home name with a slash still gives a duplicate chore its own visible note', async (t) => {
  const { app } = await setup(t);
  await app.post('/api/homes', { name: 'Maple St' });
  const lake = await app.post('/api/homes', { name: 'Lake/Cabin' });
  await app.post('/api/chores', { name: 'Vacuum', home: 'Maple St' });
  assert.equal((await app.post('/api/chores', { name: 'Vacuum', home: lake.json.id })).status, 201);
  assert.deepEqual((await app.get(`/api/chores?home=${encodeURIComponent(lake.json.id)}`)).json.map((c) => c.name), ['Vacuum']);
});
