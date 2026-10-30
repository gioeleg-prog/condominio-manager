const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getStorage } = require('firebase-admin/storage');
const { backupNotturno } = require('./backup');
const { REGIONI_CALLABLE } = require('./regioni');
const { copiaSuDrive } = require('./drive');
const { defineSecret } = require('firebase-functions/params');
// Credenziali per la copia su Google Drive (scripts/drive-autorizza.js).
const DRIVE_BACKUP = defineSecret('DRIVE_BACKUP');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();
const auth = getAuth();
// Permessi di condomini disattivati, usciti o declassati: vedi permessi.js.
const permessi = require('./permessi');
// Ruolo del chiamante riletto dal database per le operazioni sensibili: vedi ruolo.js.
const ruoloDb = require('./ruolo');
// Voci del registro modifiche con id stabile (una riconsegna non le duplica).
const { scriviEvento } = require('./eventi');
// Il condomino corregge da solo i propri dati personali: vedi profilo.js.
const profilo = require('./profilo');

// ═══════════════════════════════════════════════════════════════
// Modello dati (REB-01, fase 2 QA): un documento per record sotto
// buildings/{buildingId}/{members|expenses|payments|suppliers|notices|
// minutes|works|resolutions}/{id}. Le firestore.rules applicano ruolo,
// edificio e forma a ogni scrittura del client, quindi le vecchie
// funzioni ponte sul blob condiviso (getBuildingData/saveBuildingData)
// non servono più e sono state rimosse. Il blob appdata/cm_* resta in
// sola lettura come copia di sicurezza della migrazione.
//
// Region: tutte le funzioni stanno in europe-west1, vicino a Firestore
// (eur3). Le callable (onCall) e quelle a orario la dichiarano; il client
// cerca le callable lì (js/firebase.js; region in functions/regioni.js).
// Anche i trigger auditTrail e notificaVita la dichiarano (SEC-012): senza,
// il valore predefinito dell'SDK e quello dell'emulatore sono us-central1.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// setUserRole
// Unico punto autorizzato ad assegnare superAdmin / adminEdificio /
// editor / member.
//  • superAdmin: qualunque ruolo, in qualunque condominio.
//  • adminEdificio (decisione del 2026-10-15: gli amministratori nominano
//    altri amministratori, con traccia nel registro): solo member, editor o
//    adminEdificio, solo nel proprio condominio, solo a un condomino attivo di
//    quel condominio e mai a chi è superAdmin o ha i permessi di un altro
//    condominio. Prima la funzione era riservata al superAdmin: il ruolo
//    scelto dall'amministratore restava solo nella scheda e il server non lo
//    applicava a chi aveva già fatto il primo accesso.
// ═══════════════════════════════════════════════════════════════
exports.setUserRole = onCall({ region: REGIONI_CALLABLE }, async (request) => {
  // Senza accesso: stesso codice delle altre callable, così il client distingue "sessione scaduta" da "non autorizzato".
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login richiesto.');
  // Ruolo riletto dal database, non dal token (QA-CONS-011): un amministratore
  // declassato o uscito, con il token ancora valido, non assegna più ruoli.
  const callerRole = (await ruoloDb.ruoloAttuale(request)).role;
  if (callerRole !== 'superAdmin' && callerRole !== 'adminEdificio') {
    throw new HttpsError('permission-denied', 'Solo un amministratore può assegnare ruoli.');
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
  if (callerRole === 'adminEdificio') await controllaNomina(request, targetUid, role, String(buildingId));

  // La scheda prima dei claim (ADV-TECH-021): se la scrittura fallisce la chiamata si ferma e i claim restano
  // come erano; non può mai restare un ruolo nei claim più alto di quello che mostra la scheda.
  if (role !== 'superAdmin') await allineaSchedaAlRuolo(String(targetUid), String(buildingId), role, request.auth.uid);

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

// Porta i flag di ruolo (isAdmin, canEdit) delle schede attive dell'utente nel condominio al ruolo assegnato,
// firmando chi ha chiesto la modifica. Scrive solo se qualcosa cambia (niente voci di registro né versioni
// nuove per nulla). Lo fa il server perché il salvataggio della scheda dal client può fallire dopo la chiamata.
async function allineaSchedaAlRuolo(targetUid, buildingId, role, attore) {
  const isAdmin = role === 'adminEdificio';
  const canEdit = isAdmin || role === 'editor';
  const snap = await db.collection(`buildings/${buildingId}/members`).where('uid', '==', targetUid).get();
  const batch = db.batch();
  let n = 0;
  for (const d of snap.docs) {
    const m = d.data();
    if (m._deleted || !permessi.membroAttivo(m)) continue;
    if (!!m.isAdmin === isAdmin && !!m.canEdit === canEdit) continue;
    batch.update(d.ref, { isAdmin, canEdit, _updatedBy: attore, _updatedAt: FieldValue.serverTimestamp() });
    n++;
  }
  if (n) await batch.commit();
}

// Limiti di un amministratore di condominio che assegna un ruolo (vedi setUserRole).
async function controllaNomina(request, targetUid, role, buildingId) {
  const no = (msg) => { throw new HttpsError('permission-denied', msg); };
  if (role === 'superAdmin') no('Solo il Super Admin può nominare un Super Admin.');
  // Un amministratore non cambia il proprio ruolo: togliersi i permessi per
  // sbaglio lo chiuderebbe fuori dal condominio.
  if (String(targetUid) === request.auth.uid) no('Non puoi cambiare il tuo ruolo: chiedi a un altro amministratore o al Super Admin.');
  if (buildingId !== String(request.auth.token.buildingId)) no('Puoi assegnare ruoli solo nel tuo condominio.');
  const profili = await db.collection(`buildings/${buildingId}/members`).where('uid', '==', String(targetUid)).get();
  if (!profili.docs.some((d) => !d.data()._deleted && permessi.membroAttivo(d.data()))) {
    no('Questa persona non è un condomino attivo del tuo condominio.');
  }
  const claims = (await auth.getUser(String(targetUid)).catch(() => null))?.customClaims || {};
  if (claims.role === 'superAdmin') no('Non puoi cambiare il ruolo del Super Admin.');
  if (claims.role && String(claims.buildingId) !== buildingId) no('Questa persona accede a un altro condominio.');
}

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
exports.whoami = onCall({ region: REGIONI_CALLABLE }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login richiesto.');
  const uid = request.auth.uid;
  const email = (request.auth.token.email || '').toLowerCase();
  if (!email) throw new HttpsError('failed-precondition', 'Account senza email associata.');

  const cfg = (await db.collection('appdata').doc('cm_config').get()).data() || {};
  const isSuperAdmin = request.auth.token.role === 'superAdmin'
    || (cfg.superAdminUid && cfg.superAdminUid === uid)
    // Per email solo se verificata (audit 2026-10-15): chi riuscisse a creare
    // un account con quell'indirizzo senza possederlo non diventa superAdmin.
    || (cfg.superAdminEmail && cfg.superAdminEmail.toLowerCase() === email
        && request.auth.token.email_verified === true);

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

  // Non-superAdmin: cerca il profilo (vedi sceltaProfilo più sotto).
  // Audit 2026-10-30: con cm_config.richiediEmailVerificata attivo, un account con email non
  // confermata non si collega a un profilo solo perché ne conosce l'indirizzo (chi riuscisse a
  // registrare un account con l'email di un condomino invitato ne prenderebbe il ruolo). Spento di
  // default: gli account creati dall'amministratore con password provvisoria non hanno l'email
  // confermata, e attivarlo senza controllare li bloccherebbe al primo accesso.
  const collegaPerEmail = cfg.richiediEmailVerificata !== true || request.auth.token.email_verified === true;
  const ref = await sceltaProfilo(uid, email, collegaPerEmail);
  const buildingId = ref.parent.parent.id;
  // Profilo già collegato a questo account (tutti gli accessi dopo il primo):
  // basta leggerlo. La transazione serve solo a collegarlo la prima volta
  // (prestazioni 2026-10-21: prima a ogni accesso, con due giri in più).
  const gia = (await ref.get()).data();
  const record = gia && gia.uid === uid ? { ...gia } : await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (data.uid && data.uid !== uid) {
      throw new HttpsError('already-exists', 'Questo profilo risulta già collegato a un altro account.');
    }
    if (!data.uid) tx.update(ref, { uid, _updatedAt: FieldValue.serverTimestamp(), _updatedBy: 'whoami-auto' });
    return { ...data, uid };
  });

  // Il record del chiamante, senza metadati né flag superAdmin (non autorevole qui).
  // L'email è quella dell'account: nel record non c'è più (sta in contatti/).
  const profile = Object.fromEntries(Object.entries(record)
    .filter(([k]) => !k.startsWith('_') && !['superAdmin', 'emailLower', 'telefono'].includes(k)));
  profile.email = email;

  // Audit 2026-10-15: un condomino disattivato o uscito (dataUscita passata)
  // non riceve permessi, e quelli che aveva ancora gli vengono tolti. L'app
  // vede disabled e chiude la sessione con il messaggio "account disattivato".
  if (!permessi.membroAttivo(record)) {
    await permessi.togliPermessi(uid, buildingId, 'whoami-auto');
    return { profile: { ...profile, disabled: true }, isSuperAdmin: false };
  }

  // Provisiona il ruolo se assente — mai superAdmin (vedi sopra).
  // Con un ruolo già nel token non c'è niente da assegnare: i permessi di un
  // condomino attivo si tolgono solo a chi esce o viene disattivato (sopra,
  // prima di qui). Altrimenti si controllano i permessi attuali dell'account.
  const existingUser = request.auth.token.role ? null : await auth.getUser(uid).catch(() => null);
  if (!request.auth.token.role && !existingUser?.customClaims?.role && record.edificioId != null) {
    const role = record.isAdmin ? 'adminEdificio' : (record.canEdit ? 'editor' : 'member');
    await auth.setCustomUserClaims(uid, { role, buildingId: String(record.edificioId) });
    await db.collection('roles').doc(uid).set({
      role, buildingId: String(record.edificioId),
      updatedAt: FieldValue.serverTimestamp(), updatedBy: 'whoami-auto',
    }, { merge: true });
  }

  // Cambio email chiesto dal condomino (profilo.js): entra con il nuovo
  // indirizzo confermato, che passa ai contatti. Mai bloccante per l'accesso.
  await profilo.allineaEmail(uid, request.auth.token, ref)
    .catch((e) => console.error('whoami: allineamento email non riuscito', e.message));

  await recordLogin(profile);
  return { profile, isSuperAdmin: false };
});

