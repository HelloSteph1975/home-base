'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempDir, writeFile, readFile } = require('./helpers');
const { parseNote, serializeNote, safeName, resolveInside, encId, decId, createNotes } = require('../server/notes');

test('editing one property keeps Obsidian list properties the app does not touch', () => {
  const text = '---\nname: Clean gutters\ntags:\n  - outside\n  - fall\nlast_done: 2026-09-01\n---\nBody text\n';
  const note = parseNote(text);
  assert.equal(note.data.name, 'Clean gutters');
  assert.equal(note.data.last_done, '2026-09-01');
  const out = serializeNote({ ...note.data, last_done: '2026-10-13' }, note.body, note);
  assert.equal(out, '---\nname: Clean gutters\ntags:\n  - outside\n  - fall\nlast_done: 2026-10-13\n---\nBody text\n');
});

test('quotes are removed, notes without properties are all body, CRLF works', () => {
  assert.equal(parseNote('---\nname: "Mom\'s birthday"\n---\n').data.name, "Mom's birthday");
  assert.deepEqual(parseNote('Just text').data, {});
  assert.equal(parseNote('Just text').body, 'Just text');
  assert.equal(parseNote('---\r\nname: A\r\n---\r\nB').data.name, 'A');
  assert.equal(parseNote('---\n---\nB').body, 'B');
});

test('a properties block that never closes is a problem', () => {
  const note = parseNote('---\nname: Broken\nlast_done: 2026-01-01\n');
  assert.match(note.problem, /never closes/);
});

test('new lines inside a value are flattened when written', () => {
  assert.equal(serializeNote({ notes: 'a\nb' }, ''), '---\nnotes: a b\n---\n');
});

test('safeName makes names safe for every system', () => {
  assert.equal(safeName('Clean A/C: filter'), 'Clean AC filter');
  assert.equal(safeName('  ..hidden  '), 'hidden');
  assert.equal(safeName('CON'), 'CON (note)');
  assert.throws(() => safeName('///'), /name is required/i);
});

test('resolveInside refuses paths that leave the data folder', () => {
  const root = tempDir();
  assert.equal(resolveInside(root, 'Bills/Water.md'), path.join(root, 'Bills', 'Water.md'));
  for (const bad of ['../x.md', '/etc/passwd', '', 'Bills/../../x.md']) assert.throws(() => resolveInside(root, bad), /Bad note path/);
});

test('ids round-trip', () => {
  assert.equal(decId(encId('Bills/Électric & gas.md')), 'Bills/Électric & gas.md');
});

test('create refuses to overwrite, write refuses a broken note, trash keeps a copy', () => {
  const root = tempDir();
  const notes = createNotes(root);
  notes.create('Bills/Water.md', { type: 'bill', name: 'Water' }, '');
  assert.throws(() => notes.create('Bills/Water.md', { name: 'Water' }, ''), (e) => e.status === 409);

  writeFile(root, 'Bills/Broken.md', '---\nname: Broken\n');
  const broken = notes.read('Bills/Broken.md');
  assert.throws(() => notes.write('Bills/Broken.md', { name: 'x' }, '', broken), (e) => e.status === 409);
  assert.equal(readFile(root, 'Bills/Broken.md'), '---\nname: Broken\n');

  const copied = notes.trash('Bills/Water.md', { copy: true });
  assert.ok(fs.existsSync(path.join(root, 'Bills', 'Water.md')));
  assert.match(copied, /^_Trash\/.* Water\.md$/);
  const moved = notes.trash('Bills/Water.md');
  assert.ok(!fs.existsSync(path.join(root, 'Bills', 'Water.md')));
  assert.notEqual(moved, copied);
});

test('move refuses to replace an existing note', () => {
  const root = tempDir();
  const notes = createNotes(root);
  writeFile(root, 'A/x.md', 'one');
  writeFile(root, 'B/x.md', 'two');
  assert.throws(() => notes.move('A/x.md', 'B/x.md'), (e) => e.status === 409);
  notes.move('A/x.md', 'C/x.md');
  assert.equal(readFile(root, 'C/x.md'), 'one');
});

test('properties with spaces, accents or comments survive when another property changes', () => {
  const text = '---\n# kept comment\nname: Mop\nlast_done: 2026-10-01\nMy Room: kitchen\ncategoría: limpieza\n\nnotes: old\n---\n';
  const note = parseNote(text);
  assert.equal(note.data['My Room'], 'kitchen');
  assert.equal(note.data['categoría'], 'limpieza');
  const out = serializeNote({ ...note.data, last_done: '2026-10-13', notes: 'new' }, note.body, note);
  assert.equal(out, '---\n# kept comment\nname: Mop\nlast_done: 2026-10-13\nMy Room: kitchen\ncategoría: limpieza\n\nnotes: new\n---\n');
});

test('values YAML would misread are quoted, and read back unchanged', () => {
  for (const value of ['Note: bring ID', 'Room #12', '[draft]', '- dash', '"Quoted"', 'He said "hi"', 'C:\\Users\\x', "it's fine"]) {
    const out = serializeNote({ notes: value }, '');
    assert.equal(parseNote(out).data.notes, value, `round trip of ${value} (${out.trim()})`);
    if (/: | #|^[[\-"]/.test(value)) assert.match(out, /^notes: "/m, `quoted: ${value}`);
  }
  assert.equal(serializeNote({ time: '14:30', due_date: '2026-10-13', amount: 142.5 }, ''), '---\ntime: 14:30\ndue_date: 2026-10-13\namount: 142.5\n---\n');
});

test('YAML comments, block values and unclosed quotes are read correctly', () => {
  assert.equal(parseNote('---\ndue_date: 2026-10-15 # next payment\n---\n').data.due_date, '2026-10-15');
  assert.equal(parseNote('---\nlocation: "Room #12"\n---\n').data.location, 'Room #12');
  assert.equal(parseNote('---\nnotes: |\n  line one\n  line two\nname: X\n---\n').data.notes, 'line one\nline two');
  assert.equal(parseNote('---\nnotes: >\n  folded\n  text\n---\n').data.notes, 'folded text');
  assert.match(parseNote('---\nname: "unfinished\n---\n').problem, /quote/);
});

test('names the index would ignore are made usable', () => {
  assert.equal(safeName('Claude'), 'Claude (note)');
  assert.equal(safeName('_Workshop'), 'Workshop');
});

test('an unchanged multi-line property keeps its line breaks when another property changes', () => {
  const text = '---\nname: Mop\nnotes: |\n  line one\n  line two\nlast_done: 2026-10-01\n---\n';
  const note = parseNote(text);
  const out = serializeNote({ ...note.data, last_done: '2026-10-13' }, note.body, note);
  assert.equal(out, '---\nname: Mop\nnotes: |\n  line one\n  line two\nlast_done: 2026-10-13\n---\n');
});
