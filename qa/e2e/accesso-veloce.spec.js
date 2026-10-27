// Accesso più rapido (misuratore-prestazioni 2026-10-27, PERF-001/003/005/006/007):
// ciò che si vede resta uguale, cambia l'ordine e il numero delle richieste.
// Dati di qa/seed-multianno.js sugli emulatori; nessun accesso a staging o produzione.
const { test } = require('@playwright/test');
const { sorveglia, PAGINA, expect } = require('./aiuti');
const { PASSWORD } = require('../seed');

let problemi;
test.beforeEach(({ page }) => { problemi = sorveglia(page); });
test.afterEach(() => { expect(problemi, problemi.join('\n')).toEqual([]); });

// Registra le richieste verso whoami e i documenti letti con getDoc (percorso).
async function strumenta(page) {
  const whoami = [];
  page.on('request', (r) => { if (/\/whoami(\?|$)/.test(r.url()) && r.method() === 'POST') whoami.push({ auth: r.headers()['authorization'] || null, dati: r.postData() }); });
  await page.goto(PAGINA);
  await page.locator('#inp-login').waitFor();
  await page.waitForFunction(() => window._fb && typeof window._fb.getDoc === 'function');
  await page.evaluate(() => {
    window.__getDoc = []; window.__renderConUtente = 0;
    const fb = window._fb, orig = fb.getDoc;
    fb.getDoc = (ref, ...x) => { window.__getDoc.push(ref.path); return orig(ref, ...x); };
    const r0 = window.render;
    window.render = function () { if (state.user) window.__renderConUtente++; return r0.apply(this, arguments); };
  });
  return whoami;
}

async function entra(page, email) {
  await page.locator('#inp-login').fill(email);
  await page.locator('#inp-pw').fill(PASSWORD);
  await page.locator('#inp-pw').press('Enter');
  await expect(page.locator('.page-title').first()).toBeVisible();
  await expect(page.locator('.kpi-value').first()).toBeVisible();
}

test.describe('Accesso più rapido', () => {
  test('whoami viene riscaldato una sola volta, senza credenziali né dati; l\'accesso vero lo chiama con il token', async ({ page }) => {
    const whoami = await strumenta(page);
    await expect.poll(() => whoami.length).toBe(1);
    expect(whoami[0].auth).toBeNull();
    expect(JSON.parse(whoami[0].dati)).toEqual({ data: {} });
    await entra(page, 'member1@qa.test');
    await expect.poll(() => whoami.length).toBe(2);
    expect(whoami[1].auth).toMatch(/^Bearer /);
    // Nessun'altra chiamata per il resto della sessione di prova.
    await page.waitForTimeout(500);
    expect(whoami.length).toBe(2);
  });

  test('condomino: stessi dati di sempre, niente richieste ai documenti riservati, impostazioni lette prima del disegno', async ({ page }) => {
    await strumenta(page);
    await entra(page, 'member1@qa.test');
    await page.waitForTimeout(600); // eventuali letture e ridisegni tardivi
    const letti = await page.evaluate(() => window.__getDoc);
    expect(letti.filter((p) => /cm_config|cm_login_stats/.test(p))).toEqual([]);
    expect(letti.filter((p) => /impostazioni\/millesimi/.test(p)).length).toBe(1);
    expect(letti.filter((p) => /impostazioni\/affitti/.test(p)).length).toBe(1);
    // Come prima: solo il proprio edificio, nessun contatto degli altri condomini.
    const q = await page.evaluate(() => ({
      edifici: state.edifici.map((e) => e.id), edificio: state.edificioAttivo,
      altriEdifici: [...state.condomini, ...state.spese, ...state.entrate].filter((r) => r.edificioId && r.edificioId !== state.edificioAttivo).length,
      contatti: state.condomini.filter((c) => c.email || c.emailLower).length,
    }));
    expect(q.edifici.length).toBe(1);
    expect(q.altriEdifici).toBe(0);
    expect(q.contatti).toBe(0);
    // Un solo disegno con l'utente: millesimi, affitti e WhatsApp non ne chiedono un secondo.
    expect(await page.evaluate(() => window.__renderConUtente)).toBe(1);
  });

  test('amministratore: contatti dei condomini presenti, impostazioni WhatsApp lette prima del disegno', async ({ page }) => {
    await strumenta(page);
    await entra(page, 'admin1@qa.test');
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => state.condomini.find((c) => c.id === 103)?.email)).toBe('member1@qa.test');
    const letti = await page.evaluate(() => window.__getDoc);
    expect(letti.filter((p) => /impostazioni\/whatsapp/.test(p)).length).toBe(1);
    expect(letti.filter((p) => /cm_config|cm_login_stats/.test(p))).toEqual([]);
    expect(await page.evaluate(() => window.__renderConUtente)).toBe(1);
  });

  test('superAdmin: vede tutti gli edifici e il registro accessi con l\'accesso appena fatto', async ({ page }) => {
    await strumenta(page);
    await entra(page, 'superadmin@qa.test');
    await expect.poll(() => page.evaluate(() => Object.keys(state.loginStats || {}).length)).toBeGreaterThan(0);
    const letti = await page.evaluate(() => window.__getDoc);
    expect(letti.filter((p) => /cm_login_stats/.test(p)).length).toBe(1);
    expect(await page.evaluate(() => state.edifici.length)).toBeGreaterThan(1);
  });

  test('riavvio con sessione salvata: stessa pagina, un solo riscaldamento di whoami', async ({ page }) => {
    await strumenta(page);
    await entra(page, 'editor1@qa.test');
    const whoami2 = [];
    page.on('request', (r) => { if (/\/whoami(\?|$)/.test(r.url()) && r.method() === 'POST') whoami2.push(r.headers()['authorization'] || null); });
    await page.reload();
    await expect(page.locator('.page-title').first()).toBeVisible();
    await expect(page.locator('.kpi-value').first()).toBeVisible();
    await expect.poll(() => whoami2.length).toBe(2);
    expect(whoami2.filter((a) => a === null).length).toBe(1);
    expect(await page.evaluate(() => state.condomini.find((c) => c.id === 103)?.email)).toBe('member1@qa.test');
  });
});
