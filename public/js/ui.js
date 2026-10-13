// Small helpers shared by every page. h() builds elements with textContent,
// so text from notes can never inject HTML.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === false || value === null || value === undefined) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

export function toast(message, kind = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `show ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = ''; }, kind === 'error' ? 6000 : 3000);
}

export const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localToday = () => ymd(new Date());
export function parseDay(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseDay(s); d.setDate(d.getDate() + n); return ymd(d); }
export const fmtDay = (s, options = { weekday: 'short', month: 'short', day: 'numeric' }) => (s ? parseDay(s).toLocaleDateString(undefined, options) : '');

// "14:30" -> "2:30 PM" (or the viewer's own clock style).
export function fmtTime(hm) {
  if (!/^\d{2}:\d{2}$/.test(hm || '')) return '';
  const [hours, minutes] = hm.split(':').map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function dueText(days) {
  if (days < -1) return `${-days} days overdue`;
  if (days === -1) return '1 day overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

export function duePill(days) {
  const kind = days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'soon' : '';
  return h('span', { class: `pill ${kind}` }, dueText(days));
}

export const card = (title, ...kids) => h('section', { class: 'card' }, title ? h('h2', { class: 'label' }, title) : null, ...kids);
export const empty = (text) => h('p', { class: 'empty' }, text);

export async function act(promise, then) {
  try {
    await promise;
    if (then) await then();
  } catch (e) {
    toast(e.message, 'error');
  }
}

export function formDialog({ title, fields, submitLabel = 'Save', extraButtons = [] }) {
  return new Promise((resolve) => {
    const inputs = {};
    let dialog;
    const finish = (result) => { resolve(result); dialog.close(); };
    const form = h('form', { class: 'form' },
      h('h2', {}, title),
      fields.map((f) => {
        let input;
        if (f.type === 'select') {
          input = h('select', { name: f.name }, f.options.map((o) => {
            const [value, label] = Array.isArray(o) ? o : [o, o];
            return h('option', { value, selected: String(f.value ?? '') === String(value) }, label);
          }));
        } else if (f.type === 'textarea') {
          input = h('textarea', { name: f.name, rows: f.rows || 4 });
          input.value = f.value ?? '';
        } else {
          input = h('input', { name: f.name, type: f.type || 'text', required: f.required, min: f.min, step: f.step });
          input.value = f.value ?? '';
        }
        inputs[f.name] = input;
        return h('label', {}, h('span', {}, f.label), input, f.hint ? h('small', {}, f.hint) : null);
      }),
      h('div', { class: 'actions' },
        extraButtons.map((b) => h('button', { type: 'button', class: `btn ${b.kind || 'ghost'}`, onclick: () => finish({ action: b.action }) }, b.label)),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => finish(null) }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn primary' }, submitLabel)));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const values = {};
      for (const [key, el] of Object.entries(inputs)) values[key] = el.value.trim();
      finish({ action: 'save', values });
    });
    dialog = h('dialog', { class: 'dialog' }, form);
    dialog.addEventListener('cancel', () => resolve(null));
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  });
}

export async function confirmDialog(text, okLabel = 'Delete') {
  const r = await formDialog({ title: text, fields: [], submitLabel: okLabel });
  return r?.action === 'save';
}
