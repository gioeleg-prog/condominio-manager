// Accesso: schermata di login, Google, password.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// ===========================
// PASSWORD MANAGEMENT — Firebase Auth
// ===========================
// Le password sono gestite da Firebase Authentication.
// getUserPassword e setUserPassword rimangono come stub
// per compatibilità con il codice di validazione UI;
// il login reale usa signInWithEmailAndPassword.
// ═══ PASSWORD: gestite ESCLUSIVAMENTE da Firebase Auth ═══
// Nessuna password salvata in chiaro — né locale né Firestore.
function getPasswords()    { return {}; }

function getUserPassword() { return null; }

function setUserPassword() { /* no-op: le password vivono solo su Firebase Auth */ }

// Cambia password dell'utente corrente su Firebase Auth
async function fbChangePassword(currentPw, newPw) {
  const { auth, reauthenticateWithCredential, EmailAuthProvider, updatePassword } = window._fb;
  const user = auth.currentUser;
  if (!user) throw new Error('Nessun utente autenticato');
  const cred = EmailAuthProvider.credential(user.email, currentPw);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPw);
}

// Reset password utente da admin: Firebase invia email di reset
async function fbAdminSetPassword(userId, newPw) {
  // Le password non possono essere impostate direttamente dal client.
  // Usa il pulsante "Invia email di reset" nel profilo del condomino.
}

function validatePassword(pw) {
  const errors = [];
  if (!pw || pw.length < 8) errors.push('almeno 8 caratteri');
  if (!/[A-Z]/.test(pw)) errors.push('almeno una lettera maiuscola');
  if (!/[0-9]/.test(pw)) errors.push('almeno un numero');
  return errors;
}

// ===========================
// LOGIN
// ===========================
function renderLogin() {
  return `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-logo">
        <div class="login-logo-icon">${svgHome()}</div>
        <div>
          <div style="font-weight:800;font-size:1.15rem;color:var(--text)">${esc(getBranding().nomeProdotto)}</div>
          <div style="font-size:12px;color:var(--text2)">Accesso privato e sicuro</div>
        </div>
      </div>

      <h2 style="font-size:1.2rem;margin-bottom:.25rem">Accedi</h2>
      <p class="sub" style="margin-bottom:1.25rem">Inserisci le tue credenziali. Solo tu puoi vedere il tuo condominio.</p>

      <div class="field">
        <label>Email</label>
        <input type="text" id="inp-login"
          placeholder="Es. mario@email.it"
          autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" autofocus>
        <p class="hint">Usa l'email con cui l'amministratore ha creato il tuo account.</p>
      </div>
      <div class="field">
        <label>Password</label>
        <input type="password" id="inp-pw" placeholder="••••••••" autocomplete="current-password">
      </div>
      <div id="login-err" style="color:var(--red);font-size:13px;margin-bottom:.75rem;display:none"></div>
      <button class="btn btn-primary" style="width:100%;margin-top:.25rem" id="btn-login">Accedi</button>
      <button type="button" id="btn-forgot" style="background:none;border:none;color:var(--accent);font-size:13px;cursor:pointer;margin-top:.5rem;width:100%;text-decoration:underline">Password dimenticata? Invia email di reset</button>
      <div style="display:flex;align-items:center;gap:.75rem;margin:1rem 0 .75rem">
        <div style="flex:1;height:1px;background:var(--border)"></div>
        <span style="font-size:12px;color:var(--text2)">oppure</span>
        <div style="flex:1;height:1px;background:var(--border)"></div>
      </div>
      <button type="button" id="btn-login-google" class="btn btn-secondary" style="width:100%;display:flex;align-items:center;justify-content:center;gap:.5rem">
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Accedi con Google
      </button>
      <div style="text-align:center;margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border)">
        <span style="font-size:11px;color:var(--text2)">Powered by <strong>${esc(getBranding().fornitore)}</strong></span>
      </div>
    </div>
  </div>`;
}

