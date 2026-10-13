'use strict';
const { HttpError } = require('../errors');
const { isDate, addDays, daysBetween } = require('../dates');
const { occurrencesBetween } = require('../recurrence');
const { encId } = require('../notes');
const { withDue } = require('./chores');
const { loadBills, isPaid } = require('./bills');

const MAX_SPAN_DAYS = 62;
const ORDER = { appointment: 0, event: 1, bill: 2, chore: 3, task: 4 };

function calendarDays({ index, homesInfo, today }, from, to) {
  if (!isDate(from) || !isDate(to)) throw new HttpError(400, 'from and to must be dates like 2026-10-13.');
  const span = daysBetween(from, to);
  if (span < 0) throw new HttpError(400, 'from must not be after to.');
  if (span > MAX_SPAN_DAYS) throw new HttpError(400, `Ask for ${MAX_SPAN_DAYS + 1} days at most.`);
  const now = today();
  const info = homesInfo();
  const days = new Map();
  for (let d = from; d <= to; d = addDays(d, 1)) days.set(d, []);
  const put = (date, item) => { if (days.has(date)) days.get(date).push(item); };

  for (const e of index.all('SELECT * FROM events')) {
    for (const d of occurrencesBetween(e.date, e.recurring, from, to)) {
      put(d, { type: 'event', id: encId(e.file_path), label: e.name, time: e.time, meta: e.category,
        edit: { name: e.name, date: e.date, time: e.time, category: e.category, location: e.location, notes: e.notes, recurring: e.recurring } });
    }
  }
  for (const a of index.all("SELECT * FROM appointments WHERE status NOT IN ('done', 'cancelled') AND date BETWEEN ? AND ?", from, to)) {
    put(a.date, { type: 'appointment', id: encId(a.file_path), label: a.name, time: a.time, meta: a.provider,
      edit: { name: a.name, date: a.date, time: a.time, provider: a.provider, reason: a.reason, status: a.status } });
  }
  for (const b of loadBills(index)) {
    for (const d of occurrencesBetween(b.due_date, b.recurring, from, to)) {
      put(d, { type: 'bill', id: encId(b.file_path), label: b.name, amount: b.amount, paid: isPaid(b, d) });
    }
  }
  for (const row of index.all('SELECT * FROM chores')) {
    const chore = withDue(row, now);
    const item = { type: 'chore', id: encId(row.file_path), label: row.name, home: info.homeOf(row.home), overdue: chore.days_until < 0 };
    put(chore.days_until < 0 ? now : chore.due_date, item);
  }
  const projects = new Map(index.all('SELECT * FROM projects').map((p) => [p.folder, p]));
  for (const t of index.all("SELECT * FROM project_tasks WHERE status != 'done' AND due_date BETWEEN ? AND ?", from, to)) {
    const p = projects.get(t.project_folder);
    put(t.due_date, { type: 'task', id: encId(t.file_path), label: t.name, meta: p ? p.name : t.project_folder, home: info.homeOf(p?.home) });
  }

  const sortItems = (a, b) => (a.time || '99').localeCompare(b.time || '99') || ORDER[a.type] - ORDER[b.type] || a.label.localeCompare(b.label);
  return [...days].map(([date, items]) => ({ date, items: items.sort(sortItems) }));
}

module.exports = { calendarDays, MAX_SPAN_DAYS };
