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

test.describe('Stampa', () => {
  test('Bilancio e Confronto: in stampa solo il contenuto, tema chiaro e data di stampa', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await tema(page, 'scuro');
    for (const p of ['bilancio', 'confronto']) {
      await vaiA(page, p);
      await expect(page.getByRole('button', { name: 'Stampa' })).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await page.emulateMedia({ media: 'print' });
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
      for (const sel of ['.sidebar', '.bottom-nav', '.btn-guida', '.tema-switch']) await expect(page.locator(sel).first()).toBeHidden();
      await expect(page.locator('.page button:visible')).toHaveCount(0);
      await expect(page.locator('.page-title')).toBeVisible();
      expect(await page.locator('.page-sub').first().evaluate((e) => getComputedStyle(e, '::after').content)).toMatch(/Stampato il/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      if (process.env.STAMPA_PDF) await page.pdf({ path: `qa/out/stampa-${p}.pdf`, format: 'A4' });
      await page.emulateMedia({ media: 'screen' });
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    }
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
    await expect(page.locator('#btn-em-invia')).toHaveText(/^\s*Invia a 1$/);
    await expect(page.locator('#btn-em-invia svg.ico')).toHaveCount(1);
    await page.locator('#btn-em-invia').click();
    await page.locator('dialog.dialogo [data-dlg="si"]').click();
    await expect(page.locator('.avviso-ok')).toContainText('Email inviata a 1 condomino');
  });

  test('rendiconto dal Bilancio: PDF creato nel browser e inviato ai selezionati', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'bilancio');
    await page.locator('#btn-rendiconto-pdf').click();
    const pallino = await page.locator('input[name="rend-tipo"]').first().boundingBox();
    expect(pallino.width).toBeLessThan(24);
    await expect(page.locator('#btn-rend-email')).toContainText('Scegli a chi inviare');
    await page.locator('#btn-rend-email').click();
    await expect(page.locator('#em-oggetto')).toHaveValue(/Rendiconto|preventivo/i);
    await page.locator('[data-scelta-nessuno="em-rend"]').click();
    await page.locator('input[data-dest="em-rend"][value="101"]').check();
    await page.locator('input[data-dest="em-rend"][value="103"]').check();
    const [scaricato] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-em-scarica').click()]);
    expect(scaricato.suggestedFilename()).toMatch(/^(Rendiconto|Preventivo)_[0-9]{4}_.*[.]pdf$/);
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
    await expect(page.locator('label[for="m-username"]')).toHaveText('Nickname (facoltativo)');
    await expect(page.locator('.modal')).not.toContainText('Username');
  });

  test('sola lettura: nessun pulsante per inviare email', async ({ page }) => {
    await accedi(page, 'member1@qa.test');
    await vaiA(page, 'entrate');
    await expect(page.locator('#btn-email-promemoria')).toHaveCount(0);
  });
});

