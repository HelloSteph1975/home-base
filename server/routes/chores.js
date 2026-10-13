'use strict';
const { HttpError } = require('../errors');
const { encId, safeName } = require('../notes');
const { reply } = require('../http');
const { FREQUENCIES } = require('../constants');
const { withDue } = require('../logic/chores');
const c = require('./common');

const FREQ_LIST = Object.keys(FREQUENCIES);

module.exports = function registerChores(app, { notes, index, homesInfo, today }) {
  app.route('GET', '/api/chores', ({ query }) => {
    const info = homesInfo();
    const home = query.get('home');
    return index.all('SELECT * FROM chores')
      .map((row) => {
        const { file_path: rel, ...rest } = withDue(row, today());
        return { ...rest, id: encId(rel), home: info.homeOf(row.home) };
      })
      .filter((row) => !home || row.home === home)
      .sort((a, b) => a.days_until - b.days_until || a.name.localeCompare(b.name));
  });

  app.route('POST', '/api/chores', ({ body }) => {
    const name = c.text(body.name, 'Name', { required: true });
    const frequency = c.oneOf(body.frequency ?? 'weekly', FREQ_LIST, 'How often');
    const { folder, days } = FREQUENCIES[frequency];
    const home = c.homeId(body.home, homesInfo) || '';
    const info = homesInfo();
    const target = c.uniqueInHome(index.all('SELECT name, home FROM chores'), name, home, info, 'chore');
    const file = c.freeName((n) => notes.exists(`Home Maintenance/${folder}/${n}.md`), safeName(name), info.nameOf(target));
    const rel = `Home Maintenance/${folder}/${file}.md`;
    notes.create(rel, {
      type: 'chore',
      name,
      frequency,
      freq_days: c.positiveInt(body.freq_days, 'Every how many days') ?? days,
      last_done: '',
      home,
      notes: c.text(body.notes, 'Notes', { max: 1000 }) ?? '',
    }, '');
    index.refresh(rel);
    return reply(201, { id: encId(rel) });
  });

  app.route('PATCH', '/api/chores/:id', ({ params, body }) => {
    const rel = c.noteRel(params.id, 'chore', notes);
    const note = notes.read(rel);
    const changes = c.defined({
      name: c.text(body.name, 'Name'),
      frequency: c.oneOf(body.frequency, FREQ_LIST, 'How often'),
      freq_days: c.positiveInt(body.freq_days, 'Every how many days'),
      home: c.homeId(body.home, homesInfo),
      notes: c.text(body.notes, 'Notes', { max: 1000 }),
      last_done: c.date(body.last_done, 'Last done'),
    });
    if (changes.name === '') throw new HttpError(400, 'Name is required.');
    if (changes.frequency && changes.freq_days === undefined) changes.freq_days = FREQUENCIES[changes.frequency].days;
    notes.write(rel, { ...note.data, ...changes }, note.body, note);
    index.refresh(rel);
    return { ok: true };
  });

  app.route('POST', '/api/chores/:id/done', ({ params, body }) => {
    const rel = c.noteRel(params.id, 'chore', notes);
    const day = c.date(body.date, 'Date') || today();
    if (day > today()) throw new HttpError(400, "A chore can't be done in the future.");
    const note = notes.read(rel);
    notes.write(rel, { ...note.data, last_done: day }, note.body, note);
    index.refresh(rel);
    return { ok: true };
  });

  app.route('DELETE', '/api/chores/:id', ({ params }) => {
    const rel = c.noteRel(params.id, 'chore', notes);
    notes.trash(rel);
    index.refresh(rel);
    return { ok: true };
  });
};
