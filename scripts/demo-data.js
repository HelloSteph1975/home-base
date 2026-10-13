'use strict';
// A made-up household for the demo, screenshots and browser tests. Dates are
// relative to today so the demo always looks lived in. Names only, no real data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createNotes } = require('../server/notes');
const { addDays, localDate } = require('../server/dates');

const DEMO_PORT = 4205;
const MARKER = '.home-base-demo';
const demoDir = () => process.env.HOME_BASE_DEMO_DIR || path.join(os.tmpdir(), 'home-base-demo');

function makeDemoFolder(dir = demoDir(), today = localDate()) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
    if (!fs.existsSync(path.join(dir, MARKER))) throw new Error(`${dir} is not a Home Base demo folder, so it was left alone.`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MARKER), 'Made by "npm run demo". Deleted and rebuilt on every demo start.\n');
  const notes = createNotes(dir);
  const d = (n) => addDays(today, n);
  const add = (rel, data, body = '') => notes.create(rel, data, body);

  add('Home Base Settings.md', { type: 'home-base-settings', name: 'Sam', default_home: 'Main house' });
  add('Homes/Main house.md', { type: 'home', name: 'Main house', kind: 'home', color: 'terracotta' }, '\nWater shut-off is in the garage, left of the heater.\n');
  add('Homes/Lake cabin.md', { type: 'home', name: 'Lake cabin', kind: 'cabin', color: 'sage' }, '\nKey is with the neighbors at #12.\n');
  add("Homes/Grandma's place.md", { type: 'home', name: "Grandma's place", kind: 'family', color: 'plum' }, '\n');

  const chore = (folder, name, frequency, freqDays, lastDone, home = '') => add(`Home Maintenance/${folder}/${name}.md`,
    { type: 'chore', name, frequency, freq_days: freqDays, last_done: lastDone, home, notes: '' });
  chore('Monthly Cleaning', 'Change air filter', 'monthly', 30, d(-30), 'Main house');
  chore('Seasonal Home Maintenance', 'Clean gutters', 'seasonal', 90, d(-100), 'Main house');
  chore('Weekly Cleaning', 'Vacuum', 'weekly', 7, d(-3));
  chore('Daily Cleaning', 'Wipe counters', 'daily', 1, d(-1));
  chore('Seasonal Home Maintenance', 'Drain the pipes', 'seasonal', 90, d(-80), 'Lake cabin');
  chore('Seasonal Home Maintenance', 'Test smoke alarms', 'seasonal', 90, d(-95), "Grandma's place");

  const bill = (name, amount, dueDate, recurring) => add(`Bills/${name}.md`,
    { type: 'bill', name, amount, due_date: dueDate, recurring, category: '', account: '', status: 'due' });
  bill('Electric', 142, d(3), 'monthly');
  bill('Internet', 65, d(6), 'monthly');
  bill('Water', 48.2, d(-2), 'monthly');
  bill('Car insurance', 610, d(40), 'annual');
  bill('Property tax', 1840, d(20), 'none');

  add(`Events/Birthdays/${d(4)} Mom's birthday.md`, { type: 'event', name: "Mom's birthday", date: d(4), time: '', category: 'Birthdays', location: '', notes: '', recurring: 'annual' });
  add(`Events/Family & Social/${d(1)} Book club.md`, { type: 'event', name: 'Book club', date: d(1), time: '19:00', category: 'Family & Social', location: 'Library', notes: '', recurring: 'weekly' });
  add(`Appointments/${today} Dentist.md`, { type: 'appointment', name: 'Dentist', date: today, time: '14:30', provider: 'Dr. Lee', reason: 'Cleaning', status: 'upcoming' });
  add(`Appointments/${d(9)} Vet checkup.md`, { type: 'appointment', name: 'Vet checkup', date: d(9), time: '10:00', provider: 'Valley Vet', reason: '', status: 'upcoming' });

  add('Projects/Paint the porch/Project Info.md', { type: 'project', name: 'Paint the porch', status: 'active', start_date: d(-7), due_date: d(14), notes: '', home: 'Main house' });
  const task = (name, due, status) => add(`Projects/Paint the porch/Tasks/${name}.md`, { type: 'project_task', project: 'Paint the porch', name, due_date: due, status, notes: '' });
  task('Pick colors', d(-2), 'done');
  task('Buy paint', d(2), 'todo');
  task('Scrape old paint', d(5), 'todo');
  return dir;
}

module.exports = { makeDemoFolder, demoDir, DEMO_PORT };
