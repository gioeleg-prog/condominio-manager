// ═══════════════════════════════════════════════════════════════
// Il mio profilo (2026-10-19): ogni condomino legge e corregge da solo i
// propri dati personali, senza passare dall'amministratore.
//  • Li modifica lui: nome e cognome, nickname, cellulare, se riceve email e
//    WhatsApp. Sono dati suoi e la scelta sulle comunicazioni spetta a lui.
//  • Restano all'amministratore: appartamento, date di ingresso e uscita,
//    condominio, ruolo, millesimi e quote. Decidono cosa paga e cosa può fare
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
const { posta: { emailValida } } = require('./notifiche');

const db = () => getFirestore();

// Testo di una riga: senza caratteri di controllo né spazi ai lati.
const riga = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();

// Valida le modifiche richieste; restituisce solo i campi presenti.
function modificheValide(m) {
  const no = (msg) => { throw new HttpsError('invalid-argument', msg); };
  if (!m || typeof m !== 'object' || Array.isArray(m)) no('Richiesta non valida.');
  const out = {};
  if ('nome' in m) {
    out.nome = riga(m.nome);
    if (out.nome.length < 2 || out.nome.length > 100) no('Scrivi nome e cognome (da 2 a 100 caratteri).');
  }
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
    telefono: c?.telefono || '', email: c?.email || emailAccesso, emailAccesso, emailInAttesa: inAttesa || null,
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

exports.mioProfilo = onCall({ region: 'europe-west1' }, async (request) => {
  const uid = request.auth?.uid;
  const ref = (await mioRecord(request)).ref;
  const contattiRef = ref.parent.parent.collection('contatti').doc(ref.id);
  const richiestaRef = db().collection('richiesteEmail').doc(uid);
  const mod = modificheValide(request.data?.modifiche || {});
  const emailAccesso = String(request.auth.token.email || '').toLowerCase();

  await db().runTransaction(async (tx) => {
    const [m, c] = await Promise.all([tx.get(ref), tx.get(contattiRef)]);
    const rec = m.data();
    const firma = { _updatedBy: uid, _updatedAt: FieldValue.serverTimestamp() };
    const delMembro = {};
    for (const k of ['nome', 'username', 'emailNotifiche', 'whatsappNotifiche']) {
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
      else tx.set(richiestaRef, { email: mod.nuovaEmail, buildingId: ref.parent.parent.id, memberId: ref.id, at: FieldValue.serverTimestamp() });
    }
  });

  const [m, c, r] = await Promise.all([ref.get(), contattiRef.get(), richiestaRef.get()]);
  return { profilo: vista(m.data(), c.exists && !c.data()._deleted ? c.data() : null, emailAccesso, r.exists ? r.data().email : null) };
});

// Chiamata da whoami a ogni accesso, con il profilo (members) già trovato per
// uid. Se il condomino aveva chiesto di cambiare email e ora entra con quel
// nuovo indirizzo, confermato da Firebase, l'email dei contatti diventa
// quella. Restituisce true se l'ha aggiornata.
async function allineaEmail(uid, token, memberRef) {
  const email = String(token.email || '').toLowerCase();
  if (!email || token.email_verified !== true) return false;
  const richiestaRef = db().collection('richiesteEmail').doc(uid);
  const r = await richiestaRef.get();
  if (!r.exists || r.data().email !== email || r.data().memberId !== memberRef.id
      || r.data().buildingId !== memberRef.parent.parent.id) return false;
  const contattiRef = memberRef.parent.parent.collection('contatti').doc(memberRef.id);
  const rec = (await memberRef.get()).data() || {};
  const c = await contattiRef.get();
  const firma = { _updatedBy: uid, _updatedAt: FieldValue.serverTimestamp() };
  const batch = db().batch();
  if (vivo(c)) batch.set(contattiRef, { email, emailLower: email, ...firma }, { merge: true });
  else batch.set(contattiRef, contattoNuovo(c, rec, uid, { email, emailLower: email }));
  batch.delete(richiestaRef);
  await batch.commit();
  return true;
}

exports.allineaEmail = allineaEmail;
exports._test = { modificheValide };
