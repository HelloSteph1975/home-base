import { api } from '../api.js';
import { h, card, empty, money, fmtDay, fmtTime, localToday, addDays, parseDay, ymd, act, formDialog, confirmDialog } from '../ui.js';

const VIEWS = [['month', 'Month'], ['week', 'Week'], ['day', 'Day']];
const TYPE_TEXT = { event: 'Event', appointment: 'Appointment', bill: 'Bill', chore: 'Chore', task: 'Project task' };
const REPEATS = [['none', 'Does not repeat'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['annual', 'Every year']];
const CATEGORIES = ['Birthdays', 'Holidays', 'Family & Social', 'Other'];

function mondayOf(s) { const d = parseDay(s); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); return ymd(d); }
const firstOfMonth = (s) => `${s.slice(0, 7)}-01`;
function lastOfMonth(s) { const d = parseDay(firstOfMonth(s)); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
function shiftMonth(s, n) { const d = parseDay(firstOfMonth(s)); return ymd(new Date(d.getFullYear(), d.getMonth() + n, 1)); }

async function editEvent(item, reload) {
  const e = item?.edit || {};
  const r = await formDialog({
    title: item ? 'Edit event' : 'New event',
    fields: [
      { name: 'name', label: 'What', required: true, value: e.name },
      { name: 'date', label: 'Date', type: 'date', required: true, value: e.date || localToday(), hint: item && e.recurring !== 'none' ? 'For a repeating event, this is the first date.' : '' },
      { name: 'time', label: 'Time', type: 'time', value: e.time },
      { name: 'category', label: 'Kind', type: 'select', options: CATEGORIES, value: e.category || 'Other' },
      { name: 'recurring', label: 'Repeats', type: 'select', options: REPEATS, value: e.recurring || 'none' },
      { name: 'location', label: 'Where', value: e.location },
      { name: 'notes', label: 'Notes', type: 'textarea', value: e.notes },
    ],
    extraButtons: item ? [{ label: 'Delete', action: 'delete', kind: 'danger' }] : [],
  });
  if (!r) return;
  if (r.action === 'delete') {
    if (await confirmDialog(`Delete "${e.name}"?`)) await act(api(`/api/events/${item.id}`, { method: 'DELETE' }), reload);
    return;
  }
  await act(api(item ? `/api/events/${item.id}` : '/api/events', { method: item ? 'PATCH' : 'POST', body: r.values }), reload);
}

async function editAppointment(item, reload) {
  const a = item?.edit || {};
  const r = await formDialog({
    title: item ? 'Edit appointment' : 'New appointment',
    fields: [
      { name: 'name', label: 'What', required: true, value: a.name },
      { name: 'date', label: 'Date', type: 'date', required: true, value: a.date || localToday() },
      { name: 'time', label: 'Time', type: 'time', value: a.time },
      { name: 'provider', label: 'With', value: a.provider },
      { name: 'reason', label: 'Reason', type: 'textarea', value: a.reason },
      ...(item ? [{ name: 'status', label: 'Status', type: 'select', options: [['upcoming', 'Upcoming'], ['done', 'Done'], ['cancelled', 'Cancelled']], value: a.status }] : []),
    ],
    extraButtons: item ? [{ label: 'Delete', action: 'delete', kind: 'danger' }] : [],
  });
  if (!r) return;
  if (r.action === 'delete') {
    if (await confirmDialog(`Delete "${a.name}"?`)) await act(api(`/api/appointments/${item.id}`, { method: 'DELETE' }), reload);
    return;
  }
  await act(api(item ? `/api/appointments/${item.id}` : '/api/appointments', { method: item ? 'PATCH' : 'POST', body: r.values }), reload);
}

function chip(item, date, reload) {
  const label = item.type === 'bill'
    ? `${item.label} ${money(item.amount)}`
    : `${item.time ? `${fmtTime(item.time)} ` : ''}${item.label}`;
  const cls = `chip t-${item.type}${item.overdue ? ' overdue' : ''}${item.paid ? ' paid' : ''}`;
  const title = `${TYPE_TEXT[item.type]}: ${label}${item.overdue ? ' (overdue)' : ''}${item.paid ? ' (paid)' : ''}`;
  if (item.type === 'event') return h('button', { class: cls, title, onclick: () => editEvent(item, reload) }, label);
  if (item.type === 'appointment') return h('button', { class: cls, title, onclick: () => editAppointment(item, reload) }, label);
  if (item.type === 'bill') return h('a', { class: cls, title, href: `#/bills/${date.slice(0, 7)}` }, label);
  const tab = item.type === 'task' ? '/projects' : '';
  return h('a', { class: cls, title, href: item.home ? `#/homes/${encodeURIComponent(item.home)}${tab}` : '#/homes' }, label);
}

export async function renderCalendar(page, args, reload) {
  const view = VIEWS.some(([v]) => v === args[0]) ? args[0] : 'month';
  const today = localToday();
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(args[1] || '') ? args[1] : today;
  let from; let to; let title; let prev; let next;
  if (view === 'month') {
    from = mondayOf(firstOfMonth(anchor));
    to = addDays(mondayOf(lastOfMonth(anchor)), 6);
    title = parseDay(anchor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    prev = shiftMonth(anchor, -1);
    next = shiftMonth(anchor, 1);
  } else if (view === 'week') {
    from = mondayOf(anchor);
    to = addDays(from, 6);
    title = `Week of ${fmtDay(from, { month: 'long', day: 'numeric' })}`;
    prev = addDays(from, -7);
    next = addDays(from, 7);
  } else {
    from = anchor;
    to = anchor;
    title = fmtDay(anchor, { weekday: 'long', month: 'long', day: 'numeric' });
    prev = addDays(anchor, -1);
    next = addDays(anchor, 1);
  }
  const { days } = await api(`/api/calendar?from=${from}&to=${to}`);
  const href = (v, d) => `#/calendar/${v}/${d}`;

  const toolbar = h('div', { class: 'toolbar' },
    h('div', { class: 'seg' }, VIEWS.map(([v, label]) => h('a', { href: href(v, anchor), class: v === view ? 'on' : '' }, label))),
    h('div', { class: 'nav' },
      h('a', { class: 'btn ghost', href: href(view, prev), 'aria-label': 'Previous' }, '←'),
      h('h1', {}, title),
      h('a', { class: 'btn ghost', href: href(view, next), 'aria-label': 'Next' }, '→'),
      h('a', { class: 'btn ghost small', href: href(view, today) }, 'Today')),
    h('div', { class: 'nav' },
      h('button', { class: 'btn', onclick: () => editEvent(null, reload) }, '+ Event'),
      h('button', { class: 'btn', onclick: () => editAppointment(null, reload) }, '+ Appointment')));

  let body;
  if (view === 'month') {
    const month = anchor.slice(0, 7);
    body = h('div', { class: 'month' },
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => h('div', { class: 'dow' }, d)),
      days.map(({ date, items }) => h('div', { class: `cell${date.slice(0, 7) !== month ? ' other' : ''}${date === today ? ' today' : ''}` },
        h('a', { class: 'num', href: href('day', date), 'aria-label': fmtDay(date, { weekday: 'long', month: 'long', day: 'numeric' }) }, String(Number(date.slice(8)))),
        items.slice(0, 3).map((i) => chip(i, date, reload)),
        items.length > 3 ? h('a', { class: 'more', href: href('day', date) }, `+${items.length - 3} more`) : null,
        items.length ? h('a', { class: 'count', href: href('day', date) }, `${items.length} item${items.length === 1 ? '' : 's'}`) : null)));
  } else if (view === 'week') {
    body = h('div', { class: 'week' }, days.map(({ date, items }) => h('div', { class: `col${date === today ? ' today' : ''}` },
      h('h2', {}, h('a', { href: href('day', date) }, fmtDay(date))),
      items.length ? items.map((i) => chip(i, date, reload)) : h('small', { class: 'muted' }, 'Nothing'))));
  } else {
    const { date, items } = days[0];
    body = card(null, items.length
      ? h('ul', { class: 'rows' }, items.map((i) => h('li', {},
        h('span', { class: 'grow' }, chip(i, date, reload)),
        h('small', { class: 'muted' }, TYPE_TEXT[i.type]))))
      : empty('Nothing on this day.'));
  }
  page.replaceChildren(toolbar, body);
}
