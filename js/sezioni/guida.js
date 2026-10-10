// Guida rapida di ogni pagina: pulsante "? Guida" accanto al titolo e pannello
// laterale (in basso sui telefoni) con spiegazioni brevi, diverse per ruolo.
// Si apre solo su richiesta; finché una pagina non è stata aperta almeno una
// volta il pulsante mostra un pallino. Se resta aperta e si cambia pagina,
// mostra la guida della nuova pagina.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// Livelli: tutti · lettura · noadmin · mod (Modifica, Amm. Edificio, Super Admin) · admin (Amm. Edificio, Super Admin) · super (solo Super Admin)
// Ogni voce può essere una stringa (per tutti) oppure [livello, testo].
const GUIDA = {
  dashboard: {
    titolo: 'Dashboard',
    breve: 'La pagina iniziale: in un colpo d\'occhio come stanno i conti del condominio nell\'anno scelto.',
    trovi: [
      'Entrate, uscite e saldo dell\'anno.',
      'Il grafico mese per mese: dati reali fino a oggi, previsioni per i mesi che verranno.',
      'Ultimi versamenti, spese confermate e spese previste.',
      'Avvisi, lavori e delibere più recenti, con il collegamento "Vedi tutti".',
      ['lettura', '"La tua situazione": quanto ti spetta pagare, quanto hai già versato e la differenza.'],
    ],
    fare: [
      ['Vedere un altro anno', 'Usa il menu dell\'anno in alto a destra.'],
      ['Andare a una sezione', 'Tocca una voce del menu, oppure "Vedi tutti" sotto ogni riquadro.'],
    ],
    sapere: [
      '<b>Previsionale</b>: importo stimato, non ancora pagato. <b>Definitiva</b>: spesa con l\'importo reale.',
      '<b>Riporto da anni precedenti</b>: il saldo che arriva dagli anni passati.',
      '<b>Riserva bassa</b>: la cassa scende sotto metà della spesa media di un mese.',
    ],
  },
  spese: {
    titolo: 'Spese',
    breve: 'Tutte le spese del condominio: quelle già pagate e quelle previste, con documenti allegati.',
    trovi: [
      'L\'elenco con titolo, categoria, importi e stato (Previsionale o Definitiva).',
      'La graffetta 📎 accanto al titolo: la spesa ha documenti allegati, tocca per aprirli.',
      'Ricerca e filtri per anno, tipo, categoria, stato e fornitore; "✕ Reset" li azzera.',
      '"📊 Esporta Excel" scarica l\'elenco filtrato.',
    ],
    fare: [
      ['mod', 'Aggiungere una spesa', '"+ Aggiungi spesa", poi Titolo, Categoria, Data e almeno un importo. Infine "Salva".'],
      ['mod', 'Correggerla', 'Tocca ✏️ sulla riga, cambia e salva.'],
      ['mod', 'Allegare fatture o foto', 'Nella scheda trascina i file nel riquadro Allegati (PDF, immagini, documenti, max 5 MB ciascuno).'],
      ['mod', 'Spesa che si ripete', 'Spunta "🔁 Spesa ricorrente", scegli la frequenza e la data di fine: le spese future vengono create da sole. Se poi cambi frequenza o data di fine, cambiano solo le righe successive non ancora consuntivate.'],
      ['mod', 'Decidere chi paga quanto', 'Nella ripartizione assegna le percentuali; "↔ Parti uguali" divide in modo uguale, 🔒 blocca una quota. Il totale deve fare 100%.'],
      ['mod', 'Eliminare', '🗑 sulla riga, oppure seleziona più righe e "🗑 Elimina selezionate".'],
      ['lettura', 'Chiedere una modifica', 'Puoi consultare spese e allegati; per correzioni rivolgiti all\'amministratore.'],
    ],
    sapere: [
      '<b>Preventivo</b> = importo stimato. <b>Consuntivo</b> = importo reale. Quando inserisci il consuntivo la spesa diventa <b>Definitiva</b>.',
      '<b>Ordinaria</b> o <b>straordinaria</b> dipende dalla categoria scelta.',
      ['mod', 'Le spese eliminate restano recuperabili dall\'amministratore del servizio.'],
    ],
  },
  entrate: {
    titolo: 'Entrate / Quote',
    breve: 'I versamenti dei condomini: quelli arrivati e quelli attesi (rate).',
    trovi: [
      'Il riepilogo per condomino: quota dovuta, versato, copertura e saldo.',
      'L\'elenco di tutti i versamenti; quelli previsti hanno l\'etichetta "🔮 Prev.".',
      'Ricerca per condomino e scelta dell\'anno.',
      ['mod', 'Il "📅 Piano rate suggerito": rate proposte per coprire le spese dell\'anno senza andare in rosso.'],
    ],
    fare: [
      ['mod', 'Registrare un pagamento arrivato', '"+ Registra versamento", scheda "💰 Effettivo": condomino, data e importo.'],
      ['mod', 'Programmare rate future', 'Nella stessa scheda scegli "🔮 Previsionale / Rate" e indica le rate.'],
      ['mod', 'Confermare una rata pagata', 'Tocca "✅ Valida" sulla riga: diventa un versamento effettivo.'],
      ['mod', 'Usare il piano rate', '"➕ Crea versamenti previsionali" crea le rate proposte per tutti; "Rimuovili" le toglie.'],
      ['lettura', 'Controllare la tua posizione', 'Cerca il tuo nome: vedi quanto hai versato e quanto resta.'],
    ],
    sapere: [
      'I versamenti <b>previsionali</b> entrano nelle previsioni ma non nel saldo reale, finché non li validi.',
      '<b>Copertura</b> = quanto è stato versato rispetto a quanto dovuto.',
    ],
  },
  bilancio: {
    titolo: 'Bilancio',
    breve: 'I conti dell\'anno da diversi punti di vista, per capire dove vanno i soldi.',
    trovi: [
      '<b>📊 Panoramica</b>: entrate, uscite e cassa mese per mese.',
      '<b>🔮 Forecast</b>: come andrà la cassa nei prossimi mesi, contando anche spese e rate previste.',
      '<b>⚖️ Prev. vs Cons.</b>: per ogni spesa, quanto si era stimato e quanto si è speso davvero.',
      '<b>👥 Per condomino</b>: quota di ciascuno, versato e copertura.',
      '<b>🏷️ Per categoria</b>: quanto pesa ogni tipo di spesa.',
    ],
    fare: [
      ['Cambiare anno o vista', 'Menu dell\'anno in alto e schede sotto il titolo.'],
      ['Vedere il dettaglio di un condomino', 'Scheda "👥 Per condomino", poi tocca il nome.'],
    ],
    sapere: [
      '<b>ACTUALS</b> = solo dati reali confermati. <b>ACTUALS + FORECAST</b> = reali più previsioni.',
      'Colori della cassa: verde positiva, giallo riserva bassa, rosso in negativo.',
      'Per l\'<b>anno prossimo</b> (preventivo) i conti partono dal <b>saldo stimato a inizio anno</b>: cassa di oggi, meno le spese ancora da pagare, più i versamenti previsti prima di allora.',
      '"Tutti gli anni", scelto in Spese o Entrate, qui mostra l\'anno corrente: il bilancio si legge un anno alla volta.',
    ],
  },
  fornitori: {
    titolo: 'Fornitori',
    breve: 'La rubrica delle ditte e dei professionisti che lavorano per il condominio.',
    trovi: [
      'Una scheda per fornitore con contatti, IBAN e persona di riferimento.',
      '"📊 Storico": le spese collegate al fornitore e l\'ultimo intervento.',
      '📋 accanto all\'IBAN lo copia.',
      'In fondo i fornitori non più attivi.',
    ],
    fare: [
      ['mod', 'Aggiungere un fornitore', '"+ Nuovo fornitore": servono almeno nome e categoria.'],
      ['mod', 'Collegarlo a una spesa', 'Nella scheda della spesa scegli il fornitore nel campo "Fornitore".'],
      ['mod', 'Non usarlo più', '⏸ lo sposta tra i non attivi senza perdere lo storico; "▶ Riattiva" lo riporta.'],
    ],
    sapere: [
      ['mod', 'Le "Note interne" servono per promemoria su prezzi, orari, accordi.'],
    ],
  },
  vita: {
    titolo: 'Vita condominiale',
    breve: 'Comunicazioni e decisioni del condominio, raccolte in quattro schede.',
    trovi: [
      '<b>📌 Bacheca</b>: avvisi per tutti; quelli ⚠️ prioritari sono in evidenza.',
      '<b>📋 Verbali</b>: le assemblee, con argomenti, decisioni e PDF del verbale.',
      '<b>🛠️ Lavori</b>: interventi in corso con stato, percentuale di avanzamento e aggiornamenti.',
      '<b>📜 Delibere</b>: le decisioni approvate, collegate al verbale di origine.',
    ],
    fare: [
      ['admin', 'Pubblicare', 'Nella scheda giusta usa "+ Nuovo avviso / verbale / lavoro / delibera".'],
      ['admin', 'Aggiornare un lavoro', '✏️ sul lavoro: cambia stato o percentuale e aggiungi una nota allo storico.'],
      ['admin', 'Collegare le cose', 'Un lavoro può citare la delibera che lo ha deciso, una delibera il suo verbale.'],
      ['noadmin', 'Proporre un avviso', 'Puoi leggere tutto; per pubblicare rivolgiti all\'amministratore.'],
    ],
    sapere: [
      'Un avviso con scadenza serve per comunicazioni a tempo (es. lavori in cortile fino al…).',
    ],
  },
  condomini: {
    titolo: 'Condomini',
    breve: 'Le persone del condominio e cosa possono fare nell\'app.',
    trovi: [
      'Gli appartamenti attivi, con email di accesso e ruolo.',
      'In fondo gli archiviati: persone che non accedono più, con i dati conservati.',
    ],
    fare: [
      ['admin', 'Aggiungere una persona', '"+ Aggiungi condomino": nome, appartamento, email e ruolo. Con quell\'email potrà entrare (anche con Google).'],
      ['admin', 'Cambiare dati o ruolo', '"✏️ Modifica".'],
      ['admin', 'Chi ha cambiato casa', '"⏸ Archivia": non entra più, ma pagamenti e storico restano. "▶ Riattiva" lo riporta.'],
      ['admin', 'Password dimenticata', '"🔑 Reset PW" imposta una password temporanea da comunicare alla persona.'],
      ['admin', 'Situazione di una persona', '"📊 Bilancio" apre il suo dettaglio.'],
    ],
    sapere: [
      '<b>Lettura</b>: solo consultazione. <b>Modifica</b>: inserisce spese, entrate e fornitori. <b>Amm. Edificio</b>: gestisce anche persone e comunicazioni.',
      'Eliminare definitivamente si può solo dall\'archivio: preferisci archiviare.',
    ],
  },
  impostazioni: {
    titolo: 'Impostazioni',
    breve: 'La configurazione del condominio e degli accessi.',
    trovi: [
      'Utenti del condominio con ruolo e stato (attivo o disabilitato).',
      'Categorie di spesa.',
      'Sicurezza dell\'account: cambio password.',
      ['super', 'Gestione dei condomìni, nome del servizio, log degli accessi e "Stato del servizio" (backup automatici, registro modifiche, errori).'],
      ['super', 'Backup manuale: "💾 Scarica backup JSON" salva una copia dei dati sul tuo computer.'],
    ],
    fare: [
      ['admin', 'Disabilitare un utente', '⏸ sulla riga; "▶ Riabilita" lo riattiva.'],
      ['super', 'Aggiungere o modificare categorie', 'Nella sezione Categorie; "↩ Ripristina categorie default" torna a quelle iniziali.'],
      ['super', 'Aggiungere un condominio', 'Sezione "🏢 Gestione condomini".'],
    ],
    sapere: [
      ['super', 'La "⚠️ Zona pericolosa" cancella i dati del condominio attivo: usala solo se sai cosa fai, dopo un backup.'],
      ['super', 'Ogni notte viene fatto un backup automatico, conservato 30 giorni.'],
    ],
  },
};

