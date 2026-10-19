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

// Versione di ogni record letta dal server (_updatedAt in millisecondi), per
// chiave e percorso del documento (un condomino e i suoi contatti hanno lo
// stesso id in due collezioni). Prima di modificare o cancellare un record si controlla che sul
// server sia ancora quella versione: se un'altra persona l'ha cambiato nel
// frattempo il salvataggio si ferma invece di sovrascriverlo in silenzio.
const _versioni = {};

function versioneDi(d) {
  const t = d && d._updatedAt;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : null;
}
function setVersioni(key, docs) {
  _versioni[key] = _versioni[key] || new Map();
  docs.forEach(d => { const v = d.data(); if (v && v.id != null) _versioni[key].set(d.ref.path, versioneDi(v)); });
}

// ═══════════════════════════════════════════════════════════════
// Contatti dei condomini (privacy, decisione del 2026-10-15)
// Email e telefono stanno in buildings/{b}/contatti/{id}, che le regole lasciano
// leggere solo ad amministratori ed editor: un condomino semplice vede degli
// altri solo nomi, appartamenti e quote. In memoria (state.condomini) i contatti
// restano dentro il record del condomino, per chi li può vedere; al salvataggio
// saveRecords li divide di nuovo nei due documenti.
// ═══════════════════════════════════════════════════════════════
const CAMPI_CONTATTO = ['email', 'telefono'];
// Percorsi dei documenti contatti che esistono sul server (creazione o modifica).
const _contattiNoti = new Set();
function senzaContatti(r) { const o = { ...r }; CAMPI_CONTATTO.forEach(k => delete o[k]); return o; }
function soloContatti(r) {
  const o = { id: r.id, edificioId: r.edificioId };
  CAMPI_CONTATTO.forEach(k => { if (r[k] != null && r[k] !== '') o[k] = r[k]; });
  return o;
}
const haContatti = (c) => CAMPI_CONTATTO.some(k => k in c);
function contattiRef(rec) {
  const { db, doc } = window._fb;
  return doc(db, 'buildings', String(rec.edificioId), 'contatti', String(rec.id));
}

// Salvataggi in coda per chiave: due salvataggi ravvicinati della stessa
// sezione devono partire in ordine, ognuno confrontato con l'esito del precedente.
const _saveQueue = {};

// Salvataggi non ancora confermati dal server: chiudere o ricaricare la pagina
// in quel momento li interromperebbe, quindi il browser chiede conferma prima di uscire.
let _salvataggiInCorso = 0;
function salvataggiInCorso() { return _salvataggiInCorso; }
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('beforeunload', (e) => { if (_salvataggiInCorso > 0) { e.preventDefault(); e.returnValue = ''; } });
}

