// Funzioni comuni dei test nel browser.
const { expect } = require('@playwright/test');
const path = require('path');
const { PASSWORD } = require('../seed');

const PAGINA = '/qa/out/harness.html';

// Ogni test parte da un browser pulito (nessun accesso salvato) e fallisce se
// l'app mostra una finestrella del browser (alert/confirm/prompt: ora vietate)
// o se nella console compare un errore JavaScript.
function sorveglia(page) {
  const problemi = [];
  page.on('dialog', async (d) => { problemi.push(`finestrella del browser: ${d.type()} "${d.message()}"`); await d.dismiss(); });
  page.on('pageerror', (e) => problemi.push('errore JavaScript: ' + e.message));
  return problemi;
}

async function accedi(page, email) {
  await page.goto(PAGINA);
  await page.locator('#inp-login').fill(email);
  await page.locator('#inp-pw').fill(PASSWORD);
  await page.locator('#inp-pw').press('Enter');
  await expect(page.locator('.sidebar, .bottom-nav').first()).toBeVisible();
  await expect(page.locator('.page-title').first()).toBeVisible();
}

async function vaiA(page, id) {
  // Telefono: barra in basso (il menu laterale è fuori schermo); computer: menu laterale.
  const basso = page.locator(`.bottom-nav [data-page="${id}"]`);
  if (await page.locator('.bottom-nav').isVisible() && await basso.count()) await basso.click();
  else await page.locator(`.sidebar [data-page="${id}"]`).click();
  await expect(page.locator('.page-title').first()).toBeVisible();
}

// Controllo di accessibilità con axe-core (contrasto, nomi dei pulsanti, etichette).
async function axe(page, regole = ['color-contrast', 'button-name', 'label', 'link-name', 'select-name', 'image-alt']) {
  await page.addScriptTag({ path: path.join(__dirname, '..', '..', 'node_modules', 'axe-core', 'axe.min.js') });
  const ris = await page.evaluate(async (r) => (await window.axe.run(document, { runOnly: { type: 'rule', values: r } })).violations
    .map((v) => `${v.id}: ${v.nodes.length} (${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')})`), regole);
  return ris;
}

// Come una persona: prima di ricaricare aspetta che il salvataggio sia confermato.
async function attendiSalvataggi(page) {
  await page.waitForFunction(() => salvataggiInCorso() === 0);
}

async function tema(page, scuro) {
  await page.evaluate((s) => { localStorage.setItem('cm_tema', s ? 'scuro' : 'chiaro'); applicaTema(); render(); }, scuro);
}

module.exports = { PAGINA, sorveglia, accedi, vaiA, axe, tema, attendiSalvataggi, expect };