// Livello dell'utente: 4 super, 3 admin, 2 mod, 1 lettura
function livelloGuida(u) {
  return isSuperAdmin(u) ? 4 : canUserAdmin(u) ? 3 : canUserEdit(u) ? 2 : 1;
}
// 'lettura' = solo per chi non può modificare; 'noadmin' = per chi non è amministratore.
function voceGuidaVisibile(liv, tag) {
  if (tag === 'lettura') return liv === 1;
  if (tag === 'noadmin') return liv < 3;
  return liv >= ({ mod: 2, admin: 3, super: 4 }[tag] || 1);
}

function guidaVista(page) {
  try { return localStorage.getItem('cm_guida_vista_' + page) === '1'; } catch (e) { return true; }
}
function segnaGuidaVista(page) {
  try { localStorage.setItem('cm_guida_vista_' + page, '1'); } catch (e) { /* navigazione privata */ }
}

function btnGuida() {
  const nuova = !guidaVista(state.page);
  return `<button type="button" class="btn-guida${state.guidaAperta ? ' attivo' : ''}" data-guida-apri aria-label="Guida di questa pagina" aria-expanded="${state.guidaAperta ? 'true' : 'false'}" title="Come funziona questa pagina">`
    + `<span class="btn-guida-icona" aria-hidden="true">?</span><span class="btn-guida-testo">Guida</span>`
    + (nuova ? '<span class="btn-guida-nuova" aria-hidden="true"></span>' : '') + `</button>`;
}

