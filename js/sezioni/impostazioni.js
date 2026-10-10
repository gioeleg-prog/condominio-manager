// Impostazioni: utenti, condomìni gestiti, categorie, registro accessi, backup/ripristino, migrazione storica.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// ===========================
// MIGRAZIONE DATI — edificioId
// ===========================
// Assegna edificioId ai record storici che ne sono privi.
// Va chiamata MANUALMENTE dal super admin dalla pagina impostazioni.
// Usa l'edificio con id più basso (il primo creato) come default sicuro.
function getMigrationStats() {
  const firstEdId = Math.min(...state.edifici.map(e=>e.id));
  const condSenza   = state.condomini.filter(c=>!c.edificioId && !c.superAdmin).length;
  const speseSenza  = state.spese.filter(s=>!s.edificioId).length;
  const entSenza    = state.entrate.filter(e=>!e.edificioId).length;
  const fornSenza   = state.fornitori.filter(f=>!f.edificioId).length;
  return { firstEdId, condSenza, speseSenza, entSenza, fornSenza,
    totale: condSenza + speseSenza + entSenza + fornSenza };
}

async function eseguiMigrazioneEdificioId(targetEdId) {
  const stats = getMigrationStats();
  if (stats.totale === 0) return { ok: true, migrati: 0 };

  const condomini = state.condomini.map(c =>
    (!c.edificioId && !c.superAdmin) ? {...c, edificioId: targetEdId} : c
  );
  const spese = state.spese.map(s =>
    (!s.edificioId) ? {...s, edificioId: targetEdId} : s
  );
  const entrate = state.entrate.map(e =>
    (!e.edificioId) ? {...e, edificioId: targetEdId} : e
  );
  const fornitori = state.fornitori.map(f =>
    (!f.edificioId) ? {...f, edificioId: targetEdId} : f
  );

  save('cm_condomini', condomini);
  save('cm_spese',     spese);
  save('cm_entrate',   entrate);
  save('cm_fornitori', fornitori);

  setState({ condomini, spese, entrate, fornitori });
  return { ok: true, migrati: stats.totale };
}

// ===========================
// CAMBIO EDIFICIO ATTIVO
// ===========================
async function cambiaEdificio(id, closeModal) {
  save('cm_edificio_attivo', id);
  // Aggiorna subito lo stato visivo
  state.edificioAttivo = id;
  if (closeModal) state.modal = null;
  render();
  // Ricarica dati freschi da Firestore — garantisce dati corretti per nuovo edificio
  if (window._fb) {
    await fbLoadAll();
    // Tutte le chiavi con stateProp (incluse bacheca/verbali/lavori/delibere),
    // tranne edificioAttivo: fbLoadAll può aver riletto il valore precedente
    // prima che la save() qui sopra arrivasse su Firestore.
    Object.entries(APPDATA_CONFIG).forEach(([key, cfg]) => {
      if (!cfg.stateProp || cfg.stateProp === 'edificioAttivo') return;
      const v = load(key, null);
      if (v && !(key === 'cm_edifici' && !v.length)) state[cfg.stateProp] = v;
    });
    _cache.cm_edificio_attivo = id;
  }
  // Se veniva dal modal switcher → vai a dashboard; altrimenti resta nella pagina corrente
  const targetPage = closeModal ? 'dashboard' : state.page;
  setState({edificioAttivo: id, page: targetPage, ...(closeModal ? {modal: null} : {})});
}

// ===========================
// APP SHELL
// ===========================

// Funzione globale per migrazione (chiamata da onclick inline)
window.avviaMigrazioneClick = async function() {
  const stats = getMigrationStats();
  const firstEd = state.edifici.find(e=>e.id===stats.firstEdId) || state.edifici[0];
  if (!firstEd) { alert('Nessun edificio trovato.'); return; }
  if (stats.totale === 0) { alert('Nessun record da migrare — tutto e gia associato.'); return; }
  const msg = 'Associare ' + stats.totale + ' record a "' + firstEd.nome + '"?' +
    (stats.condSenza  > 0 ? '\n- ' + stats.condSenza  + ' condomini'  : '') +
    (stats.speseSenza > 0 ? '\n- ' + stats.speseSenza + ' spese'      : '') +
    (stats.entSenza   > 0 ? '\n- ' + stats.entSenza   + ' versamenti' : '') +
    (stats.fornSenza  > 0 ? '\n- ' + stats.fornSenza  + ' fornitori'  : '') +
    '\n\nQuesta operazione salva su Firebase.';
  if (!confirm(msg)) return;
  const okEl = document.getElementById('migra-ok');
  try {
    const res = await eseguiMigrazioneEdificioId(firstEd.id);
    if (okEl) { okEl.textContent = 'Migrati ' + res.migrati + ' record a "' + firstEd.nome + '"'; okEl.style.display='block'; }
    setTimeout(() => setState({page:'impostazioni'}), 2000);
  } catch(err) {
    alert('Errore: ' + err.message);
  }
};

// ===========================
// BACKUP / RESTORE
// ===========================
// Backup e ripristino iterano APPDATA_CONFIG invece di un elenco a mano:
// l'elenco fisso non includeva bacheca/verbali/lavori/delibere, quindi il
// backup JSON le perdeva senza avvisare.
window.esportaDati = function() {
  const data = {};
  Object.entries(APPDATA_CONFIG).forEach(([key, cfg]) => {
    data[key] = cfg.stateProp ? state[cfg.stateProp] : load(key, null);
  });
  const backup = {
    version: 3,
    timestamp: new Date().toISOString(),
    edificioAttivo: state.edificioAttivo,
    data,
  };
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'backup-condominio-' + ymdLocale(new Date()) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  alert('Backup scaricato! Conserva il file JSON in un posto sicuro.');
};

window.importaDati = function(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const backup = JSON.parse(e.target.result);
      if (!backup.data) { alert('File backup non valido.'); return; }
      if (!confirm('Importare il backup del ' + (backup.timestamp||'data sconosciuta') + '?\n\nQuesta operazione SOVRASCRIVE tutti i dati attuali.')) return;
      const d = backup.data;
      // Salva su Firebase
      // Solo le chiavi presenti nel file: un backup v2 (prima di bacheca/
      // verbali/lavori/delibere) non azzera le sezioni che non conteneva.
      Object.entries(APPDATA_CONFIG).forEach(([key, cfg]) => {
        if (d[key] == null) return;
        if (cfg.stateProp) state[cfg.stateProp] = d[key];
        save(key, d[key]);
      });
      setState({page:'dashboard'});
      alert('✅ Dati ripristinati con successo!');
    } catch(err) {
      alert('Errore durante il ripristino: ' + err.message);
    }
  };
  reader.readAsText(file);
};

