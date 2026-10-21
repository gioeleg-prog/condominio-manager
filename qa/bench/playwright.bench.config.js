// Banco di misura delle prestazioni (qa/bench): stesso server e stessa pagina
// di prova dei test nel browser (playwright.config.js), un solo worker, tempi
// lunghi. Si avvia con:  npm run bench   (vedi qa/bench/run.js)
const { defineConfig, devices } = require('@playwright/test');
const base = require('../../playwright.config.js');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /bench\.spec\.js$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240 * 60_000,
  expect: { timeout: 600_000 },
  reporter: 'list',
  outputDir: '../out/bench-risultati',
  use: { ...base.use, trace: 'off', screenshot: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
  ],
  webServer: { ...base.webServer, cwd: require('path').join(__dirname, '..', '..') },
});
