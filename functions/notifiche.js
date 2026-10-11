// Notifiche email ai condomini, spedite dalla casella Gmail del condominio.
//
//  • notificaVita: nuovo avviso in bacheca o nuovo verbale. Parte solo se chi
//    pubblica lascia spuntato "Avvisa i condomini per email": il client scrive
//    nel record il campo `notificaEmail` (un codice nuovo a ogni richiesta).
//    Un'email sola, con i destinatari in copia nascosta (nessuno vede gli
//    indirizzi degli altri).
//  • promemoriaRate: ogni mattina alle 8, promemoria a ciascun condomino per
//    le rate previste fra GIORNI_PREAVVISO giorni.
//
// Destinatari: condomini dell'edificio non archiviati, con un'email e senza
// `emailNotifiche: false` (casella "Riceve le email" nella scheda condomino).
// Ogni invio è registrato in mailLog con un id deterministico, creato PRIMA di
// spedire: un nuovo tentativo della funzione non spedisce due volte.
//
// La password per le app di Gmail è nel Secret Manager (GMAIL_APP_PASSWORD),
// mai nel codice. Sugli emulatori le email NON partono: vengono solo
// registrate in mailLog con simulata: true.
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const nodemailer = require('nodemailer');

const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');
const MITTENTE = 'notifichecondominio@gmail.com';
const SITO = 'https://neridarimini20.it';
const GIORNI_PREAVVISO = 3;
const EMULATORE = process.env.FUNCTIONS_EMULATOR === 'true';

const db = () => getFirestore();

// ─── Testi ─────────────────────────────────────────────────────────
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = (n) => '€ ' + Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataIt = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s || ''); };
// Una riga di oggetto non può contenere a capo (intestazioni dell'email).
const unaRiga = (s, max = 140) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

function pagina(nomeEdificio, titolo, corpoHtml) {
  return `<!doctype html><html lang="it"><body style="margin:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="font-size:13px;color:#636363;margin-bottom:8px">${escHtml(nomeEdificio)}</div>
  <div style="background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:20px 22px">
    <h1 style="font-size:19px;margin:0 0 12px">${escHtml(titolo)}</h1>
    ${corpoHtml}
    <p style="margin:20px 0 0"><a href="${SITO}" style="display:inline-block;background:#171717;color:#fafafa;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:14px">Apri Condominio Manager</a></p>
  </div>
  <p style="font-size:12px;color:#636363;line-height:1.5;margin:14px 4px 0">Email automatica di Condominio Manager: non rispondere a questo indirizzo.
  Per non ricevere più queste email chiedi all'amministratore del condominio di togliere la spunta "Riceve le email" dalla tua scheda.</p>
</div></body></html>`;
}
const paragrafi = (testo) => String(testo || '').split(/\n{2,}/).map((p) => `<p style="font-size:15px;line-height:1.55;margin:0 0 10px;white-space:pre-line">${escHtml(p)}</p>`).join('');

// ─── Destinatari e invio ───────────────────────────────────────────
async function nomeEdificio(buildingId) {
  const s = await db().doc(`buildings/${buildingId}`).get();
  return (s.exists && s.data().nome) || 'Il tuo condominio';
}

function emailValida(e) { return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(String(e || '')); }

async function destinatari(buildingId) {
  const snap = await db().collection(`buildings/${buildingId}/members`).get();
  const oggi = new Date().toISOString().slice(0, 10);
  const email = new Set();
  snap.forEach((d) => {
    const m = d.data();
    if (m._deleted || m.disabled || m.emailNotifiche === false) return;
    if (m.dataUscita && String(m.dataUscita) <= oggi) return;
    if (emailValida(m.email)) email.add(String(m.email).trim().toLowerCase());
  });
  return [...email];
}

let _trasporto;
function trasporto() {
  if (!_trasporto) {
    _trasporto = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: MITTENTE, pass: GMAIL_APP_PASSWORD.value() },
    });
  }
  return _trasporto;
}

