// Privacy tra condomini (decisione del 2026-10-15): email e telefono dei
// condomini passano da buildings/{b}/members/{id} a buildings/{b}/contatti/{id},
// che le regole lasciano leggere solo ad amministratori ed editor. I condomini
// semplici continuano a leggere members (nomi, appartamenti, quote) ma non più
// i contatti degli altri.
//
// Due passi per ogni condomino che ha ancora email, emailLower o telefono nel
// suo record:
//  1. crea contatti/{id} se manca (o lo completa se è uguale), con autore
//     AUTORE: la Cloud Function auditTrail non ne fa una voce di registro;
//  2. solo dopo aver riletto contatti/{id} e trovato gli stessi valori, toglie
//     i campi dal record del condomino.
// Idempotente: rieseguita non cambia nulla. Se un contatti/{id} esiste già con
// un'email diversa da quella del record si ferma su quel condomino senza
// toccarlo e lo segnala (da sistemare a mano).
// Usata da scripts/separa-contatti.js e dal seed dei test (qa/seed.js).
const { FieldValue } = require('./firebase-admin');

const AUTORE = 'migrazione-contatti';
const CAMPI = ['email', 'emailLower', 'telefono'];

const testo = (v) => (v == null ? '' : String(v).trim());

// Contatti da spostare per un record di condomino (null = niente da fare).
function contattiDi(m) {
  if (!CAMPI.some((k) => k in m)) return null;
  const email = testo(m.email);
  const telefono = testo(m.telefono);
  return { email, emailLower: email ? email.toLowerCase() : null, telefono };
}

async function separaContatti(db, { dryRun = false, log = () => {} } = {}) {
  const esito = { condomini: 0, daSpostare: 0, creati: 0, giaPresenti: 0, ripuliti: 0, conflitti: [] };
  for (const edificio of await db.collection('buildings').listDocuments()) {
    const membri = await edificio.collection('members').get();
    for (const d of membri.docs) {
      esito.condomini++;
      const m = d.data();
      const c = contattiDi(m);
      if (!c) continue;
      esito.daSpostare++;
      const ref = edificio.collection('contatti').doc(d.id);
      const esistente = await ref.get();
      const prima = esistente.exists ? esistente.data() : null;
      if (prima && testo(prima.email).toLowerCase() !== c.email.toLowerCase() && c.email) {
        esito.conflitti.push(`${edificio.id}/${d.id}: contatti con «${prima.email}», condomino con «${c.email}»`);
        continue;
      }
      if (dryRun) { if (prima) esito.giaPresenti++; continue; }
      if (!c.email && !c.telefono) {
        // Campi vuoti: nessun contatto da copiare, si tolgono e basta.
      } else if (!prima) {
        await ref.create({
          id: m.id ?? d.id, edificioId: m.edificioId ?? edificio.id,
          email: c.email, emailLower: c.emailLower, ...(c.telefono ? { telefono: c.telefono } : {}),
          _createdAt: m._createdAt || FieldValue.serverTimestamp(), _createdBy: AUTORE,
          _updatedAt: FieldValue.serverTimestamp(), _updatedBy: AUTORE,
          _deleted: m._deleted === true, ...(m._deleted === true && m._deletedBy ? { _deletedBy: m._deletedBy } : {}),
        });
        esito.creati++;
      } else {
        esito.giaPresenti++;
        // Già presente con la stessa email: si completano solo i campi mancanti.
        const manca = {};
        if (!prima.email && c.email) Object.assign(manca, { email: c.email, emailLower: c.emailLower });
        if (!prima.telefono && c.telefono) manca.telefono = c.telefono;
        if (Object.keys(manca).length) await ref.update({ ...manca, _updatedAt: FieldValue.serverTimestamp(), _updatedBy: AUTORE });
      }
      // Verifica sul server prima di togliere i campi dal condomino.
      const dopo = (await ref.get()).data() || {};
      if (testo(dopo.email).toLowerCase() !== c.email.toLowerCase() || (c.telefono && testo(dopo.telefono) !== c.telefono)) {
        esito.conflitti.push(`${edificio.id}/${d.id}: contatti non coincidono dopo la copia, condomino non toccato`);
        continue;
      }
      await d.ref.update({ ...Object.fromEntries(CAMPI.map((k) => [k, FieldValue.delete()])),
        _updatedAt: FieldValue.serverTimestamp(), _updatedBy: AUTORE });
      esito.ripuliti++;
    }
  }
  log(`Condomini: ${esito.condomini}; con contatti nel record: ${esito.daSpostare}; contatti creati: ${esito.creati}; già presenti: ${esito.giaPresenti}; record ripuliti: ${esito.ripuliti}.`);
  esito.conflitti.forEach((c) => log('CONFLITTO ' + c));
  return esito;
}

// Verifica: nessun record di condomino con contatti, e ogni condomino con
// un'email ha il suo contatti/{id}. Restituisce l'elenco dei problemi.
async function verificaContatti(db) {
  const problemi = [];
  for (const edificio of await db.collection('buildings').listDocuments()) {
    const [membri, contatti] = await Promise.all([edificio.collection('members').get(), edificio.collection('contatti').get()]);
    const ids = new Set(contatti.docs.map((d) => d.id));
    for (const d of membri.docs) {
      if (contattiDi(d.data())) problemi.push(`${edificio.id}/${d.id}: contatti ancora nel record del condomino`);
    }
    for (const c of contatti.docs) {
      if (!membri.docs.some((d) => d.id === c.id)) problemi.push(`${edificio.id}/${c.id}: contatti senza condomino`);
    }
    if (ids.size > membri.size) problemi.push(`${edificio.id}: più contatti che condomini`);
  }
  return problemi;
}

module.exports = { separaContatti, verificaContatti, AUTORE };
