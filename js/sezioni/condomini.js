// Condomini: elenco, scheda, disattivazione, procedura guidata per un nuovo utente.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// ===========================
// CONDOMINI
// ===========================
function renderCondomini() {
  // Solo admin e superAdmin possono accedere
  if (!canUserAdmin(state.user)) {
    return '<div class="page"><div class="empty"><p>Accesso non autorizzato.</p></div></div>';
  }
  const canEdit = canUserAdmin(state.user);
  const myEdId3 = getUserEdificio(state.user);
  // STRICT: solo condomini dell'edificio attivo (superAdmin vede quelli dell'edificio selezionato)
  const tuttiCondomini = state.condomini
    .filter(c => c.edificioId === state.edificioAttivo);
  const attivi      = tuttiCondomini.filter(c=>!c.disabled);
  const disabilitati= tuttiCondomini.filter(c=>c.disabled);
  // Anno del filtro (come il "📊 Bilancio" a cui porta la scheda); "Tutti" = anno corrente.
  const anno = state.filterAnno || new Date().getFullYear();

  return `
  <div>
    <div class="page-header">
      <div><div class="page-title">Condomini ${btnGuida()}</div><div class="page-sub">${attivi.length} appartamenti attivi</div></div>
      ${canEdit?`<button class="btn btn-primary" id="btn-add-cond">+ Aggiungi condomino</button>`:''}
    </div>

    <div class="condomini-grid">
      ${attivi.map(c=>{
        const totVersato = state.entrate.filter(e=>e.condominoId===c.id && !e.previsionale && annoDi(e.data)===anno).reduce((a,e)=>a+parseFloat(e.importo||0),0);
        const edName     = (state.edifici.find(e=>e.id===(c.edificioId||state.edificioAttivo))||{nome:'—'}).nome;
        return `<div class="utente-card">
          <div class="uc-head">
            <div class="avatar-lg" style="${avatarStyle(c.color)}">${initials(c.nome)}</div>
            <div style="flex:1;min-width:0">
              <div class="uc-name">${esc(c.nome)}</div>
              <div class="uc-apt">🏠 ${esc(c.appartamento)}</div>
              ${c.username?`<div style="font-size:11px;color:var(--text2)">👤 ${esc(c.username)}</div>`:''}
            </div>
          </div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:.5rem;display:flex;flex-direction:column;gap:2px">
            ${c.email?`<div>📧 ${esc(c.email)}</div>`:''}
            <div>🏢 ${esc(edName)}</div>
          </div>
          <div class="uc-ruolo-bar" style="margin-bottom:.75rem">
            <span class="badge ${getRuoloBadgeClass(c)}">${getRuoloLabel(c)}</span>
            <span style="font-size:11px;color:var(--green);margin-left:8px">✓ ${fmt(totVersato)} versato ${anno}</span>
          </div>
          <div class="uc-actions" style="flex-wrap:wrap;gap:.35rem">
            ${canEdit?`
            <button class="btn btn-secondary btn-sm" data-edit-cond="${c.id}" title="Modifica anagrafica">✏️ Modifica</button>
            <button class="btn btn-secondary btn-sm" data-bilancio-cond="${c.id}" style="color:var(--accent)" title="Vedi bilancio individuale">📊 Bilancio</button>
            <button class="btn btn-secondary btn-sm" data-disable-cond="${c.id}" style="color:var(--amber)" title="Archivia — il condomino non potrà più accedere ma i dati restano">⏸ Archivia</button>
            ${isSuperAdmin(state.user)?`<button class="btn btn-secondary btn-sm" data-reset-pw-cond="${c.id}" title="Reset password — imposta una nuova password temporanea">🔑 Reset PW</button>`:''}
            <button class="btn btn-danger btn-sm" data-del-cond="${c.id}" title="Elimina definitivamente — attenzione: i versamenti restano nello storico">🗑 Elimina</button>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>

    ${disabilitati.length>0?`
    <div class="section-divider" style="margin-top:1.5rem"><h3>📦 Archiviati</h3></div>
    <div class="condomini-grid">
      ${disabilitati.map(c=>`<div class="utente-card" style="background:var(--surface2);border-style:dashed">
        <div class="uc-head">
          <div class="avatar-lg" style="${avatarStyle(c.color)}">${initials(c.nome)}</div>
          <div style="flex:1"><div class="uc-name">${esc(c.nome)}</div><div class="uc-apt">🏠 ${esc(c.appartamento)}</div></div>
          <span class="badge badge-gray">Archiviato</span>
        </div>
        ${canEdit?`<div class="uc-actions" style="margin-top:.75rem">
          <button class="btn btn-secondary btn-sm" data-enable-cond="${c.id}" title="Riattiva — il condomino potrà tornare ad accedere">▶ Riattiva</button>
          <button class="btn btn-danger btn-sm" data-del-cond="${c.id}" title="Elimina definitivamente dall'archivio">🗑 Elimina</button>
        </div>`:''}
      </div>`).join('')}
    </div>`:''}
  </div>`;
}

function renderModalFirebaseUserCreated(u) {
  const pfu = state._pendingFirebaseUser || {};
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <h2>✅ Utente creato</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="alert alert-success" style="margin-bottom:1rem">
          Il profilo di <strong>${esc(u.nome)}</strong> è stato salvato su Firestore.
        </div>
        <div class="alert alert-warning" style="font-size:13px;margin-bottom:1rem">
          <strong>⚠️ Ultimo passaggio richiesto</strong><br>
          Devi creare manualmente l'account su <strong>Firebase Authentication</strong> perché l'app non ha permessi admin lato client.
        </div>
        <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:1rem;font-size:13px;margin-bottom:1rem">
          <div style="font-weight:600;margin-bottom:.75rem">Fai così:</div>
          <div style="display:flex;flex-direction:column;gap:.5rem">
            <div>1️⃣ Apri <a href="https://console.firebase.google.com/project/condominio-manager-9e99a/authentication/users" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">Firebase Console → Authentication</a></div>
            <div>2️⃣ Clicca <strong>"Aggiungi utente"</strong></div>
            <div>3️⃣ Email: <code style="background:white;padding:2px 6px;border-radius:4px;border:1px solid var(--border)">${esc(u.email||'(nessuna email inserita)')}</code></div>
            <div>4️⃣ Password: la password che hai impostato nel wizard</div>
            <div>5️⃣ Clicca <strong>"Aggiungi utente"</strong></div>
          </div>
        </div>
        <p style="font-size:12px;color:var(--text2)">Fatto questo, il condomino potrà accedere con email e password.</p>
      </div>
      <div class="modal-footer">
        <a href="https://console.firebase.google.com/project/condominio-manager-9e99a/authentication/users" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="text-decoration:none">
          🔥 Apri Firebase Console
        </a>
        <button class="btn btn-secondary" id="modal-cancel">Chiudi</button>
      </div>
    </div>
  </div>`;
}

// ===========================
// MODAL DISABILITA UTENTE
// ===========================
function renderModalDisableCond(cond) {
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:460px">
      <div class="modal-header">
        <h2>⏸ Disabilita utente</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;align-items:center;gap:12px;padding:.875rem;background:var(--surface2);border-radius:var(--radius-sm);margin-bottom:1.25rem">
          <div class="avatar-lg" style="${avatarStyle(cond.color)}">${initials(cond.nome)}</div>
          <div>
            <div style="font-weight:700">${esc(cond.nome)}</div>
            <div style="font-size:12px;color:var(--text2)">🏠 ${esc(cond.appartamento)} · ${esc(cond.email||'—')}</div>
          </div>
        </div>
        <div class="alert alert-warning" style="margin-bottom:1rem">
          <strong>L'utente verrà disabilitato</strong> e non potrà più accedere al sistema. Tutte le spese, i versamenti e lo storico rimarranno intatti e visibili nella sezione archivio.
        </div>
        <div class="field">
          <label>Motivazione (opzionale)</label>
          <input type="text" id="disable-note" placeholder="Es. Cambio proprietà — venduta a Mario Bianchi" maxlength="120">
          <p class="hint">Questa nota apparirà nella card archivio come riferimento</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        <button class="btn btn-primary" id="btn-confirm-disable" data-uid="${cond.id}" style="background:var(--amber);border-color:var(--amber)">⏸ Conferma disabilitazione</button>
      </div>
    </div>
  </div>`;
}

// ===========================
// WIZARD NUOVO UTENTE
// ===========================
function renderModalNuovoUtente() {
  const step = state.wizardStep || 1;
  const wd   = state.wizardData || {};

  const steps = [
    { n:1, label:'Dati personali' },
    { n:2, label:'Ruolo' },
    { n:3, label:'Password' },
  ];

  const stepsHtml = steps.map((s,i) => {
    const cls = step > s.n ? 'done' : step === s.n ? 'active' : '';
    const lineClass = step > s.n ? 'done' : '';
    return `<div class="wstep ${cls}">
      <div class="wstep-circle">${step > s.n ? '✓' : s.n}</div>
      <div class="wstep-label">${s.label}</div>
    </div>${i < steps.length-1 ? `<div class="wstep-line ${lineClass}"></div>` : ''}`;
  }).join('');

  let body = '';
  if (step === 1) {
    body = `
      <div class="field"><label>Nome completo *</label>
        <input type="text" id="wiz-nome" value="${esc(wd.nome||'')}" placeholder="Es. Marco Verdi" autofocus></div>
      <div class="form-row">
        <div class="field"><label>Appartamento *</label>
          <input type="text" id="wiz-apt" value="${esc(wd.appartamento||'')}" placeholder="Es. Int. 3"></div>
        <div class="field"><label>Email</label>
          <input type="email" id="wiz-email" value="${esc(wd.email||'')}" placeholder="marco@example.com"></div>
      </div>
      <div class="field">
        <label>Username di accesso *</label>
        <input type="text" id="wiz-username" value="${esc(wd.username||'')}"
          placeholder="Es. mario.rossi · int1 · m.verdi"
          autocapitalize="none" autocorrect="off" spellcheck="false">
        <p class="hint">L'utente userà questo per entrare nell'app. Suggerimento: <strong>nome.cognome</strong> o <strong>int1</strong></p>
      </div>
      <div class="field">
        <label>Condominio *</label>
        <select id="wiz-edificio">
          ${state.edifici.map(e=>`<option value="${e.id}" ${(wd.edificioId||state.edificioAttivo)===e.id?'selected':''}>${esc(e.emoji||'🏢')} ${esc(e.nome)}</option>`).join('')}
        </select>
      </div>
      <div id="wiz-err1" class="alert alert-warning" style="display:none"></div>`;
  } else if (step === 2) {
    const r = wd.ruolo||'lettura';
    body = `
      <p style="font-size:13px;color:var(--text2);margin-bottom:1rem">Scegli il livello di accesso per <strong>${esc(wd.nome||'')}</strong>:</p>
      <div class="ruolo-cards">
        <div class="ruolo-card ${r==='lettura'?'selected-lettura':''}" data-pick-ruolo="lettura">
          <div class="rc-icon">👁️</div>
          <div class="rc-title" style="color:#475569">Lettura</div>
          <div class="rc-desc">Consulta spese, entrate e bilancio</div>
        </div>
        <div class="ruolo-card ${r==='modifica'?'selected-modifica':''}" data-pick-ruolo="modifica">
          <div class="rc-icon">✏️</div>
          <div class="rc-title" style="color:var(--green)">Modifica</div>
          <div class="rc-desc">Aggiunge e modifica spese ed entrate</div>
        </div>
        <div class="ruolo-card ${r==='adminedificio'?'selected-admin':''}" data-pick-ruolo="adminedificio">
          <div class="rc-icon">🏢</div>
          <div class="rc-title" style="color:var(--accent)">Amm. Edificio</div>
          <div class="rc-desc">Gestisce utenti e dati del suo condominio</div>
        </div>
      </div>
      <div id="wiz-err2" class="alert alert-warning" style="display:none;margin-top:.75rem"></div>`;
  } else {
    body = `
      <p style="font-size:13px;color:var(--text2);margin-bottom:1rem">Imposta la password iniziale per <strong>${esc(wd.nome||'')}</strong>. Potrà cambiarla dopo il primo accesso.</p>
      <div class="field"><label>Password *</label>
        <input type="password" id="wiz-pw1" placeholder="Nuova password">
        <p class="hint">Almeno 8 caratteri · almeno una maiuscola · almeno un numero</p>
      </div>
      <div class="field"><label>Conferma password *</label>
        <input type="password" id="wiz-pw2" placeholder="Ripeti la password"></div>
      <div id="wiz-pw-rules" style="font-size:12px;min-height:18px;margin-bottom:.5rem"></div>

      <!-- Riepilogo -->
      <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:1rem;margin-top:.75rem;font-size:13px">
        <div style="font-weight:600;margin-bottom:.5rem">Riepilogo nuovo utente</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.35rem">
          <span style="color:var(--text2)">Nome</span><span>${esc(wd.nome||'')}</span>
          <span style="color:var(--text2)">Appartamento</span><span>${esc(wd.appartamento||'')}</span>
          <span style="color:var(--text2)">Username</span><span style="font-family:monospace">${esc(wd.username||'(non impostato)')}</span>
          <span style="color:var(--text2)">Email</span><span>${esc(wd.email||'—')}</span>
          <span style="color:var(--text2)">Ruolo</span><span><span class="badge ${wd.ruolo==='adminedificio'?'badge-blue':wd.ruolo==='modifica'?'badge-green':'badge-gray'}">${wd.ruolo==='adminedificio'?'Amm. Edificio':wd.ruolo==='modifica'?'Modifica':'Lettura'}</span></span>
          <span style="color:var(--text2)">Condominio</span><span>${(()=>{const e=state.edifici.find(x=>x.id===wd.edificioId); return e?(e.emoji||'🏢')+' '+esc(e.nome):'—';})()}</span>
        </div>
      </div>
      <div id="wiz-err3" class="alert alert-warning" style="display:none;margin-top:.75rem"></div>`;
  }

  const isLast = step === 3;
  const isFirst = step === 1;

  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <h2>➕ Nuovo utente — Step ${step} di 3</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="wizard-steps">${stepsHtml}</div>
        ${body}
      </div>
      <div class="modal-footer" style="justify-content:space-between">
        <button class="btn btn-secondary" id="wiz-back" ${isFirst?'disabled style="opacity:.4;cursor:not-allowed"':''}>← Indietro</button>
        <button class="btn btn-primary" id="wiz-next" style="width:auto">${isLast?'✅ Crea utente':'Avanti →'}</button>
      </div>
    </div>
  </div>`;
}

function renderModalCond(d) {
  const isEdit = !!d?.id;
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal">
      <div class="modal-header">
        <h2>${isEdit?'Modifica condomino':'Nuovo condomino'}</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="field"><label>Nome completo *</label><input type="text" id="m-nome" value="${esc(d?.nome||'')}" placeholder="Mario Rossi"></div>
          <div class="field"><label>Appartamento *</label><input type="text" id="m-apt" value="${esc(d?.appartamento||'')}" placeholder="Int. 1"></div>
        </div>
        <div class="form-row">
          <div class="field">
            <label>Username di accesso *</label>
            <input type="text" id="m-username" value="${esc(d?.username||'')}"
              placeholder="Es. mario.rossi · int1"
              autocapitalize="none" autocorrect="off" spellcheck="false">
            <p class="hint">Usato per accedere all'app. Solo lettere, numeri, punti. Deve essere unico.</p>
          </div>
          <div class="field">
            <label>Email</label>
            <input type="email" id="m-email" value="${esc(d?.email||'')}" placeholder="email@example.com">
            <p class="hint">Usata per Firebase Auth e per il reset password.</p>
          </div>
        </div>
        <div class="field">
          <label>Condominio di appartenenza ${isSuperAdmin(state.user)?'*':''}</label>
          ${isSuperAdmin(state.user) ? `
          <select id="m-edificio">
            ${state.edifici.map(e=>`<option value="${e.id}" ${(d?.edificioId||state.edificioAttivo)===e.id?'selected':''}>${esc(e.emoji||'🏢')} ${esc(e.nome)}</option>`).join('')}
          </select>
          <p class="hint">Il super admin può assegnare l'utente a qualsiasi condominio.</p>
          ` : `
          <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--surface2);border-radius:var(--radius-sm);font-size:14px">
            <span>🏢</span><strong>${esc((state.edifici.find(e=>e.id===(d?.edificioId||state.edificioAttivo))||{nome:'—'}).nome)}</strong>
          </div>
          <input type="hidden" id="m-edificio" value="${d?.edificioId||state.edificioAttivo}">
          <p class="hint">Gli utenti vengono creati nel tuo condominio.</p>
          `}
        </div>
        <div class="field">
          <label>Ruolo</label>
          <select id="m-ruolo">
            <option value="lettura"  ${!d?.canEdit&&!d?.isAdmin?'selected':''}>Lettura — solo consultazione</option>
            <option value="modifica" ${d?.canEdit&&!d?.isAdmin?'selected':''}>Modifica — può aggiungere e modificare</option>
            <option value="adminedificio" ${d?.isAdmin&&!d?.superAdmin?'selected':''}>Amm. Edificio — gestisce questo condominio</option>
          </select>
          <p class="hint">Amm. Edificio può gestire utenti e dati del suo condominio.</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        <button class="btn btn-primary" id="modal-save">💾 ${isEdit?'Salva':'Aggiungi'}</button>
      </div>
    </div>
  </div>`;
}

