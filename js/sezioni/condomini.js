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
  // Archiviato = disattivato, oppure con data di uscita già arrivata (subentro a data futura, CONS-023).
  const oggiLista   = ymdLocale(new Date());
  const archiviato  = c => !!c.disabled || uscitaArrivata(c, oggiLista);
  const attivi      = tuttiCondomini.filter(c=>!archiviato(c));
  const disabilitati= tuttiCondomini.filter(c=>archiviato(c));
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
        const totVersato = state.entrate.filter(e=>e.condominoId===c.id && !e.previsionale && annoDi(e.data)===anno).reduce((a,e)=>a+importoNum(e.importo),0);
        const edName     = (state.edifici.find(e=>e.id===(c.edificioId||state.edificioAttivo))||{nome:'—'}).nome;
        return `<div class="utente-card">
          <div class="uc-head">
            <div class="avatar-lg" style="${avatarStyle(c.color)}">${initials(c.nome)}</div>
            <div style="flex:1;min-width:0">
              <div class="uc-name">${esc(c.nome)}</div>
              <div class="uc-apt">🏠 ${esc(c.appartamento)}</div>
              ${c.username?`<div style="font-size:11px;color:var(--text2)">👤 ${esc(c.username)}</div>`:''}
              ${ingressoFuturo(c, oggiLista) ? `<div style="font-size:11px;color:var(--amber)">⏳ Entra il ${esc(dataPdf(c.dataIngresso))}: fino ad allora senza accesso né email</div>` : ''}
              ${uscitaFutura(c, oggiLista) ? `<div style="font-size:11px;color:var(--amber)">⏳ Esce il ${esc(dataPdf(c.dataUscita))}: resta attivo fino ad allora</div>` : ''}
              ${typeof appartamentoInAffitto === 'function' && appartamentoInAffitto(c.appartamento) ? `<div style="font-size:11px;color:var(--text2)" title="Si imposta in Impostazioni → Appartamenti in affitto">🔑 In affitto: le quote ordinarie sono dell'inquilino</div>` : ''}
              ${typeof condividenti === 'function' && condividenti(c).length ? (c.rappresentante === true
                ? `<div style="font-size:11px;color:var(--text2)" title="Nei millesimi l'appartamento conta una volta sola, per il rappresentante">👤 Rappresentante dell'appartamento</div>`
                : (condividenti(c).some(x => x.rappresentante === true)
                  ? `<div style="font-size:11px;color:var(--text2)" title="Nei millesimi conta il rappresentante dell'appartamento">Cointestatario: non porta peso nei millesimi</div>`
                  : (configMillesimi()?.attivo ? `<div style="font-size:11px;color:var(--amber)" title="Apri Modifica e spunta «Rappresentante dell'appartamento» su uno dei condomini">⚠️ Appartamento con più condomini: manca il rappresentante (peso diviso in parti uguali)</div>` : ''))) : ''}
              ${typeof millesimiDi === 'function' && millesimiDi(c).length ? `<div style="font-size:11px;color:var(--text2)" title="Si modificano in Impostazioni → Tabelle millesimali">⚖️ ${millesimiDi(c).map(m => esc(m.nome) + ' ' + fmtMill(m.valore)).join(' · ')}</div>` : ''}
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
            <button class="btn btn-secondary btn-sm" data-estratto-cond="${c.id}" title="Estratto conto in PDF">📄 Estratto conto</button>
            <button class="btn btn-secondary btn-sm" data-subentro-cond="${c.id}" title="Vendita o cambio di inquilino: archivia chi esce e inserisce chi entra">🔁 Subentro</button>
            <button class="btn btn-secondary btn-sm" data-disable-cond="${c.id}" style="color:var(--amber)" title="Archivia — il condomino non potrà più accedere ma i dati restano">⏸ Archivia</button>
            ${isSuperAdmin(state.user)?`<button class="btn btn-secondary btn-sm" data-reset-pw-cond="${c.id}" title="Reset password — imposta una nuova password temporanea">🔑 Reset PW</button>`:''}
            <button class="btn btn-danger btn-sm" data-del-cond="${c.id}" title="Elimina definitivamente — solo se non ha quote né versamenti (altrimenti usa Archivia)">🗑 Elimina</button>`:''}
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
          <div style="flex:1"><div class="uc-name">${esc(c.nome)}</div><div class="uc-apt">🏠 ${esc(c.appartamento)}</div>
            ${periodoCondomino(c).fine && periodoCondomino(c).fine !== '0000-00-00' ? `<div style="font-size:11px;color:var(--text2)">${periodoCondomino(c).inizio ? 'dal ' + dataPdf(periodoCondomino(c).inizio) + ' ' : ''}uscito il ${dataPdf(periodoCondomino(c).fine)}</div>` : ''}</div>
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
            <div>3️⃣ Email: <code style="background:var(--surface);padding:2px 6px;border-radius:4px;border:1px solid var(--border)">${esc(u.email||'(nessuna email inserita)')}</code></div>
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
        <h2>${ico('disabilita')} Disabilita utente</h2>
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
          <label for="disable-uscita">Data di uscita</label>
          <input type="date" id="disable-uscita" value="${ymdLocale(new Date())}">
          <p class="hint">Dal giorno indicato non partecipa più alle spese senza ripartizione. Per chi ha venduto a un nuovo condomino usa invece "🔁 Subentro" (per una vendita, il giorno dopo il rogito).</p>
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
        <div class="field"><label for="wiz-email">Email di accesso</label>
          <input type="email" id="wiz-email" value="${esc(wd.email||'')}" placeholder="nome@esempio.it" autocapitalize="none" autocorrect="off" spellcheck="false"></div>
      </div>
      <p class="hint" style="margin:-.5rem 0 1rem">Con questa email la persona entra nell'app (anche con "Accedi con Google") e riceve le email del condominio.</p>
      <div class="field">
        <label for="wiz-username">Nickname (facoltativo)</label>
        <input type="text" id="wiz-username" value="${esc(wd.username||'')}" maxlength="40" placeholder="Es. Marco del 3° piano">
        <p class="hint">Come lo chiamate di solito: aiuta a riconoscerlo. Non serve per accedere.</p>
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
          <div class="rc-title" style="color:var(--text2)">Lettura</div>
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
          <span style="color:var(--text2)">Nickname</span><span>${esc(wd.username||'—')}</span>
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
            <label for="m-email">Email di accesso</label>
            <input type="email" id="m-email" value="${esc(d?.email||'')}" placeholder="nome@esempio.it" autocapitalize="none" autocorrect="off" spellcheck="false">
            <p class="hint">Con questa email entra nell'app (anche con "Accedi con Google"), recupera la password e riceve le email del condominio.</p>
          </div>
          <div class="field">
            <label for="m-username">Nickname (facoltativo)</label>
            <input type="text" id="m-username" value="${esc(d?.username||'')}" maxlength="40" placeholder="Es. Lucia del 2° piano">
            <p class="hint">Come lo chiamate di solito: aiuta a riconoscerlo. Non serve per accedere.</p>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="m-ingresso">Nel condominio dal</label>
            <input type="date" id="m-ingresso" value="${esc(d?.dataIngresso||'')}">
            <p class="hint">Facoltativa: da questa data partecipa alle spese senza ripartizione. Per una vendita: il giorno dopo il rogito.</p>
          </div>
          ${d?.disabled || d?.dataUscita ? `<div class="field">
            <label for="m-uscita">Uscito il</label>
            <input type="date" id="m-uscita" value="${esc(d?.dataUscita || (d?.disabledOn||'').slice(0,10))}">
            <p class="hint">Primo giorno in cui non partecipa più alle spese. Per una vendita: il giorno dopo il rogito (il giorno del rogito è ancora del venditore).</p>
          </div>` : ''}
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
        <label class="casella-email" for="m-email-notifiche">
          <input type="checkbox" id="m-email-notifiche" ${d?.emailNotifiche === false ? '' : 'checked'}>
          <span><strong>Riceve le email</strong><span class="hint" style="display:block;margin-top:2px">Avvisi, verbali e promemoria delle rate all'indirizzo qui sopra.</span></span>
        </label>
        <div class="field">
          <label for="m-tel">Cellulare (WhatsApp)</label>
          <input type="tel" id="m-tel" value="${esc(d?.telefono||'')}" maxlength="40" placeholder="333 123 4567" autocomplete="off">
          <p class="hint">Facoltativo. Senza prefisso vale +39; per un numero estero scrivi il prefisso (es. +41…). Lo vedono solo amministratori ed editor.</p>
        </div>
        <label class="casella-email" for="m-wa-notifiche">
          <input type="checkbox" id="m-wa-notifiche" ${d?.whatsappNotifiche === false ? '' : 'checked'}>
          <span><strong>Riceve WhatsApp</strong><span class="hint" style="display:block;margin-top:2px">Compare tra i condomini a cui mandare avvisi, verbali, rendiconto e promemoria su WhatsApp.</span></span>
        </label>
        <label class="casella-email" for="m-rappresentante">
          <input type="checkbox" id="m-rappresentante" ${d?.rappresentante === true ? 'checked' : ''}>
          <span><strong>Rappresentante dell'appartamento</strong><span class="hint" style="display:block;margin-top:2px">Serve solo se nello stesso appartamento ci sono più condomini attivi (cointestatari): nei millesimi l'appartamento conta una volta sola, per il rappresentante. Se lo spunti, l'eventuale altro rappresentante dello stesso appartamento viene tolto.</span></span>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        <button class="btn btn-primary" id="modal-save">💾 ${isEdit?'Salva':'Aggiungi'}</button>
      </div>
    </div>
  </div>`;
}

