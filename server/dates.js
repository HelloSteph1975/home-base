'use strict';
// Local calendar dates as YYYY-MM-DD strings. Never use toISOString() for a
// date: that is UTC, and in the evening in the Americas it is already tomorrow.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return null;
  const [y, m, day] = s.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  return d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === day ? d : null;
}

const isDate = (s) => parseDate(s) !== null;

function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

// Same day of the month n months later, or the month's last day if it is shorter.
function addMonths(s, n) {
  const d = parseDate(s);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return localDate(target);
}

// Math.round absorbs the 23- and 25-hour days around daylight-saving changes.
function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

function mondayOf(s) {
  const d = parseDate(s);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return localDate(d);
}

module.exports = { localDate, parseDate, isDate, addDays, addMonths, daysBetween, mondayOf };
