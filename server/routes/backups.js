'use strict';
const path = require('node:path');
const { HttpError } = require('../errors');
const c = require('./common');

module.exports = function registerBackups(app, { backups, index }) {
  app.route('GET', '/api/backups', () => ({ ...backups.current().list(), location: backups.current().dir }));

  app.route('POST', '/api/backups', () => {
    const r = backups.current().snapshot();
    if (r.error) throw new HttpError(503, `The backup failed: ${r.error}`);
    return r;
  });

  app.route('GET', '/api/backups/:date', ({ params }) => backups.current().diff(params.date));

  app.route('POST', '/api/backups/:date/restore', ({ params, body }) => {
    const r = backups.current().restore(params.date, { paths: body.paths, all: body.all });
    index.rescan();
    return r;
  });

  app.route('PUT', '/api/backups/location', ({ body }) => {
    const dir = c.text(body.dir, 'Folder', { required: true, max: 500 });
    if (!path.isAbsolute(dir)) throw new HttpError(400, 'Give the full folder path, like D:\\Backups\\Home Base.');
    return backups.switchTo(dir);
  });
};
