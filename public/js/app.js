import { h } from './ui.js';
import { renderToday } from './pages/today.js';
import { renderCalendar } from './pages/calendar.js';
import { renderHomes } from './pages/homes.js';
import { renderBills } from './pages/bills.js';
import { renderSettings } from './pages/settings.js';

const PAGES = { today: renderToday, calendar: renderCalendar, homes: renderHomes, bills: renderBills, settings: renderSettings };
const TITLES = { today: 'Today', calendar: 'Calendar', homes: 'Homes', bills: 'Bills', settings: 'Settings' };
const page = document.getElementById('page');

function parts() {
  return (location.hash || '#/today').replace(/^#\/?/, '').split('/').map((p) => {
    try { return decodeURIComponent(p); } catch { return p; }
  });
}

// Each visit renders into its own detached slot. Only the latest visit moves its
// slot onto the page, so a slow page can't replace the one you switched to.
let latest = 0;

async function route() {
  const visit = ++latest;
  const isCurrent = () => visit === latest;
  const [first, ...args] = parts();
  const name = PAGES[first] ? first : 'today';
  for (const a of document.querySelectorAll('[data-tab]')) {
    const on = a.dataset.tab === name;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  document.title = `${TITLES[name]} · Home Base`;
  const slot = document.createElement('div');
  try {
    await PAGES[name](slot, args, route, isCurrent);
  } catch (e) {
    slot.replaceChildren(h('section', { class: 'card' },
      h('h1', {}, "This page couldn't load"),
      h('p', { class: 'error' }, e.message),
      h('p', { class: 'muted' }, 'Try reloading. If Home Base was stopped, start it again first.')));
  }
  if (isCurrent()) page.replaceChildren(...slot.childNodes);
}

addEventListener('hashchange', route);
route();
