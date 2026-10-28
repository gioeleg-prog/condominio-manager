// Avvio dell'app: configurazione superAdmin, login (whoami), caricamento dei dati. Caricato per ultimo.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// Ricarica cm_config (SUPER_ADMIN_UID/EMAIL) da Firestore. Va richiamata sia
// al boot (best-effort) sia dopo il login (autoritativa).
async function loadSuperAdminConfig() {
  try {
    const { db, doc, getDoc } = window._fb;
    const cfgPromise = getDoc(doc(db, 'appdata', 'cm_config'));
    const cfgTimeout = new Promise(r => setTimeout(() => r(null), 8000));
    const snap = await Promise.race([cfgPromise, cfgTimeout]);
    if (snap && snap.exists && snap.exists()) {
      const d = snap.data();
      SUPER_ADMIN_UID   = d.superAdminUid   || SUPER_ADMIN_UID;
      SUPER_ADMIN_EMAIL = d.superAdminEmail || SUPER_ADMIN_EMAIL;
    }
  } catch(e) { console.warn('cm_config:', e.message); }
}

// LOG ACCESSI: ogni accesso riuscito (form o sessione persistente) lo
// registra la Cloud Function whoami in cm_login_stats, leggibile solo dal
// superAdmin (QA PRIV-01/INT-02). Struttura invariata, aggregata per
// utente/mese: { condominoId: { nome, ultimoLogin, totale, mensile } }.

// PERF-005: un token appena emesso (accesso fatto in questo momento) è già
// aggiornato, rinnovarlo costa un giro di rete inutile. Dopo un riavvio con
// sessione salvata il token può essere vecchio e il rinnovo resta obbligatorio
// (SEC-03). Un orologio indietro o un'età negativa contano come "non nuovo".
const ETA_MAX_TOKEN_NUOVO_MS = 60000;
function tokenAppenaEmesso(tokenResult, adesso = Date.now()) {
  const emesso = Date.parse(tokenResult && tokenResult.issuedAtTime);
  if (!Number.isFinite(emesso)) return false;
  const eta = adesso - emesso;
  return eta >= 0 && eta < ETA_MAX_TOKEN_NUOVO_MS;
}

// PERF-003: profilo provvisorio ricavato dal token (ruolo ed edificio), solo per
// far partire in anticipo la lettura dei dati dell'edificio mentre whoami è in
// corso. Non è mai autorevole: vale il profilo di whoami. null se il token non
// ha un ruolo utilizzabile (primo accesso: allora si aspetta whoami, come prima).
function profiloDaToken(tokenResult) {
  const c = (tokenResult && tokenResult.claims) || {};
  if (c.role === 'superAdmin') return { superAdmin: true, isAdmin: true, canEdit: true };
  if (['adminEdificio', 'editor', 'member'].includes(c.role) && c.buildingId != null && c.buildingId !== '') {
    return { edificioId: String(c.buildingId), isAdmin: c.role === 'adminEdificio', canEdit: c.role === 'adminEdificio' || c.role === 'editor' };
  }
  return null;
}
// La lettura anticipata si può adottare solo se il profilo di whoami ha lo stesso
// "taglio" di quello provvisorio: stesso edificio e stessa possibilità di vedere i contatti.
function letturaCoincideConProfilo(provvisorio, profilo) {
  if (!provvisorio || !profilo) return false;
  if (isSuperAdmin(provvisorio) !== isSuperAdmin(profilo)) return false;
  if (!isSuperAdmin(profilo) && String(provvisorio.edificioId) !== String(profilo.edificioId)) return false;
  return canUserEdit(provvisorio) === canUserEdit(profilo);
}

// PERF-007: millesimi, affitti e WhatsApp dell'edificio attivo si leggono insieme
// ai dati dell'edificio, prima del primo disegno: prima partivano dopo il disegno
// e ne richiedevano un secondo. Non fallisce mai (ogni lettura gestisce il proprio errore).
function precaricaImpostazioni(profilo) {
  const ed = isSuperAdmin(profilo) ? _cache.cm_edificio_attivo : profilo.edificioId;
  if (ed == null || ed === '') return Promise.resolve();
  const uid = (window._fb.auth.currentUser || {}).uid || '';
  return Promise.all([
    typeof caricaMillesimi === 'function' ? caricaMillesimi(ed) : null,
    typeof caricaAffitti === 'function' ? caricaAffitti(ed) : null,
    typeof caricaImpWa === 'function' && canUserAdmin(profilo) ? caricaImpWa(uid + '/' + ed, ed) : null,
  ]).catch(() => {});
}

// PERF-006: il registro accessi (solo superAdmin) si rilegge dopo il primo disegno,
// così include l'accesso appena registrato da whoami senza ritardare lo schermo.
async function rileggiLoginStats() {
  try {
    const { db, doc, getDoc } = window._fb;
    const snap = await getDoc(doc(db, 'appdata', 'cm_login_stats'));
    if (!snap.exists()) return;
    _cache.cm_login_stats = JSON.parse(snap.data().value);
    state.loginStats = _cache.cm_login_stats;
    if (state.user && state.page === 'impostazioni' && !state.modal && typeof renderPresto === 'function') renderPresto();
  } catch (e) { console.warn('cm_login_stats:', e.message); }
}