function bindWizard() {
  const wNext = document.getElementById('wiz-next');
  const wBack = document.getElementById('wiz-back');
  if (!wNext) return; // non siamo nel wizard

  // Ruolo card click
  document.querySelectorAll('[data-pick-ruolo]').forEach(card => {
    card.onclick = () => {
      const r = card.dataset.pickRuolo;
      state.wizardData = {...(state.wizardData||{}), ruolo: r};
      document.querySelectorAll('[data-pick-ruolo]').forEach(c => {
        c.className = 'ruolo-card';
        if (c.dataset.pickRuolo === r) c.classList.add('selected-' + r);
      });
    };
  });

  // Password live validation
  const pw1 = document.getElementById('wiz-pw1');
  if (pw1) pw1.oninput = () => {
    const errs = validatePassword(pw1.value);
    const el = document.getElementById('wiz-pw-rules');
    if (!pw1.value) { el.innerHTML=''; return; }
    el.innerHTML = errs.length===0
      ? '<span style="color:var(--green)">✅ Password valida</span>'
      : errs.map(e=>`<span style="color:var(--red)">✗ ${e}</span>`).join(' &nbsp;');
  };

  wBack.onclick = () => {
    const step = state.wizardStep || 1;
    if (step > 1) setState({wizardStep: step - 1});
  };

  wNext.onclick = () => {
    const step = state.wizardStep || 1;
    const wd   = state.wizardData || {};
    const showErr = (id, msg) => {
      const el = document.getElementById(id);
      if (el) { el.textContent = msg; el.style.display = 'block'; }
    };
    const hideErr = (id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    };

    if (step === 1) {
      const nome = document.getElementById('wiz-nome')?.value?.trim();
      const apt  = document.getElementById('wiz-apt')?.value?.trim();
      const email= document.getElementById('wiz-email')?.value?.trim();
      hideErr('wiz-err1');
      if (!nome || !apt) { showErr('wiz-err1','Nome e appartamento sono obbligatori'); return; }
      const edificioSel = parseInt(document.getElementById('wiz-edificio')?.value)||state.edificioAttivo;
      const usernameSel = (document.getElementById('wiz-username')?.value||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'');
      state.wizardData = {...wd, nome, appartamento:apt, email, edificioId:edificioSel, username:usernameSel};
      setState({wizardStep: 2});

    } else if (step === 2) {
      hideErr('wiz-err2');
      const ruolo = state.wizardData?.ruolo || null;
      if (!ruolo) { showErr('wiz-err2','Seleziona un ruolo'); return; }
      setState({wizardStep: 3});

    } else if (step === 3) {
      const v1 = document.getElementById('wiz-pw1')?.value;
      const v2 = document.getElementById('wiz-pw2')?.value;
      hideErr('wiz-err3');
      const errs = validatePassword(v1);
      if (errs.length > 0) { showErr('wiz-err3','Password non valida: '+errs.join(', ')); return; }
      if (v1 !== v2) { showErr('wiz-err3','Le password non coincidono'); return; }
      // Crea l'utente
      const d = state.wizardData;
      const ruolo = d.ruolo;
      const isAdminNew = ruolo === 'adminedificio';
      const canEditNew = ruolo === 'modifica' || ruolo === 'adminedificio';
      const superAdminNew = false;
      const nextIdx = state.condomini.length % COLORS.length;
      const nuovoUtente = {
        id: newId(),
        nome: d.nome,
        appartamento: d.appartamento,
        email: d.email||'',
        canEdit: canEditNew,
        isAdmin: isAdminNew,
        color: COLORS[nextIdx],
        edificioId: d.edificioId || state.edificioAttivo,
        username: (d.username||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,''),
        superAdmin: superAdminNew || false,
      };
      const condomini = [...state.condomini, nuovoUtente];
      save('cm_condomini', condomini);
      setUserPassword(String(nuovoUtente.id), v1);
      // Su Firebase: mostra istruzioni per creare l'account Auth
      if (window._fb && nuovoUtente.email) {
        state._pendingFirebaseUser = {email: nuovoUtente.email, password: v1, nome: nuovoUtente.nome};
      }
      setState({condomini, modal: window._fb && nuovoUtente.email ? {type:'firebase-user-created', data: nuovoUtente} : null, wizardStep:1, wizardData:{}});
    }
  };
}

