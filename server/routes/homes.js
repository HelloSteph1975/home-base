'use strict';
const { HttpError } = require('../errors');
const { safeName } = require('../notes');
const { reply } = require('../http');
const { HOME_KINDS, HOME_COLORS } = require('../constants');
const { homeSummaries } = require('../logic/today');
const c = require('./common');

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

module.exports = function registerHomes(app, { notes, index, homesInfo, settings, today }) {
  // A home's id is its note's file name, exactly as it is on disk (a home made
  // in Obsidian may have a name the app wouldn't have chosen).
  function relOf(id) {
    const rel = `Homes/${id}.md`;
    if (!id || /[\\/]/.test(id) || id === '.' || id === '..' || !homesInfo().exists(id) || !notes.exists(rel)) {
      throw new HttpError(404, 'That home no longer exists. Reload the page.');
    }
    return rel;
  }

  app.route('GET', '/api/homes', () => homeSummaries(index, homesInfo(), today()));

  app.route('POST', '/api/homes', ({ body }) => {
    const name = c.text(body.name, 'Name', { required: true, max: 80 });
    const id = safeName(name);
    const rel = `Homes/${id}.md`;
    const count = homesInfo().homes.length;
    notes.create(rel, {
      type: 'home',
      name,
      kind: c.oneOf(body.kind, HOME_KINDS, 'Kind') ?? 'home',
      color: c.oneOf(body.color, HOME_COLORS, 'Color') ?? HOME_COLORS[count % HOME_COLORS.length],
    }, '\n');
    index.refresh(rel);
    if (!homesInfo().exists(settings.read().default_home)) settings.write({ default_home: id });
    return reply(201, { id });
  });

  app.route('PATCH', '/api/homes/:id', ({ params, body }) => {
    const rel = relOf(params.id);
    const note = notes.read(rel);
    const changes = c.defined({
      name: c.text(body.name, 'Name', { max: 80 }),
      kind: c.oneOf(body.kind, HOME_KINDS, 'Kind'),
      color: c.oneOf(body.color, HOME_COLORS, 'Color'),
    });
    if (changes.name === '') throw new HttpError(400, 'Name is required.');
    const text = c.text(body.notes, 'Notes', { max: 20000, multiline: true });
    notes.write(rel, { ...note.data, ...changes }, text === undefined ? note.body : `\n${text}\n`, note);
    index.refresh(rel);
    return { ok: true };
  });

  app.route('DELETE', '/api/homes/:id', ({ params }) => {
    const rel = relOf(params.id);
    const info = homesInfo();
    const mine = (rows) => rows.filter((r) => info.homeOf(r.home) === params.id).length;
    const chores = mine(index.all('SELECT home FROM chores'));
    const projects = mine(index.all('SELECT home FROM projects'));
    if (chores || projects) {
      throw new HttpError(409, `Move or delete this home's ${plural(chores, 'chore')} and ${plural(projects, 'project')} first.`);
    }
    notes.trash(rel);
    index.refresh(rel);
    if (settings.read().default_home === params.id) settings.write({ default_home: homesInfo().homes[0]?.id || '' });
    return { ok: true };
  });
};