function bindLogin() {
  // Ogni volta che la schermata di login viene (ri)montata, azzera un
  // eventuale collegamento Google rimasto in sospeso da un tentativo
  // precedente abbandonato: altrimenti il clic successivo salterebbe alla
  // richiesta password con una credenziale ormai scaduta, invece di
  // riaprire un popup Google fresco.
  window.__pendingGoogleLink = null;

  const bl = document.getElementById('btn-login');
  if (bl) bl.onclick = doLogin;
  // Enter su username → focus password; Enter su password → login
  const inpLogin = document.getElementById('inp-login');
  const inpPw    = document.getElementById('inp-pw');
  // Se l'utente cambia l'email, annulla il collegamento in sospeso: la
  // password andrebbe verificata contro l'email del popup, non una nuova.
  if (inpLogin) inpLogin.oninput = () => { window.__pendingGoogleLink = null; };
  if (inpLogin) inpLogin.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); inpPw?.focus(); }
  };
  if (inpPw) inpPw.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); doLogin(); }
  };


  const bg = document.getElementById('btn-login-google');
  if (bg) bg.onclick = async () => {
    if (!window._fb) { showLoginErr('Connessione richiesta.'); return; }
    const { auth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, linkWithCredential } = window._fb;

    // Fase 2 del collegamento automatico: un tentativo precedente ha trovato
    // che l'email Google ha già un account con password (caso B/C). Chiediamo
    // la password UNA volta — Firebase non consente di agganciare Google a un
    // account esistente senza provarne il possesso (altrimenti un Gmail omonimo
    // lo ruberebbe) — poi colleghiamo la credenziale Google già ottenuta.
    if (window.__pendingGoogleLink) {
      const pw = (document.getElementById('inp-pw')?.value || '').trim();
      if (!pw) { showLoginErr('Inserisci la password dell’account per collegare Google.'); return; }
      bg.disabled = true;
      const { email, credential } = window.__pendingGoogleLink;
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, email, pw);
      } catch (e2) {
        // Password sbagliata: lo stato pending resta, così può riprovare.
        bg.disabled = false;
        showLoginErr(e2.code === 'auth/wrong-password' || e2.code === 'auth/invalid-credential'
          ? 'Password errata. Riprova per collegare Google.'
          : ('Accesso non riuscito: ' + (e2.message || e2)));
        return;
      }
      // Login riuscito: consumiamo il pending a prescindere dall'esito del
      // collegamento, per non lasciarlo appeso. onAuthStateChanged prosegue.
      window.__pendingGoogleLink = null;
      try {
        await linkWithCredential(cred.user, credential);
        // Collegato: dal prossimo accesso Google funziona diretto.
      } catch (e3) {
        // Sei comunque entrato (via password); solo il collegamento Google non
        // è riuscito (es. credenziale del popup scaduta). Nessun blocco: al
        // prossimo tentativo con Google si ripropone il collegamento.
        console.warn('Collegamento Google non riuscito (accesso comunque effettuato):', e3.code || e3);
      }
      return;
    }

    bg.disabled = true;
    try {
      // La verifica in due passaggi, se attiva sull'account Google, la gestisce
      // Google stesso durante il popup. Poi onAuthStateChanged/whoami verifica
      // che l'email corrisponda a un condomino: altrimenti rifiuta l'accesso.
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      // onAuthStateChanged prosegue da solo (whoami, caricamento dati).
    } catch (e) {
      bg.disabled = false;
      const code = e.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      if (code === 'auth/account-exists-with-different-credential') {
        // Caso B/C: email con account password esistente. Conserviamo la
        // credenziale Google e l'email, prefilliamo il campo e chiediamo la
        // password per completare il collegamento al prossimo clic.
        const credential = GoogleAuthProvider.credentialFromError(e);
        const email = e.customData?.email || '';
        if (credential && email) {
          window.__pendingGoogleLink = { email, credential };
          const inp = document.getElementById('inp-login');
          if (inp) inp.value = email;
          showLoginErr('Questo è il tuo primo accesso con Google. Inserisci qui la password del tuo account e premi di nuovo "Accedi con Google" per collegarlo (una volta sola).');
          document.getElementById('inp-pw')?.focus();
        } else {
          showLoginErr('Accesso con Google non riuscito. Accedi con la password.');
        }
      } else if (code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed') {
        // signup disattivato o provider non abilitato: nessun account per
        // questa email Google (casi A/D).
        showLoginErr('Nessun account associato a questa email Google. Contatta l’amministratore.');
      } else {
        showLoginErr(e.message || 'Accesso con Google non riuscito.');
      }
    }
  };

  const bf = document.getElementById('btn-forgot');
  if (bf) bf.onclick = async () => {
    const email = (document.getElementById('inp-login')?.value||'').trim();
    if (!email) { showLoginErr('Inserisci la tua email prima di cliccare reset.'); return; }
    if (!window._fb) { showLoginErr('Connessione richiesta.'); return; }
    // QA: stessa risposta se l'email non è registrata, per non rivelare quali
    // email hanno un account.
    const ok = () => {
      const el = document.getElementById('login-err');
      if (el) { el.style.color='var(--green)'; el.style.display='block'; el.textContent='✅ Se l’email è registrata riceverai a breve il link per reimpostare la password. Controlla anche lo spam.'; }
    };
    try {
      const { auth, sendPasswordResetEmail } = window._fb;
      await sendPasswordResetEmail(auth, email);
      ok();
    } catch(e) {
      if (e.code === 'auth/user-not-found') ok();
      else showLoginErr(e.code === 'auth/invalid-email' ? 'Indirizzo email non valido.' : (e.message || 'Invio non riuscito. Riprova.'));
    }
  };
}

