'use strict';
// Per-household settings live in a note, "Home Base Settings.md", at the top of
// the data folder, so they travel with the notes and are included in backups.
const { SETTINGS_NOTE } = require('./constants');

function readSettings(notes) {
  if (!notes.exists(SETTINGS_NOTE)) return { name: '', default_home: '' };
  const { data } = notes.read(SETTINGS_NOTE);
  return { name: data.name || '', default_home: data.default_home || '' };
}

function writeSettings(notes, changes) {
  if (!notes.exists(SETTINGS_NOTE)) {
    notes.create(SETTINGS_NOTE, { type: 'home-base-settings', name: '', default_home: '', ...changes },
      '\nSettings for the Home Base app. You can change them in the app under Settings.\n');
    return;
  }
  const note = notes.read(SETTINGS_NOTE);
  notes.write(SETTINGS_NOTE, { ...note.data, ...changes }, note.body, note);
}

// A chore or project without a home, or naming a home that doesn't exist,
// belongs to the default home: the one in settings, else the first by name.
function resolveHomes(index, settings) {
  const homes = index.all('SELECT * FROM homes ORDER BY name COLLATE NOCASE');
  const ids = new Set(homes.map((h) => h.id));
  const defaultHome = ids.has(settings.default_home) ? settings.default_home : (homes[0]?.id || '');
  return {
    homes,
    defaultHome,
    exists: (id) => ids.has(id),
    homeOf: (id) => (id && ids.has(id) ? id : defaultHome),
    nameOf: (id) => homes.find((h) => h.id === id)?.name || '',
  };
}

module.exports = { readSettings, writeSettings, resolveHomes };
