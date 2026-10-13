import { api } from '../api.js';
import { h, card, empty, money, fmtDay, act, toast, formDialog, confirmDialog, localToday, dueText } from '../ui.js';

const REPEATS = [['none', 'Just once'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['annual', 'Every year']];
const REPEAT_TEXT = Object.fromEntries(REPEATS);

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function editBill(bill, reload) {
  const r = await formDialog({
    title: bill ? 'Edit bill' : 'New bill',
    fields: [
      { name: 'name', label: 'Bill', required: true, value: bill?.name },
      { name: 'amount', label: 'Amount', type: 'number', min: 0, step: '0.01', required: true, value: bill?.amount ?? '' },
      { name: 'due_date', label: 'Due date', type: 'date', required: true, value: bill?.due_date || localToday(), hint: 'For a repeating bill, the first due date. The rest follow from it.' },
      { name: 'recurring', label: 'Repeats', type: 'select', options: REPEATS, value: bill?.recurring || 'monthly' },
      { name: 'category', label: 'Category', value: bill?.category },
      { name: 'account', label: 'Paid from', value: bill?.account },
    ],
    extraButtons: bill ? [{ label: 'Delete', action: 'delete', kind: 'danger' }] : [],
  });
  if (!r) return;
  if (r.action === 'delete') {
    if (await confirmDialog(`Delete "${bill.name}"?`)) await act(api(`/api/bills/${bill.id}`, { method: 'DELETE' }), reload);
    return;
  }
  await act(api(bill ? `/api/bills/${bill.id}` : '/api/bills', { method: bill ? 'PATCH' : 'POST', body: r.values }), reload);
}

export async function renderBills(page, args, reload) {
  const month = /^\d{4}-\d{2}$/.test(args[0] || '') ? args[0] : localToday().slice(0, 7);
  const data = await api(`/api/bills?month=${month}`);
  const today = localToday();
  const [y, m] = month.split('-').map(Number);
  const title = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const status = (item) => {
    if (item.paid) return h('span', { class: 'pill paid' }, 'paid');
    if (item.date < today) return h('span', { class: 'pill overdue' }, 'overdue');
    if (item.date === today) return h('span', { class: 'pill today' }, 'due today');
    return h('span', { class: 'pill soon' }, `due ${fmtDay(item.date)}`);
  };
  const pay = (item) => act(api(`/api/bills/${item.id}/paid`, { method: 'POST', body: { for: item.date } }), () => { toast(`Marked ${item.name} paid.`); return reload(); });
  const unpay = (item) => act(api(`/api/bills/${item.id}/unpaid`, { method: 'POST', body: { for: item.date } }), reload);
  const nextText = (b) => {
    if (!b.due_date) return '—';
    if (!b.next_due) return 'Paid';
    return `${fmtDay(b.next_due)} (${dueText(b.days_until)})`;
  };

  page.replaceChildren(
    h('div', { class: 'toolbar' },
      h('div', { class: 'nav' },
        h('a', { class: 'btn ghost', href: `#/bills/${shiftMonth(month, -1)}`, 'aria-label': 'Previous month' }, '←'),
        h('h1', {}, title),
        h('a', { class: 'btn ghost', href: `#/bills/${shiftMonth(month, 1)}`, 'aria-label': 'Next month' }, '→')),
      h('button', { class: 'btn primary', onclick: () => editBill(null, reload) }, '+ Add bill')),
    h('div', { class: 'stats' },
      card('Still due this month', h('div', { class: 'stat' }, h('b', {}, money(data.due_total)))),
      card('Paid this month', h('div', { class: 'stat' }, h('b', {}, money(data.paid_total))))),
    h('div', { class: 'stack' },
      card('This month', data.items.length
        ? h('ul', { class: 'rows bill-rows' }, data.items.map((item) => h('li', {},
          h('span', { class: 'grow' }, h('b', {}, item.name), h('small', { class: 'muted' }, ` · ${fmtDay(item.date)}`)),
          h('span', {}, money(item.amount)),
          status(item),
          item.paid
            ? h('button', { class: 'btn ghost small', onclick: () => unpay(item) }, 'Undo')
            : h('button', { class: 'btn small', onclick: () => pay(item) }, 'Mark paid'))))
        : empty('No bills fall in this month.')),
      card('All bills', data.bills.length
        ? h('div', { class: 'scroll' }, h('table', { class: 'bill-table' },
          h('thead', {}, h('tr', {}, ['Bill', 'Amount', 'Repeats', 'Next due', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, data.bills.map((b) => h('tr', {},
            h('td', {}, b.name),
            h('td', {}, money(b.amount)),
            h('td', {}, REPEAT_TEXT[b.recurring] || ''),
            h('td', {}, nextText(b)),
            h('td', {}, h('button', { class: 'btn ghost small', onclick: () => editBill(b, reload) }, 'Edit')))))))
        : empty('No bills yet. Add the ones you pay so Home Base can remind you.'))));
}
