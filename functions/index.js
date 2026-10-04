const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();
const auth = getAuth();

// ═══════════════════════════════════════════════════════════════
// Modello dati (REB-01, fase 2 QA): un documento per record sotto
// buildings/{buildingId}/{members|expenses|payments|suppliers|notices|
// minutes|works|resolutions}/{id}. Le firestore.rules applicano ruolo,
// edificio e forma a ogni scrittura del client, quindi le vecchie
// funzioni ponte sul blob condiviso (getBuildingData/saveBuildingData)
// non servono più e sono state rimosse. Il blob appdata/cm_* resta in
// sola lettura come copia di sicurezza della migrazione.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// setUserRole
// Unico punto autorizzato ad assegnare superAdmin / adminEdificio /
// editor / member. Il chiamante deve già avere il claim role=='superAdmin'.
// ═══════════════════════════════════════════════════════════════
exports.setUserRole = onCall(async (request) => {
  const callerRole = request.auth?.token?.role;
  if (callerRole !== 'superAdmin') {
    throw new HttpsError('permission-denied', 'Solo un superAdmin può assegnare ruoli.');
  }

  const { targetUid, role, buildingId } = request.data || {};
  // 'editor': come 'member' ma può scrivere spese/entrate/fornitori del
  // proprio edificio — mappa canEdit:true && !isAdmin.
  const validRoles = ['superAdmin', 'adminEdificio', 'editor', 'member'];
  if (!targetUid || !validRoles.includes(role)) {
    throw new HttpsError('invalid-argument', 'targetUid e role (validi) sono obbligatori.');
  }
  if (role !== 'superAdmin' && !buildingId) {
    throw new HttpsError('invalid-argument', 'buildingId obbligatorio per adminEdificio/editor/member.');
  }
  if (role !== 'superAdmin') {
    const b = await db.collection('buildings').doc(String(buildingId)).get();
    if (!b.exists || b.data()._deleted) {
      throw new HttpsError('invalid-argument', `Edificio ${buildingId} inesistente.`);
    }
  }

  const claims = role === 'superAdmin' ? { role } : { role, buildingId: String(buildingId) };
  await auth.setCustomUserClaims(targetUid, claims);

  await db.collection('roles').doc(targetUid).set({
    role,
    buildingId: role === 'superAdmin' ? null : String(buildingId),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: request.auth.uid,
  }, { merge: true });

  await db.collection('auditEvents').add({
    type: 'role.assigned',
    targetUid,
    role,
    buildingId: role === 'superAdmin' ? null : String(buildingId),
    actorUid: request.auth.uid,
    at: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

// ═══════════════════════════════════════════════════════════════
// whoami
// Al login cerca lato server il profilo del chiamante tra i condomini di
// tutti gli edifici (collection group "members") e restituisce SOLO il suo
// record: il client non legge mai i condomini degli altri edifici.
// Collega l'uid al profilo al primo accesso, provisiona il ruolo se assente
// e registra l'accesso. Il superAdmin è determinato SOLO da cm_config
// (superAdminUid/superAdminEmail, scrivibile solo dal superAdmin) o da un
// claim role già presente — mai dal flag superAdmin di un record, che un
// adminEdificio potrebbe impostare.
// ═══════════════════════════════════════════════════════════════
exports.whoami = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login richiesto.');
  const uid = request.auth.uid;
  const email = (request.auth.token.email || '').toLowerCase();
  if (!email) throw new HttpsError('failed-precondition', 'Account senza email associata.');

  const cfg = (await db.collection('appdata').doc('cm_config').get()).data() || {};
  const isSuperAdmin = request.auth.token.role === 'superAdmin'
    || (cfg.superAdminUid && cfg.superAdminUid === uid)
    || (cfg.superAdminEmail && cfg.superAdminEmail.toLowerCase() === email);

  if (isSuperAdmin) {
    if (!request.auth.token.role) {
      // Primo login del superAdmin di config senza claim ancora assegnato.
      await auth.setCustomUserClaims(uid, { role: 'superAdmin' });
      await db.collection('roles').doc(uid).set({
        role: 'superAdmin', buildingId: null,
        updatedAt: FieldValue.serverTimestamp(), updatedBy: 'whoami-auto',
      }, { merge: true });
    }
    const profile = { id: 0, uid, email, nome: 'Super Admin', appartamento: 'Admin',
      superAdmin: true, isAdmin: true, canEdit: true, color: '#1B2A4A' };
    await recordLogin(profile);
    return { profile, isSuperAdmin: true };
  }

  // Non-superAdmin: cerca per uid, poi per email (emailLower, scritto dal
  // client e dalla migrazione). Rifiuta 2+ corrispondenze di email: un
  // condomino presente in due edifici con la stessa email darebbe un match
  // ambiguo.
  const members = db.collectionGroup('members');
  const alive = (snap) => snap.docs.filter((d) => !d.data()._deleted);
  let docs = alive(await members.where('uid', '==', uid).get());
  if (!docs.length) {
    docs = alive(await members.where('emailLower', '==', email).get());
    if (docs.length > 1) {
      throw new HttpsError('failed-precondition', 'Più profili con questa email. Contatta l\'amministratore.');
    }
  }
  if (!docs.length) {
    throw new HttpsError('not-found', 'Nessun condomino associato a questa email. Contatta l\'amministratore.');
  }

  const ref = docs[0].ref;
  const record = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (data.uid && data.uid !== uid) {
      throw new HttpsError('already-exists', 'Questo profilo risulta già collegato a un altro account.');
    }
    if (!data.uid) tx.update(ref, { uid, _updatedAt: FieldValue.serverTimestamp(), _updatedBy: 'whoami-auto' });
    return { ...data, uid };
  });

  // Provisiona il ruolo se assente — mai superAdmin (vedi sopra).
  const existingUser = await auth.getUser(uid).catch(() => null);
  if (!existingUser?.customClaims?.role && record.edificioId != null) {
    const role = record.isAdmin ? 'adminEdificio' : (record.canEdit ? 'editor' : 'member');
    await auth.setCustomUserClaims(uid, { role, buildingId: String(record.edificioId) });
    await db.collection('roles').doc(uid).set({
      role, buildingId: String(record.edificioId),
      updatedAt: FieldValue.serverTimestamp(), updatedBy: 'whoami-auto',
    }, { merge: true });
  }

  // Il record del chiamante, senza metadati né flag superAdmin (non autorevole qui).
  const profile = Object.fromEntries(Object.entries(record)
    .filter(([k]) => !k.startsWith('_') && k !== 'superAdmin'));
  if (!profile.disabled) await recordLogin(profile);
  return { profile, isSuperAdmin: false };
});