// Registra l'invio (id deterministico: se esiste già, non rispedisce) e spedisce.
async function invia(idLog, { a, ccn, oggetto, html, testo, info }) {
  const ref = db().collection('mailLog').doc(idLog);
  const destinatariTot = (a ? [a] : []).concat(ccn || []);
  try {
    await ref.create({ ...info, oggetto, destinatari: destinatariTot.length, stato: 'in invio', simulata: EMULATORE, creatoIl: FieldValue.serverTimestamp() });
  } catch (e) {
    if (e.code === 6 || /already exists/i.test(e.message)) return { saltata: true }; // già spedita
    throw e;
  }
  if (!destinatariTot.length) { await ref.update({ stato: 'nessun destinatario' }); return { inviata: false }; }
  if (EMULATORE) { await ref.update({ stato: 'simulata', elenco: destinatariTot }); return { inviata: false, simulata: true }; }
  try {
    await trasporto().sendMail({
      from: `"Condominio Manager" <${MITTENTE}>`,
      to: a || MITTENTE,
      bcc: ccn && ccn.length ? ccn : undefined,
      subject: oggetto, html, text: testo,
    });
    await ref.update({ stato: 'inviata', inviataIl: FieldValue.serverTimestamp() });
    return { inviata: true };
  } catch (e) {
    await ref.update({ stato: 'errore', errore: unaRiga(e.message, 300) });
    throw e;
  }
}

// ─── Avvisi e verbali ──────────────────────────────────────────────
const TIPI = {
  notices: { etichetta: 'Nuovo avviso', voce: 'avviso' },
  minutes: { etichetta: 'Nuovo verbale', voce: 'verbale' },
};

function contenuto(coll, r) {
  if (coll === 'notices') {
    const scad = r.scadenza ? `<p style="font-size:14px;color:#636363;margin:0 0 10px">Valido fino al ${escHtml(dataIt(r.scadenza))}</p>` : '';
    return { html: (r.prioritaria ? '<p style="font-size:13px;font-weight:600;color:#b91c1c;margin:0 0 8px">Avviso importante</p>' : '') + paragrafi(r.testo) + scad,
      testo: `${r.testo || ''}${r.scadenza ? `\n\nValido fino al ${dataIt(r.scadenza)}` : ''}` };
  }
  const dec = (r.decisioni || []).length ? `<p style="font-size:14px;font-weight:600;margin:12px 0 6px">Decisioni</p><ul style="font-size:15px;line-height:1.5;margin:0;padding-left:20px">${r.decisioni.map((d) => `<li>${escHtml(d)}</li>`).join('')}</ul>` : '';
  const arg = (r.argomenti || []).length ? `<p style="font-size:14px;color:#636363;margin:0 0 8px">Argomenti: ${escHtml(r.argomenti.join(', '))}</p>` : '';
  const all = (r.allegati || []).length ? `<p style="font-size:14px;color:#636363;margin:10px 0 0">${r.allegati.length} ${r.allegati.length === 1 ? 'allegato' : 'allegati'}: aprili nell'app.</p>` : '';
  return { html: `<p style="font-size:14px;color:#636363;margin:0 0 8px">Assemblea ${escHtml(r.tipo || '')} del ${escHtml(dataIt(r.data))}</p>${arg}${dec}${all}`,
    testo: `Assemblea ${r.tipo || ''} del ${dataIt(r.data)}\n${(r.decisioni || []).map((d) => '- ' + d).join('\n')}` };
}

