'use strict';
const { HttpError } = require('../errors');
const c = require('./common');

module.exports = function registerSettings(app, { index, settings, homesInfo, config, version }) {
  app.route('GET', '/api/settings', () => ({
    name: settings.read().name,
    default_home: homesInfo().defaultHome,
    data_dir: config.dataDir,
    port: config.port,
    version,
  }));

  app.route('PATCH', '/api/settings', ({ body }) => {
    const changes = c.defined({ name: c.text(body.name, 'Your name', { max: 80 }), default_home: c.text(body.default_home, 'Default home', { max: 80 }) });
    if (changes.default_home !== undefined && !homesInfo().exists(changes.default_home)) {
      throw new HttpError(400, `There is no home called "${changes.default_home}".`);
    }
    settings.write(changes);
    return { ok: true };
  });

  app.route('GET', '/api/problems', () => {
    const out = index.problems().map((p) => ({ path: p.file_path, message: p.message }));
    const info = homesInfo();
    const fallback = info.nameOf(info.defaultHome) || 'no home';
    const refs = index.all("SELECT file_path, home FROM chores WHERE home != '' UNION ALL SELECT file_path, home FROM projects WHERE home != ''");
    for (const r of refs) {
      if (!info.exists(r.home)) out.push({ path: r.file_path, message: `It names a home called "${r.home}" that doesn't exist, so it shows under ${fallback}.` });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  });
};
