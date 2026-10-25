// ═══════════════════════════════════════════════════════════════
// Permessi dei condomini disattivati, usciti o declassati (audit 2026-10-15)
// I permessi stanno nei custom claims del token: cambiare il record del
// condomino non basta a toglierli. Qui il server li allinea al record, ma
// solo verso il BASSO: aumentare i permessi resta compito di setUserRole
// (superAdmin) e del primo accesso in whoami. Non tocca mai un superAdmin né
// chi ha i permessi di un altro edificio (es. condomino appena spostato).
// Dopo la modifica revoca i token di accesso: al rinnovo successivo
// (al massimo un'ora) l'utente perde i vecchi permessi.
// ═══════════════════════════════════════════════════════════════
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { posta: { dataTraGiorni, ingressoFuturo } } = require('./notifiche');

const auth = () => getAuth();
const db = () => getFirestore();

const LIVELLO = { member: 1, editor: 2, adminEdificio: 3 };

// Un condomino può accedere se non è cancellato, disattivato o uscito
// (data di uscita arrivata: stesso criterio di "archiviato" per le email) e se
// la data di ingresso è già arrivata (un subentro a data futura: chi entra non
// ha accesso prima di quel giorno; audit 2026-10-24, ADV-FUNC-010). Conta solo una
// data di ingresso AAAA-MM-GG valida: un testo in un altro formato vale "nessuna
// data" e non toglie accesso né permessi (DAT-001).
function membroAttivo(m, oggi = dataTraGiorni(0)) {
  return !!m && !m._deleted && !m.disabled && !(m.dataUscita && String(m.dataUscita) <= oggi)
    && !ingressoFuturo(m, oggi);
}

function ruoloDa(m) {
  return m.isAdmin ? 'adminEdificio' : (m.canEdit ? 'editor' : 'member');
}

// Porta i permessi di un utente dell'edificio buildingId a nuovoRuolo (null =
// nessuno), solo se oggi ne ha di più. Restituisce true se li ha cambiati.
async function riduciPermessi(uid, buildingId, nuovoRuolo, actor) {
  const user = await auth().getUser(uid).catch(() => null);
  const claims = user?.customClaims || {};
  if (!claims.role || claims.role === 'superAdmin') return false;
  if (String(claims.buildingId) !== String(buildingId)) return false;
  if (nuovoRuolo && (LIVELLO[nuovoRuolo] || 0) >= (LIVELLO[claims.role] || 0)) return false;

  const nuovi = nuovoRuolo ? { role: nuovoRuolo, buildingId: String(buildingId) } : null;
  await auth().setCustomUserClaims(uid, nuovi);
  await auth().revokeRefreshTokens(uid);
  await db().collection('roles').doc(uid).set({
    role: nuovoRuolo || null, buildingId: nuovoRuolo ? String(buildingId) : null,
    updatedAt: FieldValue.serverTimestamp(), updatedBy: actor,
  }, { merge: true });
  await db().collection('auditEvents').add({
    type: nuovoRuolo ? 'role.reduced' : 'role.revoked',
    targetUid: uid, role: nuovoRuolo || null, previousRole: claims.role,
    buildingId: String(buildingId), actorUid: actor, at: FieldValue.serverTimestamp(),
  });
  return true;
}

function togliPermessi(uid, buildingId, actor) {
  return riduciPermessi(uid, buildingId, null, actor);
}

// Ogni modifica di un condomino (disattivazione, subentro, cambio ruolo,
// cancellazione logica, uscita) allinea subito i permessi del suo account. Il
// trigger (auditTrail in index.js) parte dopo una scrittura che le rules
// hanno già consentito.
// Si guarda il record com'è ADESSO, non com'era nell'evento: gli eventi possono
// arrivare in ritardo o fuori ordine, e uno vecchio non deve togliere i
// permessi dati dopo. Le cancellazioni fisiche (solo superAdmin, da console o
// script: l'app cancella in modo logico) non toccano i permessi.
async function allineaPermessi(ref, before) {
  const snap = await ref.get();
  if (!snap.exists) return;
  const now = snap.data();
  const buildingId = ref.parent.parent.id;
  const actor = now._updatedBy || 'sistema'; // l'autore è chi ha firmato la scrittura (audit 2026-10-24)
  // Account scollegato dal record (solo il superAdmin può farlo): perde i permessi.
  if (before?.uid && before.uid !== now.uid) await togliPermessi(before.uid, buildingId, actor);
  if (!now.uid) return;
  if (!membroAttivo(now)) await togliPermessi(now.uid, buildingId, actor);
  else {
    // Un ruolo assegnato con setUserRole DOPO l'ultima scrittura del record
    // non si riduce: un trigger in ritardo leggerebbe il record ancora vecchio
    // e annullerebbe la promozione (audit 2026-10-24, ADV-TECH-005).
    const ruolo = await db().collection('roles').doc(now.uid).get().catch(() => null);
    const assegnato = ruolo?.exists ? ruolo.data().updatedAt : null;
    const scritto = now._updatedAt;
    if (assegnato?.toMillis && scritto?.toMillis && assegnato.toMillis() > scritto.toMillis()) return;
    await riduciPermessi(now.uid, buildingId, ruoloDa(now), actor);
  }
}

// Chi ha una data di uscita futura perde l'accesso quando arriva il giorno:
// nessuno scrive il record quel giorno, quindi ci pensa questo controllo notturno.
async function revocaUsciti(oggi = dataTraGiorni(0)) {
  const snap = await db().collectionGroup('members').get();
  let n = 0;
  for (const d of snap.docs) {
    const m = d.data();
    if (m.uid && !membroAttivo(m, oggi) && await togliPermessi(m.uid, d.ref.parent.parent.id, 'permessiUsciti')) n++;
  }
  return n;
}

exports.permessiUsciti = onSchedule({ schedule: '30 0 * * *', timeZone: 'Europe/Rome', region: 'europe-west1' }, async () => {
  await revocaUsciti();
});

exports.membroAttivo = membroAttivo;
exports.togliPermessi = togliPermessi;
exports.allineaPermessi = allineaPermessi;
exports._test = { allineaPermessi, revocaUsciti, riduciPermessi };
