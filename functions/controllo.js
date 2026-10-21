// Avvisi automatici al Super Admin: problemi del servizio per email, senza
// dover aprire "Stato del servizio".
//
//  • controlloServizio: ogni mattina alle 7:30 (dopo il backup delle 3) verifica
//      - backup notturno: riuscito e non più vecchio di 26 ore (alle 7:30 quello
//        della notte ha 4,5 ore, quello del giorno prima 28,5), con la copia su Google Drive;
//      - errori dell'app (clientErrors) nelle ultime 24 ore: almeno 10, oppure
//        almeno 5 e il triplo della media giornaliera dei 7 giorni prima;
//      - email ai condomini non partite nelle ultime 24 ore (storico invii:
//        "errore", "in parte", "bloccata" dai limiti (limiti.js), o ferme "in
//        invio" da più di un'ora; queste ultime anche se create prima delle 24 ore).
//    Un controllo che non riesce a leggere i dati diventa a sua volta un problema,
//    senza fermare gli altri. Con almeno un problema scrive ai Super Admin, al
//    massimo una volta al giorno; se l'email non parte l'esecuzione pianificata
//    termina con errore, visibile nei log di Cloud Functions.
//  • provaAvvisi (dall'app, solo Super Admin): stesso controllo, email anche se
//    è tutto a posto, per verificare che arrivi.
//
// Destinatari: utenti con ruolo superAdmin (roles/) e l'email di cm_config.
// Ogni esecuzione è registrata in serviceAlerts/{id} (con i dettagli, mai
// leggibile dall'app) creato prima di spedire: un nuovo tentativo della
// funzione non rispedisce, a meno che l'invio precedente sia finito in errore o
// sia rimasto "in invio" per più di 10 minuti (funzione interrotta prima di
// spedire): allora riprova. L'esito per la schermata va in
// appSettings/controlloServizio con i soli titoli dei problemi (appSettings
// lo legge solo il superAdmin dal 2026-10-19; prima chiunque fosse autenticato).
// Sugli emulatori nessuna email parte (vedi notifiche.js).
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { posta } = require('./notifiche');

const { GMAIL_APP_PASSWORD, EMULATORE, spedisci, pagina, escHtml, unaRiga, emailValida, dataTraGiorni } = posta;
const ORA = 3600000;
const GIORNO = 24 * ORA;
const SOGLIA_BACKUP_ORE = 26;
const SOGLIA_ERRORI = 10;
const SOGLIA_AUMENTO = 5;
const RIPROVA_MS = 10 * 60000;

const db = () => getFirestore();
const ms = (t) => (t?.toMillis ? t.toMillis() : (t instanceof Date ? t.getTime() : 0));
const quando = (m) => new Date(m).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// ─── I tre controlli: ognuno ritorna null oppure { titolo, righe[] } ──
async function controllaBackup(ora) {
  const s = await db().doc('appSettings/backupStatus').get();
  if (!s.exists) return { titolo: 'Nessun backup automatico registrato', righe: ['Il backup notturno delle 3 non ha mai salvato il suo esito.'] };
  const b = s.data();
  if (b.ok === false) return { titolo: 'Backup notturno non riuscito', righe: [`Tentativo del ${quando(ms(b.at))}: ${unaRiga(b.error || 'errore sconosciuto', 300)}`] };
  if (ora - ms(b.at) > SOGLIA_BACKUP_ORE * ORA) return { titolo: 'Backup notturno non eseguito', righe: [`L'ultimo backup riuscito è del ${quando(ms(b.at))}.`] };
  // Copia esterna su Google Drive (drive.js), registrata dallo stesso backup.
  if (b.drive && b.drive.ok === false) {
    return b.drive.configurata === false
      ? { titolo: 'Copia del backup su Google Drive non attiva', righe: ['Manca l\'autorizzazione del Drive: vedi scripts/drive-autorizza.js.'] }
      : { titolo: 'Copia del backup su Google Drive non riuscita', righe: [unaRiga(b.drive.error || 'errore sconosciuto', 300)] };
  }
  // Copia riuscita, ma copie vecchie non cancellate: si accumulerebbero.
  const n = b.drive?.nonRimossi;
  if (n > 0) return { titolo: 'Backup vecchi su Google Drive non cancellati', righe: [`${n} ${n === 1 ? 'copia da togliere è rimasta' : 'copie da togliere sono rimaste'} nella cartella "Backup Condominio": il motivo è nei log di Cloud Functions (dailyBackup drive).`] };
  return null;
}