// Riattiva (CONS-022, ADV-FUNC-009). Chi è uscito per un subentro (nota "Subentro: …", scritta dalla
// scheda Subentro) non si riattiva: cancellerebbe la data di uscita e l'appartamento tornerebbe ad avere
// due condomini attivi. Scelta prudente: blocco con avviso (non si perde nulla e non c'è un'uscita da
// ricostruire); per un ritorno vero si registra un nuovo subentro.
// Subentro a data futura già registrato (ADV-FUNC-032, RA-3): chi esce resta tra gli attivi fino alla data,
// con la nota "Subentro: …" e la data di uscita; chi entra è già nello stesso appartamento. Su di lui non si
// registra un secondo subentro (avrebbe due nuovi condomini), non si sostituisce la nota e non si svuota la
// data di uscita (resterebbero attivi sia lui sia chi entra) senza conferma o avviso.
function subentroInCorso(c) {
  return !!c && !c.disabled && !!c.dataUscita && /^Subentro:/.test(String(c.disabledNote || ''));
}
function motivoNoSubentro(c) {
  if (!subentroInCorso(c)) return '';
  return `"${c.nome}" ha già un subentro registrato (${String(c.disabledNote).replace(/^Subentro:\s*/, '')}) e resta attivo fino al ${dataPdf(c.dataUscita)}: un secondo subentro darebbe due nuovi condomini nello stesso appartamento. Se la data è sbagliata, correggila con ✏️ Modifica (campo «Uscito il») e aggiorna di conseguenza anche l'ingresso del nuovo condomino.`;
}
function motivoNoRiattiva(c) {
  if (!/^Subentro:/.test(String(c?.disabledNote || ''))) return '';
  return `"${c.nome}" è uscito per un subentro (${String(c.disabledNote).replace(/^Subentro:\s*/, '')}) e non si riattiva: l'appartamento ${c.appartamento || ''} tornerebbe ad avere due condomini attivi. Se ${c.nome} rientra davvero, registra un nuovo subentro dalla scheda di chi occupa ora l'appartamento.`;
}
async function riattivaCondomino(id) {
  const cond = state.condomini.find(c => c.id === id);
  if (!cond) return;
  const motivo = motivoNoRiattiva(cond);
  if (motivo) { avvisa('⛔ ' + motivo); return; }
  if (!await chiedi('Riabilitare questo utente? Potrà tornare ad accedere al sistema.')) return;
  const condomini = state.condomini.map(c => c.id === id
    ? {...c, disabled:false, disabledOn:null, disabledNote:null, dataUscita:null}
    : c);
  save('cm_condomini', condomini);
  setState({condomini});
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

  wNext.onclick = () => unClicAllaVolta(wNext, async () => {
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
      const usernameSel = (document.getElementById('wiz-username')?.value || '').trim().replace(/\s+/g, ' ').slice(0, 40); // nickname, testo libero
      if (email && email.toLowerCase() !== String(wd.email || '').toLowerCase() && !await emailUsabileQui(email, edificioSel)) return;
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
        username: d.username || '', // nickname, testo libero
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
  });
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
      if (superAdminNew && !await chiedi('Stai promuovendo questo utente a Super Admin globale. Potrà vedere e gestire TUTTI i condomini. Confermi?')) {
        sel.value = sel.dataset.prevValue || 'lettura';
        return;
      }
      const target = state.condomini.find(c => c.id === id);
      if (!target?.uid) {
        avvisa('Questo utente non ha ancora effettuato il primo login: il ruolo server-side verrà assegnato automaticamente al suo primo accesso.');
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
        // Il server ha aggiornato anche la scheda (ADV-TECH-021): si riprende la sua versione per il salvataggio qui sotto.
        await rinfrescaVersione('cm_condomini', { ...target, edificioId: target.edificioId || state.edificioAttivo });
      } catch (err) {
        avvisa('Impossibile assegnare il ruolo: ' + (err.message || err));
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
  document.querySelectorAll('[data-subentro-cond]').forEach(btn => {
    btn.onclick = () => {
      const cond = state.condomini.find(c => c.id === parseInt(btn.dataset.subentroCond));
      if (!cond || !canUserAdmin(state.user)) return;
      const motivo = motivoNoSubentro(cond);
      if (motivo) { avvisa('⛔ ' + motivo); return; }
      setState({ modal: { type: 'subentro', data: { ...cond } } });
    };
  });
  document.querySelectorAll('[data-disable-cond]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.disableCond);
      const cond = state.condomini.find(c=>c.id===id);
      if (cond) setState({modal:{type:'disable-cond', data:{...cond}}});
    };
  });
  // Riabilita utente
  document.querySelectorAll('[data-enable-cond]').forEach(btn => {
    btn.onclick = () => riattivaCondomino(parseInt(btn.dataset.enableCond));
  });
  // Elimina utente definitivamente
  // (il pulsante ha data-del-cond: prima il gestore cercava data-delete-cond e "🗑 Elimina" non faceva nulla)
  document.querySelectorAll('[data-del-cond]').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.delCond);
      const cond = state.condomini.find(c=>c.id===id);
      if (!cond) return;
      // Con quote o versamenti non si elimina: uscirebbe dalle viste per condomino ma le sue
      // quote resterebbero nei totali (CONS-025, ADV-FUNC-012). Si archivia.
      if (haMovimenti(id, state.spese, state.entrate)) {
        avvisa(cond.disabled
          ? `⛔ Ha movimenti: non si può eliminare.\n\n"${cond.nome}" ha quote o versamenti registrati; resta archiviato e i suoi dati restano nello storico, altrimenti i totali non tornerebbero.`
          : `⛔ Ha movimenti: usa Archivia.\n\n"${cond.nome}" ha quote o versamenti registrati e non si può eliminare, altrimenti i totali non tornerebbero. Con "Archivia" esce dall'elenco dei condomini attivi e i suoi dati restano nello storico.`);
        return;
      }
      if (!await chiedi(`Eliminare definitivamente "${cond.nome}"? Questa operazione è irreversibile.`)) return;
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
  if (bConfDis) bConfDis.onclick = async () => {
    const id = parseInt(bConfDis.dataset.uid);
    let note = document.getElementById('disable-note')?.value?.trim() || null;
    const dataUscita = document.getElementById('disable-uscita')?.value || ymdLocale(new Date());
    // Chi ha un subentro a data futura (ADV-FUNC-032): archiviarlo ora anticipa l'uscita e lascia
    // l'appartamento scoperto fino all'ingresso di chi subentra. Serve la conferma; la nota
    // "Subentro: …" non si sostituisce (la motivazione scritta si aggiunge dopo).
    const prima = state.condomini.find(c => c.id === id);
    if (subentroInCorso(prima)) {
      if (!await chiedi(`"${prima.nome}" ha già un subentro registrato (${String(prima.disabledNote).replace(/^Subentro:\s*/, '')}) e uscirebbe il ${dataPdf(prima.dataUscita)}.\n\nArchiviarlo adesso porta l'uscita al ${dataPdf(dataUscita)}, ma chi subentra entra solo dalla data del subentro: nel frattempo l'appartamento non ha condomini attivi. La nota del subentro resta.\n\nArchiviare lo stesso?`,
        { titolo: 'Subentro già registrato', conferma: 'Archivia lo stesso' })) return;
      note = prima.disabledNote + (note ? ' · ' + note : '');
    }
    // Lavori straordinari deliberati quando era proprietario: restano a suo carico, glielo si ricorda prima che esca.
    const avvisoLavori = prima ? avvisoUscitaLavori(prima) : '';
    if (avvisoLavori && !await chiedi(avvisoLavori, { titolo: 'Lavori deliberati a suo carico', conferma: 'Archivia', pericolo: false })) return;
    const condomini = state.condomini.map(c => c.id===id
      ? {...c, disabled:true, disabledOn: new Date().toISOString(), disabledNote: note, dataUscita}
      : c);
    save('cm_condomini', condomini);
    setState({condomini, modal:null});
  };
  bindSchedaSubentro();
  // Wizard nuovo utente
  bindWizard();
}

