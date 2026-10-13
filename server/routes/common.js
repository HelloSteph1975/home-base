'use strict';
const { HttpError } = require('../errors');
const { decId, safeName } = require('../notes');
const { kindFor } = require('../index-db');
const { isDate } = require('../dates');

function noteRel(id, kind, notes) {
  let rel = '';
  try { rel = decId(id); } catch { rel = ''; }
  if (kindFor(rel) !== kind || !notes.exists(rel)) throw new HttpError(404, 'That item no longer exists. Reload the page.');
  return rel;
}

function text(v, label, { max = 200, required = false, multiline = false } = {}) {
  if (v === undefined || v === null) {
    if (required) throw new HttpError(400, `${label} is required.`);
    return undefined;
  }
  if (typeof v !== 'string' && typeof v !== 'number') throw new HttpError(400, `${label} must be text.`);
  const s = (multiline ? String(v).replace(/\r\n/g, '\n') : String(v).replace(/\r?\n/g, ' ')).trim();
  if (required && !s) throw new HttpError(400, `${label} is required.`);
  if (s.length > max) throw new HttpError(400, `${label} is too long (${max} characters at most).`);
  return s;
}

function date(v, label, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${label} is required.`);
    return v === '' ? '' : undefined;
  }
  if (!isDate(v)) throw new HttpError(400, `${label} must be a date like 2026-10-13.`);
  return v;
}

function time(v, label) {
  if (v === undefined || v === null) return undefined;
  if (v === '') return '';
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new HttpError(400, `${label} must be a time like 14:30.`);
  return v;
}

function oneOf(v, list, label) {
  if (v === undefined || v === null) return undefined;
  if (!list.includes(v)) throw new HttpError(400, `${label} must be one of: ${list.join(', ')}.`);
  return v;
}

function money(v, label, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${label} is required.`);
    return undefined;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new HttpError(400, `${label} must be an amount like 142.50.`);
  return Math.round(n * 100) / 100;
}

function positiveInt(v, label) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 3650) throw new HttpError(400, `${label} must be a whole number from 1 to 3650.`);
  return n;
}

function homeId(v, homesInfo) {
  const id = text(v, 'Home', { max: 80 });
  if (id === undefined || id === '') return id;
  if (!homesInfo().exists(id)) throw new HttpError(400, `There is no home called "${id}".`);
  return id;
}

// The first free file or folder name: "Vacuum", then "Vacuum (Pine Cabin)",
// then "Vacuum 2", "Vacuum 3"... taken(name) says whether a name is in use.
function freeName(taken, base, suffix) {
  if (!taken(base)) return base;
  let safeSuffix = '';
  try { safeSuffix = suffix ? safeName(suffix) : ''; } catch { safeSuffix = ''; }
  if (safeSuffix && !taken(`${base} (${safeSuffix})`)) return `${base} (${safeSuffix})`;
  for (let n = 2; ; n += 1) if (!taken(`${base} ${n}`)) return `${base} ${n}`;
}

// Refuses a second item with the same name in the same home.
function uniqueInHome(rows, name, homeId, info, what) {
  const target = info.homeOf(homeId);
  const clash = rows.some((r) => r.name.toLowerCase() === name.toLowerCase() && info.homeOf(r.home) === target);
  if (clash) throw new HttpError(409, `There's already a ${what} called "${name}"${info.nameOf(target) ? ` at ${info.nameOf(target)}` : ''}.`);
  return target;
}

const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

module.exports = { noteRel, text, date, time, oneOf, money, positiveInt, homeId, freeName, uniqueInHome, defined };
