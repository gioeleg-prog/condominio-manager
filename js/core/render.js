// Disegno dell'app: struttura, scelta della pagina, finestre, accessibilità, gesto di apertura del menu.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// ===========================
// RENDER ENGINE
// ===========================
function render() {
  const app = document.getElementById('app');
  const nomeProdotto = getBranding().nomeProdotto;
  if (!state.user) { document.title = nomeProdotto; app.innerHTML = renderLogin(); applyA11y(app); bindLogin(); return; }
  document.title = nomeEdificioAttivo() ? nomeEdificioAttivo() + ' · ' + nomeProdotto : nomeProdotto;
  // Ogni render ridisegna tutto: chi usa la tastiera perderebbe il punto in cui
  // si trova. Gli elementi con data-focus-key (es. i pulsanti degli anni)
  // ritrovano il focus dopo il ridisegno.
  const focusKey = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.focusKey;
  app.innerHTML = renderApp() + (state.viewer ? renderViewer() : '');
  // Applica classe per pagine a piena larghezza
  const _pageEl = document.querySelector('.page');
  if (_pageEl) {
    _pageEl.classList.toggle('page-full-width', ['spese'].includes(state.page));
  }
  applyA11y(app);
  bindApp();
  if (focusKey) { const el = app.querySelector(`[data-focus-key="${focusKey}"]`); if (el) el.focus(); }
}

// Accessibilità (QA, WCAG 2.2 AA): dopo ogni render collega le etichette dei
// campi (<div class="field"><label>…</label><input id=…>) ai rispettivi
// controlli e dà un nome ai menu di filtro che non hanno un'etichetta visibile,
// così i lettori di schermo annunciano a cosa serve ogni campo.
const A11Y_NAMES = {
  'anno-filter': 'Anno', 'anno-bilancio': 'Anno', 'filter-anno-spese': 'Anno', 'filter-anno-entrate': 'Anno',
  'filter-tipo-spese': 'Tipo di spesa', 'filter-stato-spese': 'Stato della spesa',
  'filter-cat-spese': 'Categoria', 'filter-fornitore-spese': 'Fornitore',
};

function applyA11y(root) {
  root.querySelectorAll('.field > label, .field label').forEach(label => {
    if (label.htmlFor || label.querySelector('input,select,textarea')) return;
    const field = label.closest('.field');
    const ctrl = field && field.querySelector('input:not([type=hidden]),select,textarea');
    if (!ctrl) return;
    if (ctrl.id) label.htmlFor = ctrl.id;
    else if (!ctrl.getAttribute('aria-label')) ctrl.setAttribute('aria-label', label.textContent.replace('*', '').trim());
  });
  root.querySelectorAll('select,input:not([type=hidden]),textarea').forEach(ctrl => {
    if (ctrl.getAttribute('aria-label') || ctrl.labels?.length) return;
    const spesa = ctrl.dataset.spesaId ? state.spese.find(s => String(s.id) === ctrl.dataset.spesaId) : null;
    const name = A11Y_NAMES[ctrl.id]
      || (ctrl.classList.contains('ruolo-select') ? 'Ruolo' : '')
      || (spesa ? 'Seleziona la spesa ' + (spesa.titolo || '') : '')
      || (ctrl.type === 'checkbox' ? 'Seleziona' : '')
      || ctrl.getAttribute('placeholder') || ctrl.getAttribute('title')
      || (ctrl.tagName === 'SELECT' && ctrl.options[0] ? ctrl.options[0].textContent.trim() : '');
    if (name) ctrl.setAttribute('aria-label', name);
  });
}

