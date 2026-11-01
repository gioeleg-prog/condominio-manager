// ===========================
// INFORMATIVA PRIVACY (bozza, solo Super Admin)
// ===========================
// La bozza si legge e si modifica da Impostazioni › Informativa privacy, ed è
// visibile solo al Super Admin (chiave appdata/cm_privacy: le rules la
// riservano a lui in lettura e scrittura). Finché non viene pubblicata come
// pagina del sito, gli altri utenti non la vedono e il login non la richiama.
//
// Formato del testo (semplice, e sicuro: tutto passa da esc() prima):
//   ## Titolo        titolo di sezione
//   - voce           elenco puntato
//   **grassetto**    grassetto dentro una riga
//   riga vuota       separa i paragrafi

const PRIVACY_BOZZA = `## Chi tratta i dati
**Titolare del trattamento:** [denominazione del condominio / dell'amministratore, indirizzo, codice fiscale].
**Contatto per la privacy:** gioele.g@gmail.com.
**Gestore dell'applicazione (responsabile del trattamento):** Gioele G. (gioele.g@gmail.com), che fornisce il servizio "Condominio Manager" su incarico del titolare.

## Quali dati trattiamo
- **Anagrafici e di contatto:** nome e cognome, appartamento, email, numero di cellulare (facoltativo), nickname.
- **Gestione del condominio:** millesimi, quote di spesa, versamenti e saldi, spese, entrate, delibere, verbali, lavori, allegati caricati, comunicazioni inviate.
- **Accesso e sicurezza:** email di accesso, ruolo assegnato, data e ora degli accessi, registro delle modifiche (chi ha fatto cosa e quando).

Non trattiamo categorie particolari di dati (salute, opinioni, ecc.) e non facciamo profilazione né decisioni automatizzate.

## Perché e su quale base giuridica
- **Gestione ordinaria del condominio** (ripartizione delle spese, rendiconto, bilancio, comunicazioni ai condomini): obbligo di legge e gestione dell'edificio (artt. 1117 e seguenti e 1130 del Codice civile; art. 6, par. 1, lett. b e c GDPR).
- **Accesso riservato al servizio e sicurezza** (autenticazione, ruoli, registro delle modifiche, prevenzione degli abusi): legittimo interesse alla sicurezza dei dati (art. 6, par. 1, lett. f GDPR).
- **Avvisi e promemoria via email o WhatsApp**, quando attivati: esecuzione del rapporto condominiale; il condomino può scegliere se riceverli dal proprio profilo.

L'accettazione di questa informativa al primo accesso è una **presa visione**, non un consenso: il trattamento non dipende dal tuo consenso.

## Chi vede i dati
- L'amministratore del condominio e chi ha il ruolo di "Modifica", per le funzioni che gli sono assegnate.
- Gli altri condomini vedono nomi, appartamenti e quote; **email e numeri di telefono li vedono solo l'amministratore e chi ha "Modifica"**. [Verificare con il titolare che l'attuale visibilità delle quote tra condomini sia coerente con quanto deciso in assemblea.]
- Fornitori tecnici che trattano i dati per conto del titolare: **Google (Firebase, Google Cloud, Gmail e Google Drive)**, per archiviazione, accesso, invio delle email e copia di sicurezza. I dati del database sono archiviati in Europa (Firestore, regione multi-regionale EU) e le funzioni del servizio girano in Belgio (europe-west1). [Verificare con il titolare l'accordo sul trattamento dei dati con Google e la regione dell'archivio dei file allegati.]

## Trasferimenti fuori dall'Unione europea
[Il servizio usa infrastrutture di Google, che può trattare dati anche fuori dall'UE; il trasferimento avviene sulla base delle garanzie previste (decisione di adeguatezza / clausole contrattuali standard). Completare dopo la verifica delle impostazioni del progetto.]

## Per quanto tempo
[Indicare i tempi: per esempio, i dati contabili per il periodo previsto dalla legge; i dati di chi lascia il condominio fino a quando servono per i rendiconti degli anni in cui ha partecipato; i registri tecnici per x mesi.] Chi viene archiviato non può più accedere, ma i suoi movimenti restano nello storico contabile.

## I tuoi diritti
Puoi chiedere al titolare l'accesso ai tuoi dati, la rettifica, la cancellazione (nei limiti degli obblighi di conservazione), la limitazione, l'opposizione al trattamento fondato sul legittimo interesse e la portabilità. Alcuni dati (nickname, cellulare, preferenze di email e WhatsApp, email di accesso) li correggi da solo da "Il mio profilo". Per le altre richieste scrivi a gioele.g@gmail.com.

Hai inoltre diritto di proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).

## Cookie e dati nel browser
Questo sito **non usa cookie di profilazione né di terze parti** e non contiene strumenti di statistica o pubblicità. Il browser conserva soltanto dati tecnici necessari al funzionamento: la sessione di accesso, il tema chiaro o scuro scelto e l'indicazione di aver già visto le guide. Per questi dati tecnici non serve il consenso.

## Aggiornamenti
Se questa informativa cambia in modo rilevante, ti verrà mostrata di nuovo all'accesso. Ultimo aggiornamento: [data].`;

const PRIVACY_MAX = 20000;

