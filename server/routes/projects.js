'use strict';
const { HttpError } = require('../errors');
const { encId, safeName } = require('../notes');
const { reply } = require('../http');
const { PROJECT_STATUSES, TASK_STATUSES } = require('../constants');
const c = require('./common');

const byDueThenName = (a, b) => (a.status === 'done') - (b.status === 'done')
  || (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.name.localeCompare(b.name);

module.exports = function registerProjects(app, { notes, index, homesInfo, today }) {
  const folderOf = (rel) => rel.split('/')[1];

  app.route('GET', '/api/projects', ({ query }) => {
    const info = homesInfo();
    const tasks = index.all('SELECT project_folder, status FROM project_tasks');
    const home = query.get('home');
    return index.all('SELECT * FROM projects')
      .map((p) => {
        const mine = tasks.filter((t) => t.project_folder === p.folder);
        return {
          id: encId(p.file_path), folder: p.folder, name: p.name, status: p.status, start_date: p.start_date,
          due_date: p.due_date, notes: p.notes, home: info.homeOf(p.home),
          task_count: mine.length, open_tasks: mine.filter((t) => t.status !== 'done').length,
        };
      })
      .filter((p) => !home || p.home === home)
      .sort(byDueThenName);
  });

  app.route('POST', '/api/projects', ({ body }) => {
    const name = c.text(body.name, 'Name', { required: true });
    const home = c.homeId(body.home, homesInfo) || '';
    const info = homesInfo();
    const target = c.uniqueInHome(index.all('SELECT name, home FROM projects'), name, home, info, 'project');
    const folder = c.freeName((n) => notes.exists(`Projects/${n}`), safeName(name), info.nameOf(target));
    const rel = `Projects/${folder}/Project Info.md`;
    notes.create(rel, {
      type: 'project',
      name,
      status: 'active',
      start_date: c.date(body.start_date, 'Start date') || today(),
      due_date: c.date(body.due_date, 'Due date') || '',
      notes: c.text(body.notes, 'Notes', { max: 1000 }) ?? '',
      home,
    }, '');
    index.refresh(rel);
    return reply(201, { id: encId(rel) });
  });

  app.route('PATCH', '/api/projects/:id', ({ params, body }) => {
    const rel = c.noteRel(params.id, 'project', notes);
    const note = notes.read(rel);
    const changes = c.defined({
      name: c.text(body.name, 'Name'),
      status: c.oneOf(body.status, PROJECT_STATUSES, 'Status'),
      start_date: c.date(body.start_date, 'Start date'),
      due_date: c.date(body.due_date, 'Due date'),
      notes: c.text(body.notes, 'Notes', { max: 1000 }),
      home: c.homeId(body.home, homesInfo),
    });
    if (changes.name === '') throw new HttpError(400, 'Name is required.');
    notes.write(rel, { ...note.data, ...changes }, note.body, note);
    index.refresh(rel);
    return { ok: true };
  });

  app.route('DELETE', '/api/projects/:id', ({ params }) => {
    const rel = c.noteRel(params.id, 'project', notes);
    const folderRel = `Projects/${folderOf(rel)}`;
    notes.trash(folderRel);
    index.removePrefix(`${folderRel}/`);
    return { ok: true };
  });

  app.route('GET', '/api/projects/:id/tasks', ({ params }) => {
    const rel = c.noteRel(params.id, 'project', notes);
    return index.all('SELECT * FROM project_tasks WHERE project_folder = ?', folderOf(rel))
      .map((t) => ({ id: encId(t.file_path), name: t.name, due_date: t.due_date, status: t.status, notes: t.notes }))
      .sort(byDueThenName);
  });

  app.route('POST', '/api/projects/:id/tasks', ({ params, body }) => {
    const rel = c.noteRel(params.id, 'project', notes);
    const project = notes.read(rel);
    const name = c.text(body.name, 'Task', { required: true });
    const taskRel = `Projects/${folderOf(rel)}/Tasks/${safeName(name)}.md`;
    notes.create(taskRel, {
      type: 'project_task',
      project: project.data.name || folderOf(rel),
      name,
      due_date: c.date(body.due_date, 'Due date') || '',
      status: 'todo',
      notes: c.text(body.notes, 'Notes', { max: 1000 }) ?? '',
    }, '');
    index.refresh(taskRel);
    return reply(201, { id: encId(taskRel) });
  });

  app.route('PATCH', '/api/tasks/:id', ({ params, body }) => {
    const rel = c.noteRel(params.id, 'task', notes);
    const note = notes.read(rel);
    const changes = c.defined({
      name: c.text(body.name, 'Task'),
      due_date: c.date(body.due_date, 'Due date'),
      status: c.oneOf(body.status, TASK_STATUSES, 'Status'),
      notes: c.text(body.notes, 'Notes', { max: 1000 }),
    });
    if (changes.name === '') throw new HttpError(400, 'Task is required.');
    notes.write(rel, { ...note.data, ...changes }, note.body, note);
    index.refresh(rel);
    return { ok: true };
  });

  app.route('DELETE', '/api/tasks/:id', ({ params }) => {
    const rel = c.noteRel(params.id, 'task', notes);
    notes.trash(rel);
    index.refresh(rel);
    return { ok: true };
  });
};