test.describe('Millesimi (modifica i dati)', () => {
  test('spenti di base: la spesa nuova si divide in parti uguali e non c\'è il pulsante Millesimi', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'spese');
    await page.locator('#btn-add-spesa').click();
    await expect(page.locator('#split-millesimi')).toHaveCount(0);
    await expect(page.locator('#split-tabella')).toHaveCount(0);
  });

  test('accesi in Impostazioni con la tabella: la spesa nuova propone i millesimi, modificabili; in anagrafica in sola lettura', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'impostazioni');
    await expect(page.locator('#mill-attivo')).not.toBeChecked();
    await page.locator('#mill-attivo').check();
    await page.locator('#mill-dal').fill(`${new Date().getFullYear()}-01-01`);
    const valori = { 'int. 1': '200', 'int. 2': '200', 'int. 3': '150', 'int. 4': '150', 'int. 5': '150', 'int. 7': '150' };
    for (const [apt, v] of Object.entries(valori)) await page.locator(`.mill-val[data-ti="0"][data-apt="${apt}"]`).fill(v);
    await expect(page.locator('#mill-tot-0')).toContainText('Totale 1000 / 1000');
    await page.locator('#mill-salva').click();
    await expect(page.locator('.avviso-ok')).toContainText('Millesimi salvati');

    await vaiA(page, 'spese');
    await page.locator('#btn-add-spesa').click();
    await expect(page.locator('#split-mill-nota')).toContainText('Proposta dai millesimi');
    await expect(page.locator('.split-perc-inp[data-cid="101"]')).toHaveValue('20.00');
    await expect(page.locator('.split-perc-inp[data-cid="103"]')).toHaveValue('15.00');
    // "Parti uguali" resta disponibile e il pulsante Millesimi ripropone la tabella.
    await page.locator('#split-equal').click();
    await expect(page.locator('.split-perc-inp[data-cid="101"]')).not.toHaveValue('20.00');
    await page.locator('#split-millesimi').click();
    await expect(page.locator('.split-perc-inp[data-cid="101"]')).toHaveValue('20.00');
    await page.locator('#modal-cancel').click();

    await vaiA(page, 'condomini');
    await expect(page.locator('.utente-card', { hasText: 'Anna Admin' })).toContainText('Generale 200');
    expect(await axe(page)).toEqual([]);
  });

  test('seconda tabella per categoria: Ascensore propone la sua tabella e chi ha 0 non paga', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'impostazioni');
    await page.locator('#mill-aggiungi').click();
    await page.locator('.mill-nome[data-ti="1"]').fill('Ascensore');
    const valori = { 'int. 1': '300', 'int. 2': '300', 'int. 3': '200', 'int. 4': '200', 'int. 5': '0', 'int. 7': '0' };
    for (const [apt, v] of Object.entries(valori)) await page.locator(`.mill-val[data-ti="1"][data-apt="${apt}"]`).fill(v);
    await expect(page.locator('#mill-tot-1')).toContainText('Totale 1000 / 1000');
    // L'associazione categoria → tabella compare con almeno due tabelle: salvo e riapro.
    await page.locator('#mill-salva').click();
    await expect(page.locator('.avviso-ok')).toContainText('Millesimi salvati');
    await page.locator('select[data-mill-cat="ascensore"]').selectOption({ label: 'Ascensore' });
    await page.locator('#mill-salva').click();
    await attendiSalvataggi(page);

    await vaiA(page, 'spese');
    await page.locator('#btn-add-spesa').click();
    await page.locator('#m-cat').selectOption('ascensore');
    await expect(page.locator('#split-tabella option:checked')).toHaveText('Ascensore');
    await expect(page.locator('#split-mill-nota')).toContainText('senza millesimi: Dora Doppia, Ugo Usato');
    await expect(page.locator('.split-perc-inp[data-cid="101"]')).toHaveValue('30.00');
    await expect(page.locator('.split-perc-inp[data-cid="105"]')).toHaveValue('0.00');
    // Pulizie torna alla tabella Generale.
    await page.locator('#m-cat').selectOption('pulizie');
    await expect(page.locator('.split-perc-inp[data-cid="101"]')).toHaveValue('20.00');
  });

  test('data prima dell\'attivazione: torna alle parti uguali; quote toccate a mano non vengono riscritte', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'spese');
    await page.locator('#btn-add-spesa').click();
    await expect(page.locator('.split-perc-inp[data-cid="101"]')).toHaveValue('20.00');
    await page.locator('#m-data').fill(`${new Date().getFullYear() - 1}-12-15`);
    await page.locator('#m-data').dispatchEvent('change');
    await expect(page.locator('#split-mill-nota')).toContainText('parti uguali');
    await expect(page.locator('.split-perc-inp[data-cid="101"]')).not.toHaveValue('20.00');
    // Di nuovo nel periodo dei millesimi: la proposta torna.
    await page.locator('#m-data').fill(`${new Date().getFullYear()}-06-15`);
    await page.locator('#m-data').dispatchEvent('change');
    await expect(page.locator('.split-perc-inp[data-cid="101"]')).toHaveValue('20.00');
    // Quota modificata a mano (bloccata): cambiare categoria non la riscrive.
    await page.locator('.split-perc-inp[data-cid="101"]').fill('25');
    await page.locator('#m-cat').selectOption('ascensore');
    await expect(page.locator('.split-perc-inp[data-cid="101"]')).toHaveValue('25');
  });

  test('ripartizione fotografata: cambiare la tabella non modifica le spese già salvate; totale ≠ 1000 chiede conferma', async ({ page }) => {
    const titolo = 'Millesimi fotografati ' + Date.now();
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'spese');
    await page.locator('#btn-add-spesa').click();
    await page.locator('#m-titolo').fill(titolo);
    await page.locator('#m-cat').selectOption('pulizie');
    await page.locator('#m-prev').fill('1000');
    await page.locator('#modal-save').click();
    await attendiSalvataggi(page);
    const perc = async () => page.evaluate((t) => state.spese.find((s) => s.titolo === t).split.find((x) => x.id === 101).perc, titolo);
    expect(await perc()).toBe(20);

    await vaiA(page, 'impostazioni');
    await page.locator('.mill-val[data-ti="0"][data-apt="int. 1"]').fill('300');
    await expect(page.locator('#mill-tot-0')).toContainText('Totale 1100 / 1000');
    await page.locator('#mill-salva').click();
    await expect(page.locator('dialog.dialogo')).toContainText('Il totale non è 1000');
    await page.locator('dialog.dialogo [data-dlg="si"]').click();
    await expect(page.locator('.avviso-ok')).toContainText('Millesimi salvati');
    expect(await perc()).toBe(20);
    // Ripristino della tabella corretta.
    await page.locator('.mill-val[data-ti="0"][data-apt="int. 1"]').fill('200');
    await page.locator('#mill-salva').click();
    await expect(page.locator('.avviso-ok').last()).toContainText('Millesimi salvati');
  });

  test('applica all\'anno in corso: anteprima, conferma; consuntivate e anni passati intatti', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    const Y = new Date().getFullYear();
    const prima = await page.evaluate((Y) => ({
      consuntivata: JSON.stringify(state.spese.find((s) => s.titolo === 'Luce 1/1').split),
      annoPrima: JSON.stringify(state.spese.find((s) => s.titolo === 'Cancello mai consuntivato').split),
    }), Y);
    await vaiA(page, 'impostazioni');
    await page.locator('#mill-applica').click();
    const scheda = page.locator('.modal');
    await expect(scheda).toContainText('non ancora consuntivate');
    await expect(scheda.locator('tbody tr').first()).toBeVisible();
    await expect(scheda).toContainText('Quota prima');
    expect(await axe(page)).toEqual([]);
    await page.locator('#btn-mill-conferma').click();
    await expect(page.locator('.avviso-ok')).toContainText('Millesimi applicati');
    await attendiSalvataggi(page);
    const dopo = await page.evaluate((Y) => ({
      consuntivata: JSON.stringify(state.spese.find((s) => s.titolo === 'Luce 1/1').split),
      annoPrima: JSON.stringify(state.spese.find((s) => s.titolo === 'Cancello mai consuntivato').split),
      pulizieNov: state.spese.find((s) => s.titolo === 'Pulizie mensili' && s.data === `${Y}-11-01`).split.find((x) => x.id === 101).perc,
    }), Y);
    expect(dopo.consuntivata).toBe(prima.consuntivata);
    expect(dopo.annoPrima).toBe(prima.annoPrima);
    expect(dopo.pulizieNov).toBe(20);
  });

  test('chi ha il ruolo Modifica riceve la stessa proposta (legge i millesimi, non li modifica)', async ({ page }) => {
    await accedi(page, 'editor1@qa.test');
    await vaiA(page, 'spese');
    await page.locator('#btn-add-spesa').click();
    await expect(page.locator('#split-mill-nota')).toContainText('Proposta dai millesimi');
    await expect(page.locator('.split-perc-inp[data-cid="101"]')).toHaveValue('20.00');
    await expect(page.locator('.sidebar [data-page="impostazioni"]')).toHaveCount(0);
  });

  test('rendiconto PDF con la colonna dei millesimi: si crea senza errori', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'bilancio');
    await page.locator('#btn-rendiconto-pdf').click();
    const millesimi = await page.evaluate(() => datiRendiconto(new Date().getFullYear()).millesimi);
    expect(millesimi).toEqual({ tabella: 'Generale' });
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-rend-genera').click()]);
    expect(pdf.suggestedFilename()).toMatch(/[.]pdf$/);
  });

  test('eliminare una tabella chiede conferma (Annulla la tiene)', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'impostazioni');
    await page.locator('[data-mill-togli="1"]').click();
    await expect(page.locator('dialog.dialogo')).toContainText('Eliminare la tabella "Ascensore"');
    await page.locator('dialog.dialogo [data-dlg="no"]').click();
    await expect(page.locator('.mill-nome[data-ti="1"]')).toHaveValue('Ascensore');
  });
});

