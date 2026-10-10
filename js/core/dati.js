// Lettura e salvataggio su Firestore (buildings/** e appdata), forma e normalizzazione dei record.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// ═══════════════════════════════════════════════════════════════
// APPDATA_CONFIG — unica fonte, in questo runtime, delle chiavi di dati
// dell'app e di dove vivono su Firestore.
// - coll: dati di un edificio (fase 2, REB-01), un documento per record in
//   buildings/{edificioId}/{coll}/{id}. Ruolo, edificio e forma di ogni
//   scrittura li controllano le firestore.rules (canAdmin/canEdit/validRecord);
//   writeRole qui serve solo alla normalizzazione e all'interfaccia.
// - buildings: l'elenco edifici, un documento per edificio in buildings/{id}.
// - tutte le altre: dati globali, un documento appdata/{key} con il valore JSON.
// stateProp: campo di state da sincronizzare dopo il caricamento (assente per
// le chiavi lette on-demand con load(), come cm_categorie/cm_config).
// I vecchi documenti appdata/cm_spese … cm_delibere, cm_condomini e cm_edifici
// restano su Firestore in sola lettura come copia della migrazione.
// ═══════════════════════════════════════════════════════════════
const APPDATA_CONFIG = {
  cm_condomini:       { writeRole: 'adminOnly', stateProp: 'condomini', coll: 'members' },
  cm_spese:           { writeRole: 'finance',   stateProp: 'spese',     coll: 'expenses' },
  cm_entrate:         { writeRole: 'finance',   stateProp: 'entrate',   coll: 'payments' },
  cm_fornitori:       { writeRole: 'finance',   stateProp: 'fornitori', coll: 'suppliers' },
  cm_bacheca:         { writeRole: 'adminOnly', stateProp: 'bacheca',   coll: 'notices' },
  cm_verbali:         { writeRole: 'adminOnly', stateProp: 'verbali',   coll: 'minutes' },
  cm_lavori:          { writeRole: 'adminOnly', stateProp: 'lavori',    coll: 'works' },
  cm_delibere:        { writeRole: 'adminOnly', stateProp: 'delibere',  coll: 'resolutions' },
  cm_edifici:         { stateProp: 'edifici', buildings: true },
  cm_categorie:       {},
  cm_edificio_attivo: { stateProp: 'edificioAttivo' },
  cm_login_stats:     { stateProp: 'loginStats' },
  cm_config:          {},
  cm_branding:        {},
};

const RECORD_KEYS = Object.keys(APPDATA_CONFIG).filter(k => APPDATA_CONFIG[k].coll || APPDATA_CONFIG[k].buildings);

const GLOBAL_KEYS = Object.keys(APPDATA_CONFIG).filter(k => !RECORD_KEYS.includes(k));

// Ultimo stato confermato dal server per chiave (copia profonda): è la base
// del confronto che decide quali record scrivere, ed è lo stato a cui si torna
// se un salvataggio viene rifiutato.
const _serverSnap = {};

function setServerSnap(key, val) {
  _serverSnap[key] = val === undefined ? undefined : JSON.parse(JSON.stringify(val));
}

// Salvataggi in coda per chiave: due salvataggi ravvicinati della stessa
// sezione devono partire in ordine, ognuno confrontato con l'esito del precedente.
const _saveQueue = {};

function fbSaveKey(key, val) {
  if (!window._fb) return Promise.resolve();
  const run = () => fbSaveKeyNow(key, val);
  const p = (_saveQueue[key] || Promise.resolve()).then(run, run);
  _saveQueue[key] = p;
  return p;
}

// Serializzazione con chiavi ordinate, per capire se un record è cambiato.
function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

// Riferimento Firestore di un record di `key`.
function recordRef(key, rec) {
  const { db, doc } = window._fb;
  const cfg = APPDATA_CONFIG[key];
  if (cfg.buildings) return doc(db, 'buildings', String(rec.id));
  return doc(db, 'buildings', String(rec.edificioId), cfg.coll, String(rec.id));
}

