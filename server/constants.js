'use strict';

const CHORE_FOLDERS = {
  'Daily Cleaning': ['daily', 1],
  'Weekly Cleaning': ['weekly', 7],
  'Monthly Cleaning': ['monthly', 30],
  'Seasonal Home Maintenance': ['seasonal', 90],
};
const FREQUENCIES = Object.fromEntries(
  Object.entries(CHORE_FOLDERS).map(([folder, [freq, days]]) => [freq, { folder, days }]),
);

module.exports = {
  CHORE_FOLDERS,
  FREQUENCIES,
  TOP_FOLDERS: ['Homes', 'Home Maintenance', 'Projects', 'Events', 'Appointments', 'Bills'],
  EVENT_CATEGORIES: ['Birthdays', 'Holidays', 'Family & Social', 'Other'],
  HOME_KINDS: ['home', 'cabin', 'land', 'family', 'rental', 'other'],
  HOME_COLORS: ['terracotta', 'sage', 'plum', 'ochre', 'slate', 'rose'],
  APPOINTMENT_STATUSES: ['upcoming', 'done', 'cancelled'],
  PROJECT_STATUSES: ['active', 'paused', 'done'],
  TASK_STATUSES: ['todo', 'done'],
  SETTINGS_NOTE: 'Home Base Settings.md',
  TRASH_FOLDER: '_Trash',
  STATE_FOLDER: '.home-base',
};
