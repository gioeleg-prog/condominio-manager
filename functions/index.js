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
  // 'editor' (REB-01 P1): come 'member' ma può scrivere spese/entrate/
  // fornitori del proprio edificio — mappa canEdit:true && !isAdmin.
  const validRoles = ['superAdmin', 'adminEdificio', 'editor', 'member'];
  if (!targetUid || !validRoles.includes(role)) {
    throw new HttpsError('invalid-argument', 'targetUid e role (validi) sono obbligatori.');
  }
  if (role !== 'superAdmin' && !buildingId) {
    throw new HttpsError('invalid-argument', 'buildingId obbligatorio per adminEdificio/editor/member.');
  }
  if (role !== 'superAdmin') {
    const snap = await db.collection('appdata').doc('cm_edifici').get();
    let edifici = [];
    try { edifici = JSON.parse(snap.data()?.value || '[]'); } catch { edifici = []; }
    if (!edifici.some((e) => String(e.id) === String(buildingId))) {
      throw new HttpsError('invalid-argument', `Edificio ${buildingId} inesistente.`);
    }
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

  const keys = ['cm_spese', 'cm_entrate', 'cm_condomini', 'cm_fornitori', 'cm_edifici', 'cm_bacheca', 'cm_verbali', 'cm_lavori', 'cm_delibere'];
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
      // edificioId nei dati è numerico, buildingId nel custom claim è
      // sempre una stringa (Firebase custom claims sono JSON, va bene
      // qualunque tipo, ma setUserRole/linkMyUid lo scrivono come stringa
      // per coerenza) — confronto tollerante al tipo, altrimenti === non
      // matcha mai e il filtro esclude tutto, non solo gli altri edifici.
      result[key] = arr.filter((rec) => !rec.edificioId || String(rec.edificioId) === String(callerBuildingId));
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
//
// Bug scoperto testando in PRODUZIONE (non riproducibile su staging,
// dove esisteva un solo utente di test già superAdmin): i condomini
// reali esistenti non hanno mai avuto un custom claim di ruolo — solo
// il superAdmin, seedato manualmente. getBuildingData rifiuta chiunque
// non abbia claim (SEC-03), quindi ogni condomino normale restava
// bloccato al primo caricamento dati. Questa function ora provisiona
// anche il ruolo (letto dai flag legacy canEdit/isAdmin/superAdmin già
// sul record), così il problema non si ripresenta per i prossimi primi
// accessi. Se il claim è già presente non viene toccato.
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

  const record = arr[idx];
  if (!record.uid) {
    arr[idx] = { ...record, uid };
    await ref.set({ value: JSON.stringify(arr) });
  }

  const existingUser = await auth.getUser(uid).catch(() => null);
  if (!existingUser?.customClaims?.role) {
    const role = record.superAdmin ? 'superAdmin'
      : (record.isAdmin ? 'adminEdificio' : (record.canEdit ? 'editor' : 'member'));
    const claims = role === 'superAdmin' ? { role } : { role, buildingId: String(record.edificioId || '') };
    await auth.setCustomUserClaims(uid, claims);
    await db.collection('roles').doc(uid).set({
      role,
      buildingId: claims.buildingId || null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'linkMyUid-auto',
    }, { merge: true });
  }

  return { ok: true };
});