// Salva una sezione per edificio scrivendo SOLO i record cambiati rispetto
// all'ultimo stato del server: nuovi e modificati con una scrittura ciascuno,
// cancellati con una cancellazione logica (_deleted). Due persone che lavorano
// insieme toccano record diversi e non si sovrascrivono più. Ogni scrittura è
// firmata (_updatedBy/_updatedAt): le rules lo pretendono e la Cloud Function
// auditTrail ne ricava il registro delle modifiche.
async function saveRecords(key, val) {
  const { auth, setDoc, writeBatch, db, serverTimestamp, deleteField } = window._fb;
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sessione scaduta: accedi di nuovo.');
  const cfg = APPDATA_CONFIG[key];
  const before = new Map((_serverSnap[key] || []).map(r => [String(r.id), r]));
  const writes = [];
  for (const raw0 of val) {
    // Copia JSON: elimina i campi undefined (Firestore li rifiuta, il vecchio
    // blob JSON li scartava in silenzio) e le date/oggetti non serializzabili.
    const raw = JSON.parse(JSON.stringify(raw0));
    const rec = cfg.buildings ? raw : { ...raw, edificioId: raw.edificioId ?? state.edificioAttivo };
    const id = String(rec.id);
    let prev = before.get(id);
    before.delete(id);
    if (prev && !cfg.buildings && String(prev.edificioId) !== String(rec.edificioId)) {
      // Spostato in un altro edificio (es. condomino senza movimenti): nuovo
      // documento nel nuovo edificio, cancellazione logica del vecchio.
      writes.push([recordRef(key, prev), { _deleted: true, _deletedBy: uid, _updatedBy: uid, _updatedAt: serverTimestamp() }, { merge: true }]);
      prev = null;
    }
    if (prev && stableStringify(prev) === stableStringify(rec)) continue;
    const data = { ...rec, _updatedBy: uid, _updatedAt: serverTimestamp(), _deleted: false };
    if (key === 'cm_condomini') data.emailLower = rec.email ? String(rec.email).toLowerCase() : null;
    if (prev) {
      // Modifica: fusione con il documento esistente (conserva autore e data
      // di creazione), togliendo esplicitamente i campi rimossi dal record.
      Object.keys(prev).forEach(k => { if (!(k in rec)) data[k] = deleteField(); });
      writes.push([recordRef(key, rec), data, { merge: true }]);
    } else {
      writes.push([recordRef(key, rec), { ...data, _createdBy: uid, _createdAt: serverTimestamp() }, null]);
    }
  }
  for (const prev of before.values()) {
    writes.push([recordRef(key, prev), { _deleted: true, _deletedBy: uid, _updatedBy: uid, _updatedAt: serverTimestamp() }, { merge: true }]);
  }
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db);
    writes.slice(i, i + 400).forEach(([ref, data, opts]) => opts ? batch.set(ref, data, opts) : batch.set(ref, data));
    await batch.commit();
  }
}

async function fbSaveKeyNow(key, val) {
  const cfg = APPDATA_CONFIG[key] || {};
  try {
    if (RECORD_KEYS.includes(key)) await saveRecords(key, val);
    else {
      const { db, doc, setDoc } = window._fb;
      await setDoc(doc(db, 'appdata', key), { value: JSON.stringify(val) });
    }
    setServerSnap(key, val);
  } catch(e) {
    // Dopo un rifiuto si torna all'ultimo stato confermato dal server, invece
    // di lasciare a schermo un dato che non è stato salvato.
    console.warn('fbSave error', key, e);
    reportClientError('Salvataggio non riuscito (' + key + '): ' + (e.code || e.message || e), e.stack);
    if (_serverSnap[key] !== undefined) {
      const restored = JSON.parse(JSON.stringify(_serverSnap[key]));
      _cache[key] = restored;
      if (cfg.stateProp) state[cfg.stateProp] = cfg.writeRole ? normalizeRecords(restored) : restored;
      render();
    }
    const msg = /permission|insufficient/i.test(e.code || e.message || '')
      ? 'Non hai i permessi per questa modifica, oppure l’app è stata aggiornata: ricarica la pagina.'
      : (e.message || e);
    alert('⚠️ Salvataggio non riuscito: ' + msg + '\nL’ultima modifica è stata annullata: i dati mostrati sono quelli salvati.');
  }
}

// Carica i dati globali (appdata). Best-effort per chiave: quelle riservate al
// superAdmin falliscono da sole senza bloccare le altre.
async function fbLoadAll() {
  if (!window._fb) return;
  const { db, doc, getDoc } = window._fb;
  await Promise.all(GLOBAL_KEYS.map(async (key) => {
    try {
      const snap = await getDoc(doc(db, 'appdata', key));
      if (snap.exists()) { _cache[key] = JSON.parse(snap.data().value); setServerSnap(key, _cache[key]); }
    } catch(e) { console.warn('fbLoadAll error', key, e.code || e.message); }
  }));
}

// Toglie i metadati (_updatedAt, _createdBy, …) e scarta i record cancellati.
function fromDocs(docs) {
  return docs.map(d => d.data()).filter(d => !d._deleted)
    .map(d => Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('_') && k !== 'emailLower')));
}