// ===========================
// IMPOSTAZIONI
// ===========================
// ===========================
// LOG ACCESSI UTENTI — solo superAdmin (Impostazioni)
// ===========================
function renderLogAccessiSection() {
  const meseNomiFull = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const oggi = new Date();
  const meseCorrente = oggi.getFullYear() + '-' + String(oggi.getMonth()+1).padStart(2,'0');
  const stats = state.loginStats || {};

  // Tutti i condomini attivi (di tutti i condomini/edifici gestiti) + il super admin, anche se
  // non ha un proprio record in state.condomini (caso comune: riconosciuto solo via UID/email di config).
  const utenti = state.condomini.filter(c => !c.disabled);
  if (!utenti.some(c => c.superAdmin) && stats['0']) {
    utenti.unshift({ id: 0, nome: stats['0'].nome || 'Super Admin', superAdmin: true, appartamento: 'Admin' });
  }

  const righe = utenti.map(c => {
    const s = stats[c.id] || null;
    return {
      c,
      ultimoLogin: s?.ultimoLogin || null,
      totale: s?.totale || 0,
      mensile: s?.mensile || {},
      questoMese: (s?.mensile || {})[meseCorrente] || 0,
    };
  }).sort((a, b) => {
    if (!a.ultimoLogin && !b.ultimoLogin) return a.c.nome.localeCompare(b.c.nome);
    if (!a.ultimoLogin) return 1;
    if (!b.ultimoLogin) return -1;
    return b.ultimoLogin.localeCompare(a.ultimoLogin);
  });

  const maiEntrati = righe.filter(r => !r.ultimoLogin).length;

  const righeHtml = righe.map(r => {
    const ed = !r.c.superAdmin ? state.edifici.find(e => e.id === r.c.edificioId) : null;
    const mesiOrdinati = Object.entries(r.mensile).sort((a, b) => b[0].localeCompare(a[0]));
    const dettaglioMensile = mesiOrdinati.length
      ? '<table style="width:100%;font-size:11px;margin-top:4px">' +
        mesiOrdinati.map(([k, v]) => {
          const [yy, mm] = k.split('-');
          return '<tr><td style="padding:2px 8px 2px 0">' + meseNomiFull[parseInt(mm) - 1] + ' ' + yy + '</td><td style="padding:2px 0;text-align:right;font-weight:600">' + v + '</td></tr>';
        }).join('') + '</table>'
      : '';

    return '<tr>' +
      '<td><div style="display:flex;align-items:center;gap:8px">' +
      '<div class="avatar" style="' + avatarStyle(r.c.color) + ';width:28px;height:28px;font-size:11px;flex-shrink:0">' + initials(r.c.nome) + '</div>' +
      '<div><div style="font-size:13px;font-weight:500">' + esc(r.c.nome) + (r.c.superAdmin ? ' <span class="badge badge-blue" style="font-size:9px">Admin</span>' : '') + '</div>' +
      (ed ? '<div style="font-size:11px;color:var(--text2)">' + esc(ed.nome) + '</div>' : '') +
      '</div></div></td>' +
      '<td style="font-size:13px;white-space:nowrap">' + (r.ultimoLogin ? esc(r.ultimoLogin) : '<span style="color:var(--text2)">Mai effettuato</span>') + '</td>' +
      '<td style="text-align:right;font-weight:700">' + r.totale + '</td>' +
      '<td style="text-align:right;color:' + (r.questoMese > 0 ? 'var(--green)' : 'var(--text2)') + '">' + r.questoMese + '</td>' +
      '<td>' + (mesiOrdinati.length ? '<details><summary style="cursor:pointer;font-size:11px;color:var(--accent)">Per mese</summary>' + dettaglioMensile + '</details>' : '<span style="color:var(--text2)">—</span>') + '</td>' +
      '</tr>';
  }).join('');

  return `
    <div class="section-divider"><h3>📈 Log accessi utenti</h3></div>
    ${maiEntrati > 0 ? `<div class="alert alert-warning" style="margin-bottom:1rem;font-size:13px">⚠️ <strong>${maiEntrati}</strong> di ${righe.length} utenti non ${maiEntrati === 1 ? 'ha' : 'hanno'} mai effettuato l'accesso.</div>` : ''}
    <div class="table-wrap" style="margin-bottom:1.5rem">
      <table>
        <thead><tr><th>Utente</th><th>Ultimo accesso</th><th style="text-align:right">Totale accessi</th><th style="text-align:right">Questo mese</th><th>Storico mensile</th></tr></thead>
        <tbody>${righeHtml || '<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:1rem">Nessun utente.</td></tr>'}</tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:1.5rem">💡 Un accesso viene contato ogni volta che l'app verifica con successo l'identità dell'utente — sia con login esplicito sia riaprendo l'app con una sessione già attiva. Il conteggio non distingue le due cose.</div>
  `;
}

function renderImpostazioni() {
  const legenda = `
    <div style="display:flex;gap:.75rem;flex-wrap:wrap;font-size:12px;color:var(--text2)">
      <span><span class="badge badge-purple" style="font-size:11px">Amministratore</span> Impostazioni + controllo totale</span>
      <span><span class="badge badge-green" style="font-size:11px">Modifica</span> Aggiunge e modifica</span>
      <span><span class="badge badge-gray" style="font-size:11px">Lettura</span> Solo lettura</span>
    </div>`;

  return `
  <div>
    <div class="page-header">
      <div>
        <div class="page-title">Impostazioni</div>
        <div class="page-sub">Gestione utenti, ruoli e sicurezza</div>
      </div>
    </div>

    <!-- STATS UTENTI -->
    <div class="stats-grid" style="margin-bottom:1.5rem">
      ${(()=>{
        const myEd = getUserEdificio(state.user);
        const visibili = state.condomini.filter(c => !c.edificioId || c.edificioId === state.edificioAttivo);
        const attivi = visibili.filter(c=>!c.disabled);
        const adminCount = attivi.filter(c=>c.isAdmin).length + (isSuperAdmin(state.user)?1:0);
        const modifica = attivi.filter(c=>c.canEdit&&!c.isAdmin).length;
        const disab = visibili.filter(c=>c.disabled).length;
        return `
        <div class="stat-card">
          <div class="stat-label">Utenti attivi</div>
          <div class="stat-value" style="color:var(--accent)">${attivi.length + (isSuperAdmin(state.user)?1:0)}</div>
          <div class="stat-sub">${isSuperAdmin(state.user)?'incl. super admin':'in questo condominio'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Amministratori</div>
          <div class="stat-value" style="color:var(--purple)">${adminCount}</div>
          <div class="stat-sub">con accesso Impostazioni</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Ruolo Modifica</div>
          <div class="stat-value" style="color:var(--green)">${modifica}</div>
          <div class="stat-sub">possono aggiungere dati</div>
        </div>
        <div class="stat-card ${disab>0?'stat-amber':''}">
          <div class="stat-label">Disabilitati</div>
          <div class="stat-value" style="color:${disab>0?'var(--amber)':'var(--text2)'}">${disab}</div>
          <div class="stat-sub">in archivio storico</div>
        </div>`;
      })()}
    </div>

    <!-- HEADER SEZIONE UTENTI -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem">
      <div>
        <div class="section-divider"><h3>👥 Utenti del condominio</h3></div>
        ${legenda}
      </div>
      <button class="btn btn-primary" id="btn-nuovo-utente" style="width:auto">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Aggiungi utente
      </button>
    </div>

    <!-- CARD GRIGLIA UTENTI ATTIVI -->
    ${!isSuperAdmin(state.user) ? `<div class="alert alert-info" style="margin-bottom:1rem;font-size:13px">
      👁️ Stai gestendo il condominio <strong>${esc((state.edifici.find(e=>e.id===state.edificioAttivo)||{nome:'—'}).nome)}</strong>. Vedi e gestisci solo i condomini di questo edificio.
    </div>` : ''}
    <div class="utenti-grid" style="padding:0;margin-bottom:1.5rem">
      ${(state.condomini.filter(c => !c.edificioId || c.edificioId === state.edificioAttivo)).filter(c=>!c.disabled).map(c => {
        const _entImp = state.entrate.filter(e => !e.edificioId || e.edificioId === state.edificioAttivo); const versato = _entImp.filter(e=>e.condominoId===c.id).reduce((a,e)=>a+parseFloat(e.importo||0),0);
        return `<div class="utente-card">
          <div class="uc-head">
            <div class="avatar-lg" style="${avatarStyle(c.color)}">${initials(c.nome)}</div>
            <div style="flex:1;min-width:0">
              <div class="uc-name">${esc(c.nome)}</div>
              <div class="uc-apt">🏠 ${esc(c.appartamento)}</div>
          ${c.username ? `<div style="font-size:11px;color:var(--text2);margin-top:1px">👤 ${esc(c.username)}</div>` : ''}
            </div>
          </div>
          <div class="uc-ruolo-bar">
            <span class="badge ${getRuoloBadgeClass(c)}">${getRuoloLabel(c)}</span>
          </div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:.4rem;display:flex;align-items:center;gap:4px">
            🏢 <strong style="color:var(--accent)">${(()=>{const e=state.edifici.find(x=>x.id===(c.edificioId||state.edificioAttivo)); return e?esc(e.nome):'Non assegnato';})()}</strong>
          </div>
          <div class="uc-email">📧 ${esc(c.email||'—')}</div>
          <div class="uc-row">
            <span style="font-size:12px;color:var(--text2)">Versato tot.</span>
            <span style="font-size:13px;font-weight:600;color:var(--green)">${fmt(versato)}</span>
          </div>
          <div class="uc-row" style="align-items:center">
            <span style="font-size:12px;color:var(--text2)">Ruolo</span>
            <select class="ruolo-select" data-ruolo-id="${c.id}" style="padding:4px 26px 4px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;background:var(--surface)">
              <option value="lettura"       ${!c.canEdit&&!c.isAdmin?'selected':''}>Lettura</option>
              <option value="modifica"      ${c.canEdit&&!c.isAdmin?'selected':''}>Modifica</option>
              <option value="adminedificio" ${c.isAdmin&&!c.superAdmin?'selected':''}>Amm. Edificio</option>
              ${isSuperAdmin(state.user)?`<option value="superadmin" ${c.superAdmin?'selected':''}>${c.superAdmin?'⭐ Super Admin':'↑ Super Admin'}</option>`:''}
            </select>
          </div>
          <div class="uc-actions">
            <button class="btn btn-secondary btn-sm" data-edit-cond="${c.id}" style="flex:1">✏️</button>
            <button class="btn btn-secondary btn-sm" data-admin-reset-pw="${c.id}" style="flex:1">🔑</button>
            <button class="btn btn-secondary btn-sm" data-disable-cond="${c.id}" title="Disabilita utente" style="color:var(--amber)">⏸</button>
            <button class="btn btn-danger btn-sm" data-delete-cond="${c.id}" title="Elimina utente">🗑</button>
          </div>
        </div>`;
      }).join('')}
    </div>

    <!-- UTENTI DISABILITATI / STORICO -->
    ${(()=>{ const _vis=state.condomini.filter(c => !c.edificioId || c.edificioId === state.edificioAttivo); return _vis.filter(c=>c.disabled).length > 0 ? `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem">
      <div class="section-divider" style="flex:1"><h3>📦 Archivio storico — utenti disabilitati</h3></div>
    </div>
    <div class="alert alert-info" style="margin-bottom:1rem;font-size:13px">
      ℹ️ Gli utenti disabilitati non possono accedere al sistema ma le loro spese e versamenti rimangono visibili nello storico.
    </div>
    <div class="utenti-grid" style="padding:0;margin-bottom:1.5rem">
      ${_vis.filter(c=>c.disabled).map(c => {
        const _entImpD = state.entrate.filter(e => !e.edificioId || e.edificioId === state.edificioAttivo); const versato = _entImpD.filter(e=>e.condominoId===c.id).reduce((a,e)=>a+parseFloat(e.importo||0),0);
        const _speseImpD = state.spese.filter(s => !s.edificioId || s.edificioId === state.edificioAttivo); const nSpese = _speseImpD.filter(s=>s.split?.some(x=>x.id===c.id)).length;
        const disabledOn = c.disabledOn ? new Date(c.disabledOn).toLocaleDateString('it-IT') : '—';
        return `<div class="utente-card disabled">
          <div class="disabled-banner">⏸ Disabilitato il ${disabledOn}${c.disabledNote ? ' · ' + esc(c.disabledNote) : ''}</div>
          <div class="uc-head">
            <div class="avatar-lg" style="${avatarStyle(c.color)}">${initials(c.nome)}</div>
            <div style="flex:1;min-width:0">
              <div class="uc-name">${esc(c.nome)}</div>
              <div class="uc-apt">🏠 ${esc(c.appartamento)}</div>
            </div>
          </div>
          <div class="uc-ruolo-bar"><span class="badge badge-disabled">Disabilitato</span></div>
          <div class="uc-email">📧 ${esc(c.email||'—')}</div>
          <div class="uc-row">
            <span style="font-size:12px;color:var(--text2)">Versato storico</span>
            <span style="font-size:13px;font-weight:600;color:var(--text2)">${fmt(versato)}</span>
          </div>
          <div class="uc-row">
            <span style="font-size:12px;color:var(--text2)">Spese collegate</span>
            <span style="font-size:13px;color:var(--text2)">${nSpese}</span>
          </div>
          <div class="uc-actions">
            <button class="btn btn-success btn-sm" data-enable-cond="${c.id}" style="flex:1">▶ Riabilita</button>
            <button class="btn btn-danger btn-sm" data-delete-cond="${c.id}">🗑 Elimina</button>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''; })()}

    <!-- ADMIN OWN PASSWORD + FIREBASE -->
    <div class="section-divider"><h3>🔐 Sicurezza account admin</h3></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem;margin-bottom:1.5rem">
      <div class="utente-card" style="display:flex;align-items:center;gap:12px">
        <div class="avatar-lg" style="${avatarStyle(state.user.color)}">${initials(state.user.nome)}</div>
        <div style="flex:1">
          <div style="font-weight:700">${esc(state.user.nome)}</div>
          <div style="font-size:12px;color:var(--text2)">${esc(state.user.email||'')} · <span class="badge badge-purple" style="font-size:11px">Amministratore</span></div>
          <button class="btn btn-secondary btn-sm" id="btn-admin-change-own-pw" style="margin-top:.5rem">🔑 Cambia password</button>
        </div>
      </div>
      <div class="utente-card">
        <div style="font-weight:600;margin-bottom:.5rem">🔒 Accesso con Google</div>
        <div id="google-link-state" style="font-size:12px;color:var(--text2);margin-bottom:.75rem">Collega il tuo account Google per accedere con un clic e con la verifica in due passaggi di Google (consigliato per l'account admin).</div>
        <button class="btn btn-secondary btn-sm" id="btn-link-google" style="display:inline-flex;align-items:center;gap:.4rem">
          <svg width="15" height="15" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Collega account Google
        </button>
      </div>
      <div class="utente-card">
        <div style="font-weight:600;margin-bottom:.5rem">🔥 Firebase Authentication</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:.75rem">Per creare o resettare l'account Firebase di un condomino, usa il pannello Firebase Console.</div>
        <a href="https://console.firebase.google.com/project/condominio-manager-9e99a/authentication/users" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="text-decoration:none;display:inline-flex">
          👥 Apri Firebase Console →
        </a>
      </div>
    </div>

    <!-- CATEGORIE DI SPESA -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;flex-wrap:wrap;gap:.5rem">
      <div class="section-divider" style="flex:1"><h3>🏷️ Categorie di spesa</h3></div>
      ${isSuperAdmin(state.user)
        ? `<button class="btn btn-primary" id="btn-nuova-cat" style="width:auto">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuova categoria</button>`
        : `<span style="font-size:12px;color:var(--text2)">🔒 Solo il super admin gestisce le categorie</span>`}
    </div>

    ${(()=>{
      const cats = getCategorie();
      const gruppi = [
        { tipo:'ordinaria',    label:'Spese ordinarie',    cls:'tipo-pill-ord', iconCls:'cat-tipo-ord' },
        { tipo:'straordinaria',label:'Spese straordinarie',cls:'tipo-pill-str', iconCls:'cat-tipo-str' },
        { tipo:'entrata',      label:'Entrate / Quote',    cls:'tipo-pill-ent', iconCls:'cat-tipo-ent' },
      ];
      return gruppi.map(g => {
        const items = cats.filter(c=>c.tipo===g.tipo);
        if (!items.length) return '';
        return `
        <div style="margin-bottom:1.25rem">
          <div style="font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.6rem;display:flex;align-items:center;gap:6px">
            <span class="tipo-pill ${g.cls}">${g.label}</span>
            <span style="font-weight:400">${items.length} categorie</span>
          </div>
          <div class="cat-grid">
            ${items.map(c => {
              const _catSpese = state.spese.filter(s => !s.edificioId || s.edificioId === state.edificioAttivo);
          const usata = _catSpese.filter(s=>s.categoria===c.id).length;
              return `<div class="cat-card">
                <div class="cat-icon ${g.iconCls}">${esc(c.icon||'📦')}</div>
                <div class="cat-info">
                  <div class="cat-name">${esc(c.label)}</div>
                  <div class="cat-meta">
                    <span class="tipo-pill ${g.cls}" style="font-size:9px">${g.label}</span>
                    ${c.builtin ? '<span class="cat-builtin-badge">predefinita</span>' : ''}
                    <span style="color:var(--text2)">${usata} uso/i</span>
                  </div>
                </div>
                ${isSuperAdmin(state.user) ? `<div class="cat-actions">
                  <button class="allegato-btn" data-edit-cat="${c.id}" title="Modifica categoria">✏️</button>
                  ${c.builtin
                    ? `<button class="allegato-btn" title="Categoria predefinita — non eliminabile" style="opacity:.3;cursor:not-allowed">🗑</button>`
                    : `<button class="allegato-btn danger" data-del-cat="${c.id}" title="${usata>0?'Usata in '+usata+' spese — verrà rimossa':'Elimina'}">🗑</button>`}
                </div>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('');
    })()}

    <!-- GESTIONE CONDOMINI / EDIFICI (solo superAdmin) -->
    ${isSuperAdmin(state.user) ? `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem">
      <div class="section-divider" style="flex:1"><h3>🏢 Gestione condomini</h3></div>
      <button class="btn btn-primary" id="btn-nuovo-edificio" style="width:auto">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nuovo condominio
      </button>
    </div>
    <div class="edificio-grid" style="margin-bottom:1.5rem">
      ${state.edifici.map(e => {
        const nCondomini = state.condomini.filter(c=>c.edificioId===e.id&&!c.disabled&&!c.superAdmin).length;
        const nSpese     = state.spese.filter(s=>!s.edificioId||s.edificioId===e.id).length;
        const isActive   = e.id === state.edificioAttivo;
        return `<div class="edificio-card ${isActive?'active':''}" style="cursor:default">
          <div class="ec-head">
            <div class="ec-icon" style="background:${esc(e.colore||'#2563EB')}22;font-size:22px">${esc(e.emoji||'🏢')}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:15px">${esc(e.nome)}</div>
              <div style="font-size:12px;color:var(--text2)">${esc(e.indirizzo||'—')}</div>
            </div>
            ${isActive ? '<span class="badge badge-blue" style="font-size:11px">Attivo</span>' : ''}
          </div>
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-top:1px solid var(--border)">
            <span style="color:var(--text2)">Condomini attivi</span><span style="font-weight:600">${nCondomini}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-top:1px solid var(--border)">
            <span style="color:var(--text2)">Spese registrate</span><span style="font-weight:600">${nSpese}</span>
          </div>
          ${e.note ? `<div style="font-size:12px;color:var(--text2);margin-top:6px;font-style:italic">${esc(e.note)}</div>` : ''}
          <div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap">
            ${!isActive ? `<button class="btn btn-secondary btn-sm" data-attiva-edificio="${e.id}" style="flex:1">▶ Attiva</button>` : '<span class="badge badge-blue" style="flex:1;justify-content:center">Condominio attivo</span>'}
            <button class="btn btn-secondary btn-sm" data-edit-edificio="${e.id}" title="Modifica nome e dati condominio">✏️</button>
            ${state.edifici.length > 1 ? `<button class="btn btn-danger btn-sm" data-del-edificio="${e.id}" title="Elimina condominio (solo se vuoto)">🗑</button>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="alert alert-info" style="margin-bottom:1.5rem;font-size:13px">
      💡 Ogni condomino e ogni spesa è associato al condominio attivo. Usa il pulsante 🏢 in cima alla sidebar per passare da un condominio all'altro.
    </div>

    ` : ''}

    <!-- LOG ACCESSI UTENTI (solo superAdmin) -->
    ${isSuperAdmin(state.user) ? renderLogAccessiSection() : ''}

    <!-- MIGRAZIONE EDIFICIO ID -->
    ${isSuperAdmin(state.user) ? `
    ${(()=>{
      const stats = getMigrationStats();
      if (stats.totale === 0) return `
        <div class="alert alert-success" style="margin-bottom:1.5rem;font-size:13px">
          ✅ <strong>Database integro</strong> — tutti i record hanno l'identificativo condominio. Nessuna migrazione necessaria.
        </div>`;
      const firstEd = state.edifici.find(e=>e.id===stats.firstEdId) || state.edifici[0] || {nome:'—'};
      return `
      <div class="section-divider"><h3>⚠️ Migrazione dati — Identificativo condominio</h3></div>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:var(--radius);padding:1.25rem;margin-bottom:1.5rem">
        <div style="font-weight:700;color:#92400e;margin-bottom:.75rem">
          ${stats.totale} record senza identificativo condominio
        </div>
        <div style="font-size:13px;color:#92400e;margin-bottom:1rem;display:flex;flex-direction:column;gap:3px">
          ${stats.condSenza>0?`<div>👥 ${stats.condSenza} condomini</div>`:''}
          ${stats.speseSenza>0?`<div>📋 ${stats.speseSenza} spese</div>`:''}
          ${stats.entSenza>0?`<div>💰 ${stats.entSenza} versamenti</div>`:''}
          ${stats.fornSenza>0?`<div>🏢 ${stats.fornSenza} fornitori</div>`:''}
        </div>
        <div style="font-size:13px;color:#92400e;margin-bottom:1rem">
          Questi record sono stati creati prima del supporto multi-condominio.
          Clicca il pulsante per associarli a <strong>${esc(firstEd.nome)}</strong> (il condominio originale).
        </div>
        <button class="btn btn-primary" onclick="avviaMigrazioneClick()" style="background:#d97706;border-color:#d97706;cursor:pointer">
          🔧 Avvia migrazione → associa a "${esc(firstEd.nome)}"
        </button>
        <div id="migra-ok" style="display:none;margin-top:.75rem" class="alert alert-success"></div>
      </div>`;
    })()}
    ` : ''}

    <!-- BACKUP / RESTORE -->
    ${isSuperAdmin(state.user) ? `
    <div class="section-divider"><h3>💾 Backup e ripristino dati</h3></div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;margin-bottom:1.5rem">
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:1;min-width:200px">
          <div style="font-weight:600;margin-bottom:.25rem">📥 Esporta backup</div>
          <div style="font-size:13px;color:var(--text2);margin-bottom:.75rem">Scarica tutti i dati in un file JSON. Salvalo in un posto sicuro.</div>
          <button class="btn btn-primary" onclick="esportaDati()">💾 Scarica backup JSON</button>
        </div>
        <div style="flex:1;min-width:200px">
          <div style="font-weight:600;margin-bottom:.25rem">📤 Importa backup</div>
          <div style="font-size:13px;color:var(--text2);margin-bottom:.75rem">Ripristina i dati da un file JSON precedentemente esportato.</div>
          <label class="btn btn-secondary" style="cursor:pointer">
            📂 Seleziona file backup
            <input type="file" accept=".json" style="display:none" onchange="importaDati(this.files[0])">
          </label>
        </div>
      </div>
      <div style="font-size:12px;color:var(--amber);margin-top:.75rem;padding:.5rem .75rem;background:#fffbeb;border-radius:var(--radius-sm)">
        ⚠️ Fai un backup prima di ogni aggiornamento del file o operazione di reset. Il backup include spese, versamenti, condomini, fornitori ed edifici.
      </div>
    </div>
    ` : ''}

    <!-- FIRESTORE INFO -->
    <div class="section-divider"><h3>🔥 Firebase / Firestore</h3></div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;margin-bottom:1.5rem">
      <div style="display:flex;flex-wrap:wrap;gap:1rem;align-items:flex-start">
        <div style="flex:1;min-width:200px">
          <div style="font-weight:600;margin-bottom:.4rem">Progetto Firebase</div>
          <div style="font-size:13px;color:var(--text2)">condominio-manager-9e99a</div>
          <div style="font-size:12px;color:var(--text2);margin-top:4px">I dati sono salvati su Firestore · Auth attiva</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:.5rem">
          <a href="https://console.firebase.google.com/project/condominio-manager-9e99a/firestore" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="text-decoration:none">📊 Firestore Console</a>
          <a href="https://console.firebase.google.com/project/condominio-manager-9e99a/authentication/users" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="text-decoration:none">👥 Authentication Console</a>
        </div>
      </div>
    </div>

    ${renderOpsSection()}
    ${isSuperAdmin(state.user) ? `
    <div class="section-divider"><h3>🏷️ Nome del servizio</h3></div>
    <div class="card" style="max-width:480px;margin-bottom:1.5rem">
      <div class="field"><label>Nome del prodotto</label><input type="text" id="br-nome" value="${esc(getBranding().nomeProdotto)}" maxlength="60"></div>
      <div class="field"><label>Fornitore (mostrato in fondo al menu e al login)</label><input type="text" id="br-fornitore" value="${esc(getBranding().fornitore)}" maxlength="60"></div>
      <p class="hint" style="margin-bottom:.75rem">Il nome di ciascun condominio si modifica dalla sua scheda in "Gestione condomini" qui sotto.</p>
      <button class="btn btn-primary" id="btn-save-branding">💾 Salva</button>
    </div>
    ` : ''}

    <!-- DATI E RESET (solo superAdmin: reset e categorie sono dati globali,
         firestore.rules ne nega comunque la scrittura agli altri ruoli) -->
    ${isSuperAdmin(state.user) ? `
    <div class="section-divider"><h3>⚠️ Zona pericolosa</h3></div>
    <div style="background:var(--red-light);border:1px solid #fecaca;border-radius:var(--radius);padding:1.25rem;max-width:480px">
      <div style="font-weight:600;margin-bottom:.4rem;color:var(--red)">Svuota i dati di questo condominio</div>
      <div style="font-size:13px;color:#7f1d1d;margin-bottom:.75rem">Elimina spese, entrate, fornitori, bacheca, verbali, lavori e delibere di <strong>${esc((state.edifici.find(e=>e.id===state.edificioAttivo)||{nome:'—'}).nome)}</strong>. Gli altri condomini, i condomini registrati e i loro account non vengono toccati. Operazione irreversibile: scarica prima il backup.</div>
      <button class="btn btn-danger" id="btn-reset">🗑 Svuota dati del condominio</button>
      <button class="btn btn-danger" id="btn-reset-cats" style="background:var(--amber-light);color:var(--amber);border-color:#fde68a">↩ Ripristina categorie default</button>
    </div>
    ` : ''}
  </div>`;
}

// ===========================
// MODAL SWITCH EDIFICIO
// ===========================
function renderModalSwitchEdificio() {
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:500px">
      <div class="modal-header">
        <h2>🏢 Seleziona condominio</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="edificio-grid">
          ${state.edifici.map(e => {
            const nCondomini = state.condomini.filter(c=>c.edificioId===e.id&&!c.disabled&&!c.superAdmin).length;
            const isActive = e.id === state.edificioAttivo;
            return `<div class="edificio-card ${isActive?'active':''}" data-sel-edificio="${e.id}">
              <div class="ec-head">
                <div class="ec-icon" style="background:${esc(e.colore||'#2563EB')}22">${esc(e.emoji||'🏢')}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:700;font-size:15px">${esc(e.nome)}</div>
                  <div style="font-size:12px;color:var(--text2)">${esc(e.indirizzo||'')}</div>
                </div>
                ${isActive ? '<span class="badge badge-blue" style="font-size:11px">Attivo</span>' : ''}
              </div>
              <div style="display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-top:1px solid var(--border)">
                <span style="color:var(--text2)">Condomini</span><span style="font-weight:600">${nCondomini}</span>
              </div>
              ${e.note ? `<div style="font-size:12px;color:var(--text2);margin-top:4px;font-style:italic">${esc(e.note)}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
        ${state.user?.isAdmin ? `<button class="btn btn-secondary" style="width:100%" id="btn-gestisci-edifici">⚙️ Gestisci condomini →</button>` : ''}
      </div>
    </div>
  </div>`;
}

function renderModalEdificio(d) {
  const isEdit = !!d?.id;
  const EMOJI_EDIFICI = ['🏢','🏠','🏗️','🏬','🏛️','🏰','🏯','🏪','🏨','🏦'];
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <h2>${isEdit ? '✏️ Modifica condominio' : '🏢 Nuovo condominio'}</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label>Nome condominio *</label>
          <input type="text" id="ed-nome" value="${esc(d?.nome||'')}" placeholder="Es. Via Verdi 5">
        </div>
        <div class="field">
          <label>Indirizzo completo</label>
          <input type="text" id="ed-indirizzo" value="${esc(d?.indirizzo||'')}" placeholder="Via Verdi 5, 47921 Rimini (RN)">
        </div>
        <div class="form-row">
          <div class="field">
            <label>Icona</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
              ${EMOJI_EDIFICI.map(em=>`<button type="button" class="icon-opt ed-emoji-opt ${(d?.emoji||'🏢')===em?'selected':''}" data-ed-emoji="${em}" style="width:38px;height:38px;font-size:20px">${em}</button>`).join('')}
            </div>
            <input type="hidden" id="ed-emoji" value="${esc(d?.emoji||'🏢')}">
          </div>
          <div class="field">
            <label>Colore</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
              ${['#2563EB','#16A34A','#D97706','#DC2626','#7C3AED','#06B6D4','#1B2A4A'].map(c=>
                `<button type="button" class="ed-color-opt" data-ed-color="${c}" style="width:28px;height:28px;border-radius:50%;background:${c};border:3px solid ${(d?.colore||'#2563EB')===c?'white':'transparent'};box-shadow:${(d?.colore||'#2563EB')===c?'0 0 0 2px '+c:'none'};cursor:pointer"></button>`
              ).join('')}
            </div>
            <input type="hidden" id="ed-colore" value="${esc(d?.colore||'#2563EB')}">
          </div>
        </div>
        <div class="field">
          <label>Note</label>
          <textarea id="ed-note" rows="2" placeholder="Es. Amministratore: Gioele Gagliardi, 6 appartamenti…">${esc(d?.note||'')}</textarea>
        </div>
        <div id="ed-err" class="alert alert-warning" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        <button class="btn btn-primary" id="btn-save-edificio" data-id="${d?.id||''}">
          💾 ${isEdit ? 'Salva modifiche' : 'Aggiungi condominio'}
        </button>
      </div>
    </div>
  </div>`;
}

// ===========================
// MODAL CATEGORIA
// ===========================
const ICONE_DISPONIBILI = ['🧹','💡','💧','🛗','🌿','🛡️','📋','🔧','🔥','🏗️','⚡','🏢','🏠','💰','📦',
  '🚿','🪟','🔑','🪴','🚗','📬','🧰','🔨','🏊','♻️','🌡️','📡','🧲','🔌','🪣','🛠️','⚙️','🏋️','💼','📝'];

function renderModalCategoria(d) {
  const isEdit = !!d?.id;
  const selTipo = d?.tipo || 'ordinaria';
  const selIcon = d?.icon || '📦';
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:500px">
      <div class="modal-header">
        <h2>${isEdit ? '✏️ Modifica categoria' : '🏷️ Nuova categoria'}</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">

        <div class="form-row">
          <div class="field" style="flex:2">
            <label>Nome categoria *</label>
            <input type="text" id="cat-label" value="${esc(d?.label||'')}" placeholder="Es. Piscina condominiale" maxlength="60" autofocus>
          </div>
          <div class="field">
            <label>Tipo spesa *</label>
            <select id="cat-tipo">
              <option value="ordinaria"     ${selTipo==='ordinaria'    ?'selected':''}>Ordinaria</option>
              <option value="straordinaria" ${selTipo==='straordinaria'?'selected':''}>Straordinaria</option>
              <option value="entrata"       ${selTipo==='entrata'      ?'selected':''}>Entrata</option>
            </select>
            <p class="hint">Verrà usato come default nelle spese</p>
          </div>
        </div>

        <div class="field">
          <label>Icona</label>
          <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem">
            <div id="cat-icon-preview" style="width:44px;height:44px;border-radius:10px;background:var(--accent-light);display:flex;align-items:center;justify-content:center;font-size:24px">${esc(selIcon)}</div>
            <span style="font-size:13px;color:var(--text2)">Scegli un'icona dalla griglia</span>
          </div>
          <div class="icon-picker" id="icon-picker">
            ${ICONE_DISPONIBILI.map(ic => `<button class="icon-opt ${ic===selIcon?'selected':''}" data-icon="${ic}" type="button">${ic}</button>`).join('')}
          </div>
          <input type="hidden" id="cat-icon" value="${esc(selIcon)}">
        </div>

        <div id="cat-err" class="alert alert-warning" style="display:none;margin-top:.5rem"></div>

        ${isEdit && d?.builtin ? `<div class="alert alert-info" style="margin-top:.5rem;font-size:13px">ℹ️ Stai modificando una categoria predefinita. Solo il nome e l'icona sono modificabili.</div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        <button class="btn btn-primary" id="btn-save-cat" data-id="${esc(d?.id||'')}" data-builtin="${d?.builtin||''}">
          💾 ${isEdit ? 'Salva modifiche' : 'Aggiungi categoria'}
        </button>
      </div>
    </div>
  </div>`;
}

// Condomìni gestiti, categorie, account dell'amministratore, stato del servizio, marchio, svuotamento dati. Chiamata da bindPageActions() (azioni.js).
function bindAzioniImpostazioni() {
  // Gestione edifici
  const bNuovoEd = document.getElementById('btn-nuovo-edificio');
  if (bNuovoEd) bNuovoEd.onclick = () => setState({modal:{type:'edificio', data:null}});
  document.querySelectorAll('[data-edit-edificio]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editEdificio);
      const ed = state.edifici.find(e=>e.id===id);
      if (ed) setState({modal:{type:'edificio', data:{...ed}}});
    };
  });
  document.querySelectorAll('[data-attiva-edificio]').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.attivaEdificio);
      btn.disabled = true;
      btn.textContent = '⏳ Attivazione…';
      await cambiaEdificio(id, false);
      // Dopo cambiaEdificio setState porta a dashboard — ok
    };
  });
  document.querySelectorAll('[data-sel-edificio]').forEach(btn => {
    btn.onclick = () => cambiaEdificio(parseInt(btn.dataset.selEdificio), true);
  });
  document.querySelectorAll('[data-del-edificio]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.delEdificio);
      const ed = state.edifici.find(e=>e.id===id);
      if (!ed) return;
      // Blocca se ha dati associati
      const condAssoc   = state.condomini.filter(c=>c.edificioId===id && !c.superAdmin).length;
      const speseAssoc  = state.spese.filter(s=>s.edificioId===id).length;
      const entAssoc    = state.entrate.filter(e=>e.edificioId===id).length;
      if (condAssoc>0 || speseAssoc>0 || entAssoc>0) {
        alert(`⚠️ Impossibile eliminare "${ed.nome}".

Ha ancora:
• ${condAssoc} condomini
• ${speseAssoc} spese
• ${entAssoc} versamenti

Sposta o elimina prima tutti i dati associati.`);
        return;
      }
      if (!confirm(`Eliminare "${ed.nome}"? Non ha dati associati, è sicuro.`)) return;
      const edifici = state.edifici.filter(e=>e.id!==id);
      save('cm_edifici', edifici);
      const nuovoAttivo = edifici[0]?.id || 1;
      save('cm_edificio_attivo', nuovoAttivo);
      setState({edifici, edificioAttivo:nuovoAttivo});
    };
  });
  // Btn gestisci edifici dal modal switcher
  const bGestEdifici = document.getElementById('btn-gestisci-edifici');
  if (bGestEdifici) bGestEdifici.onclick = () => setState({modal:null, page:'impostazioni'});
  // Nuova categoria
  const bNuovaCat = document.getElementById('btn-nuova-cat');
  if (bNuovaCat) bNuovaCat.onclick = () => setState({modal:{type:'categoria', data:null}});
  // Edit categoria
  document.querySelectorAll('[data-edit-cat]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.editCat;
      const cat = getCategorie().find(c=>c.id===id);
      if (cat) setState({modal:{type:'categoria', data:{...cat}}});
    };
  });
  // Delete categoria
  document.querySelectorAll('[data-del-cat]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.delCat;
      const cat = getCategorie().find(c=>c.id===id);
      if (!cat) return;
      const usata = state.spese.filter(s=>s.categoria===id).length;
      const msg = usata > 0
        ? `La categoria "${cat.label}" è usata in ${usata} spese.\nEliminandola le spese manterranno l'ID ma non mostreranno il nome.\nProcedere?`
        : `Eliminare la categoria "${cat.label}"? L'operazione è irreversibile.`;
      if (!confirm(msg)) return;
      const cats = getCategorie().filter(c=>c.id!==id);
      saveCategorie(cats);
      setState({}); // re-render
    };
  });
  // Admin change own password
  const bAdminOwnPw = document.getElementById('btn-admin-change-own-pw');
  if (bAdminOwnPw) bAdminOwnPw.onclick = () => setState({modal:{type:'change-pw'}});
  // Collega l'account Google a quello attuale (stesso uid, niente doppioni).
  // Dopo il collegamento l'accesso con Google eredita la 2FA di Google.
  const bLinkG = document.getElementById('btn-link-google');
  const gState = document.getElementById('google-link-state');
  const googleLinked = (window._fb?.auth?.currentUser?.providerData || []).some(p => p.providerId === 'google.com');
  if (googleLinked && gState) {
    gState.innerHTML = '✅ Account Google collegato. Puoi accedere con il pulsante “Accedi con Google”.';
    if (bLinkG) bLinkG.style.display = 'none';
  }
  if (bLinkG) bLinkG.onclick = async () => {
    if (!window._fb) return;
    bLinkG.disabled = true;
    try {
      const { auth, GoogleAuthProvider, linkWithPopup } = window._fb;
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const res = await linkWithPopup(auth.currentUser, provider);
      // L'email Google deve combaciare con quella dell'account: altrimenti il
      // login con Google porterebbe a un profilo diverso da quello atteso.
      const gEmail = res.user.providerData.find(p => p.providerId === 'google.com')?.email || '';
      if (gEmail.toLowerCase() !== (auth.currentUser.email || '').toLowerCase()) {
        alert('⚠️ Attenzione: hai collegato ' + gEmail + ', diverso dalla tua email ' + auth.currentUser.email + '. L\'accesso con Google potrebbe non riconoscerti. Scollega da Firebase Console se non voluto.');
      }
      alert('✅ Account Google collegato. Da ora puoi accedere con “Accedi con Google”.');
      setState({});
    } catch (e) {
      bLinkG.disabled = false;
      const code = e.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      alert(code === 'auth/credential-already-in-use'
        ? 'Questo account Google è già collegato a un altro profilo.'
        : (code === 'auth/provider-already-linked' ? 'Hai già collegato un account Google.' : ('Collegamento non riuscito: ' + (e.message || e))));
    }
  };
  // Reset
  bindOpsSection();
  const bBrand = document.getElementById('btn-save-branding');
  if (bBrand) bBrand.onclick = () => {
    if (!isSuperAdmin(state.user)) return;
    const nomeProdotto = (document.getElementById('br-nome')?.value || '').trim() || BRANDING_DEFAULT.nomeProdotto;
    const fornitore = (document.getElementById('br-fornitore')?.value || '').trim() || BRANDING_DEFAULT.fornitore;
    save('cm_branding', { nomeProdotto, fornitore });
    setState({});
  };
  const bResetCats = document.getElementById('btn-reset-cats');
  if (bResetCats) bResetCats.onclick = () => {
    if (!confirm('Ripristinare le categorie predefinite? Le categorie personalizzate verranno eliminate.')) return;
    saveCategorie(CATEGORIE_DEFAULT);
    setState({});
  };
  const bReset = document.getElementById('btn-reset');
  if (bReset) bReset.onclick = () => {
    if (!isSuperAdmin(state.user)) return;
    // QA: prima il reset azzerava i dati di TUTTI i condomini e sostituiva i
    // condomini registrati con 6 profili di esempio. Ora svuota solo i dati
    // operativi dell'edificio attivo; condomini e account restano.
    const edId = state.edificioAttivo;
    const edNome = (state.edifici.find(e => e.id === edId) || {nome: 'questo condominio'}).nome;
    if (!confirm(
      '⚠️ Svuotare i dati di "' + edNome + '"?\n\n' +
      'Verranno CANCELLATI per questo condominio:\n' +
      '• spese, versamenti e fornitori\n' +
      '• bacheca, verbali, lavori e delibere\n\n' +
      'Restano invariati: gli altri condomini, i condomini registrati e i loro account, le categorie.\n\n' +
      'Operazione NON reversibile (scarica prima il backup).\n\nProcedi?'
    )) return;

    // Seconda conferma — digita RESET
    const conferma = prompt('SECONDA CONFERMA\n\nDigita la parola RESET per svuotare i dati di "' + edNome + '".');
    if ((conferma||'').trim().toUpperCase() !== 'RESET') {
      alert('Operazione annullata: parola di conferma errata.');
      return;
    }

    const patch = {};
    [['cm_spese','spese'], ['cm_entrate','entrate'], ['cm_fornitori','fornitori'], ['cm_bacheca','bacheca'],
     ['cm_verbali','verbali'], ['cm_lavori','lavori'], ['cm_delibere','delibere']].forEach(([key, prop]) => {
      patch[prop] = state[prop].filter(r => r.edificioId !== edId);
      save(key, patch[prop]);
    });
    setState(patch);
    alert('✅ Dati di "' + edNome + '" svuotati.');
  };
}

// Schede di condominio gestito e categoria; migrazione storica. Chiamata da bindModal() (schede.js).
function bindSchedaImpostazioni() {
  // ── Migrazione edificioId (pagina Impostazioni) ──────────────────────────
  const bMigra = document.getElementById('btn-migra-edificio-id');
  if (bMigra) bMigra.onclick = async () => {
    const stats = getMigrationStats();
    const firstEd = state.edifici.find(e=>e.id===stats.firstEdId) || state.edifici[0];
    if (!firstEd) { alert('Nessun edificio trovato.'); return; }
    if (stats.totale === 0) { alert('Nessun record da migrare — tutto e gia associato a un condominio.'); return; }
    const msg1 = 'Stai per associare ' + stats.totale + ' record a "' + firstEd.nome + '".' +
      (stats.condSenza  > 0 ? '\n- ' + stats.condSenza  + ' condomini'  : '') +
      (stats.speseSenza > 0 ? '\n- ' + stats.speseSenza + ' spese'      : '') +
      (stats.entSenza   > 0 ? '\n- ' + stats.entSenza   + ' versamenti' : '') +
      (stats.fornSenza  > 0 ? '\n- ' + stats.fornSenza  + ' fornitori'  : '') +
      '\n\nQuesta operazione salva su Firebase. Procedi?';
    if (!confirm(msg1)) return;
    bMigra.disabled = true;
    bMigra.textContent = 'Migrazione in corso...';
    bMigra.style.opacity = '0.7';
    try {
      const res = await eseguiMigrazioneEdificioId(firstEd.id);
      const okEl = document.getElementById('migra-ok');
      if (okEl) { okEl.textContent = 'Migrati ' + res.migrati + ' record a "' + firstEd.nome + '"'; okEl.style.display='block'; }
      bMigra.textContent = 'Migrazione completata';
      setTimeout(() => setState({page:'impostazioni'}), 2000);
    } catch(err) {
      alert('Errore: ' + err.message);
      bMigra.disabled = false;
      bMigra.textContent = 'Riprova migrazione';
      bMigra.style.opacity = '1';
    }
  };
  const bSaveEd = document.getElementById('btn-save-edificio');
  if (bSaveEd) {
    // emoji picker
    document.querySelectorAll('.ed-emoji-opt').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.ed-emoji-opt').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('ed-emoji').value = btn.dataset.edEmoji;
      };
    });
    // color picker
    document.querySelectorAll('.ed-color-opt').forEach(btn => {
      btn.onclick = () => {
        const c = btn.dataset.edColor;
        document.getElementById('ed-colore').value = c;
        document.querySelectorAll('.ed-color-opt').forEach(b => {
          b.style.border = `3px solid ${b.dataset.edColor===c?'white':'transparent'}`;
          b.style.boxShadow = b.dataset.edColor===c ? `0 0 0 2px ${c}` : 'none';
        });
      };
    });

    bSaveEd.onclick = () => {
      const nome     = document.getElementById('ed-nome')?.value?.trim();
      const indirizzo= document.getElementById('ed-indirizzo')?.value?.trim();
      const emoji    = document.getElementById('ed-emoji')?.value || '🏢';
      const colore   = document.getElementById('ed-colore')?.value || '#2563EB';
      const note     = document.getElementById('ed-note')?.value?.trim();
      const origId   = bSaveEd.dataset.id;
      const errEl    = document.getElementById('ed-err');
      errEl.style.display = 'none';
      if (!nome) { errEl.textContent='Il nome è obbligatorio'; errEl.style.display='block'; return; }

      let edifici;
      if (origId) {
        edifici = state.edifici.map(e => e.id===parseInt(origId) ? {...e,nome,indirizzo,emoji,colore,note} : e);
      } else {
        const newEd = {id: newId(), nome, indirizzo, emoji, colore, note};
        edifici = [...state.edifici, newEd];
      }
      save('cm_edifici', edifici);
      setState({edifici, modal:null});
    };
  }
  // Salva categoria (crea/modifica)
  const bSaveCat = document.getElementById('btn-save-cat');
  if (bSaveCat) {
    // Icon picker
    document.querySelectorAll('.icon-opt').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.icon-opt').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        const ic = btn.dataset.icon;
        document.getElementById('cat-icon').value = ic;
        const prev = document.getElementById('cat-icon-preview');
        if (prev) prev.textContent = ic;
      };
    });

    bSaveCat.onclick = () => {
      const label = document.getElementById('cat-label')?.value?.trim();
      const tipo  = document.getElementById('cat-tipo')?.value;
      const icon  = document.getElementById('cat-icon')?.value || '📦';
      const origId= bSaveCat.dataset.id;
      const isBuiltin = bSaveCat.dataset.builtin === 'true';
      const errEl = document.getElementById('cat-err');
      errEl.style.display = 'none';

      if (!label) { errEl.textContent='Il nome è obbligatorio'; errEl.style.display='block'; return; }

      let cats = getCategorie();

      if (origId) {
        // Modifica
        cats = cats.map(c => c.id === origId
          ? {...c, label, icon, ...(isBuiltin ? {} : {tipo}) }  // builtin: non cambiare tipo
          : c);
      } else {
        // Crea — genera id slug dal label
        const baseId = label.toLowerCase().replace(/[^a-z0-9]/g,'_').slice(0,30) + '_' + Date.now().toString(36);
        if (cats.find(c=>c.label.toLowerCase()===label.toLowerCase())) {
          errEl.textContent='Esiste già una categoria con questo nome'; errEl.style.display='block'; return;
        }
        cats = [...cats, {id: baseId, label, tipo, icon, builtin:false}];
      }

      saveCategorie(cats);
      setState({modal:null});
    };
  }
}
