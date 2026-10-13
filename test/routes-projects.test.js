'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempDir, readFile, startApp } = require('./helpers');

test('projects belong to homes and hold tasks', async (t) => {
  const root = tempDir();
  const app = await startApp(root, { today: '2026-10-13' });
  t.after(() => app.close());
  await app.post('/api/homes', { name: 'Maple St' });
  await app.post('/api/homes', { name: 'Pine Cabin' });
  const made = await app.post('/api/projects', { name: 'Fix the well', home: 'Pine Cabin', due_date: '2026-11-01' });
  assert.equal(made.status, 201);
  assert.match(readFile(root, 'Projects/Fix the well/Project Info.md'), /^start_date: 2026-10-13$/m);
  const { id } = made.json;

  assert.equal((await app.post(`/api/projects/${id}/tasks`, { name: 'Call the plumber', due_date: '2026-10-20' })).status, 201);
  assert.equal((await app.post(`/api/projects/${id}/tasks`, { name: 'Buy pipe' })).status, 201);
  const tasks = (await app.get(`/api/projects/${id}/tasks`)).json;
  assert.deepEqual(tasks.map((x) => x.name), ['Call the plumber', 'Buy pipe']);
  assert.equal((await app.patch(`/api/tasks/${tasks[0].id}`, { status: 'done' })).status, 200);

  const [project] = (await app.get('/api/projects?home=Pine Cabin')).json;
  assert.deepEqual([project.name, project.task_count, project.open_tasks], ['Fix the well', 2, 1]);
  assert.equal((await app.get('/api/projects?home=Maple St')).json.length, 0);

  assert.equal((await app.patch(`/api/projects/${id}`, { status: 'finished' })).status, 400);
  assert.equal((await app.patch(`/api/projects/${id}`, { status: 'done', home: 'Maple St' })).status, 200);
  assert.equal((await app.get('/api/projects?home=Maple St')).json[0].status, 'done');

  assert.equal((await app.del(`/api/tasks/${tasks[1].id}`)).status, 200);
  assert.equal((await app.del(`/api/projects/${id}`)).status, 200);
  assert.ok(!fs.existsSync(path.join(root, 'Projects', 'Fix the well')));
  assert.ok(fs.readdirSync(path.join(root, '_Trash')).some((f) => f.endsWith('Fix the well')));
  assert.equal((await app.get('/api/projects')).json.length, 0);
});

test('a duplicate project name is refused', async (t) => {
  const app = await startApp(tempDir(), { today: '2026-10-13' });
  t.after(() => app.close());
  await app.post('/api/projects', { name: 'Porch' });
  assert.equal((await app.post('/api/projects', { name: 'Porch' })).status, 409);
});
