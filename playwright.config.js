const os = require('node:os');
const path = require('node:path');
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4207' },
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning server/index.js --demo',
    url: 'http://127.0.0.1:4207/api/health',
    reuseExistingServer: false,
    env: { HOME_BASE_PORT: '4207', HOME_BASE_DEMO_DIR: path.join(os.tmpdir(), 'home-base-e2e') },
  },
});
