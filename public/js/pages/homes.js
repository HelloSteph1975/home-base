import { api } from '../api.js';
import { h, card, empty, duePill, act, toast, formDialog, confirmDialog, fmtDay } from '../ui.js';

const KINDS = [['home', 'Home'], ['cabin', 'Cabin'], ['land', 'Land'], ['family', 'Family home'], ['rental', 'Rental'], ['other', 'Other']];
const COLORS = ['terracotta', 'sage', 'plum', 'ochre', 'slate', 'rose'].map((c) => [c, c[0].toUpperCase() + c.slice(1)]);
const FREQS = [['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['seasonal', 'Every season']];
const FREQ_TEXT = Object.fromEntries(FREQS);
const STATUSES = [['active', 'Active'], ['paused', 'Paused'], ['done', 'Done']];
const homeHref = (id, tab) => `#/homes/${encodeURIComponent(id)}${tab ? `/${tab}` : ''}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

async function editHome(home, homes, reload) {
  const r = await formDialog({
    title: home ? 'Edit home' : 'Add a home',
    fields: [
      { name: 'name', label: 'Name', required: true, value: home?.name },
      { name: 'kind', label: 'Kind of place', type: 'select', options: KINDS, value: home?.kind || 'home' },
      { name: 'color', label: 'Color', type: 'select', options: COLORS, value: home?.color || COLORS[homes.length % COLORS.length][0] },
    ],
    extraButtons: home ? [{ label: 'Delete home', action: 'delete', kind: 'danger' }] : [],
  });
  if (!r) return;
  if (r.action === 'delete') {
    if (!(await confirmDialog(`Delete ${home.name}?`))) return;
    await act(api(`/api/homes/${encodeURIComponent(home.id)}`, { method: 'DELETE' }), () => { toast(`${home.name} moved to _Trash.`); location.hash = '#/homes'; });
    return;
  }
  if (home) { await act(api(`/api/homes/${encodeURIComponent(home.id)}`, { method: 'PATCH', body: r.values }), reload); return; }
  try {
    const made = await api('/api/homes', { method: 'POST', body: r.values });
    location.hash = homeHref(made.id);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function editChore(chore, home, homes, reload) {
  const r = await formDialog({
    title: chore ? 'Edit chore' : `New chore for ${home.name}`,
    fields: [
      { name: 'name', label: 'Chore', required: true, value: chore?.name },
      { name: 'frequency', label: 'How often', type: 'select', options: FREQS, value: chore?.frequency || 'weekly' },
      { name: 'freq_days', label: 'Every how many days', type: 'number', min: 1, value: chore?.freq_days ?? '', hint: 'Leave empty for the usual: 1, 7, 30 or 90 days.' },
      { name: 'home', label: 'Home', type: 'select', options: homes.map((x) => [x.id, x.name]), value: chore?.home || home.id },
      { name: 'notes', label: 'Notes', type: 'textarea', value: chore?.notes },
    ],
    extraButtons: chore ? [{ label: 'Delete', action: 'delete', kind: 'danger' }] : [],
  });
  if (!r) return;
  if (r.action === 'delete') {
    if (await confirmDialog(`Delete "${chore.name}"?`)) await act(api(`/api/chores/${chore.id}`, { method: 'DELETE' }), reload);
    return;
  }
  const body = { ...r.values };
  const changedFrequency = chore && body.frequency !== chore.frequency && Number(body.freq_days) === chore.freq_days;
  if (body.freq_days === '' || changedFrequency) delete body.freq_days;
  else body.freq_days = Number(body.freq_days);
  await act(api(chore ? `/api/chores/${chore.id}` : '/api/chores', { method: chore ? 'PATCH' : 'POST', body }), reload);
}

async function editProject(project, home, homes, reload) {
  const r = await formDialog({
    title: project ? 'Edit project' : `New project for ${home.name}`,
    fields: [
      { name: 'name', label: 'Project', required: true, value: project?.name },
      ...(project ? [{ name: 'status', label: 'Status', type: 'select', options: STATUSES, value: project.status }] : []),
      { name: 'due_date', label: 'Finish by', type: 'date', value: project?.due_date },
      { name: 'home', label: 'Home', type: 'select', options: homes.map((x) => [x.id, x.name]), value: project?.home || home.id },
      { name: 'notes', label: 'Notes', type: 'textarea', value: project?.notes },
    ],
    extraButtons: project ? [{ label: 'Delete', action: 'delete', kind: 'danger' }] : [],
  });
  if (!r) return;
  if (r.action === 'delete') {
    if (await confirmDialog(`Delete "${project.name}" and its tasks?`)) await act(api(`/api/projects/${project.id}`, { method: 'DELETE' }), reload);
    return;
  }
  await act(api(project ? `/api/projects/${project.id}` : '/api/projects', { method: project ? 'PATCH' : 'POST', body: r.values }), reload);
}

async function choresTab(home, homes, reload) {
  const chores = await api(`/api/chores?home=${encodeURIComponent(home.id)}`);
  const done = (c) => act(api(`/api/chores/${c.id}/done`, { method: 'POST' }), () => { toast(`Marked "${c.name}" done.`); return reload(); });
  return h('div', {},
    chores.length
      ? h('ul', { class: 'rows' }, chores.map((c) => h('li', {},
        h('button', { class: 'linkish grow', onclick: () => editChore(c, home, homes, reload) }, c.name, h('small', { class: 'muted' }, ` · ${FREQ_TEXT[c.frequency] || ''}`)),
        duePill(c.days_until),
        h('button', { class: 'btn small', onclick: () => done(c) }, 'Done'))))
      : empty('No chores here yet.'),
    h('p', {}, h('button', { class: 'btn ghost', onclick: () => editChore(null, home, homes, reload) }, '+ Add chore')));
}

async function projectsTab(home, homes, reload) {
  const projects = await api(`/api/projects?home=${encodeURIComponent(home.id)}`);
  const blocks = await Promise.all(projects.map(async (p) => {
    const tasks = await api(`/api/projects/${p.id}/tasks`);
    const name = h('input', { type: 'text', placeholder: 'Add a task', 'aria-label': `New task for ${p.name}` });
    const due = h('input', { type: 'date', 'aria-label': `Due date for the new task in ${p.name}` });
    const addTask = (e) => {
      e.preventDefault();
      if (!name.value.trim()) return;
      act(api(`/api/projects/${p.id}/tasks`, { method: 'POST', body: { name: name.value.trim(), due_date: due.value || undefined } }), reload);
    };
    return h('details', { class: 'project', open: p.status !== 'done' },
      h('summary', {},
        h('b', { class: 'grow' }, p.name),
        h('span', { class: `pill ${p.status === 'done' ? 'paid' : ''}` }, STATUSES.find(([v]) => v === p.status)?.[1] || p.status),
        p.due_date ? h('small', { class: 'muted' }, `by ${fmtDay(p.due_date)}`) : null,
        h('button', { class: 'btn ghost small', onclick: (e) => { e.preventDefault(); editProject(p, home, homes, reload); } }, 'Edit')),
      p.notes ? h('p', { class: 'muted' }, p.notes) : null,
      tasks.length
        ? h('ul', { class: 'rows' }, tasks.map((t) => h('li', { class: `task${t.status === 'done' ? ' done' : ''}` },
          h('input', { type: 'checkbox', checked: t.status === 'done', 'aria-label': `Done: ${t.name}`,
            onchange: (e) => act(api(`/api/tasks/${t.id}`, { method: 'PATCH', body: { status: e.target.checked ? 'done' : 'todo' } }), reload) }),
          h('span', { class: 'grow' }, t.name),
          t.due_date ? h('small', { class: 'muted' }, fmtDay(t.due_date)) : null,
          h('button', { class: 'btn ghost small', 'aria-label': `Delete ${t.name}`, onclick: async () => {
            if (await confirmDialog(`Delete "${t.name}"?`)) await act(api(`/api/tasks/${t.id}`, { method: 'DELETE' }), reload);
          } }, '✕'))))
        : empty('No tasks yet.'),
      h('form', { class: 'inline-form', onsubmit: addTask }, name, due, h('button', { class: 'btn small', type: 'submit' }, 'Add')));
  }));
  return h('div', {},
    projects.length ? blocks : empty('No projects here yet.'),
    h('p', {}, h('button', { class: 'btn ghost', onclick: () => editProject(null, home, homes, reload) }, '+ New project')));
}

function notesTab(home, reload) {
  const area = h('textarea', { rows: 12, 'aria-label': `Notes for ${home.name}` });
  area.value = home.notes || '';
  const save = (e) => {
    e.preventDefault();
    act(api(`/api/homes/${encodeURIComponent(home.id)}`, { method: 'PATCH', body: { notes: area.value } }), () => { toast('Notes saved.'); return reload(); });
  };
  return h('form', { class: 'stack', onsubmit: save },
    h('p', { class: 'muted' }, "Gate codes, who to call, where the water shut-off is. It's saved in this home's note, so you can edit it in Obsidian too."),
    area,
    h('div', {}, h('button', { class: 'btn primary', type: 'submit' }, 'Save notes')));
}

async function homeDetail(home, homes, tab, reload) {
  const tabs = [['chores', 'Chores'], ['projects', 'Projects'], ['notes', 'Notes']];
  const current = tabs.some(([k]) => k === tab) ? tab : 'chores';
  let body;
  if (current === 'projects') body = await projectsTab(home, homes, reload);
  else if (current === 'notes') body = notesTab(home, reload);
  else body = await choresTab(home, homes, reload);
  return h('section', { class: `card home-detail c-${home.color}` },
    h('a', { href: '#/homes', class: 'back' }, '← All homes'),
    h('div', { class: 'detail-head' },
      h('h2', {}, home.name),
      h('button', { class: 'btn ghost small', onclick: () => editHome(home, homes, reload) }, 'Edit home')),
    h('nav', { class: 'subtabs', 'aria-label': `${home.name} sections` },
      tabs.map(([k, label]) => h('a', { href: homeHref(home.id, k), class: k === current ? 'on' : '', 'aria-current': k === current ? 'page' : false }, label))),
    body);
}

export async function renderHomes(page, args, reload, isCurrent = () => true) {
  const [id, tab] = args;
  const homes = await api('/api/homes');
  if (!isCurrent()) return;
  if (!id && homes.length && matchMedia('(min-width: 761px)').matches) {
    location.replace(homeHref((homes.find((x) => x.is_default) || homes[0]).id));
    return;
  }
  const home = id ? homes.find((x) => x.id === id) : null;
  const list = h('aside', { class: 'home-list' },
    h('h1', {}, 'Your homes'),
    homes.map((x) => h('a', { href: homeHref(x.id), class: `home-card c-${x.color}${x.id === id ? ' on' : ''}` },
      h('b', { class: 'serif' }, x.name),
      h('small', { class: 'muted' }, x.due_count ? `${x.due_count} due` : 'All caught up', x.active_projects ? ` · ${plural(x.active_projects, 'project')}` : ''))),
    homes.length ? null : empty("Add the places you look after: your house, a cabin, a parent's home."),
    h('button', { class: 'btn ghost', onclick: () => editHome(null, homes, reload) }, '+ Add a home'));
  let detail = null;
  if (id && !home) detail = card(null, h('a', { href: '#/homes', class: 'back' }, '← All homes'), empty('That home no longer exists.'));
  else if (home) detail = await homeDetail(home, homes, tab, reload);
  page.replaceChildren(h('div', { class: `homes${id ? ' has-selection' : ''}` }, list, detail));
}
