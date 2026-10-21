// Email ai condomini, spedite dalla casella Gmail del condominio.
// Regola: nessuna email parte senza che chi amministra l'abbia deciso, e ogni
// invio va solo ai destinatari scelti nell'elenco con le spunte.
//
//  • notificaVita: avviso o verbale pubblicato con "Avvisa per email" acceso.
//    Il client scrive nel record `notificaEmail` (codice nuovo a ogni richiesta)
//    e `notificaDestinatari` (id dei condomini scelti). Un'email, in copia nascosta.
//  • inviaEmail (chiamata dall'app, solo amministratori): rendiconto PDF a più
//    condomini (copia nascosta), estratti conto personali (uno a ciascuno),
//    promemoria delle rate (uno a ciascuno, con importo, data e saldo).
//  • promemoriaRate: ogni mattina alle 8 SOLO per gli edifici che l'hanno
//    acceso in Impostazioni (buildings/{b}/impostazioni/email), con i giorni
//    di preavviso scelti. Spento finché nessuno lo accende.
//
// Limiti (limiti.js, decisione del 2026-10-15): per condominio 5 invii all'ora e
// 50 destinatari in 24 ore, 400 destinatari in 24 ore per la casella. Oltre il
// limite l'invio non parte: voce "bloccata" nello storico con il motivo e, per
// gli invii dall'app, errore con il tempo di attesa.
//
// Mai a chi è archiviato, uscito, senza email valida o con "Riceve le email"
// tolto (emailNotifiche: false), anche se richiesto. Ogni invio è registrato in
// buildings/{b}/invii (storico per gli amministratori) con un id creato prima
// di spedire: un nuovo tentativo della funzione non spedisce due volte.
// Password per le app di Gmail nel Secret Manager (GMAIL_APP_PASSWORD).
// Sugli emulatori nessuna email parte: invio solo registrato (simulata: true).
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const nodemailer = require('nodemailer');
const limiti = require('./limiti');

const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');
const MITTENTE = 'notifichecondominio@gmail.com';
const SITO = 'https://neridarimini20.it';
const EMULATORE = process.env.FUNCTIONS_EMULATOR === 'true';
const MAX_DESTINATARI = limiti.LIMITI.destinatariGiorno;
const MAX_ALLEGATI_BYTE = 7 * 1024 * 1024;

const db = () => getFirestore();