function renderApp() {
  const {user, page, sidebarOpen} = state;
  const isAdmin = canUserSeeImpostazioni(user);
  const canWrite = canUserEdit(user);
  const navLinks = [
    {id:'dashboard', label:'Dashboard', icon:svgDashboard()},
    {id:'spese', label:'Spese', icon:svgSpese()},
    {id:'entrate', label:'Entrate / Quote', icon:svgEntrate()},
    {id:'bilancio', label:'Bilancio', icon:svgBilancio()},
    {id:'confronto', label:'Confronto anni', icon:svgConfronto()},
    {id:'fornitori', label:'Fornitori', icon:svgFornitori()},
    {id:'vita', label:'Vita condominiale', icon:svgVita()},
    ...(canUserAdmin(user) ? [{id:'condomini', label:'Condomini', icon:svgCondomini()}] : []),
    ...(isAdmin ? [{id:'impostazioni', label:'Impostazioni', icon:svgSettings()}] : []),
  ];
  return `
  <div class="sidebar-overlay ${sidebarOpen?'show':''}" id="sidebar-overlay"></div>
  <div class="app${state.guidaAperta ? ' guida-aperta' : ''}">
    <aside class="sidebar ${sidebarOpen?'open':''}">
      <div class="sidebar-logo">
        <div class="icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Palazzo condominiale -->
            <rect x="3" y="4" width="18" height="17" rx="1" fill="white" opacity="0.15"/>
            <rect x="3" y="4" width="18" height="17" rx="1" stroke="white" stroke-width="1.5"/>
            <!-- Piano terra porta -->
            <rect x="9.5" y="14" width="5" height="7" rx="0.5" fill="white" opacity="0.9"/>
            <!-- Finestre piano 1 -->
            <rect x="5" y="7" width="3" height="3" rx="0.4" fill="white" opacity="0.8"/>
            <rect x="10.5" y="7" width="3" height="3" rx="0.4" fill="white" opacity="0.8"/>
            <rect x="16" y="7" width="3" height="3" rx="0.4" fill="white" opacity="0.8"/>
            <!-- Finestre piano 2 -->
            <rect x="5" y="12" width="3" height="3" rx="0.4" fill="white" opacity="0.8"/>
            <rect x="16" y="12" width="3" height="3" rx="0.4" fill="white" opacity="0.8"/>
            <!-- Tetto linea -->
            <path d="M1 4.5 L12 1 L23 4.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div style="min-width:0"><div class="label">${esc(getBranding().nomeProdotto)}</div><div class="sub">${esc(nomeEdificioAttivo())}</div></div>
      </div>
      <!-- Edificio attivo: cliccabile solo per superAdmin, label per adminEdificio, fisso per condomini -->
      ${isSuperAdmin(user) ? `
      <button class="edificio-switcher" id="btn-switch-edificio">
        <div class="ed-icon">🏢</div>
        <div class="ed-info">
          <div class="ed-nome">${esc((state.edifici.find(e=>e.id===state.edificioAttivo)||state.edifici[0]||{nome:'—'}).nome)}</div>
          <div class="ed-label">Cambia condominio</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--accent)"><path d="M6 9l6 6 6-6"/></svg>
      </button>` : `
      <div style="display:flex;align-items:center;gap:8px;padding:.5rem .875rem;margin:.5rem .75rem;background:var(--surface2);border-radius:8px;">
        <div style="width:28px;height:28px;border-radius:6px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">🏢</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${esc((state.edifici.find(e=>e.id===getUserEdificio(user))||state.edifici[0]||{nome:'—'}).nome)}
          </div>
          <div style="font-size:10px;color:var(--accent);font-weight:500">
            ${isAdminEdificio(user) ? '🔑 Amministratore' : '🏠 ' + esc(user?.appartamento||'Condomino')}
          </div>
        </div>
      </div>`}
      <nav>
        <div class="section-label">Menu</div>
        ${navLinks.map(l=>`<a class="${page===l.id?'active':''}" data-page="${l.id}">${l.icon}<span>${l.label}</span></a>`).join('')}
      </nav>
      <div class="sidebar-user">
        <div class="user-chip">
          <div class="avatar" style="${avatarStyle(user.color)}">${initials(user.nome)}</div>
          <div class="user-info">
            <div class="name">${esc(user.nome)}</div>
            <div class="role" style="display:flex;flex-direction:column;gap:2px">
              <span style="display:flex;align-items:center;gap:4px">
                <span class="badge ${getRuoloBadgeClass(user)}" style="padding:1px 7px;font-size:10px">${getRuoloLabel(user)}</span>
              ${!isSuperAdmin(user) && user.edificioId ? `<span style="font-size:10px;color:var(--text2)">${esc((state.edifici.find(e=>e.id===user.edificioId)||{nome:''}).nome)}</span>` : ''}
              </span>
              <span style="font-size:10px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px">${esc(user.email||'')}</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <button class="logout-btn" id="btn-change-pw" title="Cambia password" style="font-size:13px">🔑</button>
            <button class="logout-btn" id="btn-logout" title="Esci">${svgLogout()}</button>
          </div>
        </div>
        <div style="padding:.5rem 1rem;font-size:10px;color:var(--text2);text-align:center;border-top:1px solid var(--border);margin-top:.5rem">
          Powered by <strong>${esc(getBranding().fornitore)}</strong>
        </div>
      </div>
    </aside>
    <div class="main">
      <div class="topbar">
        <div class="topbar-left">
          <button class="hamburger" id="btn-hamburger" aria-label="Apri il menu">${svgMenu()}</button>
          <div>
            <div class="topbar-logo">🏠 ${esc(nomeEdificioAttivo() || getBranding().nomeProdotto)}</div>
          </div>
        </div>
        <div class="topbar-right">
          ${isSuperAdmin(user) ? `
          <button id="btn-topbar-switch-ed" style="background:var(--accent-light);border:1px solid var(--accent);border-radius:8px;padding:5px 10px;font-size:12px;font-weight:600;color:var(--accent);cursor:pointer;white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis" title="Cambia condominio">
            🏢 ${(state.edifici.find(e=>e.id===state.edificioAttivo)||state.edifici[0]||{nome:'—'}).nome.split(' ').slice(-2).join(' ')}
          </button>` : ''}
          <button id="btn-change-pw-top" class="topbar-avatar" style="${avatarStyle(user.color)}" title="Profilo e impostazioni">${initials(user.nome)}</button>
        </div>
        <!-- Menu profilo mobile (appare sul click avatar) -->
        <div class="mobile-profile-menu" id="mobile-profile-menu">
          <div style="padding:8px 12px 6px;font-size:12px;color:var(--text2);font-weight:600">${esc(user.nome)}</div>
          <div style="padding:0 12px 8px;font-size:11px;color:var(--text2)">${esc(user.email||'')}</div>
          ${isSuperAdmin(user) ? `
          <div class="mpm-sep"></div>
          <div style="padding:4px 12px 2px;font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.05em">Condominio attivo</div>
          <button class="mpm-item" id="mpm-switch-edificio" style="color:var(--accent)">
            🏢 ${esc((state.edifici.find(e=>e.id===state.edificioAttivo)||state.edifici[0]||{nome:'—'}).nome)}
            <span style="font-size:11px;color:var(--text2);margin-left:4px">· Cambia</span>
          </button>` : ''}
          <div class="mpm-sep"></div>
          <button class="mpm-item" id="mpm-change-pw">🔑 Cambia password</button>
          ${canUserSeeImpostazioni(user) ? '<button class="mpm-item" id="mpm-impostazioni">⚙️ Impostazioni</button>' : ''}
          <div class="mpm-sep"></div>
          <button class="mpm-item danger" id="mpm-logout">↩️ Esci</button>
        </div>
      </div>
      <div class="page">${renderPage()}</div>
    </div>

    <!-- BOTTOM NAV (mobile only) -->
    <nav class="bottom-nav">
      <div class="bottom-nav-inner">
        ${[
          {id:'dashboard', label:'Home',    icon:svgDashboard()},
          {id:'spese',     label:'Spese',   icon:svgSpese()},
          {id:'entrate',   label:'Entrate', icon:svgEntrate()},
          {id:'bilancio',  label:'Bilancio',icon:svgBilancio()},
          {id:'fornitori', label:'Fornitori', icon:svgFornitori()},
          ...(canUserAdmin(user) ? [{id:'condomini', label:'Persone', icon:svgCondomini()}] : []),
          {id:'vita', label:'Vita', icon:svgVita()},
          ...(canUserSeeImpostazioni(user) ? [{id:'impostazioni', label:'Impost.', icon:svgSettings()}] : []),
        ].map(l=>`<button class="bnav-item ${page===l.id?'active':''}" data-page="${l.id}">
          ${l.icon}<span>${l.label}</span>
          <div class="bnav-dot"></div>
        </button>`).join('')}
      </div>
    </nav>

    <!-- FAB (mobile only) -->
    ${(page==='spese'||page==='entrate') && canUserEdit(user) ? `
    <button class="fab" id="fab-add" title="Aggiungi">+</button>` : ''}

  </div>
  ${state.guidaAperta ? renderGuida() : ''}
  ${state.modal ? renderModal() : ''}`;
}

