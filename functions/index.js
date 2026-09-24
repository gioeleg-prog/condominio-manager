const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();
const auth = getAuth();

// ═══════════════════════════════════════════════════════════════
// APPDATA_RESTRICTED_CONFIG — unica fonte, in questo runtime, per le
// chiavi del blob appdata che passano da saveBuildingData/getBuildingData
// invece che da una scrittura/lettura diretta sul documento. writeRole:
// 'adminOnly' (solo adminEdificio/superAdmin) o 'finance' (anche editor).
// Deriva RESTRICTED_KEYS e ADMIN_ONLY_KEYS qui sotto, ed è la base del
// `keys` di getBuildingData (+ 'cm_edifici', sempre incluso e mai
// filtrato per edificio).
//
// index.html ha la propria copia equivalente (runtime separato, non
// importabile da qui) — aggiungere o togliere una chiave va fatto in
// entrambe. firestore.rules resta sincronizzata a mano: è un linguaggio
// dichiarativo che non può importare questo oggetto, quindi i suoi due
// elenchi (lettura e scrittura) vanno aggiornati a mano in coppia con
// questo file. Le chiavi a lettura diretta ristretta al superAdmin
// (cm_spese/cm_entrate/cm_fornitori/cm_delibere) sono una decisione
// presa SOLO in firestore.rules — non influenzano nessuna derivazione
// qui sotto, perché getBuildingData filtra per edificio allo stesso modo
// tutte le chiavi diverse da cm_edifici, ristrette o no.
// ═══════════════════════════════════════════════════════════════
const APPDATA_RESTRICTED_CONFIG = {
  cm_condomini: { writeRole: 'adminOnly' },
  cm_spese:     { writeRole: 'finance' },
  cm_entrate:   { writeRole: 'finance' },
  cm_fornitori: { writeRole: 'finance' },
  cm_bacheca:   { writeRole: 'adminOnly' },
  cm_verbali:   { writeRole: 'adminOnly' },
  cm_lavori:    { writeRole: 'adminOnly' },
  cm_delibere:  { writeRole: 'adminOnly' },
};
const RESTRICTED_KEYS = Object.keys(APPDATA_RESTRICTED_CONFIG);
const ADMIN_ONLY_KEYS = RESTRICTED_KEYS.filter((k) => APPDATA_RESTRICTED_CONFIG[k].writeRole === 'adminOnly');

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

  const keys = [...RESTRICTED_KEYS, 'cm_edifici'];
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
      // Audit 2026-09: i record senza edificioId non vengono più mostrati a
      // tutti gli edifici (in produzione non ne esistono, e saveBuildingData
      // ora li assegna sempre al proprio edificio).
      result[key] = arr.filter((rec) => rec && rec.edificioId != null && String(rec.edificioId) === String(callerBuildingId));
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
  // Transazione: cm_condomini è scritto anche da saveBuildingData (un admin
  // che modifica i condomini) — senza, un primo login concorrente poteva
  // annullare la modifica dell'admin, o viceversa perdere il collegamento uid.
  const record = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let arr = [];
    try { arr = JSON.parse(snap.data()?.value || '[]'); } catch { arr = []; }

    const idx = arr.findIndex((c) => c.email && c.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) {
      throw new HttpsError('not-found', 'Nessun condomino associato a questa email. Contatta l\'amministratore.');
    }
    if (arr[idx].uid && arr[idx].uid !== uid) {
      throw new HttpsError('already-exists', 'Questo profilo risulta già collegato a un altro account.');
    }

    const rec = arr[idx];
    if (!rec.uid) {
      arr[idx] = { ...rec, uid };
      tx.set(ref, { value: JSON.stringify(arr) });
    }
    return rec;
  });

  // Audit 2026-09: il ruolo superAdmin NON viene mai assegnato da qui.
  // Il flag superAdmin sul record è scrivibile da un adminEdificio tramite
  // saveBuildingData (ora filtrato, ma resta un dato del blob, non una
  // fonte autorevole): trasformarlo in claim permetteva a un adminEdificio
  // di creare un condomino superAdmin e prenderne l'account. Il superAdmin
  // si assegna solo con setUserRole (da un superAdmin) o con gli script
  // Admin SDK. Stesso motivo per i record senza edificio: niente claim.
  const existingUser = await auth.getUser(uid).catch(() => null);
  if (!existingUser?.customClaims?.role && !record.superAdmin && record.edificioId != null) {
    const role = record.isAdmin ? 'adminEdificio' : (record.canEdit ? 'editor' : 'member');
    const claims = { role, buildingId: String(record.edificioId) };
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
// whoami
// Audit 2026-09: prima il client, al login, leggeva TUTTO cm_condomini
// (nomi/email di ogni edificio) per cercarci dentro il proprio profilo —
// e le firestore.rules dovevano quindi lasciare quel documento leggibile
// a chiunque fosse autenticato. Questa function sposta la ricerca lato
// server (Admin SDK): restituisce SOLO il record del chiamante, così le
// rules possono chiudere la lettura diretta di cm_condomini al superAdmin.
//
// Fa anche ciò che faceva linkMyUid (collega l'uid, provisiona il ruolo se
// assente), così il login è una sola chiamata. Il superAdmin è determinato
// SOLO da cm_config (superAdminUid/superAdminEmail, scrivibile solo dal
// superAdmin) o da un claim role già presente — mai dal flag superAdmin
// di un record del blob (che un adminEdificio può impostare).
// ═══════════════════════════════════════════════════════════════
exports.whoami = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login richiesto.');
  const uid = request.auth.uid;
  const email = (request.auth.token.email || '').toLowerCase();
  if (!email) throw new HttpsError('failed-precondition', 'Account senza email associata.');

  const [condSnap, cfgSnap] = await Promise.all([
    db.collection('appdata').doc('cm_condomini').get(),
    db.collection('appdata').doc('cm_config').get(),
  ]);
  const cfg = cfgSnap.data() || {};
  const isSuperAdmin = request.auth.token.role === 'superAdmin'
    || (cfg.superAdminUid && cfg.superAdminUid === uid)
    || (cfg.superAdminEmail && cfg.superAdminEmail.toLowerCase() === email);

  // superAdmin: profilo sintetico, non deve esistere in cm_condomini.
  if (isSuperAdmin) {
    if (!request.auth.token.role) {
      // Primo login del superAdmin di config senza claim ancora assegnato.
      await auth.setCustomUserClaims(uid, { role: 'superAdmin' });
      await db.collection('roles').doc(uid).set({
        role: 'superAdmin', buildingId: null,
        updatedAt: FieldValue.serverTimestamp(), updatedBy: 'whoami-auto',
      }, { merge: true });
    }
    return { profile: { id: 0, uid, email, nome: 'Super Admin', appartamento: 'Admin',
      superAdmin: true, isAdmin: true, canEdit: true, color: '#1B2A4A' }, isSuperAdmin: true };
  }

  // Non-superAdmin: cerca per uid, poi per email. Rifiuta 2+ corrispondenze
  // di email (un condominio multi-edificio con la stessa email darebbe un
  // match ambiguo: prima "vinceva" il primo silenziosamente).
  const record = await db.runTransaction(async (tx) => {
    const ref = db.collection('appdata').doc('cm_condomini');
    const snap = await tx.get(ref);
    let arr = [];
    try { arr = JSON.parse(snap.data()?.value || '[]'); } catch { arr = []; }

    let idx = arr.findIndex((c) => c.uid === uid);
    if (idx === -1) {
      const matches = arr.map((c, i) => ({ c, i })).filter(({ c }) => c.email && c.email.toLowerCase() === email);
      if (matches.length > 1) {
        throw new HttpsError('failed-precondition', 'Più profili con questa email. Contatta l\'amministratore.');
      }
      idx = matches.length === 1 ? matches[0].i : -1;
    }
    if (idx === -1) {
      throw new HttpsError('not-found', 'Nessun condomino associato a questa email. Contatta l\'amministratore.');
    }
    if (arr[idx].uid && arr[idx].uid !== uid) {
      throw new HttpsError('already-exists', 'Questo profilo risulta già collegato a un altro account.');
    }
    if (!arr[idx].uid) {
      arr[idx] = { ...arr[idx], uid };
      tx.set(ref, { value: JSON.stringify(arr) });
    }
    return arr[idx];
  });

  // Provisiona il ruolo se assente — mai superAdmin (vedi linkMyUid).
  const existingUser = await auth.getUser(uid).catch(() => null);
  if (!existingUser?.customClaims?.role && record.edificioId != null) {
    const role = record.isAdmin ? 'adminEdificio' : (record.canEdit ? 'editor' : 'member');
    await auth.setCustomUserClaims(uid, { role, buildingId: String(record.edificioId) });
    await db.collection('roles').doc(uid).set({
      role, buildingId: String(record.edificioId),
      updatedAt: FieldValue.serverTimestamp(), updatedBy: 'whoami-auto',
    }, { merge: true });
  }

  // Il record del chiamante, senza il flag superAdmin (non autorevole qui).
  const { superAdmin, ...safe } = record;
  return { profile: safe, isSuperAdmin: false };
});

