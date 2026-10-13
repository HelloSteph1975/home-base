'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { tempDir, writeFile } = require('./helpers');
const { createApp, reply } = require('../server/http');
const { HttpError } = require('../server/errors');

async function start(t) {
  const publicDir = tempDir();
  writeFile(publicDir, 'index.html', '<h1>Home Base</h1>');
  writeFile(publicDir, 'js/app.js', 'console.log(1)');
  const app = createApp({ publicDir });
  app.route('GET', '/api/things/:id', ({ params }) => ({ id: params.id }));
  app.route('POST', '/api/things', ({ body }) => reply(201, { got: body }));
  app.route('GET', '/api/boom', () => { throw new HttpError(409, 'Nope'); });
  const server = http.createServer(app.handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return server.address().port;
}

function request(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: data }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test('routes, params, JSON bodies and errors', async (t) => {
  const port = await start(t);
  assert.deepEqual(JSON.parse((await request(port, { path: '/api/things/a%20b' })).text), { id: 'a b' });
  const made = await request(port, { method: 'POST', path: '/api/things', headers: { 'content-type': 'application/json' }, body: '{"x":1}' });
  assert.equal(made.status, 201);
  assert.deepEqual(JSON.parse(made.text), { got: { x: 1 } });
  const boom = await request(port, { path: '/api/boom' });
  assert.equal(boom.status, 409);
  assert.deepEqual(JSON.parse(boom.text), { error: 'Nope' });
  assert.equal((await request(port, { path: '/api/nothing' })).status, 404);
});

test('guards: foreign Host, non-JSON writes, bad JSON, bad escapes', async (t) => {
  const port = await start(t);
  assert.equal((await request(port, { path: '/api/things/1', headers: { host: 'evil.example' } })).status, 403);
  assert.equal((await request(port, { method: 'POST', path: '/api/things', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await request(port, { method: 'POST', path: '/api/things', headers: { 'content-type': 'application/json' }, body: '{bad' })).status, 400);
  assert.equal((await request(port, { method: 'POST', path: '/api/things', headers: { 'content-type': 'application/json' }, body: '[1]' })).status, 400);
  assert.equal((await request(port, { path: '/api/things/%E0%A4%A' })).status, 400);
});

test('static files: index, scripts, no escaping the public folder', async (t) => {
  const port = await start(t);
  const home = await request(port, { path: '/' });
  assert.equal(home.status, 200);
  assert.match(home.headers['content-type'], /text\/html/);
  assert.equal(home.headers['cache-control'], 'no-store');
  assert.match((await request(port, { path: '/js/app.js' })).headers['content-type'], /javascript/);
  assert.equal((await request(port, { path: '/../package.json' })).status, 404);
  assert.equal((await request(port, { path: '/%2e%2e/package.json' })).status, 404);
});