// Gestione di condomini e utenti: modifica, ruoli, disattivazione, reset password. Chiamata da bindPageActions() (azioni.js).
function bindAzioniCondomini() {
  const bAddCond = document.getElementById('btn-add-cond');
  if (bAddCond) bAddCond.onclick = () => setState({modal:{type:'cond',data:null}});
  // Reset password da superAdmin
  document.querySelectorAll('[data-reset-pw-cond]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.resetPwCond);
      const c  = state.condomini.find(x=>x.id===id);
      if (!c) return;
      setState({modal:{type:'admin-reset-pw', data:c}});
    };
  });
  // Edit cond
  document.querySelectorAll('[data-edit-cond]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editCond);
      const item = state.condomini.find(c=>c.id===id);
      if (item) setState({modal:{type:'cond',data:{...item}}});
    };
  });
  // Aggiungi nuovo utente (wizard)
  const bNuovoUtente = document.getElementById('btn-nuovo-utente');
  if (bNuovoUtente) bNuovoUtente.onclick = () => setState({modal:{type:'nuovo-utente'}, wizardStep:1, wizardData:{}});
  // Ruolo select inline nelle card impostazioni
  document.querySelectorAll('.ruolo-select').forEach(sel => {
    sel.onchange = async () => {
      const id = parseInt(sel.dataset.ruoloId);
      const ruolo = sel.value;
      const isAdminNew    = ruolo === 'adminedificio' || ruolo === 'superadmin';
      const canEditNew    = ruolo === 'modifica' || isAdminNew;
      const superAdminNew = ruolo === 'superadmin';
      if (superAdminNew && !confirm('Stai promuovendo questo utente a Super Admin globale. Potrà vedere e gestire TUTTI i condomini. Confermi?')) {
        sel.value = sel.dataset.prevValue || 'lettura';
        return;
      }
      const target = state.condomini.find(c => c.id === id);
      if (!target?.uid) {
        alert('Questo utente non ha ancora effettuato il primo login: il ruolo server-side verrà assegnato automaticamente al suo primo accesso.');
        sel.value = sel.dataset.prevValue || 'lettura';
        return;
      }
      // SEC-02/05 — assegna il ruolo lato server (custom claims), unico punto autorizzato
      try {
        const { functionsInstance, httpsCallable } = window._fb;
        const setUserRole = httpsCallable(functionsInstance, 'setUserRole');
        // 'editor' (REB-01 P1): canEdit:true ma non admin. Prima di questo fix
        // veniva sempre inviato 'member' anche per "Modifica", disallineando il
        // claim server-side dal ruolo mostrato in UI.
        const serverRole = superAdminNew ? 'superAdmin' : (isAdminNew ? 'adminEdificio' : (canEditNew ? 'editor' : 'member'));
        const resp = await setUserRole({
          targetUid: target.uid,
          role: serverRole,
          buildingId: String(target.edificioId || state.edificioAttivo),
        });
        console.log('setUserRole OK:', resp.data);
      } catch (err) {
        alert('Impossibile assegnare il ruolo: ' + (err.message || err));
        sel.value = sel.dataset.prevValue || 'lettura';
        return; // NIENTE scrittura locale se la function fallisce
      }
      sel.dataset.prevValue = ruolo;
      const condomini = state.condomini.map(c => c.id===id
        ? {...c, canEdit:canEditNew, isAdmin:isAdminNew, superAdmin:superAdminNew}
        : c);
      save('cm_condomini', condomini);
      setState({condomini});
    };
    sel.dataset.prevValue = sel.value;
  });
  // Disabilita utente
  document.querySelectorAll('[data-disable-cond]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.disableCond);
      const cond = state.condomini.find(c=>c.id===id);
      if (cond) setState({modal:{type:'disable-cond', data:{...cond}}});
    };
  });
  // Riabilita utente
  document.querySelectorAll('[data-enable-cond]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.enableCond);
      if (!confirm('Riabilitare questo utente? Potrà tornare ad accedere al sistema.')) return;
      const condomini = state.condomini.map(c => c.id===id
        ? {...c, disabled:false, disabledOn:null, disabledNote:null}
        : c);
      save('cm_condomini', condomini);
      setState({condomini});
    };
  });
  // Elimina utente definitivamente
  document.querySelectorAll('[data-delete-cond]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.deleteCond);
      const cond = state.condomini.find(c=>c.id===id);
      if (!cond) return;
      const hasData = state.entrate.some(e=>e.condominoId===id) ||
                      state.spese.some(s=>s.split?.some(x=>x.id===id));
      const msg = hasData
        ? `⚠️ Attenzione: "${cond.nome}" ha versamenti o spese collegate.\n\nEliminando l'utente questi dati perderanno il riferimento (rimarranno nello storico senza nome).\n\nProcedere comunque con l'eliminazione definitiva?`
        : `Eliminare definitivamente "${cond.nome}"? Questa operazione è irreversibile.`;
      if (!confirm(msg)) return;
      const condomini = state.condomini.filter(c=>c.id!==id);
      save('cm_condomini', condomini);
      setState({condomini});
    };
  });
  // Admin reset password per condomino
  document.querySelectorAll('[data-admin-reset-pw]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.adminResetPw);
      const cond = state.condomini.find(c=>c.id===id);
      if (cond) setState({modal:{type:'admin-reset-pw', data:{...cond}}});
    };
  });
  // Toggle edit permission
  document.querySelectorAll('[data-toggle-edit]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.toggleEdit);
      const condomini = state.condomini.map(c=>c.id===id?{...c,canEdit:!c.canEdit}:c);
      save('cm_condomini', condomini);
      setState({condomini});
    };
  });
}

