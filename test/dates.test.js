'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../server/dates');

test('localDate is the local calendar day, even late in the evening', () => {
  assert.equal(d.localDate(new Date(2026, 9, 13, 23, 30)), '2026-10-13');
  assert.equal(d.localDate(new Date(2026, 9, 13, 0, 5)), '2026-10-13');
});

test('isDate rejects impossible and wrongly formatted dates', () => {
  assert.equal(d.isDate('2026-10-13'), true);
  assert.equal(d.isDate('2026-02-30'), false);
  assert.equal(d.isDate('2026-13-01'), false);
  assert.equal(d.isDate('10/13/2026'), false);
  assert.equal(d.isDate(''), false);
  assert.equal(d.isDate(undefined), false);
});

test('addDays crosses month ends and daylight-saving changes', () => {
  assert.equal(d.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(d.addDays('2026-03-07', 2), '2026-03-09');
  assert.equal(d.addDays('2026-11-01', -1), '2026-10-31');
});

test('daysBetween counts calendar days across daylight saving', () => {
  assert.equal(d.daysBetween('2026-03-07', '2026-03-09'), 2);
  assert.equal(d.daysBetween('2026-10-13', '2026-10-10'), -3);
});

test('addMonths clamps to the last day of short months', () => {
  assert.equal(d.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(d.addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(d.addMonths('2026-01-31', 2), '2026-03-31');
  assert.equal(d.addMonths('2028-02-29', 12), '2029-02-28');
});

test('mondayOf finds the Monday of the week', () => {
  assert.equal(d.mondayOf('2026-10-13'), '2026-10-12');
  assert.equal(d.mondayOf('2026-10-18'), '2026-10-12');
  assert.equal(d.mondayOf('2026-10-12'), '2026-10-12');
});
