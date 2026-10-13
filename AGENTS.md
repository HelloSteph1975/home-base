# Instructions for AI agents

These instructions are for an AI agent like Claude Code or Codex that is
installing, updating or removing Home Base for someone. Read the rules first.

## Rules

1. Never delete, move, overwrite or reset the data folder. It holds the person's
   notes and backups. By default it is `Documents/Home Base Data` in their home
   folder. `dataDir` in `config.json` changes it, and the environment variable
   `HOME_BASE_DATA_DIR` overrides both.
2. Never point `dataDir` at a new, empty folder to "fix" an error. The app would
   look empty, and the person's notes are still in the old folder.
3. Don't edit or delete `config.json` without telling the person. Setup creates
   it, and Git ignores it.
4. Tests, demos and experiments use temporary folders. Never point them at the
   person's data folder, and never use their port, which is 4173 by default.
5. Ask before running `npm run install-windows`. It adds two scheduled tasks and
   a Desktop shortcut.

## Install

Needs Node.js 24 or newer, and Git or a ZIP of the repo.

1. `git clone https://github.com/HelloSteph1975/home-base.git` and `cd home-base`.
2. `npm install`
3. `npm run setup`. This writes `config.json` if it's missing and creates the
   data folder. If the person wants their notes somewhere else, edit `dataDir`
   in `config.json` first, then run setup again. Windows paths need doubled
   backslashes, like `"D:\\Home Data"`.
4. On Windows, offer `npm run install-windows`. Explain that it starts Home Base
   every morning at 5:30, stops it at 9 PM, and adds a "Home Base Dashboard"
   shortcut to the Desktop. Run it only if they say yes.
5. Start it with `npm start`, or the Desktop shortcut on Windows.
6. Check it: `GET http://127.0.0.1:<port>/api/health` returns JSON with
   `"app": "home-base"`. The port is in `config.json`, and the default is 4173.
7. Tell the person to open `http://127.0.0.1:<port>/` and add their homes on the
   Homes page.

## Update

1. `npm run stop`
2. `git pull`, or copy the new files over the folder and keep `config.json`.
3. `npm install`
4. Start it again.

An update never touches the data folder.

## Uninstall

1. On Windows, `npm run uninstall-windows`. It stops Home Base and removes the
   scheduled tasks and the Desktop shortcut. On macOS or Linux, `npm run stop`.
2. Before removing the app folder, resolve the data folder path as Rule 1
   describes. If it is the app folder or inside it, stop and tell the person why.
   Don't remove anything.
3. Otherwise the app folder can be removed if they want. Leave the data folder
   unless they explicitly ask to delete it. If they do, remind them it holds all
   their notes and backups, and confirm once more.

## Troubleshooting

- **"Port 4173 is busy."** Another copy is probably running already, which is
  fine. To restart it, run `npm run stop`, then start it again. If a different
  program uses the port, set another `port` in `config.json` and restart.
- **`config.json` errors.** The app names the file and stops. The usual cause is
  a Windows path with single backslashes. Fix only that line.
- **"The data folder doesn't exist or can't be reached."** The folder is missing
  or on a drive that isn't connected. Connect the drive, or fix `dataDir`. Don't
  create an empty folder in its place.
- **"Home Base couldn't start" on Windows.** Read the last lines of `server.log`
  in the app folder.
- **Settings → Needs attention lists a note.** The properties block between the
  `---` lines at the top of the note is broken, or the note names a home that
  doesn't exist. Fix the note in a text editor. Home Base never rewrites a
  broken note.
- **Restoring.** Use Settings → Backups. Don't copy files by hand. Every restore
  first copies the current version to `_Trash/`.

## Coming from Home Base 1

Home Base 1 kept appointments in `Health & Fitness/Doctor's Appointments` and
bills in `Personal Finance/Bills`. To move them:

1. Run `npm run migrate -- --dry-run --homes "Main house:home,Cabin:cabin"` with
   the names and kinds of the person's homes. Kinds are home, cabin, land,
   family, rental and other. Show the person the output in plain words.
2. Only when they agree, run the same command without `--dry-run`. It takes a
   backup first and logs what it did in `.home-base/migration-<date>.log`.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Start Home Base |
| `npm run demo` | Start a demo with sample data on port 4205, in its own temp folder |
| `npm test` | Unit and API tests, in temp folders only |
| `npm run test:e2e` | Browser tests on port 4207. Run `npx playwright install chromium` once first |
| `npm run setup` | Write `config.json` and create the data folder |
| `npm run migrate` | One-time move of Home Base 1 notes |
| `npm run stop` | Stop Home Base |
| `npm run install-windows` | Setup plus the scheduled tasks and Desktop shortcut |
| `npm run uninstall-windows` | Stop and remove the tasks and shortcut |
