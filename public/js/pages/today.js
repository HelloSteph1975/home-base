import { api } from '../api.js';
import { h, card, empty, money, fmtDay, fmtTime, duePill, act, toast } from '../ui.js';

const TYPE_TEXT = { event: 'Event', appointment: 'Appointment', task: 'Project task' };

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export async function renderToday(page, _args, reload) {
  const t = await api('/api/today');
  const done = (c) => act(api(`/api/chores/${c.id}/done`, { method: 'POST' }), () => { toast(`Marked "${c.name}" done.`); return reload(); });
  const paid = (b) => act(api(`/api/bills/${b.id}/paid`, { method: 'POST', body: { for: b.next_due } }), () => { toast(`Marked ${b.name} paid.`); return reload(); });

  const chores = t.chores.length
    ? h('ul', { class: 'rows' }, t.chores.map((c) => h('li', {},
      h('span', { class: 'grow' }, c.name, c.home_name ? h('small', { class: 'muted' }, ` · ${c.home_name}`) : null),
      duePill(c.days_until),
      h('button', { class: 'btn small', onclick: () => done(c) }, 'Done'))))
    : empty('Nothing due. Nice work.');

  const bills = t.bills.length
    ? h('ul', { class: 'rows' }, t.bills.map((b) => h('li', {},
      h('span', { class: 'grow' }, b.name, h('small', { class: 'muted' }, ` · ${money(b.amount)}`)),
      duePill(b.days_until),
      h('button', { class: 'btn small', onclick: () => paid(b) }, 'Paid'))))
    : empty('No bills due in the next week.');

  const comingUp = t.coming_up.length
    ? h('ul', { class: 'rows' }, t.coming_up.map((i) => h('li', {},
      h('span', { class: 'grow' }, i.label, h('small', { class: 'muted' }, ` · ${TYPE_TEXT[i.type]}${i.meta ? `, ${i.meta}` : ''}`)),
      h('small', { class: 'muted' }, `${fmtDay(i.date)}${i.time ? `, ${fmtTime(i.time)}` : ''}`))))
    : empty('Nothing on the calendar this week.');

  const homes = t.homes.length
    ? h('ul', { class: 'rows' }, t.homes.map((x) => h('li', {},
      h('span', { class: `dot c-${x.color}` }),
      h('a', { class: 'grow', href: `#/homes/${encodeURIComponent(x.id)}` }, x.name),
      h('small', { class: 'muted' }, x.due_count ? `${x.due_count} due` : 'All caught up',
        x.active_projects ? ` · ${x.active_projects} project${x.active_projects === 1 ? '' : 's'}` : ''))))
    : h('p', {}, 'No homes yet. ', h('a', { href: '#/homes' }, 'Add your first home'), '.');

  page.replaceChildren(
    h('div', { class: 'hello' },
      h('h1', {}, `${greeting()}${t.name ? `, ${t.name}` : ''}`),
      h('p', { class: 'muted' }, fmtDay(t.date, { weekday: 'long', month: 'long', day: 'numeric' }))),
    h('div', { class: 'grid2' },
      card('Chores due', chores),
      card('Bills', bills),
      card('Coming up', comingUp),
      card('Homes', homes)));
}