// ─── Testi ─────────────────────────────────────────────────────────
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = (n) => '€ ' + Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataIt = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s || ''); };
// Una riga di intestazione dell'email non può contenere a capo.
const unaRiga = (s, max = 140) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const testoLibero = (s, max = 3000) => String(s ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

const PIEDE_CONDOMINI = `Email di Condominio Manager inviata dall'amministratore: non rispondere a questo indirizzo.
  Per non ricevere più queste email chiedi all'amministratore di togliere la spunta "Riceve le email" dalla tua scheda.`;

function pagina(nomeEdificio, titolo, corpoHtml, piede = PIEDE_CONDOMINI) {
  return `<!doctype html><html lang="it"><body style="margin:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="font-size:13px;color:#636363;margin-bottom:8px">${escHtml(nomeEdificio)}</div>
  <div style="background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:20px 22px">
    <h1 style="font-size:19px;margin:0 0 12px">${escHtml(titolo)}</h1>
    ${corpoHtml}
    <p style="margin:20px 0 0"><a href="${SITO}" style="display:inline-block;background:#171717;color:#fafafa;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:14px">Apri Condominio Manager</a></p>
  </div>
  <p style="font-size:12px;color:#636363;line-height:1.5;margin:14px 4px 0">${escHtml(piede)}</p>
</div></body></html>`;
}
const paragrafi = (testo) => String(testo || '').split(/\n{2,}/).filter((p) => p.trim())
  .map((p) => `<p style="font-size:15px;line-height:1.55;margin:0 0 10px;white-space:pre-line">${escHtml(p)}</p>`).join('');

// ─── Condomini e destinatari ───────────────────────────────────────
async function nomeEdificio(buildingId) {
  const s = await db().doc(`buildings/${buildingId}`).get();
  return (s.exists && s.data().nome) || 'Il tuo condominio';
}
function emailValida(e) { return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(String(e || '').trim()); }
function oggiRoma() { return dataTraGiorni(0); }

// Perché un condomino non può ricevere email (null = può).
function motivoEsclusione(m, oggi = oggiRoma()) {
  if (!m || m._deleted) return 'non trovato';
  if (m.disabled || (m.dataUscita && String(m.dataUscita) <= oggi)) return 'archiviato';
  if (m.emailNotifiche === false) return 'ha tolto "Riceve le email"';
  if (!emailValida(m.email)) return 'senza email';
  return null;
}

// Condomini con la loro email, che sta in buildings/{b}/contatti/{id} (privacy,
// decisione del 2026-10-15); per un record non ancora migrato
// (scripts/separa-contatti.js) vale quella rimasta nel condomino.
async function condomini(buildingId) {
  const [snap, contatti] = await Promise.all([
    db().collection(`buildings/${buildingId}/members`).get(),
    db().collection(`buildings/${buildingId}/contatti`).get(),
  ]);
  const email = new Map(contatti.docs.filter((d) => !d.data()._deleted && d.data().email).map((d) => [String(d.id), d.data().email]));
  const mappa = new Map();
  snap.forEach((d) => mappa.set(String(d.id), email.has(String(d.id)) ? { ...d.data(), email: email.get(String(d.id)) } : d.data()));
  return mappa;
}

// Divide gli id richiesti in destinatari validi ed esclusi (con il motivo).
function scegli(mappa, ids) {
  const ok = [], esclusi = [];
  for (const id of [...new Set((ids || []).map(String))]) {
    const m = mappa.get(id);
    const motivo = motivoEsclusione(m);
    if (motivo) esclusi.push({ id, nome: m?.nome || id, motivo });
    else ok.push({ id, nome: m.nome || '', email: String(m.email).trim() });
  }
  return { ok, esclusi };
}

// ─── Invio e storico ───────────────────────────────────────────────
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

// Crea la voce di storico (se esiste già: invio già fatto, si salta).
async function apriStorico(buildingId, idLog, dati) {
  const ref = db().doc(`buildings/${buildingId}/invii/${idLog}`);
  try {
    await ref.create({ ...dati, buildingId: String(buildingId), stato: 'in invio', simulata: EMULATORE, creatoIl: FieldValue.serverTimestamp() });
    return ref;
  } catch (e) {
    if (e.code === 6 || /already exists/i.test(e.message)) return null;
    throw e;
  }
}

async function spedisci({ a, ccn, oggetto, html, testo, allegati }) {
  if (EMULATORE) return;
  await trasporto().sendMail({
    from: `"Condominio Manager" <${MITTENTE}>`,
    to: a || MITTENTE,
    bcc: ccn && ccn.length ? ccn : undefined,
    subject: unaRiga(oggetto, 160), html, text: testo,
    attachments: (allegati || []).map((x) => ({ filename: x.nome, content: x.contenuto, contentType: 'application/pdf' })),
  });
}

// Prenota l'invio nei limiti (limiti.js); se non c'è posto la voce di storico
// diventa "bloccata" con il motivo, che l'app mostra all'amministratore.
async function nelLimite(ref, buildingId, n, orario) {
  const r = await limiti.prenota(buildingId, n, { orario });
  if (r.ok) return null;
  await ref.update({ stato: 'bloccata', errore: r.messaggio });
  return { bloccata: true, messaggio: r.messaggio };
}

// Un'email sola, destinatari in copia nascosta.
async function inviaCollettiva(buildingId, idLog, { destinatari, esclusi = [], oggetto, html, testo, allegati, info }) {
  const ref = await apriStorico(buildingId, idLog, { ...info, oggetto, destinatari, esclusi, n: destinatari.length,
    allegato: allegati?.[0]?.nome || null });
  if (!ref) return { saltata: true };
  if (!destinatari.length) { await ref.update({ stato: 'nessun destinatario' }); return { inviati: 0 }; }
  const bloccata = await nelLimite(ref, buildingId, destinatari.length, true);
  if (bloccata) return bloccata;
  try {
    await spedisci({ ccn: destinatari.map((d) => d.email), oggetto, html, testo, allegati });
    await ref.update({ stato: EMULATORE ? 'simulata' : 'inviata', inviataIl: FieldValue.serverTimestamp() });
    return { inviati: destinatari.length };
  } catch (e) {
    await ref.update({ stato: 'errore', errore: unaRiga(e.message, 300) });
    throw e;
  }
}

// Un'email per ciascuno (estratti conto, promemoria): una voce di storico con l'esito di ognuno.
// orario: false per i promemoria automatici (contano solo sui destinatari del giorno).
async function inviaSingole(buildingId, idLog, { messaggi, esclusi = [], oggetto, info, orario = true }) {
  const ref = await apriStorico(buildingId, idLog, { ...info, oggetto, n: messaggi.length, esclusi,
    destinatari: messaggi.map((m) => ({ id: m.id, nome: m.nome, email: m.email })) });
  if (!ref) return { saltata: true };
  if (!messaggi.length) { await ref.update({ stato: 'nessun destinatario' }); return { inviati: 0, errori: [] }; }
  const bloccata = await nelLimite(ref, buildingId, messaggi.length, orario);
  if (bloccata) return bloccata;
  const errori = [];
  for (const m of messaggi) {
    try { await spedisci({ a: m.email, oggetto: m.oggetto, html: m.html, testo: m.testo, allegati: m.allegati }); }
    catch (e) { errori.push({ id: m.id, nome: m.nome, errore: unaRiga(e.message, 200) }); }
  }
  await ref.update({ stato: errori.length ? (errori.length === messaggi.length ? 'errore' : 'in parte') : (EMULATORE ? 'simulata' : 'inviata'),
    errori, inviataIl: FieldValue.serverTimestamp() });
  return { inviati: messaggi.length - errori.length, errori };
}

const idNuovo = (pref) => `${pref}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
  // Id dello storico (e quindi dell'invio) deciso dal server: l'ora della
  // scrittura, che le regole impongono uguale all'ora del server (_updatedAt),
  // o in mancanza l'id dell'evento, uguale nei nuovi tentativi della funzione.
  // Mai il codice scritto dal client, che può sceglierlo a piacere.
  const quando = typeof dopo._updatedAt?.toMillis === 'function' ? String(dopo._updatedAt.toMillis())
    : String(event.id || Date.now()).replace(/[^\w-]/g, '').slice(0, 60);
  if (!Array.isArray(dopo.notificaDestinatari)) return; // sempre l'elenco scelto, mai "tutti" implicito
  const mappa = await condomini(buildingId);
  const { ok, esclusi } = scegli(mappa, dopo.notificaDestinatari.slice(0, MAX_DESTINATARI));
  const edificio = await nomeEdificio(buildingId);
  const titolo = unaRiga(dopo.titolo || TIPI[coll].etichetta);
  const { html, testo } = contenuto(coll, dopo);
  await inviaCollettiva(buildingId, `vita_${coll}_${docId}_${quando}`, {
    destinatari: ok, esclusi,
    oggetto: `${TIPI[coll].etichetta}: ${titolo}`,
    html: pagina(edificio, titolo, html),
    testo: `${edificio}\n\n${titolo}\n\n${testo}\n\nApri Condominio Manager: ${SITO}`,
    info: { tipo: TIPI[coll].voce, recordId: docId, autoreUid: dopo._updatedBy || null },
  });
});

// ─── Invii dall'app (solo amministratori) ──────────────────────────
function controllaPermesso(request, buildingId) {
  const t = request.auth?.token || {};
  if (!request.auth) throw new HttpsError('unauthenticated', 'Accesso richiesto.');
  if (t.role === 'superAdmin') return;
  if (t.role === 'adminEdificio' && String(t.buildingId) === String(buildingId)) return;
  throw new HttpsError('permission-denied', 'Solo l\'amministratore del condominio può inviare email.');
}

function leggiAllegato(a) {
  if (!a || typeof a.base64 !== 'string' || !a.base64) throw new HttpsError('invalid-argument', 'Allegato mancante.');
  const contenuto = Buffer.from(a.base64, 'base64');
  if (contenuto.subarray(0, 5).toString() !== '%PDF-') throw new HttpsError('invalid-argument', 'L\'allegato deve essere un PDF.');
  const nome = unaRiga(a.nome || 'documento.pdf', 120).replace(/[\\/:*?"<>|]/g, '_');
  return { nome: /\.pdf$/i.test(nome) ? nome : nome + '.pdf', contenuto };
}

// Invio fermato dai limiti: errore all'app con il motivo e il tempo di attesa.
function seBloccata(r) {
  if (r.bloccata) throw new HttpsError('resource-exhausted', r.messaggio);
  return r;
}

async function inviaDaApp(request) {
  const d = request.data || {};
  const buildingId = String(d.buildingId || '');
  if (!/^\d+$/.test(buildingId)) throw new HttpsError('invalid-argument', 'Condominio non valido.');
  controllaPermesso(request, buildingId);
  // Prima di pubblicare un avviso o un verbale con l'email l'app chiede se
  // l'invio passerebbe, per avvisare subito invece che dopo la pubblicazione.
  if (d.tipo === 'verifica') {
    return limiti.verifica(buildingId, Math.max(1, Math.min(1000, parseInt(d.n, 10) || 1)));
  }
  const mappa = await condomini(buildingId);
  const edificio = await nomeEdificio(buildingId);
  const messaggio = testoLibero(d.messaggio);
  const info = { autoreUid: request.auth.uid };

  if (d.tipo === 'rendiconto') {
    const ids = Array.isArray(d.destinatari) ? d.destinatari : [];
    if (!ids.length || ids.length > MAX_DESTINATARI) throw new HttpsError('invalid-argument', 'Scegli da 1 a ' + MAX_DESTINATARI + ' destinatari.');
    const allegato = leggiAllegato(d.allegato);
    if (allegato.contenuto.length > MAX_ALLEGATI_BYTE) throw new HttpsError('invalid-argument', 'Il PDF è troppo grande per l\'email.');
    const { ok, esclusi } = scegli(mappa, ids);
    const oggetto = unaRiga(d.oggetto || 'Rendiconto del condominio');
    const r = seBloccata(await inviaCollettiva(buildingId, idNuovo('rend'), {
      destinatari: ok, esclusi, oggetto, allegati: [allegato],
      html: pagina(edificio, oggetto, (messaggio ? paragrafi(messaggio) : '') + `<p style="font-size:14px;color:#636363;margin:10px 0 0">In allegato: ${escHtml(allegato.nome)}</p>`),
      testo: `${edificio}\n\n${oggetto}\n\n${messaggio}\n\nIn allegato: ${allegato.nome}\n\n${SITO}`,
      info: { ...info, tipo: 'rendiconto' },
    }));
    return { inviati: r.inviati || 0, esclusi, simulata: EMULATORE };
  }

  if (d.tipo === 'estratti' || d.tipo === 'promemoria') {
    const voci = Array.isArray(d.invii) ? d.invii : [];
    if (!voci.length || voci.length > MAX_DESTINATARI) throw new HttpsError('invalid-argument', 'Scegli da 1 a ' + MAX_DESTINATARI + ' destinatari.');
    const { ok, esclusi } = scegli(mappa, voci.map((v) => v.id));
    const perId = new Map(voci.map((v) => [String(v.id), v]));
    let byte = 0;
    const messaggi = ok.map((c) => {
      const v = perId.get(c.id);
      if (d.tipo === 'estratti') {
        const allegato = leggiAllegato(v.allegato);
        byte += allegato.contenuto.length;
        const oggetto = unaRiga(d.oggetto || `Il tuo estratto conto ${v.anno || ''}`);
        return { ...c, oggetto, allegati: [allegato],
          html: pagina(edificio, oggetto, `<p style="font-size:15px;line-height:1.55;margin:0 0 10px">Ciao ${escHtml(c.nome)}, in allegato il tuo estratto conto${v.anno ? ' ' + escHtml(v.anno) : ''}: quote, versamenti e saldo.</p>` + paragrafi(messaggio)),
          testo: `${edificio}\n\nCiao ${c.nome}, in allegato il tuo estratto conto${v.anno ? ' ' + v.anno : ''}.\n\n${messaggio}\n\n${SITO}` };
      }
      const righe = [];
      if (v.rataImporto) righe.push(`la rata di <strong>${escHtml(euro(v.rataImporto))}</strong>${v.rataData ? ` prevista per il <strong>${escHtml(dataIt(v.rataData))}</strong>` : ''}`);
      const saldoTxt = typeof v.saldo === 'number' && v.saldo < 0 ? `<p style="font-size:15px;line-height:1.55;margin:0 0 10px">Il tuo saldo attuale è di <strong>${escHtml(euro(v.saldo))}</strong>.</p>` : '';
      const oggetto = unaRiga(d.oggetto || (v.rataData ? `Promemoria rata del ${dataIt(v.rataData)}` : 'Promemoria versamenti condominio'));
      return { ...c, oggetto,
        html: pagina(edificio, 'Promemoria', `<p style="font-size:15px;line-height:1.55;margin:0 0 10px">Ciao ${escHtml(c.nome)}, ti ricordiamo ${righe.length ? righe.join('') : 'i versamenti per il condominio'}.</p>${saldoTxt}${paragrafi(messaggio)}<p style="font-size:14px;color:#636363;margin:0">Se hai già versato, non serve fare nulla: l'amministratore lo registrerà.</p>`),
        testo: `${edificio}\n\nCiao ${c.nome}, ti ricordiamo ${v.rataImporto ? `la rata di ${euro(v.rataImporto)}${v.rataData ? ' prevista per il ' + dataIt(v.rataData) : ''}` : 'i versamenti per il condominio'}.${typeof v.saldo === 'number' && v.saldo < 0 ? `\nSaldo attuale: ${euro(v.saldo)}.` : ''}\n\n${messaggio}\n\nSe hai già versato, non serve fare nulla.\n\n${SITO}` };
    });
    if (byte > MAX_ALLEGATI_BYTE * 2) throw new HttpsError('invalid-argument', 'Troppi PDF in un solo invio: dividi in più volte.');
    const oggettoStorico = d.tipo === 'estratti' ? `Estratti conto ${voci[0]?.anno || ''}`.trim() : 'Promemoria rate';
    const r = seBloccata(await inviaSingole(buildingId, idNuovo(d.tipo === 'estratti' ? 'estr' : 'prom'), { messaggi, esclusi, oggetto: oggettoStorico, info: { ...info, tipo: d.tipo } }));
    return { inviati: r.inviati || 0, errori: r.errori || [], esclusi, simulata: EMULATORE };
  }
  throw new HttpsError('invalid-argument', 'Tipo di invio sconosciuto.');
}

