// ═══════════════════════════════════════════════════════════════
// Il mio profilo (2026-10-19): ogni condomino legge e corregge da solo i
// propri dati personali, senza passare dall'amministratore.
//  • Li modifica lui: nickname, cellulare, se riceve email e WhatsApp. Sono dati
//    suoi e la scelta sulle comunicazioni spetta a lui.
//  • Restano all'amministratore: nome e cognome (ADV-FUNC-037: compaiono in
//    bilanci, rendiconti e CSV e identificano la persona nei documenti contabili),
//    appartamento, date di ingresso e uscita, condominio, ruolo, millesimi e quote. Decidono cosa paga e cosa può fare
//    nell'app, quindi non li cambia chi ne trae vantaggio.
//  • Email: è anche l'email di accesso. Il cambio lo fa Firebase con un link
//    di conferma al nuovo indirizzo (verifyBeforeUpdateEmail, lato app); qui si
//    registra solo la richiesta in richiesteEmail/{uid} (mai accessibile
//    dall'app: le regole negano tutto ciò che non è elencato). Al primo accesso
//    con il nuovo indirizzo confermato whoami aggiorna i contatti
//    (allineaEmail): un indirizzo mai confermato non arriva mai ai contatti.
// Scrive con l'Admin SDK (le regole lasciano scrivere i condomini solo
// all'amministratore), firmando _updatedBy con l'uid del condomino: auditTrail
// registra la modifica a suo nome.
// ═══════════════════════════════════════════════════════════════
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { membroAttivo } = require('./permessi');
const { REGIONI_CALLABLE } = require('./regioni');
const { posta: { emailValida } } = require('./notifiche');

const db = () => getFirestore();

// Testo di una riga: senza caratteri di controllo né spazi ai lati.
const riga = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();

// Valida le modifiche richieste; restituisce solo i campi presenti.
function modificheValide(m) {
  const no = (msg) => { throw new HttpsError('invalid-argument', msg); };
  if (!m || typeof m !== 'object' || Array.isArray(m)) no('Richiesta non valida.');
  const out = {};
  // Il nome anagrafico lo cambia solo l'amministratore (ADV-FUNC-037). Le pagine vecchie
  // rimaste in cache lo mandano sempre: uguale a quello salvato si ignora, diverso si
  // rifiuta in modo esplicito (controllo nella transazione di mioProfilo).
  if ('nome' in m) out.nome = riga(m.nome);
  if ('username' in m) {
    out.username = riga(m.username);
    if (out.username.length > 40) no('Il nickname può avere al massimo 40 caratteri.');
  }
  if ('telefono' in m) {
    out.telefono = riga(m.telefono);
    if (out.telefono.length > 40 || !/^[0-9 +()./-]*$/.test(out.telefono)) no('Il cellulare può contenere solo cifre, spazi e il prefisso (es. +39).');
    if (out.telefono && out.telefono.replace(/\D/g, '').length < 6) no('Il cellulare sembra incompleto.');
  }
  for (const k of ['emailNotifiche', 'whatsappNotifiche']) {
    if (k in m) { if (typeof m[k] !== 'boolean') no('Valore non valido per ' + k + '.'); out[k] = m[k]; }
  }
  if ('nuovaEmail' in m) {
    out.nuovaEmail = riga(m.nuovaEmail).toLowerCase();
    if (out.nuovaEmail.length > 200 || !emailValida(out.nuovaEmail)) no('L\'email non sembra valida.');
  }
  return out;
}

// Il profilo di condomino di chi chiama: quello collegato al suo account, nel
// condominio dei suoi permessi (claim buildingId), attivo e non cancellato.
async function mioRecord(request) {
  const t = request.auth?.token || {};
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login richiesto.');
  if (t.role === 'superAdmin') throw new HttpsError('failed-precondition', 'Il Super Admin non ha una scheda da condomino.');
  if (!t.buildingId) throw new HttpsError('failed-precondition', 'Account non ancora configurato: esci e rientra.');
  const snap = await db().collection(`buildings/${t.buildingId}/members`).where('uid', '==', request.auth.uid).get();
  const doc = snap.docs.find((d) => membroAttivo(d.data()));
  if (!doc) throw new HttpsError('not-found', 'Scheda da condomino non trovata. Contatta l\'amministratore.');
  return doc;
}

