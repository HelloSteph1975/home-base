'use strict';
const { isDate, addDays, addMonths } = require('./dates');

const RECURRING = ['none', 'weekly', 'biweekly', 'monthly', 'annual'];

// The k-th occurrence, always counted from the base date so month ends don't drift.
function nthOccurrence(base, recurring, k) {
  if (k === 0) return base;
  if (recurring === 'weekly') return addDays(base, 7 * k);
  if (recurring === 'biweekly') return addDays(base, 14 * k);
  if (recurring === 'monthly') return addMonths(base, k);
  if (recurring === 'annual') return addMonths(base, 12 * k);
  return null;
}

function occurrencesBetween(base, recurring, from, to) {
  const out = [];
  if (!isDate(base)) return out;
  for (let k = 0; k < 6000; k += 1) {
    const d = nthOccurrence(base, recurring, k);
    if (d === null || d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

module.exports = { RECURRING, nthOccurrence, occurrencesBetween };
