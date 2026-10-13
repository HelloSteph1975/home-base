'use strict';
// Every read and write of a note goes through here, so the safety rules live
// in one place: stay inside the data folder, never overwrite a note whose
// properties can't be read, write atomically, and move deletions to _Trash.
const fs = require('node:fs');
const path = require('node:path');
const { HttpError } = require('./errors');
const { TRASH_FOLDER } = require('./constants');

// A property line starts at column 0 with anything but a space, "-" or "#", and
// its key ends at the first ": " (or a ":" at the end). Keys may have spaces or
// accents, like "Due date" or "categoría".
const KEY_LINE = /^([^\s#-][^:]*?):(?:[ \t]+(.*))?$/;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

// Reads one YAML value: quoted strings are unquoted, a " #" comment after a
// plain value is dropped. Returns null for a quote that never closes.
function readValue(raw) {
  const v = raw.trim();
  if (v[0] === '"') {
    const m = v.match(/^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/);
    return m ? m[1].replace(/\\(["\\])/g, '$1') : null;
  }
  if (v[0] === "'") {
    const m = v.match(/^'((?:[^']|'')*)'\s*(?:#.*)?$/);
    return m ? m[1].replace(/''/g, "'") : null;
  }
  return v.replace(/(^|\s+)#.*$/, '');
}

const BLOCK = /^[|>][+-]?\d*$/;

// The text of a "key: |" or "key: >" block from its indented lines.
function blockValue(style, lines) {
  const body = lines.filter((l) => /^\s/.test(l) || !l.trim());
  const indent = Math.min(...body.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
  const text = body.map((l) => l.slice(Number.isFinite(indent) ? indent : 0));
  while (text.length && !text[text.length - 1].trim()) text.pop();
  return style[0] === '|' ? text.join('\n') : text.join(' ').replace(/\s+/g, ' ').trim();
}

// blocks[key] keeps the key's original lines (including list items), so a
// property the app didn't change is written back exactly as it was. extras[key]
// holds the comments and blank lines after it, which survive even when the
// app changes that property. preamble holds anything before the first key.
function parseNote(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const empty = { data: {}, blocks: {}, extras: {}, preamble: [], body: src, problem: null };
  if (!/^---[ \t]*\r?\n/.test(src)) return empty;
  const m = src.match(/^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  if (!m) return { ...empty, problem: 'Its properties block (between the --- lines at the top) never closes.' };
  const data = {};
  const blocks = {};
  const extras = {};
  const preamble = [];
  const blockStyles = {};
  let key = null;
  for (const line of (m[1] || '').split(/\r?\n/)) {
    const kv = line.match(KEY_LINE);
    if (kv) {
      key = kv[1];
      const raw = (kv[2] ?? '').trim();
      const value = BLOCK.test(raw) ? '' : readValue(raw);
      if (value === null) return { ...empty, problem: `The value of "${key}" has a quote that never closes.` };
      if (BLOCK.test(raw)) blockStyles[key] = raw;
      data[key] = value;
      blocks[key] = [line];
      extras[key] = [];
    } else if (!key) {
      preamble.push(line);
    } else {
      blocks[key].push(line);
      if (!/^[\s-]/.test(line) && !(blockStyles[key] && !line.trim())) extras[key].push(line);
    }
  }
  for (const [k, style] of Object.entries(blockStyles)) data[k] = blockValue(style, blocks[k].slice(1));
  return { data, blocks, extras, preamble, body: m[2], problem: null };
}

const cleanValue = (v) => (v === undefined || v === null ? '' : String(v).replace(/\r?\n/g, ' '));

// Plain values are written as they are; anything YAML would misread (": ",
// " #", a leading [ { - " ' and so on) is double-quoted.
const PLAIN = /^[\p{L}\p{N}(][\p{L}\p{N} ._()',/$+:-]*$/u;
function yamlValue(v) {
  if (v === '' || (PLAIN.test(v) && !/: |:$/.test(v) && !/\s$/.test(v))) return v;
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function serializeNote(data, body = '', original = null) {
  const lines = ['---', ...((original && original.preamble) || [])];
  for (const [key, value] of Object.entries(data)) {
    // Compare before flattening, so an unchanged multi-line value keeps its block.
    const prior = original && original.blocks && original.blocks[key];
    const same = prior && original.data[key] === (value === undefined || value === null ? '' : String(value));
    if (same) lines.push(...prior);
    else lines.push(`${key}: ${yamlValue(cleanValue(value))}`, ...((original && original.extras && original.extras[key]) || []));
  }
  lines.push('---', '');
  return lines.join('\n') + (body || '');
}

function resolveInside(root, rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\0') || path.isAbsolute(rel) || /^[\\/]/.test(rel)) {
    throw new HttpError(400, 'Bad note path.');
  }
  const base = path.resolve(root);
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep)) throw new HttpError(400, 'Bad note path.');
  return file;
}

function safeName(value) {
  let name = String(value ?? '')
    .replace(/[\\/:*?"<>|#^[\]\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[._\s]+|[.\s]+$/g, '')
    .slice(0, 80)
    .trim();
  if (!name) throw new HttpError(400, 'A name is required.');
  // CON, NUL and friends can't be Windows file names; CLAUDE.md is skipped by the index.
  if (RESERVED.test(name) || name.toLowerCase() === 'claude') name += ' (note)';
  return name;
}

const encId = (rel) => Buffer.from(rel, 'utf8').toString('base64url');
const decId = (id) => Buffer.from(String(id), 'base64url').toString('utf8');

// OneDrive or an open editor can hold a file for a moment on Windows.
const BUSY = new Set(['EPERM', 'EACCES', 'EBUSY']);
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function retryFs(op, { tries = 5, delayMs = 250 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return op();
    } catch (e) {
      if (!BUSY.has(e.code)) throw e;
      if (attempt >= tries) throw new HttpError(503, 'The file is busy (OneDrive may be syncing). Try again in a moment.');
      sleepSync(delayMs);
    }
  }
}

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, content, 'utf8');
    retryFs(() => fs.renameSync(tmp, file));
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw e;
  }
}

function createNotes(root) {
  const base = path.resolve(root);
  const abs = (rel) => resolveInside(base, rel);
  const toRel = (file) => path.relative(base, file).split(path.sep).join('/');
  const exists = (rel) => fs.existsSync(abs(rel));

  function read(rel) {
    return { rel, ...parseNote(fs.readFileSync(abs(rel), 'utf8')) };
  }

  function write(rel, data, body, original) {
    if (original && original.problem) {
      throw new HttpError(409, `${rel} has a problem, so Home Base won't change it: ${original.problem} Fix it in a text editor first.`);
    }
    writeAtomic(abs(rel), serializeNote(data, body, original));
  }

  function create(rel, data, body = '') {
    const file = abs(rel);
    if (fs.existsSync(file)) {
      throw new HttpError(409, `There's already a note called "${path.posix.basename(rel, '.md')}" in ${path.posix.dirname(rel)}.`);
    }
    writeAtomic(file, serializeNote(data, body));
  }

  // Moves a file or folder into _Trash, or copies a file there when it is about to be rewritten.
  function trash(rel, { copy = false, now = new Date() } = {}) {
    const file = abs(rel);
    if (!fs.existsSync(file)) return null;
    const dir = path.join(base, TRASH_FOLDER);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const name = path.basename(file);
    let dest = path.join(dir, `${stamp} ${name}`);
    for (let n = 2; fs.existsSync(dest); n += 1) dest = path.join(dir, `${stamp} (${n}) ${name}`);
    retryFs(() => (copy ? fs.copyFileSync(file, dest, fs.constants.COPYFILE_EXCL) : fs.renameSync(file, dest)));
    return toRel(dest);
  }

  function move(fromRel, toRelPath) {
    const from = abs(fromRel);
    const to = abs(toRelPath);
    if (fs.existsSync(to)) throw new HttpError(409, `${toRelPath} already exists.`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    retryFs(() => fs.renameSync(from, to));
  }

  return { root: base, abs, toRel, exists, read, write, create, trash, move };
}

module.exports = { parseNote, serializeNote, resolveInside, safeName, encId, decId, retryFs, writeAtomic, createNotes };
