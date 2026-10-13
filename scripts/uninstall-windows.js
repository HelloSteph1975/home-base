'use strict';
// Stops Home Base, then removes its scheduled tasks and Desktop shortcut. Never touches the data folder.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

execFileSync(process.execPath, [path.join(__dirname, 'stop.js')], { stdio: 'inherit' });
require('./windows').uninstall();
