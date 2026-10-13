'use strict';
const { HttpError } = require('../errors');
const { encId, safeName } = require('../notes');
const { reply } = require('../http');
const { APPOINTMENT_STATUSES } = require('../constants');
const c = require('./common');

module.exports = function registerAppointments(app, { notes, index }) {
  app.route('GET', '/api/appointments', () => index.all('SELECT * FROM appointments ORDER BY date, time')
    .map(({ file_path: rel, ...a }) => ({ id: encId(rel), ...a })));

  app.route('POST', '/api/appointments', ({ body }) => {
    const name = c.text(body.name, 'What', { required: true });
    const date = c.date(body.date, 'Date', { required: true });
    const rel = `Appointments/${safeName(`${date} ${name}`)}.md`;
    notes.create(rel, {
      type: 'appointment',
      name,
      date,
      time: c.time(body.time, 'Time') ?? '',
      provider: c.text(body.provider, 'With') ?? '',
      reason: c.text(body.reason, 'Reason', { max: 1000 }) ?? '',
      status: 'upcoming',
    }, '');
    index.refresh(rel);
    return reply(201, { id: encId(rel) });
  });

  app.route('PATCH', '/api/appointments/:id', ({ params, body }) => {
    const rel = c.noteRel(params.id, 'appointment', notes);
    const note = notes.read(rel);
    const changes = c.defined({
      name: c.text(body.name, 'What'),
      date: c.date(body.date, 'Date'),
      time: c.time(body.time, 'Time'),
      provider: c.text(body.provider, 'With'),
      reason: c.text(body.reason, 'Reason', { max: 1000 }),
      status: c.oneOf(body.status, APPOINTMENT_STATUSES, 'Status'),
    });
    if (changes.name === '') throw new HttpError(400, 'What is required.');
    if (changes.date === '') throw new HttpError(400, 'Date is required.');
    notes.write(rel, { ...note.data, ...changes }, note.body, note);
    index.refresh(rel);
    return { ok: true };
  });

  app.route('DELETE', '/api/appointments/:id', ({ params }) => {
    const rel = c.noteRel(params.id, 'appointment', notes);
    notes.trash(rel);
    index.refresh(rel);
    return { ok: true };
  });
};