// Quale profilo di condomino spetta a chi accede (decisione del 2026-10-15).
// Prima il profilo già collegato al suo account (uid); se non ce n'è uno
// attivo, un profilo con la sua email (emailLower, scritto dal client e dalla
// migrazione) non ancora collegato. Un'email vale per un solo condominio:
// se la stessa email è in più profili attivi, vale quello inserito per primo
// (_createdAt). Così un amministratore che inserisce l'email di una persona
// di un altro condominio non la collega a sé né la blocca; al salvataggio
// l'app lo avvisa (verificaEmail). Due profili creati nello stesso istante
// restano ambigui: rifiuto esplicito.
const creatoMs = (d) => (typeof d.data()._createdAt?.toMillis === 'function' ? d.data()._createdAt.toMillis() : 0);
function piuVecchio(docs) {
  const ordinati = [...docs].sort((a, b) => creatoMs(a) - creatoMs(b));
  if (ordinati.length > 1 && creatoMs(ordinati[0]) === creatoMs(ordinati[1])) {
    throw new HttpsError('failed-precondition', 'Più profili con questa email inseriti insieme. Contatta l\'amministratore.');
  }
  return ordinati[0];
}
// I profili attivi se ce ne sono, altrimenti tutti (danno "account disattivato").
const preferisciAttivi = (docs) => { const a = docs.filter((d) => permessi.membroAttivo(d.data())); return a.length ? a : docs; };