exports.inviaEmail = onCall({ region: 'europe-west1', secrets: [GMAIL_APP_PASSWORD], timeoutSeconds: 120, memory: '512MiB' }, inviaDaApp);

// ─── Promemoria automatici (spenti finché un amministratore non li accende) ──
function dataTraGiorni(n) {
  const d = new Date(Date.now() + n * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

async function inviaPromemoriaRate() {
  const edifici = await db().collection('buildings').listDocuments();
  let n = 0;
  for (const e of edifici) {
    const imp = (await e.collection('impostazioni').doc('email').get()).data() || {};
    if (imp.promemoriaAuto !== true) continue;
    const giorni = Math.min(15, Math.max(1, parseInt(imp.giorniPreavviso, 10) || 3));
    const giorno = dataTraGiorni(giorni);
    const rate = (await e.collection('payments').where('data', '==', giorno).get()).docs
      .map((d) => ({ id: d.id, ...d.data() })).filter((r) => !r._deleted && r.previsionale === true);
    if (!rate.length) continue;
    const mappa = await condomini(e.id);
    const edificio = await nomeEdificio(e.id);
    for (const r of rate) {
      const c = mappa.get(String(r.condominoId));
      if (motivoEsclusione(c)) continue;
      const oggetto = `Promemoria rata del ${dataIt(r.data)}: ${euro(r.importo)}`;
      const esito = await inviaSingole(e.id, `auto_rata_${r.id}_${r.data}`, {
        oggetto, info: { tipo: 'promemoria-auto', recordId: r.id }, orario: false,
        messaggi: [{ id: String(r.condominoId), nome: c.nome || '', email: String(c.email).trim(), oggetto,
          html: pagina(edificio, 'Promemoria rata', `<p style="font-size:15px;line-height:1.55;margin:0 0 10px">Ciao ${escHtml(c.nome || '')}, ti ricordiamo la rata di <strong>${escHtml(euro(r.importo))}</strong> prevista per il <strong>${escHtml(dataIt(r.data))}</strong>.</p>`
            + (r.descrizione ? `<p style="font-size:14px;color:#636363;margin:0 0 10px">${escHtml(r.descrizione)}</p>` : '')
            + '<p style="font-size:14px;color:#636363;margin:0">Se l\'hai già versata, non serve fare nulla: l\'amministratore la registrerà.</p>'),
          testo: `${edificio}\n\nCiao ${c.nome || ''}, ti ricordiamo la rata di ${euro(r.importo)} prevista per il ${dataIt(r.data)}.\nSe l'hai già versata, non serve fare nulla.\n\n${SITO}` }],
      });
      if (!esito.saltata && !esito.bloccata) n++;
    }
  }
  return n;
}

exports.promemoriaRate = onSchedule({ schedule: '0 8 * * *', timeZone: 'Europe/Rome', region: 'europe-west1', secrets: [GMAIL_APP_PASSWORD] }, async () => {
  await inviaPromemoriaRate();
});

// Per gli avvisi al Super Admin (controllo.js).
exports.posta = { GMAIL_APP_PASSWORD, EMULATORE, spedisci, pagina, escHtml, unaRiga, emailValida, dataTraGiorni };

exports._test = { inviaPromemoriaRate, inviaDaApp, motivoEsclusione, dataTraGiorni, contenuto, unaRiga };