async function doLogin() {
  // L'utente sceglie il login con password: annulla un eventuale collegamento
  // Google in sospeso (non vogliamo che un clic Google successivo riusi un
  // pending vecchio).
  window.__pendingGoogleLink = null;
  const loginInput = (document.getElementById('inp-login')?.value || '').trim();
  const pw         = (document.getElementById('inp-pw')?.value   || '').trim();
  if (!loginInput) { showLoginErr('Inserisci username o email'); return; }
  if (!pw)         { showLoginErr('Inserisci la password'); return; }

  const btn = document.getElementById('btn-login');
  if (btn) { btn.disabled = true; btn.textContent = 'Accesso in corso…'; }

  try {
    if (!window._fb) {
      showLoginErr('Connessione a Firebase richiesta. Controlla la rete.');
      if (btn) { btn.disabled = false; btn.textContent = 'Accedi'; }
      return;
    }
    const { auth, signInWithEmailAndPassword } = window._fb;
    await signInWithEmailAndPassword(auth, loginInput, pw);
    // onAuthStateChanged completerà il login
  } catch(e) {
    console.error('Login error:', e.code, e.message);
    // QA: email inesistente e password errata danno lo stesso messaggio, così
    // dalla schermata di login non si può scoprire quali email sono registrate.
    const msg = e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential' || e.code === 'auth/user-not-found'
      ? 'Email o password non corrette. Hai dimenticato la password? Usa il link qui sotto per riceverla via email.'
      : e.code === 'auth/invalid-email'
      ? 'Indirizzo email non valido. Inserisci una email nel formato corretto (es. nome@esempio.it).'
      : e.code === 'auth/too-many-requests'
      ? 'Troppi tentativi falliti. Attendi qualche minuto oppure usa "Password dimenticata?" per resettarla.'
      : e.code === 'auth/network-request-failed'
      ? 'Errore di rete. Controlla la connessione internet e riprova.'
      : e.code === 'auth/unauthorized-domain'
      ? 'Accesso non autorizzato da questo dominio. Contatta l amministratore.'
      : e.code === 'auth/user-disabled'
      ? 'Account disabilitato. Contatta l amministratore.'
      : 'Accesso non riuscito. Verifica email e password e riprova.';
    showLoginErr(msg);
    if (btn) { btn.disabled = false; btn.textContent = 'Accedi'; }
  }
}

