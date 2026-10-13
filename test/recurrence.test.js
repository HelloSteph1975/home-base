'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { occurrencesBetween } = require('../server/recurrence');

test('one-time items occur only on their date', () => {
  assert.deepEqual(occurrencesBetween('2026-10-15', 'none', '2026-10-01', '2026-10-31'), ['2026-10-15']);
  assert.deepEqual(occurrencesBetween('2026-10-15', 'none', '2026-11-01', '2026-11-30'), []);
});

test('weekly items repeat on the same weekday', () => {
  assert.deepEqual(occurrencesBetween('2026-10-06', 'weekly', '2026-10-10', '2026-10-31'), ['2026-10-13', '2026-10-20', '2026-10-27']);
});

test('monthly on the 31st uses the last day of short months without drifting', () => {
  assert.deepEqual(occurrencesBetween('2026-01-31', 'monthly', '2026-02-01', '2026-04-30'), ['2026-02-28', '2026-03-31', '2026-04-30']);
});

test('a Feb 29 birthday shows on Feb 28 in other years', () => {
  assert.deepEqual(occurrencesBetween('2024-02-29', 'annual', '2026-01-01', '2028-12-31'), ['2026-02-28', '2027-02-28', '2028-02-29']);
});

test('nothing before the start date; bad input gives the base date or nothing', () => {
  assert.deepEqual(occurrencesBetween('2026-10-20', 'weekly', '2026-10-01', '2026-10-19'), []);
  assert.deepEqual(occurrencesBetween('', 'monthly', '2026-10-01', '2026-10-31'), []);
  assert.deepEqual(occurrencesBetween('2026-10-01', 'fortnightly', '2026-10-01', '2026-10-31'), ['2026-10-01']);
});
