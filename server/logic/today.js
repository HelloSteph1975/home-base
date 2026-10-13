'use strict';
const { addDays, daysBetween } = require('../dates');
const { encId } = require('../notes');
const { withDue } = require('./chores');
const { loadBills, nextDue } = require('./bills');
const { calendarDays } = require('./calendar');

function homeSummaries(index, info, today) {
  const chores = index.all('SELECT home, last_done, freq_days FROM chores').map((c) => withDue(c, today));
  const projects = index.all("SELECT home FROM projects WHERE status != 'done'");
  const mine = (rows, id) => rows.filter((r) => info.homeOf(r.home) === id);
  return info.homes.map((h) => ({
    id: h.id,
    name: h.name,
    kind: h.kind,
    color: h.color,
    notes: (h.body || '').trim(),
    is_default: h.id === info.defaultHome,
    chore_count: mine(chores, h.id).length,
    due_count: mine(chores, h.id).filter((c) => c.days_until <= 0).length,
    active_projects: mine(projects, h.id).length,
  }));
}

function todayView({ index, homesInfo, settings, today }) {
  const now = today();
  const info = homesInfo();
  const chores = index.all('SELECT * FROM chores').map((c) => withDue(c, now))
    .filter((c) => c.days_until <= 0)
    .sort((a, b) => a.days_until - b.days_until || a.name.localeCompare(b.name))
    .map((c) => ({ id: encId(c.file_path), name: c.name, days_until: c.days_until, home: info.homeOf(c.home), home_name: info.nameOf(info.homeOf(c.home)) }));
  const bills = loadBills(index)
    .map((b) => ({ b, next: nextDue(b) }))
    .filter(({ next }) => next && daysBetween(now, next) <= 7)
    .map(({ b, next }) => ({ id: encId(b.file_path), name: b.name, amount: b.amount, next_due: next, days_until: daysBetween(now, next) }))
    .sort((a, b) => a.days_until - b.days_until || a.name.localeCompare(b.name));
  const comingUp = calendarDays({ index, homesInfo, today }, now, addDays(now, 7))
    .flatMap((d) => d.items
      .filter((i) => i.type === 'event' || i.type === 'appointment' || i.type === 'task')
      .map((i) => ({ date: d.date, type: i.type, label: i.label, time: i.time || '', meta: i.meta || '' })));
  return { name: settings.read().name, date: now, chores, bills, coming_up: comingUp, homes: homeSummaries(index, info, now) };
}

module.exports = { homeSummaries, todayView };
