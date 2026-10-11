// Test nel browser (end-to-end): l'app vera in Chromium contro gli emulatori
// Firebase del progetto demo-qa, con i dati di qa/seed-multianno.js.
// Si avviano con:  npm run test:e2e   (emulatori, dati e pagina di prova automatici)
// Nessun accesso a staging o produzione; la password di prova vale solo sull'emulatore.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'qa/e2e',
  // I test cambiano i dati condivisi dell'emulatore: uno alla volta, in ordine.
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'qa/out/e2e-report' }]] : 'list',
  outputDir: 'qa/out/e2e-risultati',
  use: {
    baseURL: 'http://127.0.0.1:8911',
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
  ],
  webServer: {
    command: 'npx http-server -p 8911 -c-1 -s',
    url: 'http://127.0.0.1:8911/qa/out/harness.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
