const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();
const auth = getAuth();

// ═══════════════════════════════════════════════════════════════
// setUserRole
// Unico punto autorizzato ad assegnare superAdmin / adminEdificio /
// member. Sostituisce la scrittura diretta di index.html riga ~5306
// (SEC-02 + SEC-05). Il chiamante deve già avere il claim
// role=='superAdmin'.
// ═══════════════════════════════════════════════════════════════
exports.setUserRole = onCall(async (request) => {
  const callerRole = request.auth?.token?.role;
  if (callerRole !== 'superAdmin') {
    throw new HttpsError('permission-denied', 'Solo un superAdmin può assegnare ruoli.');
  }

  const { targetUid, role, buildingId } = request.data || {};
  const validRoles = ['superAdmin', 'adminEdificio', 'member'];
  if (!targetUid || !validRoles.includes(role)) {
    throw new HttpsError('invalid-argument', 'targetUid e role (validi) sono obbligatori.');
  }
  if (role !== 'superAdmin' && !buildingId) {
    throw new HttpsError('invalid-argument', 'buildingId obbligatorio per adminEdificio/member.');
  }

  const claims = role === 'superAdmin' ? { role } : { role, buildingId };
  await auth.setCustomUserClaims(targetUid, claims);

  await db.collection('roles').doc(targetUid).set({
    role,
    buildingId: buildingId || null,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: request.auth.uid,
  }, { merge: true });

  await db.collection('auditEvents').add({
    type: 'role.assigned',
    targetUid,
    role,
    buildingId: buildingId || null,
    actorUid: request.auth.uid,
    at: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

// ═══════════════════════════════════════════════════════════════
// getBuildingData
// Ponte transitorio (SEC-03 interim): finché appdata resta un
// blob JSON unico per tutti gli edifici, questa function legge il
// blob LATO SERVER e restituisce al client solo i record del suo
// edificio. Da ritirare quando REB-01 è completa.
// ═══════════════════════════════════════════════════════════════
exports.getBuildingData = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login richiesto.');

  const callerRole = request.auth.token.role;
  const callerBuildingId = request.auth.token.buildingId;
  if (!callerRole) {
    throw new HttpsError('permission-denied', 'Utente non provisionato (nessun ruolo assegnato).');
  }

  const keys = ['cm_spese', 'cm_entrate', 'cm_condomini', 'cm_fornitori', 'cm_edifici'];
  const snaps = await Promise.all(
    keys.map((k) => db.collection('appdata').doc(k).get())
  );

  const result = {};
  snaps.forEach((snap, i) => {
    const key = keys[i];
    let arr = [];
    try { arr = JSON.parse(snap.data()?.value || '[]'); } catch { arr = []; }

    if (callerRole === 'superAdmin' || key === 'cm_edifici') {
      result[key] = arr;
    } else {
      result[key] = arr.filter((rec) => !rec.edificioId || rec.edificioId === callerBuildingId);
    }
  });

  return result;
});

// ═══════════════════════════════════════════════════════════════
// linkMyUid
// Bug scoperto testando SEC-05 su staging: le firestore.rules limitano
// la scrittura di appdata/cm_condomini a superAdmin/adminEdificio, ma
// il codice esistente (index.html, blocco onAuthStateChanged) collega
// l'uid Firebase al record condomino al primo login scrivendo
// direttamente su cm_condomini — cosa che un utente 'member' (nessun
// ruolo ancora assegnato) non può più fare. Questa function esegue lo
// stesso collegamento lato server con Admin SDK (bypassa le rules),
// ma SOLO sul record che corrisponde alla email dell'utente chiamante,
// e SOLO se quel record non è già collegato a un uid diverso.
// ═══════════════════════════════════════════════════════════════
exports.linkMyUid = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login richiesto.');

  const email = request.auth.token.email;
  if (!email) throw new HttpsError('failed-precondition', 'Account senza email associata.');

  const uid = request.auth.uid;
  const ref = db.collection('appdata').doc('cm_condomini');
  const snap = await ref.get();
  let arr = [];
  try { arr = JSON.parse(snap.data()?.value || '[]'); } catch { arr = []; }

  const idx = arr.findIndex((c) => c.email && c.email.toLowerCase() === email.toLowerCase());
  if (idx === -1) {
    throw new HttpsError('not-found', 'Nessun condomino associato a questa email. Contatta l\'amministratore.');
  }
  if (arr[idx].uid && arr[idx].uid !== uid) {
    throw new HttpsError('already-exists', 'Questo profilo risulta già collegato a un altro account.');
  }
  if (arr[idx].uid === uid) {
    return { ok: true, alreadyLinked: true };
  }

  arr[idx] = { ...arr[idx], uid };
  await ref.set({ value: JSON.stringify(arr) });

  return { ok: true };
});