// Testo → HTML sicuro: prima si fa l'escape di tutto, poi si riconoscono solo
// i pochi segni del formato (titoli, elenchi, grassetto).
function formattaInformativa(testo) {
  const inline = riga => esc(riga).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const blocchi = String(testo || '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const html = [];
  blocchi.forEach(blocco => {
    let elenco = [];
    const chiudi = () => { if (elenco.length) { html.push('<ul>' + elenco.join('') + '</ul>'); elenco = []; } };
    let par = [];
    const chiudiPar = () => { if (par.length) { html.push('<p>' + par.join('<br>') + '</p>'); par = []; } };
    blocco.split('\n').forEach(riga => {
      if (!riga.trim()) return;
      if (/^##\s+/.test(riga)) { chiudi(); chiudiPar(); html.push('<h4>' + inline(riga.replace(/^##\s+/, '')) + '</h4>'); }
      else if (/^-\s+/.test(riga)) { chiudiPar(); elenco.push('<li>' + inline(riga.replace(/^-\s+/, '')) + '</li>'); }
      else { chiudi(); par.push(inline(riga)); }
    });
    chiudi(); chiudiPar();
  });
  return html.join('');
}

// Quanti segnaposto [ … ] restano da compilare (le parentesi quadre aperte).
function segnapostiPrivacy(testo) {
  return (String(testo || '').match(/\[/g) || []).length;
}

function privacyCorrente() {
  const v = load('cm_privacy', null);
  return v && typeof v.testo === 'string' ? v : { testo: PRIVACY_BOZZA, aggiornatoIl: null, predefinita: true };
}

function renderPrivacyAdmin() {
  const p = privacyCorrente();
  return `
    <div class="section-divider"><h3>🔒 Informativa privacy (bozza)</h3></div>
    <div class="card" style="max-width:860px;margin-bottom:1.5rem" id="priv-card">
      <p class="hint" style="margin-bottom:.75rem">Solo tu vedi e modifichi questa bozza: gli altri utenti non la vedono e il login non la richiama. Quando il testo è definitivo lo pubblichiamo come pagina del sito.</p>
      <div class="field">
        <label for="priv-testo">Testo dell'informativa</label>
        <textarea id="priv-testo" rows="18" maxlength="${PRIVACY_MAX}" spellcheck="true" style="width:100%;font-family:inherit;line-height:1.5" aria-describedby="priv-aiuto priv-stato">${esc(p.testo)}</textarea>
        <p class="hint" id="priv-aiuto">Formato: <code>## Titolo</code> per le sezioni, <code>- voce</code> per gli elenchi, <code>**grassetto**</code>; una riga vuota separa i paragrafi.</p>
      </div>
      <p class="hint" id="priv-stato" role="status" aria-live="polite"></p>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">
        <button class="btn btn-primary" id="btn-priv-salva">💾 Salva la bozza</button>
        <button class="btn btn-secondary" id="btn-priv-ripristina">↩️ Ripristina la bozza iniziale</button>
      </div>
      <div class="label" style="margin-bottom:.25rem">Anteprima</div>
      <div id="priv-anteprima" class="priv-anteprima" style="border:1px solid var(--border);border-radius:var(--radius);padding:1rem;line-height:1.6"></div>
    </div>`;
}

// Legge la bozza dal server (le chiavi riservate non si caricano
// all'accesso, così gli altri ruoli non chiedono un documento che le rules negano).
async function caricaPrivacy() {
  if (!window._fb) return;
  try {
    const { db, doc, getDoc } = window._fb;
    const snap = await getDoc(doc(db, 'appdata', 'cm_privacy'));
    if (snap.exists()) {
      const v = JSON.parse(snap.data().value);
      _cache['cm_privacy'] = v;
      setServerSnap('cm_privacy', v);
    }
  } catch (e) { console.warn('cm_privacy:', e.code || e.message); }
}

function bindPrivacyAdmin() {
  const ta = document.getElementById('priv-testo');
  if (!ta || !isSuperAdmin(state.user)) return;
  const anteprima = document.getElementById('priv-anteprima');
  const stato = document.getElementById('priv-stato');
  let sporco = false;
  const aggiorna = () => {
    anteprima.innerHTML = formattaInformativa(ta.value);
    const n = segnapostiPrivacy(ta.value);
    const p = privacyCorrente();
    stato.textContent = (n ? n + ' parti tra [ ] ancora da completare. ' : 'Nessuna parte tra [ ] rimasta. ')
      + (p.aggiornatoIl ? 'Ultimo salvataggio: ' + new Date(p.aggiornatoIl).toLocaleString('it-IT') + '.' : 'Non ancora salvata: stai vedendo la bozza iniziale.');
  };
  aggiorna();
  ta.oninput = () => { sporco = true; aggiorna(); };
  // La bozza salvata sul server arriva dopo: si mostra solo se nel frattempo non hai scritto nulla.
  caricaPrivacy().then(() => {
    if (sporco || !document.body.contains(ta)) return;
    ta.value = privacyCorrente().testo;
    aggiorna();
  });
  document.getElementById('btn-priv-salva').onclick = async () => {
    const testo = ta.value.slice(0, PRIVACY_MAX);
    if (!testo.trim()) { avvisa('Il testo è vuoto: non salvo.'); return; }
    const ok = await save('cm_privacy', { testo, aggiornatoIl: new Date().toISOString() });
    if (ok) { sporco = false; aggiorna(); avvisa('✅ Bozza dell\'informativa salvata (la vedi solo tu).'); }
  };
  document.getElementById('btn-priv-ripristina').onclick = async () => {
    if (!await chiedi('Ripristinare la bozza iniziale? Le tue modifiche al testo vanno perse.')) return;
    ta.value = PRIVACY_BOZZA;
    sporco = true;
    aggiorna();
  };
}
