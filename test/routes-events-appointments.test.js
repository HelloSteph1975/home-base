'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tempDir, readFile, startApp } = require('./helpers');

test('events: create, edit, delete', async (t) => {
  const root = tempDir();
  const app = await startApp(root, { today: '2026-10-13' });
  t.after(() => app.close());
  const made = await app.post('/api/events', { name: "Mom's birthday", date: '1960-08-15', category: 'Birthdays', recurring: 'annual' });
  assert.equal(made.status, 201);
  assert.match(readFile(root, "Events/Birthdays/1960-08-15 Mom's birthday.md"), /^recurring: annual$/m);
  assert.equal((await app.patch(`/api/events/${made.json.id}`, { time: '18:00', location: 'Her house' })).status, 200);
  const [event] = (await app.get('/api/events')).json;
  assert.deepEqual([event.time, event.location, event.category], ['18:00', 'Her house', 'Birthdays']);
  assert.equal((await app.patch(`/api/events/${made.json.id}`, { date: '' })).status, 400);
  assert.equal((await app.patch(`/api/events/${made.json.id}`, { time: '6pm' })).status, 400);
  assert.equal((await app.post('/api/events', { name: 'X', date: '2026-10-13', recurring: 'daily' })).status, 400);
  assert.equal((await app.del(`/api/events/${made.json.id}`)).status, 200);
  assert.equal((await app.get('/api/events')).json.length, 0);
});

test('appointments: create, mark done, sort', async (t) => {
  const root = tempDir();
  const app = await startApp(root, { today: '2026-10-13' });
  t.after(() => app.close());
  await app.post('/api/appointments', { name: 'Vet', date: '2026-10-22' });
  const dentist = await app.post('/api/appointments', { name: 'Dentist', date: '2026-10-13', time: '14:30', provider: 'Dr. Lee' });
  assert.equal(dentist.status, 201);
  assert.deepEqual((await app.get('/api/appointments')).json.map((a) => a.name), ['Dentist', 'Vet']);
  assert.equal((await app.patch(`/api/appointments/${dentist.json.id}`, { status: 'done' })).status, 200);
  assert.equal((await app.get('/api/appointments')).json[0].status, 'done');
  assert.equal((await app.patch(`/api/appointments/${dentist.json.id}`, { status: 'maybe' })).status, 400);
  assert.equal((await app.post('/api/appointments', { name: 'No date' })).status, 400);
});