// Carica edifici e dati per edificio: tutti per il superAdmin, solo il proprio
// per gli altri ruoli (le rules non permettono altro). Lancia un errore se non
// riesce: senza questi dati l'app non è utilizzabile.
async function fbLoadBuildings(profile) {
  const { db, doc, getDoc, getDocs, collection } = window._fb;
  let edifici;
  if (isSuperAdmin(profile)) {
    edifici = fromDocs((await getDocs(collection(db, 'buildings'))).docs);
  } else {
    const snap = await getDoc(doc(db, 'buildings', String(profile.edificioId)));
    edifici = snap.exists() ? fromDocs([snap]) : [];
  }
  edifici.sort((a, b) => Number(a.id) - Number(b.id));
  const perKey = {};
  await Promise.all(RECORD_KEYS.filter(k => APPDATA_CONFIG[k].coll).map(async (key) => {
    const parts = await Promise.all(edifici.map(async (ed) =>
      fromDocs((await getDocs(collection(db, 'buildings', String(ed.id), APPDATA_CONFIG[key].coll))).docs)));
    perKey[key] = parts.flat();
  }));
  _cache.cm_edifici = edifici;
  setServerSnap('cm_edifici', edifici);
  Object.entries(perKey).forEach(([key, arr]) => { _cache[key] = arr; setServerSnap(key, arr); });
}

// ═══════════════════════════════════════════════════════
//  INIT — Avvio app con Firebase
// ═══════════════════════════════════════════════════════
// Applica alla cache in memoria (state.*) i dati appena letti da Firestore.
// Fattorizzata per poter essere richiamata sia al boot (best-effort) sia
// dopo l'autenticazione (autoritativa — è qui che DEVE riuscire).
// Forma minima dei record (stessi elenchi di RECORD_SCHEMA in
// functions/index.js, che rifiuta i salvataggi non conformi). QA: un solo
// record con un campo del tipo sbagliato (es. argomenti come testo invece che
// elenco) faceva crollare l'intera pagina; qui i dati già salvati vengono
// riportati alla forma attesa prima di essere mostrati.
const RECORD_SCHEMA = {
  arrays: { allegati: 'object', split: 'object', storicoAggiornamenti: 'object', argomenti: 'string', decisioni: 'string' },
  text: ['titolo', 'testo', 'descrizione', 'descrizioneSintetica', 'nome', 'appartamento', 'email', 'username', 'note', 'responsabile',
    'indirizzo', 'categoria', 'tipo', 'tipoSpesa', 'stato', 'data', 'scadenza', 'telefono'],
};

function normalizeRecords(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(r => r && typeof r === 'object' && !Array.isArray(r)).map(r => {
    let out = r;
    const fix = (f, v) => { if (out === r) out = { ...r }; out[f] = v; };
    for (const [f, itemType] of Object.entries(RECORD_SCHEMA.arrays)) {
      const v = r[f];
      if (v == null) continue;
      const list = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
      const ok = list.filter(x => itemType === 'string' ? (typeof x === 'string' || typeof x === 'number') : (x && typeof x === 'object' && !Array.isArray(x)))
                     .map(x => itemType === 'string' ? String(x) : x);
      if (!Array.isArray(v) || ok.length !== v.length || ok.some((x, i) => x !== v[i])) fix(f, ok);
    }
    for (const f of RECORD_SCHEMA.text) {
      const v = r[f];
      if (v != null && typeof v !== 'string') fix(f, typeof v === 'number' ? String(v) : '');
    }
    return out;
  });
}

function applyLoadedDataFromCache() {
  // Guidato da APPDATA_CONFIG (stateProp) invece di un elenco manuale per
  // chiave — bug corretto: prima di questo loop, cm_bacheca/cm_verbali
  // (poi anche cm_lavori/cm_delibere) non comparivano qui, quindi le
  // pagine restavano vuote dopo il login finché non si creava un elemento
  // nella sessione corrente (lo stato in memoria veniva aggiornato solo
  // dai save handler, mai dal caricamento iniziale da Firestore). Con il
  // loop, una nuova chiave con stateProp viene sincronizzata automaticamente.
  Object.entries(APPDATA_CONFIG).forEach(([key, cfg]) => {
    if (!cfg.stateProp) return;
    const saved = load(key, null);
    if (saved) state[cfg.stateProp] = cfg.writeRole ? normalizeRecords(saved) : saved;
  });

  // Dopo il caricamento: se l'anno corrente non ha dati nel condominio attivo,
  // si apre sull'anno più recente con dati che NON sia nel futuro (con il solo
  // preventivo dell'anno prossimo caricato si resta sull'anno corrente).
  // Prima si guardavano tutti i condomìni e si poteva saltare a un anno futuro.
  const currYear = new Date().getFullYear();
  const edOk = r => !r.edificioId || r.edificioId === state.edificioAttivo;
  const anniConDati = new Set([...state.spese.filter(edOk), ...state.entrate.filter(edOk)].map(r => annoDi(r.data)).filter(a => a > 0));
  if (!anniConDati.has(currYear)) {
    const passati = [...anniConDati].filter(a => a < currYear).sort((a,b)=>b-a);
    if (passati.length > 0) state.filterAnno = passati[0];
  }
}