function renderGuida() {
  const g = GUIDA[state.page] || GUIDA.dashboard;
  const liv = livelloGuida(state.user);
  const filtra = (arr) => (arr || []).filter((v) => !Array.isArray(v) || v.length < 2 || !['lettura', 'noadmin', 'mod', 'admin', 'super'].includes(v[0]) || voceGuidaVisibile(liv, v[0]));
  const testo = (v) => Array.isArray(v) ? v[v.length - 1] : v;
  // I testi della guida sono scritti qui nel codice (non dati inseriti dagli utenti): l'HTML semplice è voluto.
  const trovi = filtra(g.trovi).map((v) => `<li>${testo(v)}</li>`).join('');
  const fare = filtra(g.fare).map((v) => {
    const [titolo, desc] = v.length === 3 ? [v[1], v[2]] : [v[0], v[1]];
    return `<li><b>${titolo}</b><span>${desc}</span></li>`;
  }).join('');
  const sapere = filtra(g.sapere).map((v) => `<li>${testo(v)}</li>`).join('');
  return `
  <div class="guida-sfondo" id="guida-sfondo"></div>
  <aside class="guida-pannello" id="guida-pannello" role="complementary" aria-labelledby="guida-titolo">
    <div class="guida-testa">
      <div>
        <div class="guida-etichetta">Guida rapida</div>
        <h2 id="guida-titolo">${g.titolo}</h2>
      </div>
      <button type="button" class="guida-chiudi" id="guida-chiudi" aria-label="Chiudi la guida">✕</button>
    </div>
    <div class="guida-corpo" tabindex="0">
      <p class="guida-breve">${g.breve}</p>
      ${trovi ? `<h3>Cosa trovi</h3><ul class="guida-lista">${trovi}</ul>` : ''}
      ${fare ? `<h3>Come si fa</h3><ul class="guida-passi">${fare}</ul>` : ''}
      ${sapere ? `<h3>Da sapere</h3><ul class="guida-lista guida-sapere">${sapere}</ul>` : ''}
      <p class="guida-piede">Il tuo ruolo: <b>${getRuoloLabel(state.user)}</b>. La guida mostra solo ciò che puoi fare.${liv < 3 ? ' Per dubbi rivolgiti all\'amministratore del condominio.' : ''}</p>
    </div>
  </aside>`;
}

function bindGuida() {
  document.querySelectorAll('[data-guida-apri]').forEach((b) => {
    b.onclick = () => {
      segnaGuidaVista(state.page);
      setState({ guidaAperta: !state.guidaAperta });
      if (state.guidaAperta) document.getElementById('guida-chiudi')?.focus();
    };
  });
  const chiudi = () => {
    setState({ guidaAperta: false });
    document.querySelector('[data-guida-apri]')?.focus();
  };
  const x = document.getElementById('guida-chiudi');
  if (x) x.onclick = chiudi;
  const sf = document.getElementById('guida-sfondo');
  if (sf) sf.onclick = chiudi;
  // Con la guida aperta e la pagina cambiata, la guida della nuova pagina conta come vista.
  if (state.guidaAperta) segnaGuidaVista(state.page);
  // Esc chiude la guida (collegato una sola volta; non interferisce con le schede aperte).
  if (!window.__guidaEsc) {
    window.__guidaEsc = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.guidaAperta && !state.modal) chiudi();
    });
  }
}