// Ciò che il condomino vede di sé (anche quello che non può cambiare).
function vista(m, c, emailAccesso, inAttesa) {
  return {
    id: m.id, nome: m.nome || '', username: m.username || '', appartamento: m.appartamento || '',
    dataIngresso: m.dataIngresso || '', emailNotifiche: m.emailNotifiche !== false, whatsappNotifiche: m.whatsappNotifiche !== false,
    telefono: c?.telefono || '', email: c?.email || '', emailAccesso, emailInAttesa: inAttesa || null,
  };
}

// Documento contatti esistente e non cancellato.
const vivo = (c) => c.exists && !c.data()._deleted;
// Contatti da (ri)scrivere da zero: un documento cancellato logicamente
// (es. dopo un subentro) può avere ancora la vecchia email o il vecchio
// telefono, che non devono tornare visibili. Si conserva solo chi l'ha creato.
function contattoNuovo(c, rec, uid, campi) {
  const prima = c.exists ? c.data() : {};
  return { id: rec.id, edificioId: rec.edificioId, ...campi, _deleted: false,
    _createdBy: prima._createdBy || uid, _createdAt: prima._createdAt || FieldValue.serverTimestamp(),
    _updatedBy: uid, _updatedAt: FieldValue.serverTimestamp() };
}

exports.mioProfilo = onCall({ region: REGIONI_CALLABLE }, async (request) => {
  const uid = request.auth?.uid;
  const ref = (await mioRecord(request)).ref;
  const contattiRef = ref.parent.parent.collection('contatti').doc(ref.id);
  const richiestaRef = db().collection('richiesteEmail').doc(uid);
  const mod = modificheValide(request.data?.modifiche || {});
  const emailAccesso = String(request.auth.token.email || '').toLowerCase();
  // Versione di un documento (ADV-FUNC-040): millisecondi dell'ultima modifica e chi l'ha fatta.
  const versione = (d) => d.exists ? { ms: d.data()._updatedAt?.toMillis?.() ?? null, by: d.data()._updatedBy || null, cancellato: d.data()._deleted === true } : null;
  let prima = null;

  await db().runTransaction(async (tx) => {
    const [m, c] = await Promise.all([tx.get(ref), tx.get(contattiRef)]);
    prima = { members: versione(m), contatti: versione(c) };   // com'erano prima di questa scrittura
    const rec = m.data();
    if ('nome' in mod && mod.nome !== riga(rec.nome)) {
      throw new HttpsError('invalid-argument', "Il nome e cognome li modifica solo l'amministratore del condominio.");
    }
    const firma = { _updatedBy: uid, _updatedAt: FieldValue.serverTimestamp() };
    const delMembro = {};
    for (const k of ['username', 'emailNotifiche', 'whatsappNotifiche']) {
      if (!(k in mod)) continue;
      const vuoto = k === 'username' && !mod[k];
      if (vuoto ? rec[k] != null : rec[k] !== mod[k]) delMembro[k] = vuoto ? FieldValue.delete() : mod[k];
    }
    if (Object.keys(delMembro).length) tx.update(ref, { ...delMembro, ...firma });
    if ('telefono' in mod) {
      const prima = c.exists && !c.data()._deleted ? (c.data().telefono || '') : '';
      if (prima !== mod.telefono) {
        if (vivo(c)) tx.set(contattiRef, { telefono: mod.telefono || FieldValue.delete(), ...firma }, { merge: true });
        else if (mod.telefono) tx.set(contattiRef, contattoNuovo(c, rec, uid, { telefono: mod.telefono }));
      }
    }
    if ('nuovaEmail' in mod) {
      if (mod.nuovaEmail === emailAccesso) tx.delete(richiestaRef);
      // emailPrecedente: l'email con cui chiede il cambio. Serve a whoami per distinguere chi
      // entra ancora con quella (richiesta in attesa) da chi ha confermato un'altra richiesta.
      // emailContattiAllaRichiesta: l'email dei contatti in questo momento. Se più tardi è diversa,
      // l'ha cambiata l'amministratore e la sua correzione prevale (allineaEmail, ADV-FUNC-039).
      else tx.set(richiestaRef, { email: mod.nuovaEmail, emailPrecedente: emailAccesso, emailContattiAllaRichiesta: vivo(c) ? String(c.data().email || '').toLowerCase() : '', buildingId: ref.parent.parent.id, memberId: ref.id, at: FieldValue.serverTimestamp() });
    }
  });

  const [m, c, r] = await Promise.all([ref.get(), contattiRef.get(), richiestaRef.get()]);
  // Versioni dopo (e prima della) scrittura: il client adotta la nuova solo se l'ultima modifica è
  // sua e il documento non era già cambiato rispetto a ciò che conosceva, così un cambio concorrente
  // di un altro amministratore resta segnalato al salvataggio successivo.
  return {
    profilo: vista(m.data(), c.exists && !c.data()._deleted ? c.data() : null, emailAccesso, r.exists ? r.data().email : null),
    versioni: { members: versione(m), contatti: versione(c) },
    versioniPrima: prima,
  };
});

