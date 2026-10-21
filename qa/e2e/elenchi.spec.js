// Elenchi lunghi (prestazioni 2026-10-21): Spese ed Entrate disegnano 200 righe
// alla volta con "Mostra altre"; totali, selezione ed esportazione restano
// sull'elenco intero. Le righe in più sono aggiunte solo in memoria nella
// pagina (nessun salvataggio): i dati dell'emulatore non cambiano.
const { test } = require('@playwright/test');
const { sorveglia, accedi, vaiA, expect } = require('./aiuti');

let problemi;
test.beforeEach(({ page }) => { problemi = sorveglia(page); });
test.afterEach(() => { expect(problemi, problemi.join('\n')).toEqual([]); });

const Y = new Date().getFullYear();

test('Spese: 200 righe alla volta, "Seleziona tutte" prende anche quelle non ancora mostrate', async ({ page }) => {
  await accedi(page, 'admin1@qa.test');
  await page.evaluate((anno) => {
    const extra = Array.from({ length: 260 }, (_, i) => ({ id: 800000 + i, titolo: 'Massa ' + i, categoria: 'pulizie', tipoSpesa: 'ordinaria',
      preventivo: '10', consuntivo: '10', data: `${anno}-05-${String(1 + (i % 28)).padStart(2, '0')}`, edificioId: 1, allegati: [], split: [] }));
    state.spese = [...state.spese, ...extra];
  }, Y);
  await vaiA(page, 'spese');
  await page.locator('#search-spese').fill('Massa');
  await expect(page.locator('.table-wrap .chk-spesa')).toHaveCount(200);
  await expect(page.locator('.altre-righe')).toContainText('200 di 260');
  await page.locator('[data-altre-righe="spese"]').click();
  await expect(page.locator('.table-wrap .chk-spesa')).toHaveCount(260);
  await expect(page.locator('.altre-righe')).toHaveCount(0);
  // Selezione dall'intestazione: tutte le 260 dell'elenco filtrato.
  await page.evaluate(() => { state.righeMostrate = {}; render(); });
  await expect(page.locator('.table-wrap .chk-spesa')).toHaveCount(200);
  await page.locator('#chk-all-spese').click(); // la casella si ridisegna non spuntata: conta la barra
  await expect(page.locator('.sel-count-bar')).toContainText('260 spese selezionate');
});

test('Entrate: 200 versamenti alla volta, totale su tutti', async ({ page }) => {
  await accedi(page, 'admin1@qa.test');
  await page.evaluate((anno) => {
    const extra = Array.from({ length: 230 }, (_, i) => ({ id: 900000 + i, condominoId: 103, importo: '1', data: `${anno}-03-${String(1 + (i % 28)).padStart(2, '0')}`,
      descrizione: 'Massa', categoria: 'quote', edificioId: 1, previsionale: false }));
    state.entrate = [...state.entrate, ...extra];
  }, Y);
  await vaiA(page, 'entrate');
  const totali = await page.evaluate(() => { const a = anniSelezionati(); return state.entrate.filter((e) => e.edificioId === 1 && inAnniSelezionati(e.data, a)).length; });
  const righe = page.locator('.card', { hasText: 'Tutti i versamenti' }).locator('.table-wrap tbody tr');
  await expect(page.locator('.page-sub').first()).toContainText(`${totali} versamenti`);
  await expect(righe).toHaveCount(200);
  await expect(page.locator('.altre-righe')).toContainText(`200 di ${totali}`);
  await page.locator('[data-altre-righe="entrate"]').click();
  await expect(righe).toHaveCount(Math.min(400, totali));
});