function bindApp() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.onclick = () => setState({page: el.dataset.page, sidebarOpen: false});
  });
  const lo = document.getElementById('btn-logout');
  if (lo) lo.onclick = async () => {
    if (window._fb) {
      try { await window._fb.signOut(window._fb.auth); } catch(e) {}
    }
    setState({user:null});
  };
  const bcp = document.getElementById('btn-change-pw');
  if (bcp) bcp.onclick = () => setState({modal:{type:'change-pw'}});

  // Topbar avatar → apri menu profilo mobile
  const bcpTop = document.getElementById('btn-change-pw-top');
  const mpm    = document.getElementById('mobile-profile-menu');
  if (bcpTop && mpm) {
    bcpTop.onclick = (e) => {
      e.stopPropagation();
      mpm.classList.toggle('open');
    };
    document.addEventListener('click', () => mpm.classList.remove('open'), {capture: false});
  }
  // Menu profilo: voci
  const mpmCpw  = document.getElementById('mpm-change-pw');
  const mpmImp  = document.getElementById('mpm-impostazioni');
  const mpmOut  = document.getElementById('mpm-logout');
  if (mpmCpw)  mpmCpw.onclick  = () => { mpm?.classList.remove('open'); setState({modal:{type:'change-pw'}}); };
  if (mpmImp)  mpmImp.onclick  = () => { mpm?.classList.remove('open'); setState({page:'impostazioni', sidebarOpen:false}); };
  if (mpmOut)  mpmOut.onclick  = async () => {
    mpm?.classList.remove('open');
    if (window._fb) { try { await window._fb.signOut(window._fb.auth); } catch(e) {} }
    setState({user:null});
  };

  // Edificio switcher in sidebar
  const bSwitchEd = document.getElementById('btn-switch-edificio');
  if (bSwitchEd) bSwitchEd.onclick = () => {
    if (!isSuperAdmin(state.user)) return; // solo superAdmin può cambiare condominio
    setState({modal:{type:'switch-edificio'}});
  };
  // Pulsante switch edificio nella topbar mobile
  const bTopSwEd = document.getElementById('btn-topbar-switch-ed');
  if (bTopSwEd) bTopSwEd.onclick = () => setState({modal:{type:'switch-edificio'}});

  // Switch edificio dal menu profilo mobile
  const mpmSwEd = document.getElementById('mpm-switch-edificio');
  if (mpmSwEd) mpmSwEd.onclick = () => {
    document.getElementById('mobile-profile-menu')?.classList.remove('open');
    setState({modal:{type:'switch-edificio'}});
  };
  // FAB
  const fab = document.getElementById('fab-add');
  if (fab) fab.onclick = () => {
    if (state.page==='spese') setState({modal:{type:'spesa',data:null}, pendingFiles:[]});
    else if (state.page==='entrate') setState({modal:{type:'entrata',data:null}});
  };
  const hb = document.getElementById('btn-hamburger');
  if (hb) hb.onclick = () => setState({sidebarOpen: !state.sidebarOpen});
  const ov = document.getElementById('sidebar-overlay');
  if (ov) ov.onclick = () => setState({sidebarOpen:false});
  // Chiudi sidebar cliccando sul contenuto principale su mobile
  const mainEl = document.querySelector('.main');
  if (mainEl) mainEl.addEventListener('click', e => {
    if (state.sidebarOpen && window.innerWidth <= 768) setState({sidebarOpen:false});
  }, {once:false, capture:false});
  bindPageActions();
  bindGuida();
  bindFiltroAnni();
  if (state.modal) bindModal();
  if (state.viewer) bindViewer();
}

