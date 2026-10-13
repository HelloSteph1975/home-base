'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempDir, writeFile, readFile } = require('./helpers');
const { makeDemoFolder } = require('../scripts/demo-data');

test('makes a fresh sample household with dates around today', () => {
  const dir = path.join(tempDir(), 'demo');
  makeDemoFolder(dir, '2026-10-13');
  assert.equal(fs.readdirSync(path.join(dir, 'Homes')).length, 3);
  assert.match(readFile(dir, 'Bills/Electric.md'), /^due_date: 2026-10-16$/m);
  assert.match(readFile(dir, 'Home Base Settings.md'), /^name: Sam$/m);
  writeFile(dir, 'Homes/Extra.md', 'x');
  makeDemoFolder(dir, '2026-10-13');
  assert.ok(!fs.existsSync(path.join(dir, 'Homes', 'Extra.md')));
});

test('refuses to wipe a folder it did not make', () => {
  const dir = tempDir();
  writeFile(dir, 'precious.md', 'keep me');
  assert.throws(() => makeDemoFolder(dir, '2026-10-13'), /not a Home Base demo folder/);
  assert.equal(readFile(dir, 'precious.md'), 'keep me');
});
