# Home Base

A household app: Today, Calendar, Homes, Bills and Settings, reading and writing
Markdown notes in a data folder. Install, update and uninstall steps for agents
are in `AGENTS.md`.

## Layout

- `server/` Node 24, CommonJS, no runtime dependencies. `app.js` wires the
  notes service (`notes.js`), the SQLite index (`index-db.js`, rebuilt from the
  notes on every start), backups (`backup.js`) and routes (`routes/`).
- `public/` the browser app: plain ES modules, no build step.
- `scripts/` demo data, migration from Home Base 1, setup, launch, stop, Windows install.
- `windows/` launcher `.vbs` files and the icon.
- `test/` `node --test`; `e2e/` Playwright.

## Rules

- Notes are the source of truth. Write the note first, then `index.refresh(rel)`.
- Never overwrite a note whose properties block can't be read. Deletions go to `_Trash/`.
- Dates are local `YYYY-MM-DD` strings from `server/dates.js`. Never `toISOString()` for a date.
- Tests and experiments use temp folders. Never use port 4173 or a real data folder.
- Ports: app 4173, demo 4205, browser tests 4207.
- Stop scripts are Node, not PowerShell. Antivirus flagged a hidden PowerShell stop script.

## Commands

`npm test`, `npm run test:e2e`, `npm run demo`, `npm start`, `npm run stop`.