// ===========================
// PAGE ROUTER
// ===========================
function renderPage() {
  switch(state.page) {
    case 'dashboard': return renderDashboard();
    case 'spese': return renderSpese();
    case 'entrate': return renderEntrate();
    case 'bilancio': return renderBilancio();
    case 'confronto': return renderConfronto();
    case 'fornitori': return renderFornitori();
    case 'vita': return renderVita();
    case 'condomini': return renderCondomini();
    case 'impostazioni': return canUserSeeImpostazioni(state.user) ? renderImpostazioni() : '<div class="empty"><p>Accesso non consentito.</p></div>';
    default: return renderDashboard();
  }
}

// ===========================
// MODAL SPESA
// ===========================
function renderModal() {
  const m = state.modal;
  if (m.type === 'spesa') return renderModalSpesa(m.data);
  if (m.type === 'entrata') return renderModalEntrata(m.data);
  if (m.type === 'cond') return renderModalCond(m.data);
  if (m.type === 'nuovo-utente') return renderModalNuovoUtente();
  if (m.type === 'firebase-user-created') return renderModalFirebaseUserCreated(m.data);
  if (m.type === 'disable-cond') return renderModalDisableCond(m.data);
  if (m.type === 'categoria') return renderModalCategoria(m.data);
  if (m.type === 'switch-edificio') return renderModalSwitchEdificio();
  if (m.type === 'edificio') return renderModalEdificio(m.data);
  if (m.type === 'fornitore') return renderModalFornitore(m.data);
  if (m.type === 'avviso') return renderModalAvviso(m.data);
  if (m.type === 'verbale') return renderModalVerbale(m.data);
  if (m.type === 'lavoro') return renderModalLavoro(m.data);
  if (m.type === 'delibera') return renderModalDelibera(m.data);
  if (m.type === 'storico-fornitore') return renderModalStoricoFornitore(m.data);
  if (m.type === 'change-pw') return renderModalChangePw();
  if (m.type === 'admin-reset-pw') return renderModalAdminResetPw(m.data);
  return '';
}

// --- MOBILE TOUCH SWIPE ---
(function() {
  let touchStartX = 0;
  let touchStartY = 0;
  document.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, {passive: true});
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
    if (dy > 60) return;
    if (dx > 60 && touchStartX < 30 && !state.sidebarOpen) {
      setState({sidebarOpen: true});
    } else if (dx < -60 && state.sidebarOpen) {
      setState({sidebarOpen: false});
    }
  }, {passive: true});
})();

function renderLoading() {
  return `<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;color:#5A6E8A">
    <div style="width:48px;height:48px;background:#2563EB;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:26px">🏠</div>
    <div style="font-weight:700;font-size:1.1rem;color:#1B2A4A">${esc(getBranding().nomeProdotto)}</div>
    <div style="font-size:14px">Connessione a Firebase…</div>
    <div style="width:200px;height:3px;background:#EEF2F7;border-radius:10px;overflow:hidden">
      <div style="height:100%;background:#2563EB;border-radius:10px;animation:loading-bar 1.5s ease-in-out infinite"></div>
    </div>
    <style>@keyframes loading-bar{0%{width:0%;margin-left:0}50%{width:60%;margin-left:20%}100%{width:0%;margin-left:100%}}</style>
  </div>`;
}