async function controllaErrori(ora) {
  const snap = await db().collection('clientErrors').where('at', '>=', new Date(ora - 8 * GIORNO)).get();
  const recenti = [];
  let prima = 0;
  snap.forEach((d) => { const e = d.data(); if (ms(e.at) >= ora - GIORNO) recenti.push(e); else prima++; });
  const media = prima / 7;
  const n = recenti.length;
  if (n < SOGLIA_ERRORI && !(n >= SOGLIA_AUMENTO && n >= 3 * media)) return null;
  const perMessaggio = new Map();
  for (const e of recenti) perMessaggio.set(e.message, (perMessaggio.get(e.message) || 0) + 1);
  const top = [...perMessaggio].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    titolo: `${n} errori dell'app nelle ultime 24 ore`,
    righe: [`Media dei 7 giorni prima: ${media.toLocaleString('it-IT', { maximumFractionDigits: 1 })} al giorno.`,
      ...top.map(([m, c]) => `${c}× ${unaRiga(m, 160)}`)],
  };
}

async function controllaEmail(ora) {
  const righe = [];
  for (const e of await db().collection('buildings').listDocuments()) {
    // Le ultime 24 ore, più gli invii ancora "in invio" creati prima: un'email
    // rimasta a metà poco prima della finestra non va persa.
    const [recenti, inInvio] = await Promise.all([
      e.collection('invii').where('creatoIl', '>=', new Date(ora - GIORNO)).get(),
      e.collection('invii').where('stato', '==', 'in invio').get(),
    ]);
    const docs = recenti.docs.concat(inInvio.docs.filter((d) => ms(d.data().creatoIl) < ora - GIORNO));
    let nome = null;
    for (const d of docs) {
      const v = d.data();
      const ferma = v.stato === 'in invio' && ora - ms(v.creatoIl) > ORA;
      if (!['errore', 'in parte', 'bloccata'].includes(v.stato) && !ferma) continue;
      if (nome === null) nome = ((await e.get()).data() || {}).nome || 'Condominio ' + e.id;
      const dettaglio = v.errore || v.errori?.[0]?.errore || (ferma ? 'rimasta in invio' : '');
      righe.push(`${nome}: «${unaRiga(v.oggetto || v.tipo || 'email', 80)}» ${v.stato}${dettaglio ? ' — ' + unaRiga(dettaglio, 160) : ''}`);
    }
  }
  return righe.length ? { titolo: `${righe.length} ${righe.length === 1 ? 'email ai condomini non partita' : 'email ai condomini non partite'}`, righe } : null;
}

// I tre controlli insieme: uno che fallisce (es. lettura di Firestore) diventa
// un problema "Controllo … non riuscito" e non fa perdere gli altri.
const CONTROLLI = [['del backup', controllaBackup], ['degli errori dell\'app', controllaErrori], ['delle email ai condomini', controllaEmail]];

async function raccogli(controlli, ora) {
  const esiti = await Promise.all(controlli.map(([nome, f]) => f(ora).catch((e) => {
    console.error('controlloServizio', nome, e);
    return { titolo: `Controllo ${nome} non riuscito`, righe: [unaRiga(e.message || String(e), 300)] };
  })));
  return esiti.filter(Boolean);
}

// ─── Destinatari ───────────────────────────────────────────────────
// Un utente cancellato si salta; altri errori di Auth (es. temporanei) si
// registrano, e se per colpa loro non resta nessun destinatario si segnala
// l'errore invece di risultare "nessun destinatario".
async function destinatari(auth = getAuth()) {
  const set = new Set();
  const cfg = (await db().doc('appdata/cm_config').get()).data() || {};
  if (emailValida(cfg.superAdminEmail)) set.add(cfg.superAdminEmail.trim().toLowerCase());
  let errore = null;
  for (const d of (await db().collection('roles').where('role', '==', 'superAdmin').get()).docs) {
    try {
      const u = await auth.getUser(d.id);
      if (!u.disabled && emailValida(u.email)) set.add(u.email.toLowerCase());
    } catch (e) {
      if (e.code === 'auth/user-not-found') continue;
      console.error('controlloServizio destinatario', d.id, e);
      errore = errore || e;
    }
  }
  if (!set.size && errore) throw errore;
  return [...set];
}

// ─── Email ─────────────────────────────────────────────────────────
const PIEDE = 'Avviso automatico di Condominio Manager per il Super Admin. Arriva solo quando qualcosa non va, una volta al giorno; i dettagli sono in Impostazioni › Stato del servizio.';

function componi(problemi, prova) {
  const titolo = problemi.length ? (problemi.length === 1 ? problemi[0].titolo : `${problemi.length} problemi da controllare`) : 'Prova: tutto a posto';
  const blocchi = problemi.map((p) => `<p style="font-size:15px;font-weight:600;margin:14px 0 6px">${escHtml(p.titolo)}</p>`
    + `<ul style="font-size:14px;line-height:1.5;margin:0;padding-left:20px">${p.righe.map((r) => `<li>${escHtml(r)}</li>`).join('')}</ul>`).join('');
  const intro = prova ? `<p style="font-size:15px;line-height:1.55;margin:0 0 10px">Email di prova richiesta dall'app: gli avvisi automatici arrivano a questo indirizzo.${problemi.length ? ' Il controllo di adesso ha trovato:' : ' Il controllo di adesso non ha trovato problemi.'}</p>` : '';
  const testo = [prova ? 'Email di prova degli avvisi automatici.' : '', ...problemi.map((p) => `${p.titolo}\n${p.righe.map((r) => '- ' + r).join('\n')}`)].filter(Boolean).join('\n\n');
  return {
    oggetto: `${prova ? '[Prova] ' : ''}Condominio Manager: ${titolo}`,
    html: pagina('Condominio Manager', titolo, intro + blocchi, PIEDE),
    testo: `${testo}\n\n${PIEDE}`,
  };
}

