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

test('Spese: una spesa con id testuale si seleziona e si esporta come le altre (ADV-FUNC-042)', async ({ page }) => {
  await accedi(page, 'admin1@qa.test');
  await page.evaluate((anno) => {
    state.spese = [...state.spese, { id: 'txt-1', titolo: 'Spesa id testuale', categoria: 'pulizie', tipoSpesa: 'ordinaria',
      preventivo: '10', consuntivo: '10', data: `${anno}-05-05`, edificioId: 1, allegati: [], split: [] }];
  }, Y);
  await vaiA(page, 'spese');
  await page.locator('#search-spese').fill('id testuale');
  await expect(page.locator('.chk-spesa')).toHaveCount(1);
  await page.locator('.chk-spesa').check();
  await expect(page.locator('.sel-count-bar')).toContainText('1 spese selezionate');
  // L'esportazione delle selezionate include la spesa (prima era esclusa in silenzio).
  const [csv] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-export-spese').click()]);
  expect(csv.suggestedFilename()).toContain('selezionate');
  const testo = require('fs').readFileSync(await csv.path(), 'utf8');
  expect(testo).toContain('Spesa id testuale');
  // "Seleziona tutte" la tiene, e la selezione sopravvive al ridisegno.
  await page.locator('#btn-sel-all').click();
  await expect(page.locator('.sel-count-bar')).toContainText('1 spese selezionate');
});

test('Spese: matita e cestino della riga funzionano anche con id testuale (CR-06)', async ({ page }) => {
  await accedi(page, 'admin1@qa.test');
  await page.evaluate((anno) => {
    state.spese = [...state.spese, { id: 'txt-2', titolo: 'Spesa riga testuale', categoria: 'pulizie', tipoSpesa: 'ordinaria',
      preventivo: '10', consuntivo: '10', data: `${anno}-05-05`, edificioId: 1, allegati: [], split: [] }];
  }, Y);
  await vaiA(page, 'spese');
  await page.locator('#search-spese').fill('riga testuale');
  const riga = page.locator('.table-wrap tr', { hasText: 'Spesa riga testuale' });
  await expect(riga).toHaveCount(1);
  // Matita: apre la scheda della spesa.
  await riga.locator('[data-edit-spesa]').click();
  await expect(page.locator('#m-titolo')).toHaveValue('Spesa riga testuale');
  await page.locator('#modal-cancel').click();
  // Cestino: dopo la conferma la riga sparisce.
  await riga.locator('[data-del-spesa]').click();
  await page.locator('dialog.dialogo [data-dlg="si"]').click();
  await expect(riga).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => state.spese.some((s) => s.id === 'txt-2'))).toBe(false);
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