// Profili di condomino con questa email. L'email sta in contatti/{id} (privacy,
// decisione del 2026-10-15); finché un record non è migrato
// (scripts/separa-contatti.js) vale anche il vecchio emailLower del condomino.
async function profiliPerEmail(email) {
  const [contatti, vecchi] = await Promise.all([
    // Se l'indice dei contatti non è ancora pronto (subito dopo il deploy) si
    // usa solo il vecchio campo, invece di impedire l'accesso a tutti.
    db.collectionGroup('contatti').where('emailLower', '==', email).get()
      .catch((e) => { console.error('whoami: ricerca nei contatti non riuscita', e.message); return { docs: [] }; }),
    db.collectionGroup('members').where('emailLower', '==', email).get(),
  ]);
  const perPercorso = new Map(vecchi.docs.map((d) => [d.ref.path, d]));
  const daLeggere = contatti.docs.filter((c) => !c.data()._deleted)
    .map((c) => c.ref.parent.parent.collection('members').doc(c.id)).filter((r) => !perPercorso.has(r.path));
  if (daLeggere.length) (await db.getAll(...daLeggere)).filter((s) => s.exists).forEach((s) => perPercorso.set(s.ref.path, s));
  return [...perPercorso.values()];
}

async function sceltaProfilo(uid, email, collegaPerEmail = true) {
  const members = db.collectionGroup('members');
  const alive = (snap) => snap.docs.filter((d) => !d.data()._deleted);
  const perUid = alive(await members.where('uid', '==', uid).get());
  if (perUid.some((d) => permessi.membroAttivo(d.data()))) return piuVecchio(preferisciAttivi(perUid)).ref;
  const perEmail = collegaPerEmail ? (await profiliPerEmail(email)).filter((d) => !d.data()._deleted) : [];
  // Uno libero (o già suo) e attivo: es. chi è uscito da un condominio ed è entrato in un altro.
  const liberi = perEmail.filter((d) => (!d.data().uid || d.data().uid === uid) && permessi.membroAttivo(d.data()));
  if (liberi.length) return piuVecchio(liberi).ref;
  if (perUid.length) return piuVecchio(perUid).ref;
  if (perEmail.length) return piuVecchio(preferisciAttivi(perEmail)).ref;
  if (!collegaPerEmail) throw new HttpsError('failed-precondition', 'Conferma prima il tuo indirizzo email (controlla la posta) e riprova.');
  throw new HttpsError('not-found', 'Nessun condomino associato a questa email. Contatta l\'amministratore.');
}

