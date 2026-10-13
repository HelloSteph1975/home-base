'use strict';
// Bills: money parsing and the payment lines kept in each bill note's body.
// A payment line looks like "- 2026-10-13: paid 142.00 for 2026-10-15".
const { isDate } = require('../dates');
const { nthOccurrence, occurrencesBetween } = require('../recurrence');
const { encId } = require('../notes');

const PAYMENT_LINE = /^- (\d{4}-\d{2}-\d{2}): paid (\d+(?:\.\d{1,2})?) for (\d{4}-\d{2}-\d{2})\s*$/;

function parseMoney(v) {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

function paymentsFromBody(body) {
  return String(body || '')
    .split(/\r?\n/)
    .map((line) => line.match(PAYMENT_LINE))
    .filter((m) => m && isDate(m[1]) && isDate(m[3]))
    .map((m) => ({ paid_on: m[1], amount: Number(m[2]), for_date: m[3] }));
}

const paymentLine = (p) => `- ${p.paid_on}: paid ${Number(p.amount).toFixed(2)} for ${p.for_date}`;

function addPayment(body, payment) {
  const text = String(body || '').replace(/\s*$/, '\n');
  const heading = /^## Payments\s*$/m.test(text) ? '' : '\n## Payments\n';
  return `${text}${heading}${paymentLine(payment)}\n`;
}

function removePayment(body, forDate) {
  let count = 0;
  const kept = String(body || '').split('\n').filter((line) => {
    const m = line.replace(/\r$/, '').match(PAYMENT_LINE);
    if (m && m[3] === forDate) { count += 1; return false; }
    return true;
  });
  return { body: kept.join('\n'), count };
}

function loadBills(index) {
  const byRel = new Map();
  for (const p of index.all('SELECT * FROM bill_payments')) {
    if (!byRel.has(p.file_path)) byRel.set(p.file_path, []);
    byRel.get(p.file_path).push({ paid_on: p.paid_on, amount: p.amount, for_date: p.for_date });
  }
  return index.all('SELECT * FROM bills ORDER BY name COLLATE NOCASE')
    .map((b) => ({ ...b, payments: byRel.get(b.file_path) || [] }));
}

// Paid by a payment line, by paid_through (set when Home Base 1 notes were
// moved over), or, for a one-time bill, by Home Base 1's status field.
function isPaid(bill, date) {
  return bill.payments.some((p) => p.for_date === date)
    || Boolean(bill.paid_through && date <= bill.paid_through)
    || (bill.recurring === 'none' && bill.status === 'paid');
}

function nextDue(bill) {
  if (!isDate(bill.due_date)) return null;
  for (let k = 0; k < 6000; k += 1) {
    const d = nthOccurrence(bill.due_date, bill.recurring, k);
    if (d === null) return null;
    if (!isPaid(bill, d)) return d;
  }
  return null;
}

function monthView(bills, month) {
  const from = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const to = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const items = [];
  for (const bill of bills) {
    for (const date of occurrencesBetween(bill.due_date, bill.recurring, from, to)) {
      const paid = isPaid(bill, date);
      const payment = bill.payments.find((p) => p.for_date === date);
      items.push({ id: encId(bill.file_path), name: bill.name, date, paid, amount: payment ? payment.amount : bill.amount });
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const sum = (list) => Math.round(list.reduce((n, i) => n + i.amount, 0) * 100) / 100;
  return { due_total: sum(items.filter((i) => !i.paid)), paid_total: sum(items.filter((i) => i.paid)), items };
}

module.exports = { parseMoney, paymentsFromBody, paymentLine, addPayment, removePayment, loadBills, isPaid, nextDue, monthView };
