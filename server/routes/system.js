'use strict';

module.exports = function registerSystem(app, { version, shutdown }) {
  app.route('GET', '/api/health', () => ({ ok: true, app: 'home-base', version }));

  // The stop script asks the server to exit, so it can close the database first.
  app.route('POST', '/api/shutdown', () => {
    setTimeout(() => shutdown('POST /api/shutdown'), 50);
    return { status: 'stopping' };
  });
};
