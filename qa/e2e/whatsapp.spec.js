// WhatsApp ai condomini nel browser (js/sezioni/whatsapp.js), con i dati di
// qa/seed-multianno.js. Gira dopo app.spec.js. window.open è sostituito: il
// test legge il link wa.me che l'app aprirebbe, senza uscire dall'emulatore.
const { test } = require('@playwright/test');
const { sorveglia, accedi, vaiA, axe, attendiSalvataggi, expect } = require('./aiuti');

let problemi;
test.beforeEach(({ page }) => { problemi = sorveglia(page); });
test.afterEach(() => { expect(problemi, problemi.join('\n')).toEqual([]); });

async function intercettaAperture(page) {
  await page.evaluate(() => { window.__aperti = []; window.open = (u) => { window.__aperti.push(u); return null; }; });
}

test.describe('WhatsApp ai condomini (modifica i dati)', () => {
  test('cellulare nella scheda, poi avviso su WhatsApp: link con il numero e il testo, storico in Impostazioni', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'condomini');
    await page.locator('.utente-card', { hasText: 'Marta Member' }).getByRole('button', { name: 'Modifica' }).click();
    await expect(page.locator('#m-wa-notifiche')).toBeChecked();
    await page.locator('#m-tel').fill('333 123 4567');
    await page.locator('#modal-save').click();
    await expect(page.locator('.modal')).toHaveCount(0);
    await attendiSalvataggi(page);

    await vaiA(page, 'vita');
    await page.locator('[data-wa-avviso="7001"]').click();
    await expect(page.locator('.modal h2')).toContainText('Chiusura acqua');
    await expect(page.locator('#wa-anteprima')).toContainText('Ciao Marta, nuovo avviso');
    await expect(page.locator('#wa-anteprima')).toContainText('*Chiusura acqua*');
    expect(await axe(page)).toEqual([]);
    await intercettaAperture(page);
    await page.locator('[data-wa-apri="103"]').click();
    await expect(page.locator('[data-wa-apri="103"]')).toHaveText('✓ Aperto');
    const [link] = await page.evaluate(() => window.__aperti);
    expect(link).toMatch(/^https:\/\/wa\.me\/393331234567\?text=/);
    expect(decodeURIComponent(link.split('text=')[1])).toContain('Martedì mattina');
    await page.locator('#modal-cancel').click();

    await vaiA(page, 'impostazioni');
    await expect(page.locator('#wa-storico')).toContainText('Nuovo avviso');
    await expect(page.locator('#wa-storico')).toContainText('aperto per 1 condomino');
  });

  test('Impostazioni: testo cambiato e promemoria spento valgono anche dopo aver ricaricato', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'entrate');
    await expect(page.locator('#btn-wa-promemoria')).toBeVisible();
    await vaiA(page, 'impostazioni');
    await page.locator('#wa-mod-avviso').fill('Avviso per {nome}: {titolo}. {firma}');
    await page.locator('#wa-firma').fill('Lo studio');
    await page.locator('#wa-on-promemoria').uncheck();
    await page.locator('#btn-wa-salva').click();
    await expect(page.locator('.avviso-ok')).toContainText('Impostazioni WhatsApp salvate');
    await page.reload();
    await expect(page.locator('.page-title').first()).toBeVisible();
    await vaiA(page, 'entrate');
    await expect(page.locator('#btn-wa-promemoria')).toHaveCount(0);
    await vaiA(page, 'vita');
    await page.locator('[data-wa-avviso="7001"]').click();
    await expect(page.locator('#wa-anteprima')).toHaveText('Avviso per Marta: Chiusura acqua. Lo studio');
  });

  test('sola lettura: nessun pulsante WhatsApp', async ({ page }) => {
    await accedi(page, 'member1@qa.test');
    await vaiA(page, 'vita');
    await expect(page.locator('.page-title').first()).toBeVisible();
    await expect(page.locator('[data-wa-avviso], [data-wa-verbale]')).toHaveCount(0);
  });
});
