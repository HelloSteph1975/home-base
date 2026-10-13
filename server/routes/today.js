'use strict';
const { todayView } = require('../logic/today');

module.exports = function registerToday(app, deps) {
  app.route('GET', '/api/today', () => todayView(deps));
};