exports.notificaVita = onDocumentWritten({ document: 'buildings/{buildingId}/{coll}/{docId}', secrets: [GMAIL_APP_PASSWORD] }, async (event) => {
  const { buildingId, coll, docId } = event.params;
  if (!TIPI[coll]) return;
  const prima = event.data?.before?.exists ? event.data.before.data() : null;
  const dopo = event.data?.after?.exists ? event.data.after.data() : null;
  if (!dopo || dopo._deleted) return;
  const codice = dopo.notificaEmail;
  // Solo una richiesta nuova: stesso codice di prima = semplice modifica del testo.
  if (!codice || typeof codice !== 'string' || codice === prima?.notificaEmail) return;
  const [ccn, edificio] = await Promise.all([destinatari(buildingId), nomeEdificio(buildingId)]);
  const titolo = unaRiga(dopo.titolo || TIPI[coll].etichetta);
  const { html, testo } = contenuto(coll, dopo);
  await invia(`vita_${buildingId}_${coll}_${docId}_${unaRiga(codice, 60).replace(/[^\w-]/g, '')}`, {
    ccn,
    oggetto: `${TIPI[coll].etichetta}: ${titolo}`,
    html: pagina(edificio, titolo, html),
    testo: `${edificio}\n\n${titolo}\n\n${testo}\n\nApri Condominio Manager: ${SITO}`,
    info: { tipo: TIPI[coll].voce, buildingId, recordId: docId },
  });
});

// ─── Promemoria rate ───────────────────────────────────────────────
function dataTraGiorni(n) {
  // Data di Roma (YYYY-MM-DD) fra n giorni.
  const d = new Date(Date.now() + n * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

async function inviaPromemoriaRate(giorno = dataTraGiorni(GIORNI_PREAVVISO)) {
  // Edificio per edificio (pochi): basta l'indice automatico su "data".
  const edifici = await db().collection('buildings').listDocuments();
  const rate = [];
  for (const e of edifici) rate.push(...(await e.collection('payments').where('data', '==', giorno).get()).docs);
  let n = 0;
  for (const doc of rate) {
    const r = doc.data();
    if (r._deleted || r.previsionale !== true) continue;
    const buildingId = String(r.edificioId);
    const m = await db().doc(`buildings/${buildingId}/members/${r.condominoId}`).get();
    const c = m.exists ? m.data() : null;
    if (!c || c._deleted || c.disabled || c.emailNotifiche === false || !emailValida(c.email)) continue;
    const edificio = await nomeEdificio(buildingId);
    const corpo = `<p style="font-size:15px;line-height:1.55;margin:0 0 10px">Ciao ${escHtml(c.nome || '')}, ti ricordiamo la rata di <strong>${escHtml(euro(r.importo))}</strong> prevista per il <strong>${escHtml(dataIt(r.data))}</strong>.</p>`
      + (r.descrizione ? `<p style="font-size:14px;color:#636363;margin:0 0 10px">${escHtml(r.descrizione)}</p>` : '')
      + '<p style="font-size:14px;color:#636363;margin:0">Se l\'hai già versata, non serve fare nulla: l\'amministratore la registrerà.</p>';
    const esito = await invia(`rata_${buildingId}_${doc.id}_${r.data}`, {
      a: String(c.email).trim(),
      oggetto: `Promemoria rata del ${dataIt(r.data)}: ${euro(r.importo)}`,
      html: pagina(edificio, 'Promemoria rata', corpo),
      testo: `${edificio}\n\nCiao ${c.nome || ''}, ti ricordiamo la rata di ${euro(r.importo)} prevista per il ${dataIt(r.data)}.\nSe l'hai già versata, non serve fare nulla.\n\n${SITO}`,
      info: { tipo: 'rata', buildingId, recordId: doc.id },
    });
    if (!esito.saltata) n++;
  }
  return n;
}

exports.promemoriaRate = onSchedule({ schedule: '0 8 * * *', timeZone: 'Europe/Rome', region: 'europe-west1', secrets: [GMAIL_APP_PASSWORD] }, async () => {
  await inviaPromemoriaRate();
});

exports._test = { inviaPromemoriaRate, destinatari, dataTraGiorni, contenuto, unaRiga };
