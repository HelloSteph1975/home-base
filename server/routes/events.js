'use strict';
const { HttpError } = require('../errors');
const { encId, safeName } = require('../notes');
const { reply } = require('../http');
const { EVENT_CATEGORIES } = require('../constants');
const { RECURRING } = require('../recurrence');
const c = require('./common');

module.exports = function registerEvents(app, { notes, index }) {
  app.route('GET', '/api/events', () => index.all('SELECT * FROM events ORDER BY date, time')
    .map(({ file_path: rel, ...e }) => ({ id: encId(rel), ...e })));

  app.route('POST', '/api/events', ({ body }) => {
    const name = c.text(body.name, 'What', { required: true });
    const date = c.date(body.date, 'Date', { required: true });
    const category = c.oneOf(body.category, EVENT_CATEGORIES, 'Kind') ?? 'Other';
    const rel = `Events/${category}/${safeName(`${date} ${name}`)}.md`;
    notes.create(rel, {
      type: 'event',
      name,
      date,
      time: c.time(body.time, 'Time') ?? '',
      category,
      location: c.text(body.location, 'Where') ?? '',
      notes: c.text(body.notes, 'Notes', { max: 1000 }) ?? '',
      recurring: c.oneOf(body.recurring, RECURRING, 'Repeats') ?? 'none',
    }, '');
    index.refresh(rel);
    return reply(201, { id: encId(rel) });
  });

  app.route('PATCH', '/api/events/:id', ({ params, body }) => {
    const rel = c.noteRel(params.id, 'event', notes);
    const note = notes.read(rel);
    const changes = c.defined({
      name: c.text(body.name, 'What'),
      date: c.date(body.date, 'Date'),
      time: c.time(body.time, 'Time'),
      category: c.oneOf(body.category, EVENT_CATEGORIES, 'Kind'),
      location: c.text(body.location, 'Where'),
      notes: c.text(body.notes, 'Notes', { max: 1000 }),
      recurring: c.oneOf(body.recurring, RECURRING, 'Repeats'),
    });
    if (changes.name === '') throw new HttpError(400, 'What is required.');
    if (changes.date === '') throw new HttpError(400, 'Date is required.');
    notes.write(rel, { ...note.data, ...changes }, note.body, note);
    index.refresh(rel);
    return { ok: true };
  });

  app.route('DELETE', '/api/events/:id', ({ params }) => {
    const rel = c.noteRel(params.id, 'event', notes);
    notes.trash(rel);
    index.refresh(rel);
    return { ok: true };
  });
};