test.describe('Appartamenti in affitto (modifica i dati)', () => {
  test('di base nessuno; spunto Int. 3: badge in anagrafica ed estratto PDF con la quota da recuperare', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'impostazioni');
    await expect(page.locator('.affitto-chk:checked')).toHaveCount(0);
    await page.locator('.affitto-chk[data-apt="int. 3"]').check();
    await page.locator('#affitti-salva').click();
    await expect(page.locator('.avviso-ok')).toContainText('1 appartamento in affitto');
    await vaiA(page, 'condomini');
    await expect(page.locator('.utente-card', { hasText: 'Marta Member' })).toContainText('In affitto');
    await expect(page.locator('.utente-card', { hasText: 'Elio Editor' })).not.toContainText('In affitto');
    const anno = new Date().getFullYear();
    const affitto = await page.evaluate((a) => { const d = datiEstratto(103, a); return d.affitto && { recuperabile: d.affitto.recuperabile, quoteOrd: d.quoteOrd }; }, anno);
    expect(affitto).not.toBeNull();
    expect(affitto.recuperabile).toBe(affitto.quoteOrd);
    await page.locator('.utente-card', { hasText: 'Marta Member' }).locator('[data-estratto-cond]').click();
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-estr-genera').click()]);
    expect(pdf.suggestedFilename()).toMatch(/^EstrattoConto_/);
    expect(await axe(page)).toEqual([]);
  });

  test('un condomino in sola lettura legge la spunta per il proprio estratto', async ({ page }) => {
    await accedi(page, 'member1@qa.test');
    await page.waitForFunction(() => typeof appartamentoInAffitto === 'function' && appartamentoInAffitto('Int. 3'));
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

test.describe('Millesimi: subentro e spegnimento (modifica i dati)', () => {
  test('dopo il subentro il nuovo proprietario mostra i millesimi dell\'appartamento', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    await vaiA(page, 'condomini');
    await expect(page.locator('.utente-card', { hasText: 'Nuova Proprietaria' })).toContainText('Generale 150');
  });

  test('spenti di nuovo: le spese nuove tornano alle parti uguali, quelle salvate restano come sono', async ({ page }) => {
    await accedi(page, 'admin1@qa.test');
    const prima = await page.evaluate(() => JSON.stringify(state.spese.filter((s) => s.tabellaMillesimi).map((s) => s.split)));
    await vaiA(page, 'impostazioni');
    await page.locator('#mill-attivo').uncheck();
    await page.locator('#mill-salva').click();
    await expect(page.locator('.avviso-ok')).toContainText('non attivi');
    await vaiA(page, 'spese');
    await page.locator('#btn-add-spesa').click();
    await expect(page.locator('#split-millesimi')).toHaveCount(0);
    await expect(page.locator('#split-mill-nota')).not.toContainText('millesimi');
    await page.locator('#modal-cancel').click();
    const dopo = await page.evaluate(() => JSON.stringify(state.spese.filter((s) => s.tabellaMillesimi).map((s) => s.split)));
    expect(dopo).toBe(prima);
  });
});