// Registro accessi (cm_login_stats), aggregato per utente e mese. Lo scrive
// solo whoami e lo legge solo il superAdmin (unico a mostrarlo). Orari in
// ora italiana, come li registrava il browser.
async function recordLogin(profile) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const giorno = `${parts.year}-${parts.month}-${parts.day}`;
  const mese = giorno.slice(0, 7);
  const ref = db.collection('appdata').doc('cm_login_stats');
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let stats = {};
      try { stats = JSON.parse(snap.data()?.value || '{}') || {}; } catch { stats = {}; }
      const key = String(profile.id);
      const prev = stats[key] || { totale: 0, mensile: {} };
      stats[key] = {
        nome: profile.nome,
        superAdmin: !!profile.superAdmin,
        ultimoLogin: `${giorno} ${parts.hour}:${parts.minute}`,
        totale: (prev.totale || 0) + 1,
        mensile: { ...(prev.mensile || {}), [mese]: ((prev.mensile || {})[mese] || 0) + 1 },
      };
      tx.set(ref, { value: JSON.stringify(stats) });
    });
  } catch (e) {
    // Il registro è informativo: un suo errore non deve impedire l'accesso.
    console.error('recordLogin', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// auditTrail
// Registra in auditEvents ogni creazione, modifica, cancellazione (logica)
// e ripristino dei record di un edificio, con autore (_updatedBy/_deletedBy,
// che le rules obbligano a coincidere con chi scrive) e valori prima/dopo dei
// campi cambiati. Serve a ricostruire chi ha modificato una spesa in caso di
// contestazione. Le scritture della migrazione (autore 'backfill') non
// generano eventi.
// ═══════════════════════════════════════════════════════════════
const MAX_VALUE_LEN = 500;

exports.auditTrail = onDocumentWritten('buildings/{buildingId}/{coll}/{docId}', async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  const actor = after?._deletedBy && after?._deleted ? after._deletedBy : (after?._updatedBy ?? null);
  if (actor === 'backfill' || actor === 'whoami-auto') return;

  let type;
  if (!before) type = 'created';
  else if (!after) type = 'purged';
  else if (after._deleted && !before._deleted) type = 'deleted';
  else if (!after._deleted && before._deleted) type = 'restored';
  else type = 'updated';

  const changes = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    if (k.startsWith('_')) continue;
    const a = stableStringify(before?.[k]);
    const b = stableStringify(after?.[k]);
    if (a !== b) changes[k] = { from: clip(before?.[k]), to: clip(after?.[k]) };
  }
  if (type === 'updated' && !Object.keys(changes).length) return;

  await db.collection('auditEvents').add({
    type: `record.${type}`,
    buildingId: event.params.buildingId,
    collection: event.params.coll,
    recordId: event.params.docId,
    // Etichetta leggibile: le delibere usano descrizioneSintetica invece di titolo.
    titolo: clip(labelOf(after) ?? labelOf(before)),
    actorUid: actor,
    changes: type === 'updated' || type === 'restored' ? changes : {},
    at: FieldValue.serverTimestamp(),
  });
});

function labelOf(r) {
  return r ? (r.titolo ?? r.nome ?? r.descrizioneSintetica ?? null) : null;
}

function clip(v) {
  if (v === undefined) return null;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s == null) return null;
  return s.length > MAX_VALUE_LEN ? s.slice(0, MAX_VALUE_LEN) + '…' : (typeof v === 'string' ? v : JSON.parse(s));
}

// Serializzazione con chiavi ordinate, per confrontare due versioni di un campo.
function stableStringify(v) {
  if (v && typeof v.toDate === 'function') return JSON.stringify(v.toDate().toISOString());
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}
