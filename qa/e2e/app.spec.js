// Percorsi principali dell'app nel browser, con i dati di qa/seed-multianno.js.
// Ordine: prima i test che leggono, poi quelli che modificano i dati.
const { test } = require('@playwright/test');
const { sorveglia, accedi, vaiA, axe, tema, attendiSalvataggi, expect } = require('./aiuti');
const { ATTESI } = require('../seed-multianno');

const Y = new Date().getFullYear();
const euro = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let problemi;
test.beforeEach(({ page }) => { problemi = sorveglia(page); });
test.afterEach(() => { expect(problemi, problemi.join('\n')).toEqual([]); });

test.describe('Accesso e ruoli', () => {
  test('amministratore: entra e vede tutte le sezioni', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await expect(page.locator('.page-title')).toContainText('Dashboard');
    for (const p of ['spese', 'entrate', 'bilancio', 'confronto', 'fornitori', 'vita', 'condomini', 'impostazioni'])
      await expect(page.locator(`.sidebar [data-page="${p}"]`)).toBeVisible();
  });

  test('sola lettura: niente Condomini né Impostazioni, nessun pulsante per modificare le spese', async ({ page }) => {
    await accedi(page, 'member1@qa.test');
    await expect(page.locator('.sidebar [data-page="condomini"]')).toHaveCount(0);
    await expect(page.locator('.sidebar [data-page="impostazioni"]')).toHaveCount(0);
    await vaiA(page, 'spese');
    await expect(page.locator('#btn-add-spesa')).toHaveCount(0);
    await expect(page.locator('[data-del-spesa], [data-edit-spesa]')).toHaveCount(0);
  });

  test('modifica: può aggiungere spese ma non gestire i condomini', async ({ page }) => {
    await accedi(page, 'editor1@qa.test');
    await vaiA(page, 'spese');
    await expect(page.locator('#btn-add-spesa')).toBeVisible();
    await expect(page.locator('.sidebar [data-page="condomini"]')).toHaveCount(0);
  });

  test('password sbagliata: messaggio, nessun accesso', async ({ page }) => {
    await page.goto('/qa/out/harness.html');
    await page.locator('#inp-login').fill('admin1@qa.test');
    await page.locator('#inp-pw').fill('Sbagliata-123');
    await page.locator('#inp-pw').press('Enter');
    await expect(page.locator('#inp-login')).toBeVisible();
    await expect(page.locator('.sidebar')).toHaveCount(0);
  });
});

test.describe('Conti su più anni', () => {
  test(`Dashboard ${Y}: riporto dagli anni precedenti come atteso`, async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await expect(page.getByText('Riporto da anni precedenti:')).toBeVisible();
    await expect(page.getByText('Riporto da anni precedenti:').locator('..')).toContainText('+€ ' + euro(ATTESI[`riporto${Y}`]));
  });
});

test.describe('Aspetto e navigazione', () => {
  test('tastiera: il menu si raggiunge con Tab e si apre una pagina con Invio', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    const voce = page.locator('.sidebar [data-page="spese"]');
    await voce.focus();
    await expect(voce).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.page-title')).toContainText('Spese');
    await expect(page.locator('.sidebar [data-page="spese"]')).toHaveAttribute('aria-current', 'page');
  });

  test('tema scuro: l\'interruttore lo attiva e la scelta resta dopo il ricaricamento', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await tema(page, false);
    await page.locator('[data-tema-switch]').first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await attendiSalvataggi(page);
    await page.reload();
    await expect(page.locator('.page-title')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('ricerca: il tasto / porta al campo, Invio mostra i risultati', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await page.locator('body').click({ position: { x: 700, y: 20 } });
    await page.keyboard.press('/');
    await expect(page.locator('#ricerca-globale')).toBeFocused();
    await page.keyboard.type('pulizie');
    await page.keyboard.press('Enter');
    await expect(page.locator('.page-title')).toContainText('Ricerca');
    await expect(page.getByText(/Pulizie/).first()).toBeVisible();
  });

  test('guida: si apre dal pulsante e si chiude con la X', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await page.locator('.btn-guida').first().click();
    await expect(page.locator('.guida-pannello')).toBeVisible();
    await page.locator('.guida-chiudi').click();
    await expect(page.locator('.guida-pannello')).toHaveCount(0);
  });

  test('pulsanti: icone al posto delle emoji, con un nome per i lettori di schermo', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'spese');
    const elimina = page.locator('.table-wrap [data-del-spesa]').first();
    await expect(elimina.locator('svg.ico')).toHaveCount(1);
    await expect(elimina).toHaveAttribute('aria-label', /Elimina/);
    const testi = await page.locator('button').allInnerTexts();
    expect(testi.filter((t) => /^(✏|🗑|✕)/u.test(t.trim()))).toEqual([]);
  });

  for (const scuro of [false, true]) {
    test(`accessibilità ${scuro ? 'tema scuro' : 'tema chiaro'}: contrasto, nomi ed etichette su tutte le pagine`, async ({ page }) => {
      await accedi(page, 'admin1@qa.test');
      await tema(page, scuro);
      const errori = {};
      for (const p of ['dashboard', 'spese', 'entrate', 'bilancio', 'confronto', 'fornitori', 'vita', 'condomini', 'impostazioni']) {
        await vaiA(page, p);
        const v = await axe(page);
        if (v.length) errori[p] = v;
      }
      expect(errori).toEqual({});
    });
  }
});