function fbSaveKey(key, val) {
  if (!window._fb) return Promise.resolve(true);
  _salvataggiInCorso++;
  const run = () => fbSaveKeyNow(key, val);
  const p = (_saveQueue[key] || Promise.resolve()).then(run, run).finally(() => { _salvataggiInCorso--; });
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
  const condomini = key === 'cm_condomini';
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
      if (condomini) cancellaCondomino(writes, prev, uid);
      else writes.push([recordRef(key, prev), cancellazione(uid), { merge: true }]);
      prev = null;
    }
    const scritto = scriviRecord(writes, recordRef(key, rec), condomini ? senzaContatti(rec) : rec, prev && (condomini ? senzaContatti(prev) : prev), uid);
    if (condomini) scriviContatti(writes, rec, prev, uid, scritto);
  }
  for (const prev of before.values()) {
    if (condomini) cancellaCondomino(writes, prev, uid);
    else writes.push([recordRef(key, prev), cancellazione(uid), { merge: true }]);
  }
  await controllaConflitti(key, writes);
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db);
    writes.slice(i, i + 400).forEach(([ref, data, opts]) => opts ? batch.set(ref, data, opts) : batch.set(ref, data));
    await batch.commit();
  }
  writes.forEach(([ref]) => { if (/\/contatti\//.test(ref.path)) _contattiNoti.add(ref.path); });
  await aggiornaVersioni(key, writes);
}

const cancellazione = (uid) => {
  const { serverTimestamp } = window._fb;
  return { _deleted: true, _deletedBy: uid, _updatedBy: uid, _updatedAt: serverTimestamp() };
};

// Scrittura di un record nuovo o cambiato (prev = com'era sul server, o null).
// Restituisce true se il record va scritto.
function scriviRecord(writes, ref, rec, prev, uid, extra = {}) {
  const { serverTimestamp, deleteField } = window._fb;
  if (prev && stableStringify(prev) === stableStringify(rec)) return false;
  const data = { ...rec, ...extra, _updatedBy: uid, _updatedAt: serverTimestamp(), _deleted: false };
  if (prev) {
    // Modifica: fusione con il documento esistente (conserva autore e data
    // di creazione), togliendo esplicitamente i campi rimossi dal record.
    Object.keys(prev).forEach(k => { if (!(k in rec) && !(k in extra)) data[k] = deleteField(); });
    // Condomini: email e telefono non stanno più nel record (le regole li
    // rifiutano), anche se un documento non ancora migrato li ha ancora.
    if (/\/members\//.test(ref.path)) [...CAMPI_CONTATTO, 'emailLower'].forEach(k => { data[k] = deleteField(); });
    writes.push([ref, data, { merge: true }]);
  } else {
    writes.push([ref, { ...data, _createdBy: uid, _createdAt: serverTimestamp() }, null]);
  }
  return true;
}

// Contatti di un condomino: buildings/{b}/contatti/{id}. Si scrivono se sono
// cambiati, oppure se il documento non esiste ancora e il condomino viene
// salvato (record non migrato: i contatti passano dal vecchio record al nuovo
// documento nello stesso salvataggio).
function scriviContatti(writes, rec, prev, uid, condominoScritto) {
  const ref = contattiRef(rec);
  const nuovi = soloContatti(rec);
  const esiste = _contattiNoti.has(ref.path);
  const prima = prev ? soloContatti(prev) : null;
  const extra = { emailLower: nuovi.email ? String(nuovi.email).toLowerCase() : null };
  if (esiste) { scriviRecord(writes, ref, nuovi, prima || {}, uid, extra); return; }
  const cambiati = !prima || stableStringify(prima) !== stableStringify(nuovi);
  if (haContatti(nuovi) && (cambiati || condominoScritto)) scriviRecord(writes, ref, nuovi, null, uid, extra);
}

// Cancellazione logica di un condomino e dei suoi contatti. Un record non
// ancora migrato perde email e telefono (le regole non li accettano più nel
// condomino): passano in un documento contatti, cancellato anche lui.
function cancellaCondomino(writes, prev, uid) {
  const { deleteField, serverTimestamp } = window._fb;
  writes.push([recordRef('cm_condomini', prev), { ...cancellazione(uid),
    ...Object.fromEntries([...CAMPI_CONTATTO, 'emailLower'].map(k => [k, deleteField()])) }, { merge: true }]);
  const ref = contattiRef(prev);
  const contatti = soloContatti(prev);
  if (_contattiNoti.has(ref.path)) writes.push([ref, cancellazione(uid), { merge: true }]);
  else if (haContatti(contatti)) {
    writes.push([ref, { ...contatti, emailLower: contatti.email ? String(contatti.email).toLowerCase() : null,
      ...cancellazione(uid), _createdBy: uid, _createdAt: serverTimestamp() }, null]);
  }
}

// Modifiche e cancellazioni (scritture con merge) di record di cui si conosce
// la versione: se sul server la versione è cambiata, o il record è stato
// cancellato, qualcun altro ci ha lavorato dopo il caricamento della pagina.
async function controllaConflitti(key, writes) {
  const { getDoc } = window._fb;
  const note = _versioni[key];
  if (!note) return;
  const daControllare = writes.filter(([ref, , opts]) => opts && note.has(ref.path));
  const conflitti = [];
  await Promise.all(daControllare.map(async ([ref]) => {
    const snap = await getDoc(ref);
    const cur = snap.exists() ? snap.data() : null;
    if (!cur || cur._deleted || versioneDi(cur) !== note.get(ref.path)) conflitti.push(cur);
  }));
  if (conflitti.length) {
    const nome = (r) => r && (r.titolo || r.nome || r.descrizioneSintetica || r.descrizione);
    const nomi = conflitti.map(nome).filter(Boolean).slice(0, 3).map(n => '«' + n + '»').join(', ');
    const err = new Error((nomi ? nomi + ': ' : '') + (conflitti.length === 1 ? 'questa voce è stata modificata' : conflitti.length + ' voci sono state modificate')
      + ' da un\'altra persona dopo che hai aperto la pagina. Ricarica la pagina per vedere la versione aggiornata, poi ripeti la modifica.');
    err.code = 'conflitto';
    throw err;
  }
}

// Dopo il salvataggio si rilegge la versione dei record scritti, così la
// prossima modifica della stessa voce da questa pagina non risulta un conflitto.
async function aggiornaVersioni(key, writes) {
  const { getDoc } = window._fb;
  _versioni[key] = _versioni[key] || new Map();
  await Promise.all(writes.map(async ([ref]) => {
    try { const snap = await getDoc(ref); if (snap.exists()) _versioni[key].set(ref.path, versioneDi(snap.data())); }
    catch (e) { _versioni[key].delete(ref.path); } // versione sconosciuta: nessun controllo, come prima
  }));
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
    return true;
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
    avvisa('⚠️ Salvataggio non riuscito: ' + msg + '\nL’ultima modifica è stata annullata: i dati mostrati sono quelli salvati.');
    return false;
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

// Id e riferimenti finiscono in attributi HTML senza escape
// (data-edit-spesa="${s.id}"…): stessa forma che impongono le firestore.rules
// (isId). Audit 2026-10-19: un record già salvato con un id "avvelenato" non
// arriva alla pagina, un riferimento non valido diventa vuoto.
const ID_SICURO = /^[A-Za-z0-9_.-]{1,64}$/;
const CAMPI_RIF = ['edificioId', 'condominoId', 'fornitoreId', 'ricGruppoId', 'tabellaMillesimi', 'delibereRifId', 'verbaleRifId'];
function idSicuro(v) {
  return (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && ID_SICURO.test(v));
}
function conIdSicuri(r) {
  const o = { ...r };
  CAMPI_RIF.forEach(k => { if (o[k] != null && o[k] !== '' && !idSicuro(o[k])) o[k] = null; });
  if (Array.isArray(o.split)) o.split = o.split.filter(s => !s || typeof s !== 'object' || s.id == null || idSicuro(s.id));
  return o;
}

// Toglie i metadati (_updatedAt, _createdBy, …) e scarta i record cancellati.
function fromDocs(docs) {
  return docs.filter(d => {
    const id = d.data().id;
    if (ID_SICURO.test(d.id) && (id == null || idSicuro(id))) return true;
    console.warn('Record con id non valido ignorato:', d.ref.path.replace(/[^A-Za-z0-9_./-]/g, '?'));
    return false;
  }).map(d => d.data()).filter(d => !d._deleted)
    .map(d => conIdSicuri(Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('_') && k !== 'emailLower'))));
}

// Unisce ai condomini email e telefono letti da buildings/{b}/contatti (solo
// per amministratori ed editor). Se la lettura non riesce i condomini restano
// senza contatti: l'app funziona, ma senza email da mostrare o a cui scrivere.
async function conContatti(lista, edifici) {
  const { db, getDocs, collection } = window._fb;
  const perId = new Map();
  try {
    await Promise.all(edifici.map(async (ed) => {
      const docs = (await getDocs(collection(db, 'buildings', String(ed.id), 'contatti'))).docs;
      setVersioni('cm_condomini', docs);
      docs.forEach(d => { _contattiNoti.add(d.ref.path); const c = d.data(); if (!c._deleted) perId.set(String(ed.id) + '/' + d.id, c); });
    }));
  } catch (e) {
    console.warn('Contatti dei condomini non letti:', e.code || e.message);
    return lista;
  }
  return lista.map(m => {
    const c = perId.get(String(m.edificioId) + '/' + String(m.id));
    if (!c) return m;
    const o = { ...m };
    CAMPI_CONTATTO.forEach(k => { if (c[k] != null) o[k] = c[k]; });
    return o;
  });
}

// Carica edifici e dati per edificio: tutti per il superAdmin, solo il proprio
// per gli altri ruoli (le rules non permettono altro). Lancia un errore se non
// riesce: senza questi dati l'app non è utilizzabile.
async function fbLoadBuildings(profile) {
  const { db, doc, getDoc, getDocs, collection } = window._fb;
  let edifici;
  if (isSuperAdmin(profile)) {
    const docs = (await getDocs(collection(db, 'buildings'))).docs;
    setVersioni('cm_edifici', docs);
    edifici = fromDocs(docs);
  } else {
    const snap = await getDoc(doc(db, 'buildings', String(profile.edificioId)));
    if (snap.exists()) setVersioni('cm_edifici', [snap]);
    edifici = snap.exists() ? fromDocs([snap]) : [];
  }
  edifici.sort((a, b) => Number(a.id) - Number(b.id));
  const perKey = {};
  await Promise.all(RECORD_KEYS.filter(k => APPDATA_CONFIG[k].coll).map(async (key) => {
    const parts = await Promise.all(edifici.map(async (ed) => {
      const docs = (await getDocs(collection(db, 'buildings', String(ed.id), APPDATA_CONFIG[key].coll))).docs;
      setVersioni(key, docs);
      return fromDocs(docs);
    }));
    perKey[key] = parts.flat();
  }));
  if (perKey.cm_condomini && canUserEdit(profile)) perKey.cm_condomini = await conContatti(perKey.cm_condomini, edifici);
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
    'indirizzo', 'categoria', 'tipo', 'tipoSpesa', 'stato', 'data', 'scadenza', 'telefono', 'dataIngresso', 'dataUscita', 'notificaEmail', 'tabellaMillesimi'],
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
    if (passati.length > 0) { state.filterAnno = passati[0]; state.filterAnni = [passati[0]]; }
  }
}
