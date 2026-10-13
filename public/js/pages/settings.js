import { api } from '../api.js';
import { h, card, empty, act, toast, formDialog, fmtDay } from '../ui.js';

const CHANGE_TEXT = { changed: 'changed since then', missing: 'deleted since then', added: 'added since then' };

export async function renderSettings(page, _args, reload) {
  const [s, homes, backups, problems] = await Promise.all([
    api('/api/settings'), api('/api/homes'), api('/api/backups'), api('/api/problems'),
  ]);

  const name = h('input', { type: 'text', value: s.name });
  const defaultHome = h('select', {}, homes.length
    ? homes.map((x) => h('option', { value: x.id, selected: x.id === s.default_home }, x.name))
    : h('option', { value: '' }, 'No homes yet'));
  const saveYou = (e) => {
    e.preventDefault();
    const body = { name: name.value.trim(), ...(homes.length ? { default_home: defaultHome.value } : {}) };
    act(api('/api/settings', { method: 'PATCH', body }), () => { toast('Saved.'); return reload(); });
  };

  const restoreArea = h('div', {});
  const daySelect = h('select', { 'aria-label': 'Backup date' }, backups.days.map((d) => h('option', { value: d.taken_on },
    `${fmtDay(d.taken_on, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ${d.count} notes`)));

  async function showChanges() {
    const date = daySelect.value;
    try {
      const diff = await api(`/api/backups/${date}`);
      const restorable = diff.filter((d) => d.status !== 'added');
      const restore = (body) => act(api(`/api/backups/${date}/restore`, { method: 'POST', body }), () => {
        toast('Restored. The versions you replaced are in _Trash.');
        return reload();
      });
      restoreArea.replaceChildren(
        diff.length
          ? h('ul', { class: 'rows' }, diff.map((d) => h('li', {},
            h('span', { class: 'grow' }, h('code', {}, d.path), ' ', h('small', { class: 'muted' }, CHANGE_TEXT[d.status])),
            d.status === 'added' ? null : h('button', { class: 'btn small', onclick: () => restore({ paths: [d.path] }) }, 'Restore'))))
          : empty('Nothing has changed since that backup.'),
        restorable.length > 1 ? h('p', {}, h('button', { class: 'btn', onclick: () => restore({ all: true }) }, `Restore all ${restorable.length} notes`)) : null);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function changeLocation() {
    const r = await formDialog({
      title: 'Where should backups go?',
      fields: [{ name: 'dir', label: 'Folder', required: true, value: backups.location, hint: 'The full path, like D:\\Backups\\Home Base. Your existing backups are copied there.' }],
      submitLabel: 'Use this folder',
    });
    if (r?.action === 'save') await act(api('/api/backups/location', { method: 'PUT', body: { dir: r.values.dir } }), () => { toast('Backups moved.'); return reload(); });
  }

  page.replaceChildren(
    h('h1', {}, 'Settings'),
    h('div', { class: 'stack' },
      card('You', h('form', { class: 'form flat', onsubmit: saveYou },
        h('label', {}, h('span', {}, 'Your name'), name, h('small', {}, 'Used for the greeting on Today.')),
        h('label', {}, h('span', {}, 'Default home'), defaultHome, h('small', {}, "Chores and projects that don't say which home they belong to show here.")),
        h('div', {}, h('button', { class: 'btn primary', type: 'submit' }, 'Save')))),
      card('Your data',
        h('p', {}, 'Your notes are in ', h('code', {}, s.data_dir)),
        h('p', { class: 'muted' }, 'Everything Home Base shows is a Markdown note in that folder. You can open it in Obsidian or any text editor.'),
        h('p', { class: 'muted' }, `Home Base ${s.version} · port ${s.port}`)),
      card('Backups',
        h('p', {}, backups.last_snapshot_at ? `Last backup: ${new Date(backups.last_snapshot_at).toLocaleString()}` : 'No backup yet.'),
        backups.last_error ? h('p', { class: 'error' }, `The last backup failed: ${backups.last_error}`) : null,
        h('p', {}, h('button', { class: 'btn primary', onclick: () => act(api('/api/backups', { method: 'POST' }), () => { toast('Backed up.'); return reload(); }) }, 'Back up now')),
        h('p', {}, 'Saved in ', h('code', {}, backups.location), ' ', h('button', { class: 'btn ghost small', onclick: changeLocation }, 'Change…')),
        h('p', { class: 'muted' }, "Pick a folder on another drive, a USB stick or a cloud folder (OneDrive, Google Drive) so a broken laptop doesn't take your backups with it. Home Base keeps 30 days."),
        backups.days.length ? h('div', { class: 'inline-form' }, daySelect, h('button', { class: 'btn', onclick: showChanges }, 'See what changed')) : null,
        restoreArea),
      card('Needs attention', problems.length
        ? h('ul', { class: 'rows' }, problems.map((p) => h('li', {}, h('span', { class: 'grow' }, h('code', {}, p.path), h('br'), h('small', {}, p.message)))))
        : empty('Everything looks fine.'))));
}