function showLoginErr(msg) {
  const el = document.getElementById('login-err');
  // Reimposta il colore rosso: un messaggio di errore mostrato dopo un avviso
  // verde (es. "email di reset inviata") altrimenti resterebbe verde.
  if (el) { el.style.color = 'var(--red)'; el.textContent = msg; el.style.display = 'block'; }
}

function renderModalChangePw() {
  const u = state.user;
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal">
      <div class="modal-header">
        <h2>🔑 Cambia password</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;align-items:center;gap:10px;padding:.75rem;background:var(--surface2);border-radius:var(--radius-sm);margin-bottom:1rem">
          <div class="avatar" style="${avatarStyle(u.color)}">${initials(u.nome)}</div>
          <div>
            <div style="font-weight:600">${esc(u.nome)}</div>
            <div style="font-size:12px;color:var(--text2)">${esc(u.email||'')} · ${u.isAdmin?'Amministratore':esc(u.appartamento)}</div>
          </div>
        </div>
        <div class="field">
          <label>Password attuale *</label>
          <input type="password" id="cp-current" placeholder="Password attuale">
        </div>
        <div class="field">
          <label>Nuova password *</label>
          <input type="password" id="cp-new1" placeholder="Nuova password">
          <p class="hint">Almeno 8 caratteri · almeno una maiuscola · almeno un numero</p>
        </div>
        <div class="field">
          <label>Conferma nuova password *</label>
          <input type="password" id="cp-new2" placeholder="Ripeti la nuova password">
        </div>
        <div id="cp-rules" style="font-size:12px;margin-bottom:.5rem;min-height:18px"></div>
        <div id="cp-err" class="alert alert-warning" style="display:none"></div>
        <div id="cp-ok" class="alert alert-success" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        <button class="btn btn-primary" id="btn-cp-save">✅ Salva nuova password</button>
      </div>
    </div>
  </div>`;
}

function renderModalAdminResetPw(cond) {
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal">
      <div class="modal-header">
        <h2>🔑 Password — ${esc(cond.nome)}</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;align-items:center;gap:10px;padding:.75rem;background:var(--surface2);border-radius:var(--radius-sm);margin-bottom:1rem">
          <div class="avatar" style="${avatarStyle(cond.color)}">${initials(cond.nome)}</div>
          <div>
            <div style="font-weight:600">${esc(cond.nome)}</div>
            <div style="font-size:12px;color:var(--text2)">${esc(cond.email||'')} · ${esc(cond.appartamento)}</div>
          </div>
        </div>
        <div class="alert alert-info" style="font-size:13px;margin-bottom:1rem">
          Le password sono gestite da Firebase Authentication: non possono essere impostate da qui direttamente. Usa una delle due opzioni sotto.
        </div>
        ${cond.email ? `
        <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:.85rem;margin-bottom:1rem">
          <div style="font-weight:600;font-size:13px;margin-bottom:.4rem">1. Imposta tu la password (consigliato)</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:.6rem">Vai su Firebase Console → Authentication, cerca <strong>${esc(cond.email)}</strong>, elimina l'account esistente e ricrealo con la nuova password. Comunicala poi al condomino in modo sicuro.</div>
          <a href="https://console.firebase.google.com/project/condominio-manager-9e99a/authentication/users"
             target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="text-decoration:none;width:100%;text-align:center;display:block">
            🔥 Apri Firebase Console → Authentication
          </a>
        </div>
        <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:.85rem">
          <div style="font-weight:600;font-size:13px;margin-bottom:.4rem">2. Email di reset automatica</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:.6rem">Firebase invia a ${esc(cond.email)} un link per scegliere una nuova password da solo/a.</div>
          <button class="btn btn-secondary btn-sm" id="btn-save-reset-admin" data-id="${cond.id}" style="width:100%">✉️ Invia email di reset</button>
        </div>
        <div id="reset-admin-ok" class="alert alert-success" style="display:none;margin-top:.75rem"></div>
        <div id="reset-admin-err" class="alert alert-warning" style="display:none;margin-top:.75rem"></div>
        ` : `
        <div class="alert alert-warning" style="font-size:13px">
          ⚠️ Nessuna email associata a questo account. Aggiungila prima nel profilo del condomino.
        </div>`}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Chiudi</button>
      </div>
    </div>
  </div>`;
}

