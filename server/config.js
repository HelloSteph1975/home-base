'use strict';
// config.json sits next to the app (Git ignores it). The environment variables
// HOME_BASE_DATA_DIR and HOME_BASE_PORT override it.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const APP_DIR = path.join(__dirname, '..');
const CONFIG_PATH = path.join(APP_DIR, 'config.json');
const DEFAULT_PORT = 4173;
const defaultDataDir = () => path.join(os.homedir(), 'Documents', 'Home Base Data');

class ConfigError extends Error {}

function readConfigFile(file) {
  if (!fs.existsSync(file)) return {};
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new ConfigError(`${file} is not valid JSON (${e.message}). Windows paths need doubled backslashes, like "D:\\\\Home Data".`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ConfigError(`${file} must hold a JSON object.`);
  return parsed;
}

function parsePort(value, source) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new ConfigError(`The port in ${source} must be a whole number from 1 to 65535, not ${JSON.stringify(value)}.`);
  return n;
}

function loadConfig({ file = CONFIG_PATH, env = process.env } = {}) {
  const raw = readConfigFile(file);
  const dataDir = path.resolve(env.HOME_BASE_DATA_DIR || raw.dataDir || defaultDataDir());
  let port = DEFAULT_PORT;
  if (env.HOME_BASE_PORT) port = parsePort(env.HOME_BASE_PORT, 'HOME_BASE_PORT');
  else if (raw.port !== undefined) port = parsePort(raw.port, file);
  const backupDir = raw.backupDir ? path.resolve(raw.backupDir) : path.join(dataDir, 'Backups');
  const stopAt = raw.stopAt ?? null;
  if (stopAt !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(stopAt)) throw new ConfigError(`stopAt in ${file} must look like "21:00".`);
  return {
    file,
    dataDir,
    port,
    backupDir,
    stopAt,
    openWith: typeof raw.openWith === 'string' && raw.openWith.trim() ? raw.openWith : null,
    openAtStart: raw.openAtStart === true,
  };
}

function updateConfigFile(changes, { file = CONFIG_PATH } = {}) {
  const next = { ...readConfigFile(file), ...changes };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
  return next;
}

module.exports = { loadConfig, updateConfigFile, ConfigError, CONFIG_PATH, APP_DIR, DEFAULT_PORT, defaultDataDir };