async function initApp() {
  // Mostra una schermata di caricamento SENZA campo password finché non sappiamo se
  // esiste già una sessione Firebase valida. Prima qui veniva mostrato subito il form di
  // login completo (con l'input password): Chrome, vedendo quel campo, avvia in background
  // il proprio flusso "compila password salvata" (che su Windows richiede il PIN di Windows
  // Hello prima di rivelare la password). Se nel frattempo la sessione Firebase risultava già
  // valida, l'app passava alla dashboard prima che Chrome avesse finito — e il PIN compariva
  // quando si era già dentro. Mostrando qui uno schermo neutro (nessun input password) e il
  // vero form di login solo quando sappiamo per certo che serve (utente non autenticato, o
  // timeout di 5s scaduto), quel trigger non scatta più per chi ha già una sessione valida.
  document.getElementById('app').innerHTML = renderLoading();

  // Aspetta che Firebase SDK sia pronto
  if (!window._fbReady) {
    await new Promise(resolve => {
      document.addEventListener('fb-ready', resolve, {once: true});
      setTimeout(resolve, 5000); // timeout fallback 5s
    });
  }

  if (!window._fb) {
    // Firebase non disponibile — modalità offline con localStorage
    console.warn('Firebase non disponibile, uso localStorage');
    render();
    return;
  }

  // Caricamento INIZIALE best-effort: se le regole Firestore richiedono
  // autenticazione, questo può fallire con "Missing or insufficient permissions"
  // per un utente non ancora loggato — non è un errore bloccante, serve solo
  // a velocizzare l'avvio quando possibile. Il caricamento AUTORITATIVO,
  // quello da cui dipende il login, avviene sempre dentro onAuthStateChanged qui sotto.
  // Prestazioni (2026-10-21): qui si caricavano appdata e cm_config prima di
  // sapere se c'è una sessione. Senza sessione le regole li negano (lettura
  // solo per chi ha fatto l'accesso), con la sessione si rileggevano subito dopo
  // in onAuthStateChanged: due giri di rete persi prima del form o della dashboard.

  // Ascolta cambiamenti auth
  const { auth, onAuthStateChanged } = window._fb;
  onAuthStateChanged(auth, async (firebaseUser) => {
    let rileggiStats = false;
    if (firebaseUser) {
      const wasLoggedOut = !state.user;

      // SEC-03: da quando le firestore.rules leggono request.auth.token.role per
      // decidere l'accesso a cm_spese/cm_entrate/cm_fornitori, il token ID appena
      // ottenuto da onAuthStateChanged può non riflettere ancora un custom claim
      // aggiornato di recente (bug reale osservato in test: fbLoadAll falliva sulle
      // sole chiavi riservate al superAdmin subito dopo login, per poi funzionare
      // al retry). Forziamo un refresh esplicito prima di qualunque lettura.
      // PERF-005: se il token è appena stato emesso (accesso fatto ora) il rinnovo si salta.
      let tokenPrima = await firebaseUser.getIdTokenResult().catch(() => null);
      if (!tokenAppenaEmesso(tokenPrima)) {
        try { await firebaseUser.getIdToken(true); } catch(e) { console.warn('token refresh:', e.message); }
        tokenPrima = await firebaseUser.getIdTokenResult().catch(() => null);
      }

      // Ricarica SEMPRE i dati ora che l'autenticazione è confermata: se il
      // caricamento pre-login sopra è fallito per permessi, questo È il
      // tentativo che deve riuscire. Senza questo, con regole Firestore che
      // richiedono l'auth, ogni primo login su un browser "pulito" fallisce
      // con "Account non configurato" perché state.condomini resta sui dati
      // demo di default invece dei condomini veri.
      // whoami parte subito, insieme ad appdata e cm_config (non dipende da
      // loro): prima erano tre attese in fila.
      const { functionsInstance, httpsCallable } = window._fb;
      const whoamiP = httpsCallable(functionsInstance, 'whoami')().then(resp => ({ resp }), err => ({ err }));
      // PERF-003: con ruolo ed edificio già nel token, i dati dell'edificio si leggono
      // subito, insieme a whoami. Il risultato si adotta solo se whoami conferma lo
      // stesso edificio e gli stessi diritti di modifica; altrimenti si rilegge con il suo profilo.
      const provvisorio = profiloDaToken(tokenPrima);
      const letturaP = provvisorio
        ? fbLoadBuildings(provvisorio, { soloLettura: true }).then(r => ({ r }), e => ({ e }))
        : null;
      // PERF-006: chi ha un ruolo non superAdmin nel token non chiede cm_config
      // (le rules lo negano). Il registro accessi non si legge qui (rileggiLoginStats).
      const saltaConfig = !!provvisorio && !provvisorio.superAdmin;
      try {
        await Promise.all([fbLoadAll({ senzaLoginStats: true }).then(applyLoadedDataFromCache), saltaConfig ? null : loadSuperAdminConfig()]);
      } catch(e) {
        console.error('Caricamento dati dopo login fallito:', e.message);
        await window._fb.signOut(auth);
        state.user = null; render();
        const b = document.getElementById('btn-login');
        if (b) { b.disabled=false; b.textContent='Accedi'; }
        showLoginErr('Impossibile caricare i dati dell\u0027app. Controlla la connessione e riprova.');
        return;
      }

      // Audit 2026-09 (lettura cross-edificio): il profilo non si cerca più
      // dentro l'intero cm_condomini (che le rules ora non lasciano leggere ai
      // non-superAdmin), ma tramite la Cloud Function whoami — che lo cerca
      // lato server, restituisce SOLO il proprio record, collega l'uid e
      // provisiona il ruolo al primo accesso.
      let profile;
      try {
        const { resp, err } = await whoamiP;
        if (err) throw err;
        profile = resp.data?.profile;
        // whoami può aver appena assegnato il custom claim (primo accesso): il
        // token in mano al client non lo riflette ancora e le rules negherebbero
        // la lettura di buildings/** qui sotto. Si rinnova solo in quel caso:
        // whoami assegna i permessi solo a chi non ne ha (prima: sempre, un giro
        // di rete in più a ogni accesso).
        if (!tokenPrima?.claims?.role) await firebaseUser.getIdToken(true);
      } catch (err) {
        const code = err.code || err.message || '';
        await window._fb.signOut(auth);
        state.user = null; render();
        const b = document.getElementById('btn-login');
        if (b) { b.disabled=false; b.textContent='Accedi'; }
        // Messaggi noti da whoami; qualunque altro errore → generico.
        const msg = /not-found/.test(code) ? "Account non configurato. Contatta l'amministratore."
          : /already-exists/.test(code) ? "Questo profilo risulta già collegato a un altro account."
          : /failed-precondition/.test(code) ? (err.message || "Impossibile completare l'accesso.")
          : "Impossibile completare l'accesso. Riprova.";
        showLoginErr(msg);
        return;
      }

      if (!profile || profile.disabled) {
        await window._fb.signOut(auth); state.user = null; render();
        const b = document.getElementById('btn-login');
        if (b) { b.disabled=false; b.textContent='Accedi'; }
        // QA: per un account disattivato prima non compariva alcun messaggio.
        showLoginErr(!profile ? "Account non configurato. Contatta l'amministratore."
          : "Il tuo account è stato disattivato. Contatta l'amministratore del condominio.");
        return;
      }
      // Fase 2 (REB-01): edifici e dati per edificio si leggono direttamente da
      // buildings/** — le rules lasciano leggere a ciascuno solo il proprio
      // edificio (tutti al superAdmin). Senza questi dati l'app non è usabile:
      // se il caricamento fallisce, si esce con un messaggio.
      // PERF-007: le impostazioni dell'edificio partono ora, in parallelo alla lettura dei dati.
      const impostazioniP = precaricaImpostazioni(profile);
      try {
        let dati = null;
        if (letturaP && letturaCoincideConProfilo(provvisorio, profile)) {
          const anticipata = await letturaP;
          if (anticipata.r) dati = anticipata.r;
        }
        // Nessuna lettura anticipata utile (primo accesso, profilo diverso dal token, errore): come prima.
        if (!dati) dati = await fbLoadBuildings(profile, { soloLettura: true });
        fbApplicaBuildings(dati);
        await impostazioniP;
      } catch (err) {
        console.error('Caricamento edifici fallito:', err.code || err.message || err);
        await window._fb.signOut(auth); state.user = null; render();
        const b = document.getElementById('btn-login');
        if (b) { b.disabled=false; b.textContent='Accedi'; }
        showLoginErr('Impossibile caricare i dati del condominio. Controlla la connessione e riprova.');
        return;
      }
      state.user = profile;
      if (!isSuperAdmin(profile) && profile.edificioId) {
        state.edificioAttivo = profile.edificioId;
        // Solo in cache (applyLoadedDataFromCache qui sotto la rilegge), mai
        // su Firestore: cm_edificio_attivo è un documento unico condiviso,
        // riservato al superAdmin dalle rules.
        _cache.cm_edificio_attivo = profile.edificioId;
      } else if (isSuperAdmin(profile) && !_cache.cm_edifici.some(e => e.id === _cache.cm_edificio_attivo) && _cache.cm_edifici[0]) {
        _cache.cm_edificio_attivo = _cache.cm_edifici[0].id;
      }
      applyLoadedDataFromCache();
      if (wasLoggedOut) state.page = 'dashboard'; // l'accesso lo registra whoami (lato server)
      rileggiStats = isSuperAdmin(profile);
    } else {
      state.user = null;
    }
    render();
    if (rileggiStats) rileggiLoginStats(); // dopo il disegno: lo mostra solo il superAdmin, in Impostazioni
  });
}

// Aggiorna logout per usare Firebase signOut
const _origBindApp = bindApp;

initApp();
