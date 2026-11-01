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
      ['noadmin', 'In cima, "La tua situazione": se sei in regola o quanto resta da versare, quanta parte della tua quota è coperta (la barra), quota dovuta, versato, credito o debito, il riporto dagli anni precedenti se c\'è e la prossima rata prevista. "📄 Il mio estratto conto" scarica il dettaglio in PDF.'],
      'Subito sotto, i numeri del condominio: entrate, uscite, saldo di cassa, quota pro-capite, spese ordinarie e straordinarie, copertura dei prossimi mesi.',
      'Il grafico mese per mese: per ogni mese una colonna blu per le entrate e una arancio per le uscite; la parte piena è reale, quella più tenue è prevista.',
      'Ultimi versamenti, spese confermate e spese previste.',
      'Avvisi, lavori e delibere più recenti, con il collegamento "Vedi tutti".',
    ],
    fare: [
      ['Vedere un altro anno', 'Usa il menu dell\'anno in alto a destra.'],
      ['Leggere i valori di un grafico', 'Passa con il mouse o tocca un mese: compare il dettaglio con gli importi. Con la tastiera: Tab sul grafico, poi le frecce ← →. "Valori in tabella" sotto il grafico mostra tutti i numeri insieme.'],
      ['Andare a una sezione', 'Tocca una voce del menu, oppure "Vedi tutti" sotto ogni riquadro.'],
      ['Correggere i tuoi dati', '"👤" accanto al tuo nome in fondo alla barra laterale (dal telefono: tocca le tue iniziali in alto, poi "Il mio profilo"). Cambi tu nickname, cellulare e se ricevere email e WhatsApp; nome e cognome li vedi ma li cambia l\'amministratore. Per l\'email di accesso scrivi la nuova e la password: ti arriva un link di conferma, aprilo e rientra con la nuova email. Se le comunicazioni del condominio arrivano a un indirizzo diverso da quello di accesso, la scheda te lo segnala: per cambiarlo chiedi all\'amministratore. Nome, appartamento, date, ruolo e millesimi li corregge l\'amministratore. (Il Super Admin non ha una scheda da condomino.)'],
      ['Cercare qualcosa', 'Campo "🔍 Cerca nel sito" nella barra laterale (dal telefono 🔍 in alto): trova spese, versamenti, fornitori, avvisi e verbali.'],
      ['Modalità scura', 'Interruttore sole/luna accanto a "Guida", in cima a ogni pagina: spostalo per passare dal tema chiaro a quello scuro. Finché non lo tocchi, l\'app segue l\'impostazione del telefono o del computer.'],
      ['Averla come app sul telefono', 'iPhone: apri il sito con Safari, tocca Condividi (il quadrato con la freccia) e poi "Aggiungi alla schermata Home". Android: apri il sito con Chrome, menu ⋮ e poi "Installa app" (o "Aggiungi a schermata Home"). Da quel momento si apre dall\'icona, a tutto schermo.'],
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
      'I pulsanti degli anni in alto: accendine uno o più (gli importi si sommano) oppure "Tutti".',
      'Ricerca e filtri per tipo, categoria, stato e fornitore; "✕ Reset" li azzera.',
      ['admin', 'Il riquadro giallo "👁 Spese con una quota dell\'editor": elenca, per 60 giorni, le spese che un utente con "Modifica" ha inserito o cambiato per ultimo e in cui lui stesso è condomino: con una sua quota, oppure con la quota portata a 0% o la riga tolta (lo trovi scritto accanto alla voce). Non blocca nulla, serve a controllare.'],
      'Le descrizioni lunghe mostrano solo le prime due righe: aprendo la spesa (matita) le leggi intere.',
      '"📊 Esporta Excel" scarica l\'elenco filtrato.',
    ],
    fare: [
      ['mod', 'Aggiungere una spesa', '"+ Aggiungi spesa", poi Titolo, Categoria, Data e almeno un importo. Infine "Salva".'],
      ['mod', 'Correggerla', 'Tocca la matita sulla riga, cambia e salva.'],
      ['mod', 'Allegare fatture o foto', 'Nella scheda trascina i file nel riquadro Allegati (PDF, immagini, documenti, max 5 MB ciascuno, fino a 10 file per spesa).'],
      ['mod', 'Spesa che si ripete', 'Spunta "🔁 Spesa ricorrente", scegli la frequenza e la data di fine: le spese future vengono create da sole. Se poi cambi frequenza o data di fine, cambiano solo le righe successive non ancora consuntivate. Ogni occorrenza segue chi abitava nel condominio alla sua data: se nella serie c\'è un subentro, da quella data la quota passa a chi è subentrato nello stesso appartamento (o si ridistribuisce tra chi abita, se non ce n\'è uno). Le occorrenze nascono senza allegati: i documenti si aggiungono alla singola spesa, e toglierne uno da una non lo toglie dalle altre. Le occorrenze copiano l\'importo della spesa: se una spesa vecchia ha un importo non valido (zero, negativo o con più di due decimali), la scheda non crea né aggiorna la serie e ti dice di correggere prima l\'importo.'],
      ['mod', 'Modificare o fermare una serie', 'Nella scheda di una spesa ricorrente, il riquadro "🔁 Serie" applica le modifiche anche alle occorrenze successive non consuntivate (la ripartizione viene adattata alla data di ciascuna), oppure le elimina con "Elimina le … successive".'],
      ['mod', 'Decidere chi paga quanto', 'Nella ripartizione assegna le percentuali; "↔ Parti uguali" divide in modo uguale, 🔒 blocca una quota (si blocca da sola quando scrivi nel suo campo, non quando ci passi con Tab; il lucchetto dice se la quota è bloccata e si preme per sbloccarla). Il totale deve fare 100% e ogni quota deve stare tra 0% e 100%: se non torna, il salvataggio si ferma e te lo segnala con un messaggio nella scheda, sopra i pulsanti, che resta finché non correggi (se in una spesa vecchia manca una quota perché era di un condomino che non esiste più, il messaggio lo dice: assegnala a chi è presente e salva). Una spesa nuova propone chi abitava nel condominio alla data della spesa (cambiando la data le righe si aggiornano, tenendo le quote che hai scritto a mano); con "＋ Aggiungi condomino" puoi inserire a mano anche chi è uscito, per esempio per un conguaglio; le quote bloccate o scritte a mano non si perdono cambiando la data. Una spesa già salvata propone ugualmente chi abitava alla sua data: se ne cambi la data le quote NON si ricalcolano da sole e te lo segnala un avviso (per ricalcolarle salva, riapri la spesa e usa "↔ Parti uguali" o "⚖️ Millesimi"). Chi nel frattempo è stato archiviato resta con la sua quota ("non più attivo"); con un "🔁 Subentro" le quote future passano al nuovo condomino.'],
      ['mod', 'Ripartire per millesimi', 'Solo se il condominio li ha accesi: una spesa nuova propone già la ripartizione dalla tabella della sua categoria (es. Ascensore). Scegli un\'altra tabella e premi "⚖️ Millesimi", oppure modifica le quote a mano; "↔ Parti uguali" resta sempre disponibile.'],
      ['mod', 'Eliminare', 'il cestino rosso sulla riga, oppure seleziona più righe e "Elimina selezionate" (al massimo 400 alla volta). Cambiando anno, filtri o ricerca la selezione tiene solo le righe ancora visibili.'],
      ['lettura', 'Chiedere una modifica', 'Puoi consultare spese e allegati; per correzioni rivolgiti all\'amministratore.'],
    ],
    sapere: [
      'Elenchi lunghi: si vedono 200 spese alla volta, "Mostra altre" in fondo aggiunge le successive. Totali, "Seleziona tutte", esportazione ed eliminazione delle selezionate valgono per tutte le spese dei filtri scelti, anche quelle non ancora mostrate.',
      '<b>Preventivo</b> = importo stimato. <b>Consuntivo</b> = importo reale. Quando inserisci il consuntivo la spesa diventa <b>Definitiva</b>.',
      'Gli importi (preventivo e consuntivo) devono essere <b>maggiori di zero</b>, con al massimo due decimali: zero e negativi non si salvano. Una nota di credito o un rimborso non si registra come spesa negativa: riduci l\'importo della spesa originale oppure registra un\'entrata.',
      '<b>Ordinaria</b> o <b>straordinaria</b> dipende dalla categoria scelta.',
      ['mod', 'Prima di eliminare, l\'app chiede conferma in una finestra: "Annulla" (o il tasto Esc) torna indietro senza toccare nulla.'],
      ['mod', 'Anno già passato: se inserisci, cambi o elimini una spesa con la data in un anno precedente a quello di oggi (o ne cambi importi, data o ripartizione), prima di salvare compare "Stai modificando un anno già passato: i riporti e i rendiconti già inviati cambiano". Non è un blocco: puoi confermare e proseguire. Se cambi solo testi (titolo, descrizione) non compare.'],
      ['mod', 'Le spese eliminate restano recuperabili dall\'amministratore del servizio.'],
      ['mod', 'Se un\'altra persona ha cambiato la stessa voce mentre l\'avevi aperta, il salvataggio si ferma e ti chiede di ricaricare la pagina: nessuna modifica va persa in silenzio.'],
      ['mod', 'Se chiudi o ricarichi la pagina mentre un salvataggio è ancora in corso, il browser ti chiede conferma prima di uscire: attendi un istante e la modifica è al sicuro.'],
    ],
  },
  entrate: {
    titolo: 'Entrate / Quote',
    breve: 'I versamenti dei condomini: quelli arrivati e quelli attesi (rate).',
    trovi: [
      'Il riepilogo per condomino: quota dovuta, versato, copertura e saldo, compreso il riporto degli anni precedenti. Chi è uscito prima compare finché ha un debito o un credito.',
      'L\'elenco di tutti i versamenti; quelli previsti hanno l\'etichetta "🔮 Prev.". Il totale in verde conta solo quelli arrivati.',
      'Ricerca per condomino e pulsanti degli anni: con più anni accesi gli importi si sommano.',
      ['admin', 'Il riquadro giallo "👁 Versamenti registrati o modificati dall\'editor a proprio nome" (e in Spese quello delle spese in cui l\'editor è condomino, anche con la quota azzerata o tolta): non blocca nulla, serve a controllare. Elenca, per 60 giorni, ciò che un utente con "Modifica" ha inserito o cambiato per ultimo su di sé. Se un amministratore ritocca la voce, il riquadro la toglie.'],
      ['mod', 'Il "📅 Piano rate suggerito": rate proposte per coprire le spese dell\'anno senza andare in rosso. Compare quando è acceso un solo anno.'],
    ],
    fare: [
      ['mod', 'Registrare un pagamento arrivato', '"+ Registra versamento", scheda "💰 Effettivo": condomino, data e importo.'],
      ['mod', 'Programmare rate future', 'Nella stessa scheda scegli "🔮 Previsionale / Rate" e indica le rate.'],
      ['mod', 'Confermare una rata pagata', 'Tocca "✅ Valida" sulla riga: diventa un versamento effettivo. Se era prevista per una data futura viene registrata con la data di oggi; per un\'altra data usa la matita.'],
      ['mod', 'Usare il piano rate', '"➕ Crea versamenti previsionali" crea le rate proposte per i condomini attuali; "Rimuovili" le toglie. La quota di chi è uscito resta a lui: il piano non la addebita agli altri, la mostra come "Quota non attribuita" e le rate previste già a carico di chi è uscito non vengono toccate dal ricalcolo.'],
      ['admin', 'Ricordare le rate', '"📧 Invia promemoria": ogni condomino scelto riceve un\'email personale con la sua prossima rata e, se è in ritardo, il saldo. Sono già spuntati quelli con una rata nei prossimi 15 giorni o con saldo negativo.'],
      ['admin', 'Ricordare le rate su WhatsApp', '"💬 Promemoria WhatsApp": in cima chi ha una rata nei prossimi 15 giorni o il saldo negativo, ognuno con la sua rata. "💬 Apri" accanto al nome apre WhatsApp con il messaggio personale già scritto: controlla e premi Invia.'],
      ['lettura', 'Controllare la tua posizione', 'Cerca il tuo nome: vedi quanto hai versato e quanto resta.'],
    ],
    sapere: [
      'Si vedono 200 versamenti alla volta: "Mostra altre" in fondo all\'elenco aggiunge i successivi. Il totale in alto comprende sempre tutti i versamenti degli anni scelti.',
      'Le email partono solo quando decide l\'amministratore. I promemoria automatici delle rate sono spenti finché non vengono accesi in Impostazioni.',
      'L\'importo di un versamento (e di ogni rata) deve essere <b>maggiore di zero</b>, con al massimo due decimali: zero e negativi non si salvano. Per un rimborso o una nota di credito riduci la spesa originale oppure registra un\'entrata.',
      ['mod', 'Anno già passato: se inserisci, cambi o elimini un versamento con la data in un anno precedente a quello di oggi (o ne cambi importo, data o condomino), o ricalcoli il piano rate di un anno passato, prima di salvare compare "Stai modificando un anno già passato: i riporti e i rendiconti già inviati cambiano". Non è un blocco: puoi confermare e proseguire. Se cambi solo la descrizione non compare.'],
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
      '<b>👥 Per condomino</b>: quota di ciascuno, versato, copertura e saldo con il riporto degli anni precedenti; "In regola" tiene conto anche dei debiti vecchi.',
      '<b>🏷️ Per categoria</b>: quanto pesa ogni tipo di spesa.',
    ],
    fare: [
      ['Stampare o salvare in PDF', '"🖨 Stampa": stampa la scheda aperta senza menu e pulsanti, su fondo chiaro anche con il tema scuro; nella finestra di stampa scegli "Salva come PDF" per un file.'],
      ['Cambiare anno o vista', 'Menu dell\'anno in alto e schede sotto il titolo.'],
      ['Vedere il dettaglio di un condomino', 'Scheda "👥 Per condomino", poi tocca il nome.'],
      ['mod', 'Estratto conto di un condomino', 'Scheda "👥 Per condomino", "📄 Estratto conto" sotto il nome: PDF con saldo iniziale, quote delle spese, versamenti e saldo progressivo, poi le prossime scadenze.'],
      ['mod', 'Preparare il rendiconto da inviare', '"📄 Rendiconto PDF": scegli l\'anno, sintetico (cassa, categorie, riparto) o dettagliato (anche tutte le spese e i versamenti), aggiungi una nota e scarica il PDF da allegare all\'email. Per l\'anno prossimo diventa il bilancio preventivo: pulsante, scheda, email e PDF si chiamano "Preventivo", gli importi sono quelli a preventivo e il registro delle spese non ha la colonna del consuntivo.'],
      ['admin', 'Mandare rendiconto o estratti per email', 'Nella scheda del rendiconto o dell\'estratto conto, "📧 Scegli a chi inviare": si apre l\'elenco, scegli i destinatari dall\'elenco, scrivi un messaggio e invia. Il rendiconto parte in un\'unica email in copia nascosta; ogni estratto conto va solo al suo condomino. Con "📄 Scarica PDF" ne tieni una copia identica a quella allegata.'],
      ['admin', 'Avvisare su WhatsApp che il rendiconto è arrivato', 'Dopo l\'invio per email l\'app chiede se avvisare anche su WhatsApp chi l\'ha ricevuto; oppure, nella scheda del rendiconto, "💬 WhatsApp". "💬 Apri" accanto a ogni nome apre WhatsApp con il messaggio già scritto; "📋 Copia per il gruppo" copia il testo per il gruppo del condominio.'],
    ],
    sapere: [
      '<b>ACTUALS</b> = solo dati reali confermati. <b>ACTUALS + FORECAST</b> = reali più previsioni.',
      'Colori della cassa: verde positiva, giallo riserva bassa, rosso in negativo.',
      'Per l\'<b>anno prossimo</b> (preventivo) i conti partono dal <b>saldo stimato a inizio anno</b>: cassa di oggi, meno le spese ancora da pagare, più i versamenti previsti prima di allora.',
      '"Tutti gli anni", scelto in Spese o Entrate, qui mostra l\'anno corrente: il bilancio si legge un anno alla volta.',
    ],
  },
  confronto: {
    titolo: 'Confronto anni',
    breve: 'I conti di più anni affiancati, come il bilancio di un\'azienda: cosa è cambiato e dove.',
    trovi: [
      '<b>📋 Sintesi</b>: entrate, uscite (ordinarie e straordinarie), risultato, cassa a fine periodo, budget e scostamento. Sotto ogni cifra la variazione rispetto all\'anno prima.',
      '<b>Andamento negli anni</b>: grafico con entrate, uscite e spese a preventivo di ogni anno; passa o tocca un anno per gli importi.',
      '<b>🏷️ Per categoria</b>: quanto si è speso per ogni voce, anno per anno.',
      '<b>⚖️ Ordinarie e straordinarie</b>: importi e peso dello straordinario.',
      '<b>👥 Per condomino</b>: quota, versato e saldo di ciascuno, anno per anno.',
    ],
    fare: [
      ['Scegliere gli anni', 'Accendi o spegni i pulsanti degli anni; "Tutti" li mostra tutti.'],
      ['Confrontare a parità di periodo', '"Da inizio anno a oggi" confronta ogni anno dal 1° gennaio alla data di oggi (year to date): utile quando l\'anno è in corso.'],
      ['Usare il preventivo', 'Con "Importi: Preventivo" o "Reali + previsti" categorie, tipo e quote usano anche le spese non ancora consuntivate (utile per l\'anno prossimo).'],
      ['Portarlo in Excel', '"📊 Esporta Excel" scarica sintesi e categorie.'],
      ['Stampare o salvare in PDF', '"🖨 Stampa": stampa il confronto senza menu e pulsanti; nella finestra di stampa scegli "Salva come PDF" per un file.'],
    ],
    sapere: [
      'Le frecce: <b>▲ verde</b> = va meglio (più entrate o meno spese), <b>▼ rossa</b> = va peggio.',
      '"—" indica dati reali di un anno non ancora iniziato: per quell\'anno conta il preventivo.',
      'Il saldo per condomino è quello del singolo anno; la situazione cumulativa (con il riporto) è in Entrate.',
    ],
  },
  ricerca: {
    titolo: 'Ricerca',
    breve: 'Trova in un colpo spese, versamenti, fornitori, avvisi, verbali, lavori e delibere che contengono le parole cercate.',
    trovi: [
      'I risultati raggruppati per sezione, con il numero di voci trovate e le parole evidenziate.',
      ['admin', 'Anche i condomini (nome, appartamento, email): solo per chi amministra.'],
    ],
    fare: [
      ['Cercare', 'Scrivi nel campo "🔍 Cerca nel sito" nella barra laterale e premi Invio; dal telefono tocca 🔍 in alto. Il tasto "/" porta subito al campo.'],
      ['Restringere', 'Aggiungi una parola: vengono mostrate solo le voci che le contengono tutte.'],
      ['Aprire una voce', 'Tocca il risultato: si apre la scheda (o la pagina giusta, già filtrata).'],
    ],
    sapere: [
      'Maiuscole e accenti non contano. Puoi cercare anche importi (es. 1200) e date (es. 31/03/2026).',
      'La ricerca mostra solo ciò che puoi già vedere nelle pagine del tuo condominio.',
    ],
  },
  fornitori: {
    titolo: 'Fornitori',
    breve: 'La rubrica delle ditte e dei professionisti che lavorano per il condominio.',
    trovi: [
      'Una scheda per fornitore con contatti, IBAN e persona di riferimento.',
      '"📊 Storico": le spese collegate al fornitore e l\'ultimo intervento.',
      '📋 accanto all\'IBAN lo copia.',
      'I pulsanti degli anni in alto: spese reali e previste di uno o più anni, sommate (con "Tutti" l\'intero storico).',
      'In fondo i fornitori non più attivi.',
    ],
    fare: [
      ['mod', 'Aggiungere un fornitore', '"+ Nuovo fornitore": servono almeno nome e categoria.'],
      ['mod', 'Collegarlo a una spesa', 'Nella scheda della spesa scegli il fornitore nel campo "Fornitore".'],
      ['mod', 'Non usarlo più', 'Il pulsante con l\'omino barrato (Disabilita) lo sposta tra i non attivi senza perdere lo storico; "▶ Riattiva" lo riporta.'],
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
      ['admin', 'Aggiornare un lavoro', 'La matita sul lavoro: cambia stato o percentuale e aggiungi una nota allo storico.'],
      ['admin', 'Collegare le cose', 'Un lavoro può citare la delibera che lo ha deciso, una delibera il suo verbale.'],
      ['admin', 'Avvisare per email', 'Pubblicando un avviso o un verbale, spunta "Avvisa i condomini per email" solo per le comunicazioni importanti: compare l\'elenco dei condomini, tutti spuntati; togli chi non serve (o "Nessuno" e scegli). L\'email parte in copia nascosta. Per rispedire dopo una modifica usa "Invia di nuovo per email".'],
      ['admin', 'Avvisare su WhatsApp', '"💬" sull\'avviso o sul verbale: scegli chi avvisare con "💬 Apri" (WhatsApp si apre con il messaggio già scritto, lo mandi tu con Invia) oppure "📋 Copia per il gruppo" e incollalo nel gruppo del condominio.'],
      ['noadmin', 'Proporre un avviso', 'Puoi leggere tutto; per pubblicare rivolgiti all\'amministratore.'],
    ],
    sapere: [
      'Un avviso con scadenza serve per comunicazioni a tempo (es. lavori in cortile fino al…).',
      'Le email arrivano da notifichecondominio@gmail.com: se non le trovi, guarda nella posta indesiderata e segna l\'indirizzo come attendibile.',
      ['admin', 'Se un invio dice che ha richiesto troppo tempo, una parte delle email può essere già partita: il pulsante resta spento. Guarda lo storico degli invii in Impostazioni prima di riprovare, per non mandarle due volte.'],
      ['admin', 'Per evitare abusi e il blocco della casella, ogni condominio può mandare al massimo 5 invii all\'ora e 50 destinatari in 24 ore (contano avvisi, verbali, rendiconti, estratti conto e promemoria). Se il limite è raggiunto l\'app te lo dice prima di pubblicare, con il tempo di attesa: puoi pubblicare senza email e usare "Invia di nuovo per email" più tardi.'],
    ],
  },
  condomini: {
    titolo: 'Condomini',
    breve: 'Le persone del condominio e cosa possono fare nell\'app.',
    trovi: [
      'Gli appartamenti attivi, con ruolo.',
      ['mod', 'Anche l\'email di ciascuno (con cui accede e riceve le comunicazioni).'],
      'In fondo gli archiviati: persone che non accedono più, con i dati conservati.',
    ],
    fare: [
      ['admin', 'Aggiungere una persona', '"+ Aggiungi condomino": nome, appartamento, email e ruolo (il nickname è facoltativo, solo per riconoscerlo). Con quell\'email potrà entrare (anche con Google).'],
      ['admin', 'Cambiare dati o ruolo', '"Modifica".'],
      ['admin', 'Vendita o nuovo inquilino', '"🔁 Subentro": indichi la data e il nuovo condomino. Chi esce viene archiviato con quella data di uscita (se la data è futura resta attivo, con accesso e quota, fino a quel giorno e poi passa tra gli archiviati; chi entra non ha accesso né email prima della sua data), chi entra prende lo stesso appartamento e, se lasci la spunta, le quote delle spese future non ancora consuntivate. L\'avviso "Subentro registrato" compare solo dopo la conferma del salvataggio; se le quote delle spese non riescono a passare (o una spesa è cambiata nel frattempo), l\'app te lo dice e vanno corrette a mano. Se avevi aperta la scheda di una spesa mentre il subentro si salvava, l\'app la chiude quando le quote passano (le modifiche non salvate di quella scheda vanno rifatte). Finché la data non è arrivata, su chi esce non si registra un secondo subentro e in "Modifica" non si può svuotare "Uscito il".'],
      ['admin', 'Chi ha lasciato il condominio', '"⏸ Archivia" con la data di uscita: non entra più, ma pagamenti e storico restano. Se archivi chi ha già un subentro a data futura, l\'app chiede conferma e conserva la nota del subentro. "▶ Riattiva" lo riporta, tranne chi è uscito con un subentro: per lui l\'app non riattiva (l\'appartamento tornerebbe ad avere due condomini attivi) e va registrato un nuovo subentro.'],
      ['admin', 'Date di ingresso e uscita', 'In "Modifica", "Nel condominio dal" (e "Uscito il" per gli archiviati). Lascia vuoto se c\'è da sempre.'],
      ['admin', 'Chi riceve le email', 'Nella scheda di ogni condomino, "Riceve le email": togli la spunta per chi non le vuole. Non comparirà più tra i destinatari selezionabili.'],
      ['admin', 'Cellulare e WhatsApp', 'Nella scheda di ogni condomino, "Cellulare (WhatsApp)": senza prefisso vale +39, per un numero estero scrivi il prefisso. Un numero fisso non va bene per WhatsApp. Togli "Riceve WhatsApp" per chi non vuole messaggi.'],
      ['admin', 'Millesimi', 'Se il condominio li usa, sulla scheda di ogni condomino compaiono i millesimi del suo appartamento. Si modificano solo in Impostazioni → Tabelle millesimali; con un subentro passano da soli al nuovo proprietario. Se in un appartamento ci sono più condomini attivi (cointestatari), l\'appartamento conta una volta sola: in "Modifica" spunta "Rappresentante dell\'appartamento" su uno di loro, gli altri non portano peso né quote proprie nella proposta dei millesimi. Nominare un nuovo rappresentante toglie la spunta solo a chi è ancora presente: chi è già uscito la conserva, così le spese delle date passate si propongono come allora. Finché non lo indichi, il peso è diviso in parti uguali tra loro e compare un avviso nella scheda e in Impostazioni → Tabelle millesimali.'],
      ['admin', 'In affitto', 'Sulla scheda di un appartamento affittato compare "🔑 In affitto": si imposta in Impostazioni → Appartamenti in affitto.'],
      ['admin', 'Password dimenticata', '"🔑 Reset PW" imposta una password temporanea da comunicare alla persona.'],
      ['admin', 'Situazione di una persona', '"📊 Bilancio" apre il suo dettaglio; "📄 Estratto conto" scarica in PDF movimenti e saldo, da inviarle.'],
    ],
    sapere: [
      '<b>Lettura</b>: solo consultazione. <b>Modifica</b>: inserisce spese, entrate e fornitori. <b>Amm. Edificio</b>: gestisce anche persone e comunicazioni.',
      ['admin', 'Un amministratore del condominio può nominare altri amministratori o dare "Modifica": ogni nomina resta nel registro delle modifiche del servizio, con chi l\'ha fatta. Il ruolo si cambia dalla scheda (Modifica) o dal menu Ruolo in Impostazioni e vale subito sul server: chi ha l\'app aperta lo vede al prossimo accesso, o al più tardi entro un\'ora. Puoi assegnare solo Lettura, Modifica e Amm. Edificio, e solo a persone del tuo condominio; il tuo ruolo lo cambia un altro amministratore o il Super Admin.'],
      ['super', 'Informativa privacy: in Impostazioni c\'è una bozza modificabile (titoli con ##, elenchi con -, grassetto con **) con anteprima e il conteggio delle parti [ ] ancora da compilare. La vedi e la modifichi solo tu; gli altri utenti non la vedono e il login non la richiama finché non la pubblichiamo.'],
      ['super', 'Le nomine fatte dagli amministratori compaiono in Impostazioni › Stato del servizio › Registro modifiche come "Nomina" e "Ruolo assegnato", con chi le ha fatte.'],
      ['admin', 'Un\'email vale per un solo condominio: se è già usata da una persona di un altro condominio, al salvataggio l\'app ti avvisa. Puoi salvare lo stesso (le email le riceverà), ma con quell\'email la persona continuerà a entrare nell\'altro condominio.'],
      ['admin', 'Ogni condomino può correggere da solo, da "👤 Il mio profilo", nickname, cellulare, la scelta su email e WhatsApp e la propria email di accesso (con link di conferma al nuovo indirizzo). Le modifiche compaiono nel registro a suo nome. Nome e cognome, appartamento, date, ruolo e millesimi restano solo a te.'],
      'Eliminare definitivamente si può solo per chi non ha movimenti: un condomino con quote nelle spese o versamenti non si elimina (l\'app risponde "Ha movimenti: usa Archivia"), si archivia e i suoi dati restano nello storico.',
      'Privacy: email e telefoni dei condomini li vedono solo l\'amministratore e chi ha "Modifica". Gli altri condomini vedono solo nomi, appartamenti e quote.',
      'Chi viene archiviato, o arriva alla data di uscita, non entra più; chi passa a un ruolo più basso perde i permessi in più. Se in quel momento ha l\'app aperta, per leggere e scrivere i dati i vecchi permessi smettono di valere entro un\'ora. Le operazioni più delicate (assegnare ruoli, inviare email a nome dell\'amministratore) controllano invece il ruolo attuale a ogni richiesta: un amministratore declassato o uscito non le può più eseguire, anche con l\'app ancora aperta.',
      'Le spese senza ripartizione si dividono tra chi abitava nel condominio alla data della spesa: chi è uscito non paga quelle successive, chi è entrato non paga quelle precedenti. Rendiconto, bilancio ed estratto conto di un anno includono anche chi c\'era solo per una parte dell\'anno e chi, uscito in precedenza, ha ancora un debito o un credito da regolare o una quota aggiunta a mano su una spesa di quell\'anno (anche nelle Entrate).',
      ['admin', 'Subentri e competenza: la data di uscita è il primo giorno in cui la persona non c\'è più, quella di ingresso il primo giorno in cui c\'è. Una spesa ordinaria è di chi fa parte del condominio nel GIORNO della spesa (come per legge: del venditore fino al rogito, dell\'acquirente dopo); lo stesso vale per ogni occorrenza di una spesa ricorrente e per la scadenza di una rata. Per una vendita inserisci come data di uscita il giorno DOPO il rogito. Conta sempre la data della spesa o della rata, non il giorno in cui la inserisci: una spesa di dicembre inserita a gennaio è di chi c\'era a dicembre.'],
      ['admin', 'Rate previste e subentri: nel Piano rate chi esce non ha rate con scadenza dopo l\'uscita e chi entra non ne ha prima dell\'ingresso (i versamenti previsionali già creati restano, ma vuoti e con la scritta "fuori competenza"). Ognuno paga in rate la propria quota di competenza, con le scadenze in cui c\'è. Se nel suo periodo non cade nessuna rata, il piano non ne aggiunge: la quota resta da regolare quando inserisci la prossima rata o spesa. I versamenti già incassati non vengono mai toccati. I rendiconti degli anni chiusi non si toccano.'],
      ['admin', 'Spese con ripartizione scritta a mano: al salvataggio l\'app ti avvisa se una quota è assegnata a chi in quella data non fa parte del condominio, o se manca la quota a chi c\'è. È solo un avviso: se è voluto puoi salvare lo stesso.'],
    ],
  },
  impostazioni: {
    titolo: 'Impostazioni',
    breve: 'La configurazione del condominio e degli accessi.',
    trovi: [
      'Utenti del condominio con ruolo e stato (attivo o disabilitato).',
      'Categorie di spesa.',
      'Sicurezza dell\'account: cambio password.',
      ['super', 'Gestione dei condomìni, nome del servizio, log degli accessi e "Stato del servizio" (backup automatici, avvisi automatici, registro modifiche, errori).'],
      ['super', 'Backup automatico: ogni notte alle 3 una copia completa nello spazio del servizio (30 giorni) e una copia compressa nel Google Drive di notifichecondominio@, cartella "Backup Condominio" (ultimi 14 giorni, uno al mese per un anno, uno all\'anno per sempre). L\'esito è in "Stato del servizio".'],
      ['super', 'Backup manuale: "💾 Scarica backup JSON" salva una copia dei dati sul tuo computer; conviene farlo una volta al mese.'],
    ],
    fare: [
      ['admin', 'Disabilitare un utente', 'Il pulsante con l\'omino barrato sulla riga; "Riabilita" (omino con la spunta) lo riattiva.'],
      ['super', 'Aggiungere o modificare categorie', 'Nella sezione Categorie; "↩ Ripristina categorie default" torna a quelle iniziali.'],
      ['super', 'Aggiungere un condominio', 'Sezione "🏢 Gestione condomini".'],
      ['admin', 'Email ai condomini', 'Sezione "📧 Email ai condomini": accendi o spegni i promemoria automatici delle rate (e quanti giorni prima) e consulta lo storico delle email inviate, con chi le ha ricevute. Le email fermate dal limite di invii compaiono come "bloccata dal limite", con il motivo.'],
      ['admin', 'WhatsApp ai condomini', 'Sezione "💬 WhatsApp ai condomini": per ogni evento (rendiconto inviato, nuovo avviso, nuovo verbale, promemoria rata) scegli se mostrare il pulsante 💬 e cambia il testo; le parole tra graffe, come {nome} o {rata}, si riempiono da sole. Imposta anche la firma. Sotto, i messaggi aperti con l\'elenco di chi: l\'app sa a chi ha aperto WhatsApp, non se poi hai premuto Invia. Nessun messaggio parte da solo: lo spedisci sempre tu dal tuo telefono o da WhatsApp Web.'],
      ['admin', 'Tabelle millesimali', 'Sezione "⚖️ Tabelle millesimali": accendi "Usa i millesimi" con la data da cui valgono, inserisci i millesimi di ogni appartamento (il totale deve fare 1000), aggiungi altre tabelle (Scale, Ascensore…) e scegli quale proporre per ogni categoria. Le spese già inserite non cambiano; per quelle dell\'anno in corso non consuntivate c\'è "Applica…" con l\'anteprima: tocca solo le spese dal giorno in cui i millesimi valgono, con la tabella scelta nella spesa (altrimenti quella della categoria), e salta quelle con la ripartizione fatta a mano (quote bloccate, righe aggiunte a mano, percentuali diverse dalle parti uguali o dalla proposta). L\'anteprima elenca spesa per spesa quelle che cambiano (prima e dopo) e quelle saltate, con il motivo.'],
      ['super', 'Ricevere gli avvisi quando qualcosa non va', 'Sono già attivi: ogni mattina alle 7:30 un controllo verifica backup notturno, errori dell\'app ed email ai condomini non partite, e se trova un problema scrive al Super Admin (al massimo una volta al giorno). Segnala anche un backup saltato la notte stessa, una copia su Drive rimasta a metà, copie vecchie che il Drive non ha cancellato, email ai condomini bloccate "in invio" anche da più di un giorno o fermate dal limite di invii e un controllo che non è riuscito a leggere i dati. Se l\'avviso del giorno non è partito, il controllo successivo riprova. In "Stato del servizio › 🔔 Avvisi automatici" vedi l\'esito dell\'ultimo controllo; "📧 Invia email di prova" lo esegue subito e ti scrive anche se è tutto a posto (se l\'email non parte, ti mostra il motivo).'],
      ['admin', 'Se un altro amministratore ha cambiato le stesse impostazioni', 'Tabelle millesimali, appartamenti in affitto, WhatsApp ed email si rileggono dal server ogni volta che apri Impostazioni. Se, mentre le modifichi, un\'altra persona le salva, il tuo salvataggio si ferma con un avviso invece di cancellare la sua modifica: scegli "Ricarica i valori" per vedere quelli aggiornati e rifai le tue, oppure "Resta qui". Lo stesso vale per le categorie e il nome del servizio.'],
      ['admin', 'Appartamenti in affitto', 'Sezione "🔑 Appartamenti in affitto": di base sono tutti del proprietario; spunta quelli affittati. Nell\'estratto conto del proprietario comparirà "Da recuperare dall\'inquilino": le quote delle spese ordinarie (le straordinarie restano sue). Verso il condominio paga sempre il proprietario.'],
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
    + (nuova ? '<span class="btn-guida-nuova" aria-hidden="true"></span>' : '') + `</button>`
    + renderInterruttoreTema(); // interruttore chiaro/scuro accanto alla guida (js/core/tema.js)
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