// ─── Esecuzione ────────────────────────────────────────────────────
// Prenota l'invio in serviceAlerts: crea il documento, oppure riprende quello
// di un'esecuzione che non ha spedito (stato "errore", o "in invio" da più di
// RIPROVA_MS). Ritorna null se tocca a questa esecuzione spedire, altrimenti lo
// stato trovato. In transazione: due esecuzioni insieme non spediscono due volte.
function prenota(ref, dati, ora) {
  return db().runTransaction(async (t) => {
    const s = await t.get(ref);
    if (!s.exists) { t.create(ref, { ...dati, creatoIl: FieldValue.serverTimestamp() }); return null; }
    const v = s.data();
    const ferma = v.stato === 'in invio' && ora - ms(v.inInvioDal || v.creatoIl) > RIPROVA_MS;
    if (v.stato !== 'errore' && !ferma) return v.stato || 'in invio';
    console.warn('controlloServizio: nuovo tentativo di invio', ref.id, v.stato);
    t.update(ref, { ...dati, tentativi: (v.tentativi || 1) + 1, errore: FieldValue.delete() });
    return null;
  });
}

async function eseguiControllo({ prova = false, ora = Date.now(), autoreUid = null, controlli = CONTROLLI, auth } = {}) {
  const problemi = await raccogli(controlli, ora);
  let email = 'non necessaria', n = 0, errore = null;
  let a = null;
  if (problemi.length || prova) {
    try {
      a = await destinatari(auth);
    } catch (e) {
      console.error('controlloServizio destinatari', e);
      email = 'errore'; errore = unaRiga('Lettura dei destinatari: ' + (e.message || e), 300);
    }
  }
  if (a) {
    const { oggetto, html, testo } = componi(problemi, prova);
    const id = prova ? `prova_${ora}_${Math.random().toString(36).slice(2, 6)}` : `controllo_${dataTraGiorni(0)}`;
    const ref = db().doc(`serviceAlerts/${id}`);
    const trovato = await prenota(ref, { oggetto, problemi, destinatari: a, prova, autoreUid, stato: 'in invio', simulata: EMULATORE, inInvioDal: FieldValue.serverTimestamp() }, ora);
    if (trovato) email = trovato === 'in invio' ? 'già in invio' : 'già inviata oggi';
    else if (!a.length) { email = 'nessun destinatario'; await ref.update({ stato: email }); }
    else {
      try {
        await spedisci({ a, oggetto, html, testo });
        email = EMULATORE ? 'simulata' : 'inviata'; n = a.length;
        await ref.update({ stato: email, inviataIl: FieldValue.serverTimestamp() });
      } catch (e) {
        console.error('controlloServizio email', e);
        email = 'errore'; errore = unaRiga(e.message, 300);
        await ref.update({ stato: 'errore', errore });
      }
    }
  }
  await db().doc('appSettings/controlloServizio').set({
    at: FieldValue.serverTimestamp(), ok: !problemi.length, problemi: problemi.map((p) => p.titolo),
    email, destinatari: n, prova, errore,
  });
  return { ok: !problemi.length, problemi: problemi.map((p) => p.titolo), email, destinatari: n, simulata: EMULATORE, errore };
}

// Email non partita: l'esecuzione termina con errore, così risulta nei log e
// negli avvisi di Cloud Functions anche senza aprire "Stato del servizio".
exports.controlloServizio = onSchedule({ schedule: '30 7 * * *', timeZone: 'Europe/Rome', region: 'europe-west1', secrets: [GMAIL_APP_PASSWORD] }, async () => {
  const r = await eseguiControllo();
  if (r.email === 'errore') throw new Error(`Avviso al Super Admin non inviato: ${r.errore}`);
});

exports.provaAvvisi = onCall({ region: 'europe-west1', secrets: [GMAIL_APP_PASSWORD] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Accesso richiesto.');
  if (request.auth.token.role !== 'superAdmin') throw new HttpsError('permission-denied', 'Solo il Super Admin può provare gli avvisi.');
  return eseguiControllo({ prova: true, autoreUid: request.auth.uid });
});

exports._test = { eseguiControllo, raccogli, controllaBackup, controllaErrori, controllaEmail, destinatari, componi };
