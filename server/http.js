'use strict';
// A small router with the safety checks every request goes through.
const fs = require('node:fs');
const path = require('node:path');
const { HttpError } = require('./errors');

const MAX_BODY = 1024 * 1024;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};
const REPLY = Symbol('reply');

const reply = (status, json) => ({ [REPLY]: true, status, json });

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'That request is too large.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) { resolve({}); return; }
      let value;
      try { value = JSON.parse(text); } catch { reject(new HttpError(400, 'That request was not valid JSON.')); return; }
      if (!value || typeof value !== 'object' || Array.isArray(value)) { reject(new HttpError(400, 'Send a JSON object.')); return; }
      resolve(value);
    });
    req.on('error', reject);
  });
}

function decode(part) {
  try { return decodeURIComponent(part); } catch { throw new HttpError(400, 'That address is not valid.'); }
}

function serveStatic(publicDir, pathname, res) {
  const rel = decode(pathname === '/' ? '/index.html' : pathname);
  const base = path.resolve(publicDir);
  const file = path.resolve(base, `.${rel}`);
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new HttpError(404, 'Not found.');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

function createApp({ publicDir }) {
  const routes = [];

  function route(method, pattern, handler) {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_m, key) => { keys.push(key); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, handler });
  }

  async function handler(req, res) {
    try {
      const host = String(req.headers.host || '').replace(/:\d+$/, '');
      if (!LOCAL_HOSTS.has(host)) throw new HttpError(403, 'Home Base only answers on this computer.');
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Not allowed.');
        serveStatic(publicDir, url.pathname, res);
        return;
      }
      if (req.method !== 'GET' && !String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        throw new HttpError(415, 'Changes must be sent as JSON.');
      }
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.re);
        if (!m) continue;
        const params = {};
        r.keys.forEach((key, i) => { params[key] = decode(m[i + 1]); });
        const body = req.method === 'GET' ? {} : await readJson(req);
        const result = await r.handler({ params, query: url.searchParams, body, req });
        if (result && result[REPLY]) sendJson(res, result.status, result.json);
        else sendJson(res, 200, result ?? { ok: true });
        return;
      }
      throw new HttpError(404, 'No such address.');
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      if (res.headersSent) { res.end(); return; }
      sendJson(res, status, { error: status === 500 ? `Something went wrong: ${e.message}` : e.message });
    }
  }

  return { route, handler };
}

module.exports = { createApp, reply, sendJson };