// Decisione del 2026-10-15: un'email vale per un solo condominio. Se è già in
// un profilo attivo di un altro condominio (functions/index.js, verificaEmail)
// la persona continua a entrare in quello: l'amministratore viene avvisato e
// sceglie se salvare lo stesso (l'email serve comunque per le notifiche).
// Se la verifica non riesce non blocca il salvataggio.
async function emailUsabileQui(email, edificioId) {
  if (!email || !window._fb?.httpsCallable) return true;
  try {
    const { functionsInstance, httpsCallable } = window._fb;
    const r = (await httpsCallable(functionsInstance, 'verificaEmail')({ buildingId: String(edificioId), email })).data || {};
    if (!r.altroCondominio) return true;
  } catch (e) { return true; }
  return chiedi('Questa email è già usata da un condomino di un altro condominio gestito con l\'app.\n\n'
    + 'Una persona può accedere a un solo condominio: con questa email continuerà a entrare nell\'altro, non in questo. '
    + 'L\'email servirà comunque per mandarle avvisi, verbali e promemoria.\n\nSalvare lo stesso?',
    { titolo: 'Email già usata in un altro condominio', conferma: 'Salva lo stesso' });
}

// Salvataggio della scheda condomino (nuovo o modificato, con controllo sullo spostamento di edificio). Chiamata da saveModal() (schede.js).
async function salvaSchedaCondomino(m) {
    const nome = document.getElementById('m-nome')?.value?.trim();
    const apt = document.getElementById('m-apt')?.value?.trim();
    const email = document.getElementById('m-email')?.value?.trim();
    const ruolo = document.getElementById('m-ruolo')?.value || 'lettura';
    const edificioId = parseInt(document.getElementById('m-edificio')?.value) || getUserEdificio(state.user);
    const isAdminNew = ruolo === 'adminedificio';
    const canEditNew = ruolo === 'modifica' || isAdminNew;
    const superAdminNew = false; // promozione a superAdmin solo via select dedicata
    if (!nome || !apt) { avvisa('Nome e appartamento sono obbligatori'); return; }
    const dataIngresso = document.getElementById('m-ingresso')?.value || '';
    const campoUscita = document.getElementById('m-uscita');
    const dataUscita = campoUscita ? campoUscita.value || '' : undefined;
    if (dataIngresso && dataUscita && dataUscita <= dataIngresso) { avvisa('La data di uscita deve venire dopo quella di ingresso.'); return; }
    // Subentro a data futura (ADV-FUNC-032): senza data di uscita resterebbero attivi sia chi esce sia chi entra.
    const inUscita = m.data?.id ? state.condomini.find(c => c.id === m.data.id) : null;
    if (subentroInCorso(inUscita) && dataUscita !== undefined && !dataUscita) {
      avvisa(`⛔ "${inUscita.nome}" esce per un subentro (${String(inUscita.disabledNote).replace(/^Subentro:\s*/, '')}): non si può lasciare vuota la data di uscita, altrimenti nell'appartamento resterebbero attivi sia lui sia chi subentra. Indica la data di uscita (era il ${dataPdf(inUscita.dataUscita)}).`);
      return;
    }
    const emailPrima = m.data?.id ? String(state.condomini.find(c => c.id === m.data.id)?.email || '') : '';
    if (email && email.toLowerCase() !== emailPrima.toLowerCase() && !await emailUsabileQui(email, edificioId)) return;
    const telefono = (document.getElementById('m-tel')?.value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const telPrima = m.data?.id ? String(state.condomini.find(c => c.id === m.data.id)?.telefono || '') : '';
    if (telefono && telefono !== telPrima && !numeroWa(telefono) && !await chiedi('Il numero "' + telefono + '" non sembra un cellulare: WhatsApp non si potrà aprire per questo condomino.\n\nSalvare lo stesso?', { titolo: 'Cellulare da controllare', conferma: 'Salva lo stesso' })) return;
    // I permessi veri sono sul server (setUserRole): se la persona ha già fatto
    // il primo accesso e il ruolo cambia, si cambia prima lì. Prima si salvava
    // solo la scheda: l'app le mostrava i pulsanti, ma ogni salvataggio falliva.
    const condPrima = m.data?.id ? state.condomini.find(c => c.id === m.data.id) : null;
    if (condPrima?.uid && !condPrima.superAdmin && window._fb?.httpsCallable
        && (!!condPrima.isAdmin !== isAdminNew || !!condPrima.canEdit !== canEditNew)) {
      try {
        const { functionsInstance, httpsCallable } = window._fb;
        await httpsCallable(functionsInstance, 'setUserRole')({ targetUid: condPrima.uid,
          role: isAdminNew ? 'adminEdificio' : (canEditNew ? 'editor' : 'member'),
          buildingId: String(condPrima.edificioId || state.edificioAttivo) });
        // Il server ha aggiornato anche la scheda (ADV-TECH-021): si riprende la sua versione per il salvataggio qui sotto.
        await rinfrescaVersione('cm_condomini', { ...condPrima, edificioId: condPrima.edificioId || state.edificioAttivo });
      } catch (e) {
        avvisa('⚠️ Ruolo non cambiato: ' + (e.message || e));
        return;
      }
    }
    const date = { dataIngresso, ...(dataUscita !== undefined ? { dataUscita } : {}),
      emailNotifiche: document.getElementById('m-email-notifiche') ? document.getElementById('m-email-notifiche').checked : true,
      whatsappNotifiche: document.getElementById('m-wa-notifiche') ? document.getElementById('m-wa-notifiche').checked : true,
      ...(document.getElementById('m-rappresentante') ? { rappresentante: document.getElementById('m-rappresentante').checked } : {}) };
    let condomini;
    let idSalvato = m.data?.id;
    if (m.data?.id) {
      const username = (document.getElementById('m-username')?.value || '').trim().replace(/\s+/g, ' ').slice(0, 40); // nickname, testo libero
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
          avvisa(
            `⛔ Impossibile spostare "${condOld?.nome}" in un altro condominio.\n\n` +
            `Ha transazioni associate:\n• ${nEnt} versamenti\n• ${nSp} spese\n\n` +
            `Crea un profilo separato per questo utente nel nuovo condominio.`
          );
          return oldEdId;  // mantieni edificio originale — BLOCCO TOTALE
        }
        return edificioId;  // nessuna transazione → spostamento libero
      })();
      condomini = state.condomini.map(c=>c.id===m.data.id
        ? {...c, nome, appartamento:apt, email, telefono, username, canEdit:canEditNew, isAdmin:isAdminNew, superAdmin:c.superAdmin||false, edificioId:edificioIdFinale, ...date}
        : c);
      // Se il ruolo dell'utente loggato è cambiato, aggiornare anche state.user
      if (state.user && state.user.id === m.data.id) {
        setState({user:{...state.user, canEdit:canEditNew, isAdmin:isAdminNew, edificioId}});
      }
    } else {
      const nextIdx = state.condomini.length % COLORS.length;
      const usernameNew = (document.getElementById('m-username')?.value || '').trim().replace(/\s+/g, ' ').slice(0, 40); // nickname, facoltativo e non univoco
      idSalvato = newId();
      condomini = [...state.condomini, {id:idSalvato,nome,appartamento:apt,email,telefono,username:usernameNew,canEdit:canEditNew,isAdmin:isAdminNew,superAdmin:false,edificioId,color:COLORS[nextIdx],...date}];
    }
    // Un solo rappresentante per appartamento: se questo lo diventa, si toglie agli altri dello stesso appartamento
    // che sono ancora presenti. A chi è già uscito il flag resta (ADV-FUNC-034): così la proposta dei millesimi
    // per le date passate, quando lui era presente, non cambia. Se chi viene spuntato è già uscito, non si tocca nessuno.
    if (date.rappresentante === true) {
      const salvato = condomini.find(c => c.id === idSalvato);
      const oggiRapp = ymdLocale(new Date());
      const uscito = c => !!c.disabled || uscitaArrivata(c, oggiRapp);
      // Anche chi esce con un subentro a data futura, prima dell'ingresso del nuovo, tiene il flag per il suo periodo.
      const uscitoPrima = c => uscito(c) || !!(c.dataUscita && salvato.dataIngresso && String(c.dataUscita) <= String(salvato.dataIngresso));
      if (!uscito(salvato)) {
        condomini = condomini.map(c => c.id !== idSalvato && c.rappresentante === true && c.edificioId === salvato.edificioId
          && chiaveApt(c.appartamento) === chiaveApt(apt) && !uscitoPrima(c) ? { ...c, rappresentante: false } : c);
      }
    }
    save('cm_condomini', condomini);
    setState({condomini, modal:null});
}

