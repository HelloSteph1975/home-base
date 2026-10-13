'use strict';
const { calendarDays } = require('../logic/calendar');

module.exports = function registerCalendar(app, deps) {
  app.route('GET', '/api/calendar', ({ query }) => {
    const from = query.get('from');
    const to = query.get('to');
    return { from, to, days: calendarDays(deps, from, to) };
  });
};
