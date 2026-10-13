'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { tempDir, startApp } = require('./helpers');
const { isUp } = require('../scripts/health');

test('isUp knows Home Base from another app on the port', async (t) => {
  const app = await startApp(tempDir());
  t.after(() => app.close());
  assert.equal(await isUp(Number(new URL(app.base).port)), true);

  const other = http.createServer((_req, res) => { res.end('{"ok":true}'); });
  await new Promise((r) => other.listen(0, '127.0.0.1', r));
  t.after(() => other.close());
  assert.equal(await isUp(other.address().port), false);
  assert.equal(await isUp(1), false);
});