// ===========================
// SUBENTRO (vendita o cambio di inquilino)
// ===========================
// In un solo passo: chi esce viene archiviato con la data di uscita, chi entra
// viene creato nello stesso appartamento con la data di ingresso, e le quote
// delle spese future non ancora consuntivate passano al nuovo condomino.
// Le spese senza ripartizione si dividono già per data (js/core/utils.js).

// Spese dell'edificio dalla data del subentro, non consuntivate, in cui chi esce ha una quota.
function speseDaPassare(condId, data, edificioId) {
  return state.spese.filter(s => (s.edificioId || state.edificioAttivo) === edificioId && String(s.data || '') >= data
    && !(parseFloat(s.consuntivo) > 0) && !deliberaDellaSpesa(s) && (s.split || []).some(x => x.id === condId && (x.perc || 0) > 0));
}

// Solo amministratore e amministratore di edificio (come archiviare e creare condomini;
// lo stesso vincolo è nelle regole del server su members).
function renderModalSubentro(d) {
  if (!canUserAdmin(state.user)) return '';
  const oggi = ymdLocale(new Date());
  const n = speseDaPassare(d.id, oggi, d.edificioId || state.edificioAttivo).length;
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <h2>🔁 Subentro nell'appartamento</h2>
        <button class="modal-close" id="modal-close" aria-label="Chiudi">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text2);margin-bottom:1rem">Esce <strong style="color:var(--text)">${esc(d.nome)}</strong> (${esc(d.appartamento || '')}): viene archiviato con i suoi versamenti e il suo storico. Entra il nuovo condomino nello stesso appartamento. Con una data futura chi esce resta attivo fino a quel giorno e chi entra non ha accesso né email prima di quel giorno.</p>
        <div class="field">
          <label for="sub-data">Data del subentro *</label>
          <input type="date" id="sub-data" value="${oggi}">
          <p class="hint">Dal giorno indicato le spese senza ripartizione si dividono con il nuovo condomino. Per una vendita inserisci il giorno dopo il rogito. Chi esce resta obbligato in solido con il nuovo proprietario finché all\'amministratore non arriva la copia autentica dell\'atto (art. 63 disp. att. c.c.); il nuovo proprietario risponde verso il condominio per l\'esercizio in corso e il precedente.</p>
        </div>
        <div class="field">
          <label for="sub-nome">Nome del nuovo condomino *</label>
          <input type="text" id="sub-nome" placeholder="Nome e cognome">
        </div>
        <div class="field">
          <label for="sub-email">Email per l'accesso</label>
          <input type="email" id="sub-email" placeholder="email@esempio.it">
          <p class="hint">Con questa email potrà entrare (anche con Google). Puoi aggiungerla dopo da ✏️ Modifica.</p>
        </div>
        <div class="field">
          <label for="sub-ruolo">Ruolo</label>
          <select id="sub-ruolo">
            <option value="lettura" selected>Lettura — solo consultazione</option>
            <option value="modifica">Modifica — può aggiungere e modificare</option>
          </select>
        </div>
        <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer">
          <input type="checkbox" id="sub-passa" checked style="width:16px;height:16px;margin-top:2px">
          <span>Passa al nuovo condomino le quote delle spese future non ancora consuntivate${n ? ` (oggi: ${n} ${n === 1 ? 'spesa' : 'spese'})` : ''}. Le spese già consuntivate restano a chi esce.</span>
        </label>
        <div id="sub-err" class="alert alert-warning" style="display:none;font-size:13px;margin-top:.75rem"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        <button class="btn btn-primary" id="btn-sub-conferma" data-cond="${d.id}">🔁 Conferma subentro</button>
      </div>
    </div>
  </div>`;
}

function bindSchedaSubentro() {
  const b = document.getElementById('btn-sub-conferma');
  if (!b || state.modal?.type !== 'subentro' || !canUserAdmin(state.user)) return;
  b.onclick = () => unClicAllaVolta(b, async () => {
    const err = (t) => { const e = document.getElementById('sub-err'); e.textContent = t; e.style.display = 'block'; };
    if (!canUserAdmin(state.user)) return err('Solo l\'amministratore può registrare un subentro.');
    const vecchio = state.condomini.find(c => c.id === Number(b.dataset.cond));
    const data = document.getElementById('sub-data').value;
    const nome = document.getElementById('sub-nome').value.trim();
    const email = document.getElementById('sub-email').value.trim();
    const ruolo = document.getElementById('sub-ruolo').value;
    if (!vecchio) return err('Condomino non trovato: ricarica la pagina.');
    if (motivoNoSubentro(vecchio)) return err(motivoNoSubentro(vecchio));
    if (!data) return err('Indica la data del subentro.');
    if (!nome) return err('Indica il nome del nuovo condomino.');
    const { inizio } = periodoCondomino(vecchio);
    if (inizio && data <= inizio) return err('La data del subentro deve venire dopo l\'ingresso di ' + vecchio.nome + ' (' + dataPdf(inizio) + ').');
    const edificioId = vecchio.edificioId || state.edificioAttivo;
    if (email && !await emailUsabileQui(email, edificioId)) return;
    const avvisoLavori = avvisoUscitaLavori(vecchio);
    if (avvisoLavori && !await chiedi(avvisoLavori, { titolo: 'Lavori deliberati a suo carico', conferma: 'Registra il subentro', pericolo: false })) return;
    const nuovo = { id: newId(), nome, appartamento: vecchio.appartamento || '', email, username: '', canEdit: ruolo === 'modifica', isAdmin: false, superAdmin: false,
      edificioId, color: COLORS[state.condomini.length % COLORS.length], dataIngresso: data };
    // Data futura (CONS-023, ADV-FUNC-010): chi esce resta attivo (con accesso, email e quota) fino a quel
    // giorno, quindi si imposta solo la data di uscita; ci pensa il controllo notturno dei permessi
    // (functions/permessi.js) a togliergli l'accesso il giorno stesso. Chi entra non ha accesso né email
    // prima della sua data di ingresso (membroAttivo, motivoEsclusione). Data odierna o passata: come prima.
    const futuro = data > ymdLocale(new Date());
    const nota = 'Subentro: ' + nome + ' dal ' + dataPdf(data);
    const condomini = [...state.condomini.map(c => c.id === vecchio.id
      ? (futuro
        ? { ...c, dataUscita: data, disabledNote: nota }
        : { ...c, disabled: true, disabledOn: new Date().toISOString(), dataUscita: data, disabledNote: nota })
      : c), nuovo];
    // Quote delle spese future: la percentuale di chi esce passa a chi entra. La scelta si legge ora (la
    // scheda si chiude subito); le spese da toccare si calcolano invece DOPO la conferma dei condomini, sullo
    // stato di quel momento (ADV-TECH-020), per non riscrivere correzioni fatte durante l'attesa.
    const passaQuote = document.getElementById('sub-passa').checked;
    const eranoDaPassare = passaQuote ? new Set(speseDaPassare(vecchio.id, data, edificioId).map(s => s.id)) : new Set();
    // Prima i condomini, poi (solo se riusciti) le quote delle spese: se il
    // salvataggio dei condomini è rifiutato (es. conflitto) le quote non passano
    // a un condomino che non esiste, e il successo si annuncia solo a conferma
    // avvenuta (audit 2026-10-24, ADV-TECH-002). Lo schermo si aggiorna subito;
    // in caso di rifiuto lo riporta indietro il salvataggio stesso (dati.js).
    const salvaCondomini = save('cm_condomini', condomini);
    setState({ condomini, modal: null });
    // save() risponde sempre true/false: si ferma solo su un rifiuto esplicito.
    if (await salvaCondomini === false) return;
    const daPassare = passaQuote ? new Set(speseDaPassare(vecchio.id, data, edificioId).map(s => s.id)) : new Set();
    // Spese che dovevano passare al clic e ora non possono più (cancellate, consuntivate, quota già tolta).
    const nonPassate = [...eranoDaPassare].filter(id => !daPassare.has(id)).length;
    let quoteOk = true;
    if (daPassare.size) {
      const spese = state.spese.map(s => {
        if (!daPassare.has(s.id)) return s;
        const quota = s.split.find(x => x.id === vecchio.id).perc || 0;
        const giaNuovo = s.split.some(x => x.id === nuovo.id);
        const split = s.split.map(x => x.id === vecchio.id ? { ...x, perc: 0 } : x.id === nuovo.id ? { ...x, perc: (x.perc || 0) + quota } : x);
        return { ...s, split: giaNuovo ? split : [...split, { id: nuovo.id, perc: quota, locked: false }] };
      });
      const salvaSpese = save('cm_spese', spese);
      // ADV-TECH-024: una scheda spesa aperta nell'attesa ha ancora la ripartizione di prima; salvandola annullerebbe
      // il passaggio della quota. Se riguarda una spesa toccata, si chiude (le modifiche non salvate si perdono) e si avvisa.
      const schedaVecchia = state.modal?.type === 'spesa' && state.modal.data && daPassare.has(state.modal.data.id);
      setState(schedaVecchia ? { spese, modal: null, pendingFiles: [] } : { spese });
      if (schedaVecchia) avvisa('La scheda della spesa che avevi aperto è stata chiusa: le quote sono passate a ' + nome + ' con il subentro. Riaprila per vedere la ripartizione aggiornata (le modifiche non salvate di quella scheda vanno rifatte).');
      quoteOk = await salvaSpese !== false;
    }
    if (!quoteOk) {
      avvisa('⚠️ Subentro registrato per ' + nome + ' dal ' + dataPdf(data) + ', ma le quote delle spese future NON sono passate al nuovo condomino: modificale a mano nelle spese.'
        + (daPassare.size > MAX_SCRITTURE_SALVATAGGIO ? ' Le spese da passare sono più di ' + MAX_SCRITTURE_SALVATAGGIO + ' (il massimo per volta): chiedi assistenza.' : ''));
    } else if (nonPassate) {
      avvisa('⚠️ Subentro registrato per ' + nome + ' dal ' + dataPdf(data) + ', ma ' + (daPassare.size ? 'solo ' + daPassare.size + ' spese hanno passato la quota: ' : 'nessuna quota è passata: ')
        + nonPassate + ' ' + (nonPassate === 1 ? 'spesa è cambiata' : 'spese sono cambiate') + ' mentre il subentro si salvava (modificata, consuntivata o eliminata). Controlla le quote nelle spese.');
    } else {
      avvisa('✅ Subentro registrato: ' + nome + ' dal ' + dataPdf(data)
        + (daPassare.size ? ', con le quote di ' + daPassare.size + ' spese future.' : '.'));
    }
    if (!email) avvisa('Ricorda di aggiungere l\'email di ' + nome + ' per l\'accesso.');
  });
}
