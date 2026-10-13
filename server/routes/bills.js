'use strict';
const { HttpError } = require('../errors');
const { encId, safeName } = require('../notes');
const { reply } = require('../http');
const { RECURRING, occurrencesBetween } = require('../recurrence');
const { daysBetween } = require('../dates');
const { loadBills, isPaid, nextDue, monthView, addPayment, removePayment } = require('../logic/bills');
const c = require('./common');

module.exports = function registerBills(app, { notes, index, today }) {
  const billFor = (rel) => loadBills(index).find((b) => b.file_path === rel);

  app.route('GET', '/api/bills', ({ query }) => {
    const month = query.get('month') || today().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, 'month must look like 2026-10.');
    const bills = loadBills(index);
    const now = today();
    return {
      month,
      ...monthView(bills, month),
      bills: bills.map((b) => {
        const next = nextDue(b);
        return {
          id: encId(b.file_path), name: b.name, amount: b.amount, due_date: b.due_date, recurring: b.recurring,
          category: b.category, account: b.account, next_due: next || '', days_until: next ? daysBetween(now, next) : null,
        };
      }),
    };
  });

  app.route('POST', '/api/bills', ({ body }) => {
    const name = c.text(body.name, 'Name', { required: true });
    const rel = `Bills/${safeName(name)}.md`;
    notes.create(rel, {
      type: 'bill',
      name,
      amount: c.money(body.amount, 'Amount', { required: true }),
      due_date: c.date(body.due_date, 'Due date', { required: true }),
      recurring: c.oneOf(body.recurring, RECURRING, 'Repeats') ?? 'none',
      category: c.text(body.category, 'Category') ?? '',
      account: c.text(body.account, 'Paid from') ?? '',
      status: 'due',
    }, '');
    index.refresh(rel);
    return reply(201, { id: encId(rel) });
  });

  app.route('PATCH', '/api/bills/:id', ({ params, body }) => {
    const rel = c.noteRel(params.id, 'bill', notes);
    const note = notes.read(rel);
    const changes = c.defined({
      name: c.text(body.name, 'Name'),
      amount: c.money(body.amount, 'Amount'),
      due_date: c.date(body.due_date, 'Due date'),
      recurring: c.oneOf(body.recurring, RECURRING, 'Repeats'),
      category: c.text(body.category, 'Category'),
      account: c.text(body.account, 'Paid from'),
    });
    if (changes.name === '') throw new HttpError(400, 'Name is required.');
    if (changes.due_date === '') throw new HttpError(400, 'Due date is required.');
    notes.write(rel, { ...note.data, ...changes }, note.body, note);
    index.refresh(rel);
    return { ok: true };
  });

  app.route('POST', '/api/bills/:id/paid', ({ params, body }) => {
    const rel = c.noteRel(params.id, 'bill', notes);
    const bill = billFor(rel);
    if (!bill) throw new HttpError(409, `${rel} has a problem; see Settings → Needs attention.`);
    if (!bill.due_date) throw new HttpError(400, 'Give this bill a due date first.');
    const forDate = c.date(body.for, 'Which due date') || nextDue(bill);
    if (!forDate) throw new HttpError(409, `${bill.name} is already paid.`);
    if (!occurrencesBetween(bill.due_date, bill.recurring, forDate, forDate).length) throw new HttpError(400, `${bill.name} isn't due on ${forDate}.`);
    if (isPaid(bill, forDate)) throw new HttpError(409, `${bill.name} is already marked paid for ${forDate}.`);
    const note = notes.read(rel);
    const payment = { paid_on: c.date(body.paid_on, 'Paid on') || today(), amount: c.money(body.amount, 'Amount') ?? bill.amount, for_date: forDate };
    const data = bill.recurring === 'none' ? { ...note.data, status: 'paid' } : note.data;
    notes.write(rel, data, addPayment(note.body, payment), note);
    index.refresh(rel);
    return { ok: true, for: forDate };
  });

  app.route('POST', '/api/bills/:id/unpaid', ({ params, body }) => {
    const rel = c.noteRel(params.id, 'bill', notes);
    const forDate = c.date(body.for, 'Which due date', { required: true });
    const bill = billFor(rel);
    const note = notes.read(rel);
    const removed = removePayment(note.body, forDate);
    const oneTimePaid = bill && bill.recurring === 'none' && bill.status === 'paid';
    if (!removed.count && !oneTimePaid) {
      if (bill && bill.paid_through && forDate <= bill.paid_through) {
        throw new HttpError(409, `Everything up to ${bill.paid_through} was marked paid when Home Base was updated. Change paid_through in the note to undo that.`);
      }
      throw new HttpError(404, 'No payment is recorded for that date.');
    }
    const data = bill && bill.recurring === 'none' ? { ...note.data, status: 'due' } : note.data;
    notes.write(rel, data, removed.body, note);
    index.refresh(rel);
    return { ok: true };
  });

  app.route('DELETE', '/api/bills/:id', ({ params }) => {
    const rel = c.noteRel(params.id, 'bill', notes);
    notes.trash(rel);
    index.refresh(rel);
    return { ok: true };
  });
};
