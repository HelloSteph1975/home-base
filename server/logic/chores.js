'use strict';
const { addDays, daysBetween } = require('../dates');

// A chore is due freq_days after it was last done. Never done means due today.
function withDue(chore, today) {
  const due = chore.last_done ? addDays(chore.last_done, chore.freq_days || 7) : today;
  return { ...chore, due_date: due, days_until: daysBetween(today, due) };
}

module.exports = { withDue };