// ═══════════════════════════════════════════════════════════════
// verificaEmail
// Per l'amministratore che salva un condomino: dice se la stessa email è già
// in un profilo attivo di un ALTRO condominio. In quel caso la persona
// continua ad accedere a quello (vedi sceltaProfilo) e l'app avvisa che con
// questo profilo non entrerà; l'email serve comunque per le notifiche. Non
// dice quale condominio né chi.
// ═══════════════════════════════════════════════════════════════
exports.verificaEmail = onCall({ region: REGIONI_CALLABLE }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login richiesto.');
  const b = String(request.data?.buildingId || '');
  const adesso = await ruoloDb.ruoloAttuale(request);
  if (!(adesso.role === 'superAdmin' || (adesso.role === 'adminEdificio' && String(adesso.buildingId) === b))) {
    throw new HttpsError('permission-denied', 'Solo l\'amministratore del condominio.');
  }
  const e = String(request.data?.email || '').trim().toLowerCase();
  if (!e || e.length > 200) return { altroCondominio: false };
  return { altroCondominio: (await profiliPerEmail(e)).some((d) => d.ref.parent.parent.id !== b && !d.data()._deleted && permessi.membroAttivo(d.data())) };
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
      // Audit 2026-10-30: la chiave è l'id del condomino; '0' è del Super Admin, quindi un
      // condomino con id 0 (lo può creare un amministratore) non sovrascrive la sua riga. Il nome
      // è troncato: un nome enorme gonfiava il documento condiviso da tutti gli accessi.
      if (!profile.superAdmin && String(profile.id) === '0') return;
      const key = String(profile.id);
      const prev = stats[key] || { totale: 0, mensile: {} };
      stats[key] = {
        nome: String(profile.nome ?? '').slice(0, 100),
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
// generano eventi. Per i condomini allinea anche i permessi dell'account
// (permessi.js, audit 2026-10-15).
// ═══════════════════════════════════════════════════════════════
const MAX_VALUE_LEN = 500;

exports.auditTrail = onDocumentWritten({ document: 'buildings/{buildingId}/{coll}/{docId}', region: 'europe-west1' }, async (event) => {
  // Storici degli invii (email: lo scrive il server; WhatsApp: solo a chi è
  // stato aperto il messaggio): non sono modifiche ai dati del condominio.
  if (event.params.coll === 'invii' || event.params.coll === 'inviiWhatsapp') return;
  await registraModifica(event);
  // Condomini: allinea anche i permessi del loro account (permessi.js). Sta
  // in questo trigger, che scatta già a ogni scrittura, per non aggiungere
  // un'esecuzione in più per ogni modifica.
  if (event.params.coll === 'members' && event.data?.after?.exists) {
    await permessi.allineaPermessi(event.data.after.ref, event.data.before?.exists ? event.data.before.data() : null);
  }
});

async function registraModifica(event) {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  // L'autore è sempre _updatedBy: le rules lo obbligano a coincidere con chi
  // scrive (_deletedBy è un metadato di cancellazione, non l'autore: audit 2026-10-24).
  const actor = after?._updatedBy ?? null;
  if (actor === 'backfill' || actor === 'whoami-auto' || actor === 'migrazione-contatti') return;
  // Scrittura di un ripristino da backup (vedi backup.js): non è un'azione
  // dell'ultimo autore del record.
  if (after?._restoredAt && stableStringify(after._restoredAt) !== stableStringify(before?._restoredAt)) return;

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

  await scriviEvento(db, event.id, '', {
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

  // Nomine (decisione del 2026-10-15): un amministratore di condominio può
  // nominare altri amministratori o dare "Modifica". Resta permesso, ma ogni
  // aumento di ruolo ha una voce sua nel registro, leggibile come "nominato
  // amministratore da …", oltre alla modifica dei campi isAdmin/canEdit.
  if (event.params.coll === 'members' && after && !after._deleted) {
    const ruolo = (m) => (m && !m._deleted ? (m.isAdmin ? 'adminEdificio' : (m.canEdit ? 'editor' : 'member')) : 'member');
    const LIVELLO = { member: 1, editor: 2, adminEdificio: 3 };
    const nuovo = ruolo(after), prima = ruolo(before);
    if (LIVELLO[nuovo] > LIVELLO[prima]) {
      await scriviEvento(db, event.id, 'nomina', {
        type: 'role.nominated',
        buildingId: event.params.buildingId,
        collection: 'members',
        recordId: event.params.docId,
        titolo: clip(after.nome ?? null),
        role: nuovo,
        previousRole: prima,
        actorUid: actor,
        at: FieldValue.serverTimestamp(),
      });
    }
  }
}

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

// ═══════════════════════════════════════════════════════════════
// dailyBackup
// Ogni notte alle 3 (ora italiana) salva tutto Firestore in un file JSON su
// Cloud Storage (backups/AAAA-MM-GG.json, non accessibile dall'app: le
// storage.rules negano tutto fuori da buildings/), tiene 30 giorni di
// copie e registra l'esito in appSettings/backupStatus, mostrato al superAdmin.
// Subito dopo ne mette una copia compressa su Google Drive (drive.js).
// Pulisce anche le segnalazioni di errore più vecchie di 30 giorni.
// La sequenza e la registrazione degli esiti sono in backupNotturno (backup.js).
// Ripristino: scripts/restore-backup.js.
// ═══════════════════════════════════════════════════════════════
exports.dailyBackup = onSchedule({ schedule: '0 3 * * *', timeZone: 'Europe/Rome', region: 'europe-west1', timeoutSeconds: 300, secrets: [DRIVE_BACKUP] }, async () => {
  await backupNotturno(db, getStorage().bucket(), {
    pulisci: purgeOldClientErrors,
    copia: (body, giorno) => copiaSuDrive(DRIVE_BACKUP.value(), body, giorno),
  });
});

async function purgeOldClientErrors() {
  const limit = new Date(Date.now() - 30 * 86400000);
  const old = await db.collection('clientErrors').where('at', '<', limit).limit(400).get();
  if (old.empty) return;
  const batch = db.batch();
  old.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// Notifiche email (avvisi, verbali, promemoria rate): vedi notifiche.js.
const notifiche = require('./notifiche');
exports.notificaVita = notifiche.notificaVita;
exports.promemoriaRate = notifiche.promemoriaRate;
exports.inviaEmail = notifiche.inviaEmail;

// Avvisi automatici al Super Admin (backup, errori, email non partite): vedi controllo.js.
const controllo = require('./controllo');
exports.controlloServizio = controllo.controlloServizio;
exports.provaAvvisi = controllo.provaAvvisi;
exports.permessiUsciti = permessi.permessiUsciti;
exports.mioProfilo = profilo.mioProfilo;