// Schede di disattivazione utente e nuovo utente. Chiamata da bindModal() (schede.js).
function bindSchedaCondomini() {
  // Conferma disabilita utente
  const bConfDis = document.getElementById('btn-confirm-disable');
  if (bConfDis) bConfDis.onclick = () => {
    const id = parseInt(bConfDis.dataset.uid);
    const note = document.getElementById('disable-note')?.value?.trim() || null;
    const condomini = state.condomini.map(c => c.id===id
      ? {...c, disabled:true, disabledOn: new Date().toISOString(), disabledNote: note}
      : c);
    save('cm_condomini', condomini);
    setState({condomini, modal:null});
  };
  // Wizard nuovo utente
  bindWizard();
}

// Salvataggio della scheda condomino (nuovo o modificato, con controllo sullo spostamento di edificio). Chiamata da saveModal() (schede.js).
function salvaSchedaCondomino(m) {
    const nome = document.getElementById('m-nome')?.value?.trim();
    const apt = document.getElementById('m-apt')?.value?.trim();
    const email = document.getElementById('m-email')?.value?.trim();
    const ruolo = document.getElementById('m-ruolo')?.value || 'lettura';
    const edificioId = parseInt(document.getElementById('m-edificio')?.value) || getUserEdificio(state.user);
    const isAdminNew = ruolo === 'adminedificio';
    const canEditNew = ruolo === 'modifica' || isAdminNew;
    const superAdminNew = false; // promozione a superAdmin solo via select dedicata
    if (!nome || !apt) { alert('Nome e appartamento sono obbligatori'); return; }
    let condomini;
    if (m.data?.id) {
      const username = document.getElementById('m-username')?.value?.trim().toLowerCase().replace(/[^a-z0-9._-]/g,'') || '';
      // ── Blocco spostamento: RIGIDO se ha transazioni ─────────────────
      const condOld      = state.condomini.find(c=>c.id===m.data.id);
      const oldEdId      = condOld?.edificioId || state.edificioAttivo;
      const cambiaEd     = edificioId !== oldEdId;
      const hasEntrate   = state.entrate.some(e=>e.condominoId===m.data.id);
      const hasSpeseSplit= state.spese.some(s=>s.split?.some(x=>x.id===m.data.id));
      const hasDati      = hasEntrate || hasSpeseSplit;
      const edificioIdFinale = (() => {
        if (!cambiaEd) return edificioId;  // stesso edificio — sempre OK
        if (hasDati) {
          const nEnt = state.entrate.filter(e=>e.condominoId===m.data.id).length;
          const nSp  = state.spese.filter(s=>s.split?.some(x=>x.id===m.data.id)).length;
          alert(
            `⛔ Impossibile spostare "${condOld?.nome}" in un altro condominio.\n\n` +
            `Ha transazioni associate:\n• ${nEnt} versamenti\n• ${nSp} spese\n\n` +
            `Crea un profilo separato per questo utente nel nuovo condominio.`
          );
          return oldEdId;  // mantieni edificio originale — BLOCCO TOTALE
        }
        return edificioId;  // nessuna transazione → spostamento libero
      })();
      condomini = state.condomini.map(c=>c.id===m.data.id
        ? {...c, nome, appartamento:apt, email, username, canEdit:canEditNew, isAdmin:isAdminNew, superAdmin:c.superAdmin||false, edificioId:edificioIdFinale}
        : c);
      // Se il ruolo dell'utente loggato è cambiato, aggiornare anche state.user
      if (state.user && state.user.id === m.data.id) {
        setState({user:{...state.user, canEdit:canEditNew, isAdmin:isAdminNew, edificioId}});
      }
    } else {
      const nextIdx = state.condomini.length % COLORS.length;
      const usernameNew = document.getElementById('m-username')?.value?.trim().toLowerCase().replace(/[^a-z0-9._-]/g,'') || '';
      // Verifica unicità username
      if (usernameNew && state.condomini.some(c=>c.username===usernameNew)) {
        alert('Username già in uso. Scegli un nome diverso.'); return;
      }
      condomini = [...state.condomini, {id:newId(),nome,appartamento:apt,email,username:usernameNew,canEdit:canEditNew,isAdmin:isAdminNew,superAdmin:false,edificioId,color:COLORS[nextIdx]}];
    }
    save('cm_condomini', condomini);
    setState({condomini, modal:null});
}