// Schede di cambio e reset della password. Chiamata da bindModal() (schede.js).
function bindSchedaPassword() {
  // Reset password admin
  const bResetAdmin = document.getElementById('btn-save-reset-admin');
  if (bResetAdmin) bResetAdmin.onclick = async () => {
    const id    = parseInt(bResetAdmin.dataset.id);
    const okEl  = document.getElementById('reset-admin-ok');
    const errEl = document.getElementById('reset-admin-err');
    if (errEl) errEl.style.display = 'none';
    const cond = state.condomini.find(c => c.id === id);
    if (!cond?.email) { if(errEl){errEl.textContent='Nessuna email configurata per questo condomino.';errEl.style.display='block';} return; }
    if (!window._fb) { if(errEl){errEl.textContent='Connessione a Firebase richiesta.';errEl.style.display='block';} return; }
    try {
      const { auth, sendPasswordResetEmail } = window._fb;
      await sendPasswordResetEmail(auth, cond.email);
      okEl.textContent = '✅ Email di reset inviata a ' + cond.email;
      okEl.style.display = 'block';
      setTimeout(()=>setState({modal:null}), 2500);
    } catch(e) {
      if (errEl) {
        errEl.textContent = e.code === 'auth/user-not-found'
          ? 'Nessun account Firebase con questa email. Crealo prima in Firebase Console → Authentication.'
          : 'Errore: ' + e.message;
        errEl.style.display = 'block';
      }
    }
  };
  // Change password (own)
  const cp1 = document.getElementById('cp-new1');
  if (cp1) {
    cp1.oninput = () => {
      const errs = validatePassword(cp1.value);
      const el = document.getElementById('cp-rules');
      if (!cp1.value) { el.innerHTML=''; return; }
      el.innerHTML = errs.length===0
        ? '<span style="color:var(--green)">✅ Password valida</span>'
        : errs.map(e=>`<span style="color:var(--red)">✗ ${e}</span>`).join(' &nbsp;');
    };
  }
  const bcps = document.getElementById('btn-cp-save');
  if (bcps) bcps.onclick = async () => {
    const cur = document.getElementById('cp-current').value;
    const n1  = document.getElementById('cp-new1').value;
    const n2  = document.getElementById('cp-new2').value;
    const errEl = document.getElementById('cp-err');
    const okEl  = document.getElementById('cp-ok');
    errEl.style.display='none'; okEl.style.display='none';
    if (!cur) { errEl.textContent='Inserisci la password attuale'; errEl.style.display='block'; return; }
    const errs = validatePassword(n1);
    if (errs.length>0) { errEl.textContent='Password non valida: '+errs.join(', '); errEl.style.display='block'; return; }
    if (n1 !== n2) { errEl.textContent='Le password non coincidono'; errEl.style.display='block'; return; }
    try {
      if (!window._fb) throw new Error('Connessione a Firebase richiesta per cambiare la password.');
      await fbChangePassword(cur, n1);
      okEl.textContent='✅ Password aggiornata con successo!';
      okEl.style.display='block';
      setTimeout(()=>setState({modal:null}), 1500);
    } catch(e) {
      errEl.textContent = e.code==='auth/wrong-password'||e.code==='auth/invalid-credential'
        ? 'Password attuale non corretta'
        : (e.message||'Errore aggiornamento password');
      errEl.style.display='block';
    }
  };
}