// ═══════════════════════════════════════════════════════════════
// saveBuildingData
// P0 URGENTE (scoperto pianificando REB-01): da quando SEC-03 filtra
// cm_spese/cm_entrate/cm_fornitori/cm_condomini (e ora anche cm_bacheca/
// cm_verbali, stesso bridge in getBuildingData qui sotto) al proprio
// edificio per i non-superAdmin, il client continua a salvare con un
// overwrite COMPLETO del blob condiviso (fbSaveKey -> setDoc). Un
// adminEdificio o un condomino con canEdit:true che salva qualunque cosa
// scrive nel documento condiviso SOLO i record del proprio edificio,
// cancellando silenziosamente quelli di tutti gli altri edifici.
//
// Questa function sostituisce quella scrittura diretta per i non-
// superAdmin: legge il blob, sostituisce SOLO le righe del proprio
// edificio con quelle inviate dal client, lascia intatto il resto.
// Con Admin SDK, quindi può fare la fusione anche se le rules negano
// la scrittura diretta di queste chiavi a chi non è superAdmin.
// ═══════════════════════════════════════════════════════════════
const RESTRICTED_KEYS = ['cm_spese', 'cm_entrate', 'cm_fornitori', 'cm_condomini', 'cm_bacheca', 'cm_verbali', 'cm_lavori', 'cm_delibere'];

exports.saveBuildingData = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login richiesto.');

  const callerRole = request.auth.token.role;
  const callerBuildingId = request.auth.token.buildingId;
  if (!callerRole) {
    throw new HttpsError('permission-denied', 'Utente non provisionato (nessun ruolo assegnato).');
  }

  const { key, records } = request.data || {};
  if (!RESTRICTED_KEYS.includes(key)) {
    throw new HttpsError('invalid-argument', 'Chiave non valida.');
  }
  if (!Array.isArray(records)) {
    throw new HttpsError('invalid-argument', 'records deve essere un array.');
  }

  // cm_condomini (gestione utenti/ruoli), cm_bacheca (comunicazioni),
  // cm_verbali (atti ufficiali di assemblea), cm_lavori (checklist lavori)
  // e cm_delibere (registro decisioni) restano riservati ad adminEdificio/
  // superAdmin — su richiesta esplicita: per tutte le sezioni introdotte
  // dopo Spese/Entrate/Fornitori, 'editor' resta sola lettura come
  // 'member', a differenza dei dati finanziari storici che si aprono
  // anche a 'editor'. Un semplice 'member' (sola lettura in UI) non può
  // scrivere nessuna di queste — altrimenti basterebbe chiamare questa
  // function da console per bypassare un limite che l'interfaccia si
  // limita a nascondere.
  if (callerRole !== 'superAdmin') {
    const adminOnlyKeys = ['cm_condomini', 'cm_bacheca', 'cm_verbali', 'cm_lavori', 'cm_delibere'];
    const canWriteAdminOnly = callerRole === 'adminEdificio';
    const canWriteFinance = callerRole === 'adminEdificio' || callerRole === 'editor';
    if (adminOnlyKeys.includes(key) && !canWriteAdminOnly) {
      throw new HttpsError('permission-denied', 'Il tuo ruolo non può modificare questi dati.');
    }
    if (!adminOnlyKeys.includes(key) && !canWriteFinance) {
      throw new HttpsError('permission-denied', 'Il tuo ruolo non può modificare questi dati.');
    }
  }

  const ref = db.collection('appdata').doc(key);
  const snap = await ref.get();
  let current = [];
  try { current = JSON.parse(snap.data()?.value || '[]'); } catch { current = []; }

  let merged;
  if (callerRole === 'superAdmin') {
    // Il superAdmin vede e gestisce tutti gli edifici: comportamento
    // invariato, sostituisce l'intero array come già fa oggi.
    merged = records;
  } else {
    const buildingIdStr = String(callerBuildingId || '');
    for (const rec of records) {
      if (rec && rec.edificioId != null && String(rec.edificioId) !== buildingIdStr) {
        throw new HttpsError('permission-denied',
          `Il record ${rec.id} non appartiene al tuo edificio.`);
      }
    }
    // Mantiene intatto tutto ciò che NON appartiene al proprio edificio
    // (altri edifici, e record senza edificioId come il superAdmin) —
    // sostituisce solo la propria fetta con quella inviata dal client.
    const others = current.filter((r) => String(r?.edificioId) !== buildingIdStr);
    merged = [...others, ...records];
  }

  await ref.set({ value: JSON.stringify(merged) });
  return { ok: true, count: merged.length };
});