// Chiamata da whoami a ogni accesso, con il profilo (members) già trovato per
// uid. Se il condomino aveva chiesto di cambiare email e ora entra con un
// indirizzo di accesso confermato da Firebase, l'email dei contatti diventa
// quella (anche se non è l'ultima richiesta: X poi Y con il link di X aperto,
// ADV-FUNC-038). Non scrive se:
//  • non c'è nessuna richiesta in sospeso (es. email di contatto scelta dall'amministratore);
//  • entra ancora con la vecchia email (la richiesta resta in attesa);
//  • l'amministratore ha cambiato l'EMAIL dei contatti dopo la richiesta (la richiesta si
//    cancella senza toccarli, ADV-FUNC-039; si riconosce dal campo email, non dalla data:
//    telefono o altri campi cambiati da chiunque non contano);
//  • richiesta senza i campi nuovi (precedente alle ultime modifiche): si scrive solo se l'email
//    di accesso è quella richiesta, altrimenti non si tocca nulla (ADV-FUNC-038, CR-03);
//  • la richiesta riguarda un'altra scheda o un altro condominio (spostamento: si cancella).
// Restituisce true se ha aggiornato i contatti.
async function allineaEmail(uid, token, memberRef) {
  const email = String(token.email || '').toLowerCase();
  if (!email || token.email_verified !== true) return false;
  const richiestaRef = db().collection('richiesteEmail').doc(uid);
  const contattiRef = memberRef.parent.parent.collection('contatti').doc(memberRef.id);
  // Tutto in una transazione: se la richiesta cambia mentre si decide (es. ne viene creata una
  // nuova nello stesso istante) si rilegge e non si cancella mai una richiesta diversa da quella valutata.
  return db().runTransaction(async (tx) => {
    const [r, mDoc, c] = await Promise.all([tx.get(richiestaRef), tx.get(memberRef), tx.get(contattiRef)]);
    if (!r.exists) return false;
    const rich = r.data();
    if (rich.memberId !== memberRef.id || rich.buildingId !== memberRef.parent.parent.id) {
      tx.delete(richiestaRef);   // spostamento di scheda o condominio: la richiesta non vale più
      return false;
    }
    // Richiesta con emailPrecedente: entra ancora con l'email di prima = il cambio non è avvenuto,
    // la richiesta resta in attesa.
    if (rich.emailPrecedente) {
      if (email !== rich.email && email === rich.emailPrecedente) return false;
    } else if (email !== rich.email) {
      // Richiesta vecchia (senza i campi nuovi): non si sa cosa sia successo, si scrive nei contatti
      // solo se l'email di accesso è proprio quella richiesta; altrimenti non si tocca nulla.
      return false;
    }
    const rec = mDoc.data() || {};
    const attuale = vivo(c) ? String(c.data().email || '').toLowerCase() : '';
    // Contatti già con l'email di accesso: nulla da allineare, la richiesta resta com'è.
    if (email !== rich.email && attuale === email) return false;
    // L'amministratore ha cambiato l'email dei contatti dopo la richiesta: la sua correzione prevale.
    if (typeof rich.emailContattiAllaRichiesta === 'string' && attuale !== rich.emailContattiAllaRichiesta) {
      tx.delete(richiestaRef);
      return false;
    }
    const firma = { _updatedBy: uid, _updatedAt: FieldValue.serverTimestamp() };
    if (vivo(c)) tx.set(contattiRef, { email, emailLower: email, ...firma }, { merge: true });
    else tx.set(contattiRef, contattoNuovo(c, rec, uid, { email, emailLower: email }));
    tx.delete(richiestaRef);
    return true;
  });
}

exports.allineaEmail = allineaEmail;
exports._test = { modificheValide };