// ═══════════════════════════════════════════════════════════════
// saveBuildingData
// P0 URGENTE (scoperto pianificando REB-01): da quando SEC-03 filtra le
// chiavi di APPDATA_RESTRICTED_CONFIG al proprio edificio per i non-
// superAdmin, il client continua a salvare con un overwrite COMPLETO del
// blob condiviso (fbSaveKey -> setDoc). Un adminEdificio o un condomino
// con canEdit:true che salva qualunque cosa scrive nel documento
// condiviso SOLO i record del proprio edificio, cancellando
// silenziosamente quelli di tutti gli altri edifici.
//
// Questa function sostituisce quella scrittura diretta per i non-
// superAdmin: legge il blob, sostituisce SOLO le righe del proprio
// edificio con quelle inviate dal client, lascia intatto il resto.
// Con Admin SDK, quindi può fare la fusione anche se le rules negano
// la scrittura diretta di queste chiavi a chi non è superAdmin.
// ═══════════════════════════════════════════════════════════════
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

  // ADMIN_ONLY_KEYS (cm_condomini, cm_bacheca, cm_verbali, cm_lavori,
  // cm_delibere — derivate da APPDATA_RESTRICTED_CONFIG in cima al file)
  // restano riservate ad adminEdificio/superAdmin — su richiesta
  // esplicita: per tutte le sezioni introdotte dopo Spese/Entrate/
  // Fornitori, 'editor' resta sola lettura come 'member', a differenza
  // dei dati finanziari storici che si aprono anche a 'editor'. Un
  // semplice 'member' (sola lettura in UI) non può scrivere nessuna di
  // queste — altrimenti basterebbe chiamare questa function da console
  // per bypassare un limite che l'interfaccia si limita a nascondere.
  if (callerRole !== 'superAdmin') {
    const canWriteAdminOnly = callerRole === 'adminEdificio';
    const canWriteFinance = callerRole === 'adminEdificio' || callerRole === 'editor';
    if (ADMIN_ONLY_KEYS.includes(key) && !canWriteAdminOnly) {
      throw new HttpsError('permission-denied', 'Il tuo ruolo non può modificare questi dati.');
    }
    if (!ADMIN_ONLY_KEYS.includes(key) && !canWriteFinance) {
      throw new HttpsError('permission-denied', 'Il tuo ruolo non può modificare questi dati.');
    }
  }

  if (callerRole === 'superAdmin') {
    // Il superAdmin vede e gestisce tutti gli edifici: comportamento
    // invariato, sostituisce l'intero array come già fa oggi.
    await db.collection('appdata').doc(key).set({ value: JSON.stringify(records) });
    return { ok: true, count: records.length };
  }

  const buildingIdStr = String(callerBuildingId || '');
  if (!buildingIdStr) {
    throw new HttpsError('permission-denied', 'Nessun edificio associato al tuo ruolo.');
  }
  // edificioId nei dati è numerico (id legacy): il valore assegnato ai
  // record che ne sono privi deve restare dello stesso tipo, altrimenti i
  // confronti === lato client (state.edificioAttivo) non li trovano più.
  const ownEdificioId = /^\d+$/.test(buildingIdStr) ? Number(buildingIdStr) : buildingIdStr;

  for (const rec of records) {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
      throw new HttpsError('invalid-argument', 'Record non valido.');
    }
    if (rec.edificioId != null && String(rec.edificioId) !== buildingIdStr) {
      throw new HttpsError('permission-denied',
        `Il record ${rec.id} non appartiene al tuo edificio.`);
    }
    // Audit 2026-09 (XSS memorizzata): nessun dato applicativo legittimo
    // contiene < o > (verificato sui dati di produzione), mentre vari punti
    // dell'interfaccia inseriscono questi campi nell'HTML. Il client ora fa
    // l'escape, questo è il secondo livello per chi scrive dalla console.
    if (/[<>]/.test(JSON.stringify(rec))) {
      throw new HttpsError('invalid-argument', 'I caratteri < e > non sono ammessi.');
    }
    // id e colori finiscono in attributi HTML (data-id, style) senza
    // escape in decine di punti: formato vincolato. Gli id generati
    // dall'app (newId) sono numeri.
    if (!(Number.isFinite(rec.id) || (typeof rec.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(rec.id)))) {
      throw new HttpsError('invalid-argument', 'Id record non valido.');
    }
    for (const f of ['color', 'colore']) {
      if (rec[f] != null && !/^#[0-9A-Fa-f]{3,8}$/.test(String(rec[f]))) {
        throw new HttpsError('invalid-argument', `Colore non valido (${f}).`);
      }
    }
  }

  // Transazione: senza, due salvataggi quasi simultanei di edifici diversi
  // leggevano entrambi lo stesso blob e il secondo a scrivere cancellava la
  // fetta appena salvata dal primo. Ora Firestore riprova la lettura se il
  // documento è cambiato nel frattempo.
  const ref = db.collection('appdata').doc(key);
  const count = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let current = [];
    try { current = JSON.parse(snap.data()?.value || '[]'); } catch { current = []; }
    // Mantiene intatto tutto ciò che NON appartiene al proprio edificio
    // (altri edifici, e record senza edificioId come il superAdmin) —
    // sostituisce solo la propria fetta con quella inviata dal client.
    const others = current.filter((r) => String(r?.edificioId) !== buildingIdStr);
    const mine = new Map(current.filter((r) => String(r?.edificioId) === buildingIdStr).map((r) => [String(r.id), r]));
    const otherIds = new Set(others.map((r) => String(r?.id)));

    const cleaned = records.map((rec) => {
      // Un id già usato da un record di un altro edificio creerebbe un
      // duplicato che poi si confonde con l'originale (modifica/cancellazione).
      if (otherIds.has(String(rec.id))) {
        throw new HttpsError('permission-denied', `Id ${rec.id} già in uso in un altro edificio.`);
      }
      // Audit 2026-09: un record senza edificioId finiva visibile a tutti gli
      // edifici (getBuildingData lo includeva ovunque) e nessun adminEdificio
      // poteva più rimuoverlo. Ora viene sempre assegnato al proprio edificio.
      const out = { ...rec, edificioId: ownEdificioId };
      if (key === 'cm_condomini') {
        // superAdmin e uid non sono modificabili da un non-superAdmin: il
        // primo è il privilegio massimo (escalation dimostrata in audit), il
        // secondo collega un account Firebase al profilo. Si conserva il
        // valore già salvato; un condomino nuovo non ne ha.
        const prev = mine.get(String(rec.id));
        delete out.superAdmin;
        delete out.uid;
        if (prev?.superAdmin) out.superAdmin = prev.superAdmin;
        if (prev?.uid) out.uid = prev.uid;
      }
      return out;
    });
    const merged = [...others, ...cleaned];
    tx.set(ref, { value: JSON.stringify(merged) });
    return merged.length;
  });
  return { ok: true, count };
});
