'use strict';
// Windows only: the two scheduled tasks and the Desktop shortcut.
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { APP_DIR } = require('../server/config');

const START_TASK = 'Home Base - Start Morning';
const STOP_TASK = 'Home Base - Stop 9 PM';
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

function install(config) {
  if (process.platform !== 'win32') {
    console.log('Scheduled tasks and the Desktop shortcut are for Windows. On this computer, start Home Base with "npm start".');
    return;
  }
  const win = path.join(APP_DIR, 'windows');
  const startVbs = path.join(win, config.openAtStart ? 'Launch Home Base.vbs' : 'Start Home Base.vbs');
  ps(`
$start = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + ${q(startVbs)} + '"') -WorkingDirectory ${q(APP_DIR)}
$startSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 72)
Register-ScheduledTask -TaskName ${q(START_TASK)} -Action $start -Trigger (New-ScheduledTaskTrigger -Daily -At 5:30AM) -Settings $startSettings -Force | Out-Null
$stop = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + ${q(path.join(win, 'Stop Home Base.vbs'))} + '"') -WorkingDirectory ${q(APP_DIR)}
$stopSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName ${q(STOP_TASK)} -Action $stop -Trigger (New-ScheduledTaskTrigger -Daily -At 9:00PM) -Settings $stopSettings -Force | Out-Null
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Home Base Dashboard.lnk'))
$lnk.TargetPath = 'wscript.exe'
$lnk.Arguments = '"' + ${q(path.join(win, 'Launch Home Base.vbs'))} + '"'
$lnk.WorkingDirectory = ${q(APP_DIR)}
$lnk.IconLocation = ${q(path.join(win, 'home-base.ico'))}
$lnk.Save()`);
  console.log(`Added the scheduled tasks "${START_TASK}" (5:30 AM) and "${STOP_TASK}" (9 PM), and "Home Base Dashboard" on your Desktop.`);
}

function uninstall() {
  if (process.platform !== 'win32') return;
  ps(`
Unregister-ScheduledTask -TaskName ${q(START_TASK)} -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName ${q(STOP_TASK)} -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Home Base Dashboard.lnk') -ErrorAction SilentlyContinue`);
  console.log('Removed the scheduled tasks and the Desktop shortcut. Your data folder was not touched.');
}

module.exports = { install, uninstall, START_TASK, STOP_TASK };
