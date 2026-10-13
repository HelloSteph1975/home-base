'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpError } = require('../server/errors');

test('HttpError carries a status', () => {
  const e = new HttpError(404, 'Gone');
  assert.equal(e.status, 404);
  assert.equal(e.message, 'Gone');
});