test.describe('Telefono', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  test('barra in basso, nessuno scorrimento orizzontale, avvisi sopra la barra', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await expect(page.locator('.bottom-nav')).toBeVisible();
    for (const p of ['dashboard', 'spese', 'entrate', 'bilancio']) {
      await vaiA(page, p);
      const largo = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(largo, `pagina ${p} più larga dello schermo`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('Spese (modifica i dati)', () => {
  test('campi mancanti: avviso dell\'app, nessuna finestrella del browser', async ({ page }) => {
    await accedi(page, 'editor1@qa.test');
    await vaiA(page, 'spese');
    await page.locator('#btn-add-spesa').click();
    await page.locator('#modal-save').click();
    await expect(page.locator('.avviso')).toBeVisible();
  });

  test('aggiungere una spesa e poi eliminarla, con la conferma dell\'app (Esc annulla)', async ({ page }) => {
    const titolo = 'Prova E2E ' + Date.now();
    await accedi(page, 'editor1@qa.test');
    await vaiA(page, 'spese');
    await page.locator('#btn-add-spesa').click();
    await page.locator('#m-titolo').fill(titolo);
    await page.locator('#m-cat').selectOption({ index: 1 });
    await page.locator('#m-prev').fill('123');
    await page.locator('#m-data').fill(`${Y}-06-15`);
    await page.locator('#modal-save').click();
    const riga = page.locator('.table-wrap tr', { hasText: titolo });
    await expect(riga).toHaveCount(1);

    await riga.locator('[data-del-spesa]').click();
    const dlg = page.locator('dialog.dialogo');
    await expect(dlg).toBeVisible();
    await expect(dlg.locator('[data-dlg="no"]')).toBeFocused(); // azione pericolosa: si parte da Annulla
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(riga).toHaveCount(1);

    await riga.locator('[data-del-spesa]').click();
    await page.locator('dialog.dialogo [data-dlg="si"]').click();
    await expect(riga).toHaveCount(0);
    await attendiSalvataggi(page);
    await page.reload();
    await expect(page.locator('.page-title')).toBeVisible();
    await vaiA(page, 'spese');
    await expect(page.locator('.table-wrap tr', { hasText: titolo })).toHaveCount(0);
  });
});

test.describe('Email ai condomini (modifica i dati)', () => {
  test('nuovo avviso: casella spenta; accesa mostra l\'elenco con le spunte; Nessuno = nessuna email', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'vita');
    await page.locator('#btn-nuovo-avviso').click();
    const casella = page.locator('#av-email');
    await expect(casella).not.toBeChecked();
    await expect(page.locator('#av-email-dest')).toBeHidden();
    await casella.check();
    await expect(page.locator('#av-email-dest')).toBeVisible();
    await expect(page.locator('#av-email-dest-conta')).toContainText('selezionati');
    await page.locator('[data-scelta-nessuno="av-email-dest"]').click();
    await expect(page.locator('#av-email-dest-conta')).toContainText('0 di');
    await page.locator('input[data-dest="av-email-dest"][value="103"]').check();
    await page.locator('#av-titolo').fill('Prova email E2E');
    await page.locator('#av-testo').fill('Testo di prova.');
    await page.locator('#btn-save-avviso').click();
    await expect(page.locator('.avviso-ok')).toContainText('Email in partenza per 1 condomino');
  });

  test('promemoria da Entrate: elenco con prossima rata e saldo, conferma, esito', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'entrate');
    await page.locator('#btn-email-promemoria').click();
    await expect(page.locator('.scelta-dest')).toContainText('saldo');
    expect(await axe(page)).toEqual([]);
    await tema(page, true);
    expect(await axe(page)).toEqual([]);
    await page.locator('[data-scelta-nessuno="em-prom"]').click();
    await expect(page.locator('#btn-em-invia')).toBeDisabled();
    await page.locator('input[data-dest="em-prom"][value="103"]').check();
    await expect(page.locator('#btn-em-invia')).toHaveText('📧 Invia a 1');
    await page.locator('#btn-em-invia').click();
    await page.locator('dialog.dialogo [data-dlg="si"]').click();
    await expect(page.locator('.avviso-ok')).toContainText('Email inviata a 1 condomino');
  });

  test('rendiconto dal Bilancio: PDF creato nel browser e inviato ai selezionati', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'bilancio');
    await page.locator('#btn-rendiconto-pdf').click();
    await page.locator('#btn-rend-email').click();
    await expect(page.locator('#em-oggetto')).toHaveValue(/Rendiconto|preventivo/i);
    await page.locator('[data-scelta-nessuno="em-rend"]').click();
    await page.locator('input[data-dest="em-rend"][value="101"]').check();
    await page.locator('input[data-dest="em-rend"][value="103"]').check();
    await page.locator('#btn-em-invia').click();
    await page.locator('dialog.dialogo [data-dlg="si"]').click();
    await expect(page.locator('.avviso-ok')).toContainText('Email inviata a 2 condomini', { timeout: 20_000 });
  });

  test('Impostazioni: promemoria automatici spenti di base, si accendono; storico degli invii', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'impostazioni');
    await expect(page.locator('#imp-prom-auto')).not.toBeChecked();
    await page.locator('#imp-prom-auto').check();
    await page.locator('#imp-prom-giorni').selectOption('5');
    await page.locator('#btn-imp-email-salva').click();
    await expect(page.locator('.avviso-ok')).toContainText('5 giorni prima');
    await expect(page.locator('#email-storico .storico-email li').first()).toBeVisible();
    await expect(page.locator('#email-storico')).toContainText('Rendiconto');
  });

  test('chi ha "Riceve le email" nella scheda condomino; un condomino non vede i pulsanti di invio', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'condomini');
    await page.locator('.utente-card', { hasText: 'Marta Member' }).getByRole('button', { name: 'Modifica' }).click();
    await expect(page.locator('#m-email-notifiche')).toBeChecked();
  });

  test('sola lettura: nessun pulsante per inviare email', async ({ page }) => {
    await accedi(page, 'member1@qa.test');
    await vaiA(page, 'entrate');
    await expect(page.locator('#btn-email-promemoria')).toHaveCount(0);
  });
});

test.describe('Subentro (modifica i dati)', () => {
  test('chi può modificare ma non amministra non vede il pulsante', async ({ page }) => {
    await accedi(page, 'editor1@qa.test');
    await expect(page.locator('[data-subentro-cond]')).toHaveCount(0);
  });

  test('amministratore: archivia chi esce e inserisce chi entra nello stesso appartamento', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'condomini');
    await page.locator('[data-subentro-cond="105"]').click();
    await page.locator('#sub-nome').fill('Nuova Proprietaria');
    await page.locator('#btn-sub-conferma').click();
    await expect(page.locator('.avviso-ok')).toBeVisible();
    await attendiSalvataggi(page);
    await page.reload();
    await expect(page.locator('.page-title')).toBeVisible();
    await vaiA(page, 'condomini');
    await expect(page.locator('.utente-card', { hasText: 'Nuova Proprietaria' })).toContainText('Int. 5');
    await expect(page.getByText(/uscito il/).first()).toBeVisible();
  });
});
