// Vita condominiale: bacheca, verbali, lavori, delibere.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// ===========================
// VITA CONDOMINIALE — Bacheca, Verbali, Lavori, Delibere raggruppate in
// un'unica pagina con tab interne, stesso pattern già usato da Bilancio
// (.bil-tabs/.bil-tab, state.bilancioTab) — nessun componente nuovo.
// ===========================
const VITA_TABS = [
  {id:'bacheca',  label:'📌 Bacheca'},
  {id:'verbali',  label:'📋 Verbali'},
  {id:'lavori',   label:'🛠️ Lavori'},
  {id:'delibere', label:'📜 Delibere'},
];

function renderVita() {
  const tab = state.vitaTab || 'bacheca';
  const tabFn = {
    bacheca: renderBachecaTab,
    verbali: renderVerbaliTab,
    lavori: renderLavoriTab,
    delibere: renderDelibereTab,
  }[tab] || renderBachecaTab;

  return `
  <div>
    <div class="page-header">
      <div><div class="page-title">Vita condominiale ${btnGuida()}</div><div class="page-sub">Bacheca, verbali, lavori e delibere</div></div>
    </div>
    <div class="bil-tabs">
      ${VITA_TABS.map(t=>`<button class="bil-tab vita-tab ${tab===t.id?'active':''}" data-vita-tab="${t.id}">${t.label}</button>`).join('')}
    </div>
    ${tabFn()}
  </div>`;
}

// ===========================
// BACHECA COMUNICAZIONI
// ===========================
// Scrittura/cancellazione riservata ad adminEdificio + superAdmin
// (canUserAdmin) — editor e member sono di sola lettura, a differenza
// di Spese/Entrate/Fornitori dove editor può scrivere.
function renderBachecaTab() {
  const canManage = canUserAdmin(state.user);
  const oggi = ymdLocale(new Date());
  const items = getBachecaVisibili().slice().sort((a,b) =>
    (b.prioritaria?1:0) - (a.prioritaria?1:0) || new Date(b.createdAt||0) - new Date(a.createdAt||0)
  );

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:1rem">
      <div class="page-sub" style="margin:0">${items.length} avvisi</div>
      ${canManage ? `<button class="btn btn-primary" id="btn-nuovo-avviso">+ Nuovo avviso</button>` : ''}
    </div>

    ${items.length === 0 ? `
    <div class="empty">${svgEmpty()}<p>Nessun avviso in bacheca</p></div>` : `
    <div style="display:flex;flex-direction:column;gap:.75rem">
      ${items.map(a => renderAvvisoCard(a, canManage, oggi)).join('')}
    </div>`}
  `;
}

function renderAvvisoCard(a, canManage, oggi) {
  const scaduto = a.scadenza && a.scadenza < oggi;
  return `
  <div class="card" style="margin-bottom:0;${a.prioritaria ? 'border-left:4px solid var(--amber)' : ''}">
    <div style="padding:1rem 1.25rem;display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
          ${a.prioritaria ? `<span class="badge badge-amber">⚠️ Prioritario</span>` : ''}
          ${a.scadenza ? `<span class="badge ${scaduto ? 'badge-gray' : 'badge-blue'}">${scaduto ? 'Scaduto il' : 'Scade il'} ${esc(a.scadenza)}</span>` : ''}
        </div>
        <div style="font-weight:600;font-size:15px;margin-bottom:4px">${esc(a.titolo)}</div>
        <div style="font-size:13.5px;color:var(--text2);white-space:pre-wrap">${esc(a.testo)}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:8px">${esc(a.createdBy||'')}${a.createdBy && a.createdAt ? ' · ' : ''}${a.createdAt ? new Date(a.createdAt).toLocaleDateString('it-IT') : ''}</div>
      </div>
      ${canManage ? `
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-secondary btn-sm" data-edit-avviso="${a.id}">✏️</button>
        <button class="btn btn-danger btn-sm" data-del-avviso="${a.id}">🗑</button>
      </div>` : ''}
    </div>
  </div>`;
}

// ===========================
// ARCHIVIO VERBALI ASSEMBLEE
// ===========================
// Scrittura/cancellazione riservata ad adminEdificio + superAdmin (atto
// ufficiale, stesso livello di cm_bacheca/cm_condomini) — editor e member
// sono di sola lettura.
function renderVerbaliTab() {
  const canManage = canUserAdmin(state.user);
  const tuttiVerbali = getVerbaliVisibili();
  const anniVerbali = [...new Set(tuttiVerbali.map(v => annoDi(v.data)))].filter(a => a > 0).sort((a,b)=>b-a); // niente opzione "NaN" per date non valide
  const anno = state.filterAnnoVerbali || 0;

  let items = tuttiVerbali;
  if (anno) items = items.filter(v => annoDi(v.data) === anno);
  if (state.searchQ) {
    const q = state.searchQ.toLowerCase();
    items = items.filter(v =>
      v.titolo.toLowerCase().includes(q) || (v.argomenti||[]).some(t=>t.toLowerCase().includes(q))
    );
  }
  items = items.slice().sort((a,b) => new Date(b.data) - new Date(a.data));

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:.75rem">
      <div class="page-sub" style="margin:0">${items.length} verbali</div>
      ${canManage ? `<button class="btn btn-primary" id="btn-nuovo-verbale">+ Nuovo verbale</button>` : ''}
    </div>

    <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem">
      <input type="text" class="spese-filter-search" id="search-verbali" placeholder="🔍 Cerca per titolo o argomento…" value="${esc(state.searchQ)}" style="flex:0 1 260px;min-width:160px">
      <select class="spese-filter-sel" onchange="setState({filterAnnoVerbali:this.value?parseInt(this.value):0})" style="max-width:160px">
        <option value="" ${anno?'':'selected'}>Tutti gli anni</option>
        ${anniVerbali.map(a=>`<option value="${a}" ${a===anno?'selected':''}>${a}</option>`).join('')}
      </select>
    </div>

    ${items.length === 0 ? `
    <div class="empty">${svgEmpty()}<p>Nessun verbale trovato</p></div>` : `
    <div style="display:flex;flex-direction:column;gap:.75rem">
      ${items.map(v => renderVerbaleCard(v, canManage)).join('')}
    </div>`}
  `;
}

function renderVerbaleCard(v, canManage) {
  const isStr = v.tipo === 'straordinaria';
  const allegati = v.allegati || [];
  const primiAllegati = allegati.slice(0, 3);
  const altriAllegati = allegati.slice(3);
  return `
  <div class="card" style="margin-bottom:0">
    <div style="padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:220px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
            <span class="badge ${isStr?'badge-purple':'badge-blue'}">${isStr?'Straordinaria':'Ordinaria'}</span>
            <span style="font-size:12px;color:var(--text2)">${esc(v.data)}</span>
          </div>
          <div style="font-weight:600;font-size:15px;margin-bottom:4px">${esc(v.titolo)}</div>
          ${(v.argomenti&&v.argomenti.length) ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">${v.argomenti.map(t=>`<span class="badge badge-gray">${esc(t)}</span>`).join('')}</div>` : ''}
          ${(v.decisioni&&v.decisioni.length) ? `<div style="font-size:13px;color:var(--text2)"><strong style="color:var(--text)">Decisioni principali:</strong><ul style="margin:4px 0 0 18px;padding:0">${v.decisioni.map(d=>`<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}
        </div>
        ${canManage ? `
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-secondary btn-sm" data-edit-verbale="${v.id}">✏️</button>
          <button class="btn btn-danger btn-sm" data-del-verbale="${v.id}">🗑</button>
        </div>` : ''}
      </div>
      ${allegati.length ? `<div style="margin-top:10px" class="allegati-list">
        ${primiAllegati.map(a => renderAllegatoItem(a,false)).join('')}
        ${altriAllegati.length ? `<details style="margin-top:4px">
          <summary style="cursor:pointer;font-size:12px;color:var(--accent);padding:4px 0">+ ${altriAllegati.length} altri allegati</summary>
          <div class="allegati-list" style="margin-top:6px">${altriAllegati.map(a => renderAllegatoItem(a,false)).join('')}</div>
        </details>` : ''}
      </div>` : ''}
    </div>
  </div>`;
}

// ===========================
// CHECKLIST LAVORI CONDOMINIALI
// ===========================
// Scrittura/cancellazione riservata ad adminEdificio + superAdmin — editor
// e member sola lettura, stessa politica di Bacheca/Verbali (semplificata
// su richiesta esplicita rispetto all'ipotesi originale di dare a editor
// scrittura sui dati operativi).
const LAVORI_STATO_ORDER = {in_corso:0, da_avviare:1, sospeso:2, completato:3};

const LAVORI_STATO_LABEL = {da_avviare:'Da avviare', in_corso:'In corso', completato:'Completato', sospeso:'Sospeso'};

const LAVORI_STATO_BADGE = {da_avviare:'badge-gray', in_corso:'badge-blue', completato:'badge-green', sospeso:'badge-amber'};

function renderLavoriTab() {
  const canManage = canUserAdmin(state.user);
  const items = getLavoriVisibili().slice().sort((a,b) =>
    (LAVORI_STATO_ORDER[a.stato]??9) - (LAVORI_STATO_ORDER[b.stato]??9)
    || new Date(a.dataPrevistaCompletamento||'9999-12-31') - new Date(b.dataPrevistaCompletamento||'9999-12-31')
  );

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:1rem">
      <div class="page-sub" style="margin:0">${items.length} lavori</div>
      ${canManage ? `<button class="btn btn-primary" id="btn-nuovo-lavoro">+ Nuovo lavoro</button>` : ''}
    </div>

    ${items.length === 0 ? `
    <div class="empty">${svgEmpty()}<p>Nessun lavoro registrato</p></div>` : `
    <div style="display:flex;flex-direction:column;gap:.75rem">
      ${items.map(l => renderLavoroCard(l, canManage)).join('')}
    </div>`}
  `;
}

function renderLavoroCard(l, canManage) {
  const statoLabel = LAVORI_STATO_LABEL[l.stato] || esc(l.stato);
  const statoBadge = LAVORI_STATO_BADGE[l.stato] || 'badge-gray';
  const pct = Math.max(0, Math.min(100, parseInt(l.percentuale)||0));
  const storico = (l.storicoAggiornamenti||[]).slice().sort((a,b)=>new Date(b.data)-new Date(a.data));
  const deliberaRif = l.delibereRifId ? getDelibereVisibili().find(d => d.id === l.delibereRifId) : null;

  return `
  <div class="card" style="margin-bottom:0">
    <div style="padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:220px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <span class="badge ${statoBadge}">${statoLabel}</span>
            ${l.dataPrevistaCompletamento ? `<span style="font-size:12px;color:var(--text2)">Previsto: ${esc(l.dataPrevistaCompletamento)}</span>` : ''}
          </div>
          <div style="font-weight:600;font-size:15px;margin-bottom:8px">${esc(l.titolo)}</div>
          <div style="display:flex;align-items:center;gap:8px;max-width:320px">
            <div class="progress-wrap" style="flex:1"><div class="progress-fill" style="width:${pct}%;background:var(--accent)"></div></div>
            <span style="font-size:12px;font-weight:600;color:var(--text2);min-width:32px;text-align:right">${pct}%</span>
          </div>
        </div>
        ${canManage ? `
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-secondary btn-sm" data-edit-lavoro="${l.id}">✏️</button>
          <button class="btn btn-danger btn-sm" data-del-lavoro="${l.id}">🗑</button>
        </div>` : ''}
      </div>
      ${storico.length ? `<div style="margin-top:10px;font-size:12.5px;color:var(--text2)">
        <strong style="color:var(--text)">Ultimo aggiornamento:</strong>
        <div style="margin-top:2px">${esc(storico[0].nota)} <span style="color:var(--text2)">— ${esc(storico[0].autore||'')}, ${storico[0].data}</span></div>
      </div>` : ''}
      ${deliberaRif ? `<div style="margin-top:8px;font-size:12px"><span onclick="setState({page:'vita',vitaTab:'delibere',sidebarOpen:false})" style="color:var(--accent);cursor:pointer">📜 Da delibera: ${esc(deliberaRif.descrizioneSintetica)}</span></div>` : ''}
    </div>
  </div>`;
}

// ===========================
// REGISTRO DECISIONI APPROVATE
// ===========================
// Stesso trattamento di Verbali: atto formale + dato economico (budget) —
// scrittura solo adminEdificio/superAdmin, lettura ristretta come le spese
// (buildings/{id}/resolutions, vedi firestore.rules).
const DELIBERE_STATO_LABEL = {approvata:'Approvata', in_corso:'In corso', completata:'Completata', sospesa:'Sospesa'};

const DELIBERE_STATO_BADGE = {approvata:'badge-blue', in_corso:'badge-amber', completata:'badge-green', sospesa:'badge-gray'};

function renderDelibereTab() {
  const canManage = canUserAdmin(state.user);
  const items = getDelibereVisibili().slice().sort((a,b) => new Date(b.dataApprovazione) - new Date(a.dataApprovazione));

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:1rem">
      <div class="page-sub" style="margin:0">${items.length} decisioni</div>
      ${canManage ? `<button class="btn btn-primary" id="btn-nuova-delibera">+ Nuova delibera</button>` : ''}
    </div>

    ${items.length === 0 ? `
    <div class="empty">${svgEmpty()}<p>Nessuna delibera registrata</p></div>` : `
    <div style="display:flex;flex-direction:column;gap:.75rem">
      ${items.map(d => renderDeliberaCard(d, canManage)).join('')}
    </div>`}
  `;
}

function renderDeliberaCard(d, canManage) {
  const statoLabel = DELIBERE_STATO_LABEL[d.stato] || esc(d.stato);
  const statoBadge = DELIBERE_STATO_BADGE[d.stato] || 'badge-gray';
  const verbaleRif = d.verbaleRifId ? getVerbaliVisibili().find(v => v.id === d.verbaleRifId) : null;
  return `
  <div class="card" style="margin-bottom:0">
    <div style="padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:220px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <span class="badge ${statoBadge}">${statoLabel}</span>
            <span style="font-size:12px;color:var(--text2)">${esc(d.dataApprovazione)}</span>
          </div>
          <div style="font-weight:600;font-size:15px;margin-bottom:4px">${esc(d.descrizioneSintetica)}</div>
          <div style="font-size:13px;color:var(--text2);display:flex;gap:14px;flex-wrap:wrap;margin-top:4px">
            ${d.responsabile ? `<span>👤 ${esc(d.responsabile)}</span>` : ''}
            ${d.budgetPrevisto ? `<span>💰 ${fmt(d.budgetPrevisto)}</span>` : ''}
          </div>
          ${d.note ? `<div style="font-size:13px;color:var(--text2);margin-top:6px;white-space:pre-wrap">${esc(d.note)}</div>` : ''}
          ${verbaleRif ? `<div style="margin-top:8px;font-size:12px"><span onclick="setState({page:'vita',vitaTab:'verbali',sidebarOpen:false})" style="color:var(--accent);cursor:pointer">📋 Da verbale: ${esc(verbaleRif.titolo)} (${esc(verbaleRif.data)})</span></div>` : ''}
        </div>
        ${canManage ? `
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-secondary btn-sm" data-edit-delibera="${d.id}">✏️</button>
          <button class="btn btn-danger btn-sm" data-del-delibera="${d.id}">🗑</button>
        </div>` : ''}
      </div>
    </div>
  </div>`;
}

function renderModalAvviso(d) {
  const isEdit = !!d?.id;
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <h2>${isEdit ? '✏️ Modifica avviso' : '📌 Nuovo avviso'}</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label>Titolo *</label>
          <input type="text" id="av-titolo" value="${esc(d?.titolo||'')}" placeholder="Es. Pulizia scale sospesa">
        </div>
        <div class="field">
          <label>Testo *</label>
          <textarea id="av-testo" rows="4" placeholder="Dettagli dell'avviso...">${esc(d?.testo||'')}</textarea>
        </div>
        <div class="form-row">
          <div class="field">
            <label>Scadenza (opzionale)</label>
            <input type="date" id="av-scadenza" value="${esc(d?.scadenza||'')}">
          </div>
          <div class="field" style="display:flex;align-items:flex-end;padding-bottom:9px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500;font-size:13.5px">
              <input type="checkbox" id="av-prioritaria" ${d?.prioritaria?'checked':''} style="width:auto">
              Segna come prioritario
            </label>
          </div>
        </div>
        <div id="av-err" class="alert alert-warning" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        <button class="btn btn-primary" id="btn-save-avviso" data-id="${d?.id||''}">
          💾 ${isEdit ? 'Salva modifiche' : 'Pubblica avviso'}
        </button>
      </div>
    </div>
  </div>`;
}

function renderModalVerbale(d) {
  const isEdit = !!d?.id;
  const argomentiStr = (d?.argomenti||[]).join(', ');
  const decisioniStr = (d?.decisioni||[]).join('\n');
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:600px">
      <div class="modal-header">
        <h2>${isEdit ? '✏️ Modifica verbale' : '📋 Nuovo verbale'}</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="field" style="flex:2">
            <label>Titolo *</label>
            <input type="text" id="vb-titolo" value="${esc(d?.titolo||'')}" placeholder="Es. Assemblea ordinaria maggio 2026">
          </div>
          <div class="field">
            <label>Data *</label>
            <input type="date" id="vb-data" value="${esc(d?.data||'')}">
          </div>
        </div>
        <div class="field">
          <label>Tipo</label>
          <select id="vb-tipo">
            <option value="ordinaria" ${(!d?.tipo||d.tipo==='ordinaria')?'selected':''}>Ordinaria</option>
            <option value="straordinaria" ${d?.tipo==='straordinaria'?'selected':''}>Straordinaria</option>
          </select>
        </div>
        <div class="field">
          <label>Argomenti (separati da virgola)</label>
          <input type="text" id="vb-argomenti" value="${esc(argomentiStr)}" placeholder="bilancio, facciata, ascensore">
        </div>
        <div class="field">
          <label>Decisioni principali (una per riga)</label>
          <textarea id="vb-decisioni" rows="3" placeholder="Approvato preventivo facciata € 42.000...">${esc(decisioniStr)}</textarea>
        </div>

        <div class="field">
          <label>Allegato (PDF)</label>
          <div class="dropzone" id="dropzone">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <div>Trascina il PDF qui oppure <strong>clicca per selezionare</strong></div>
            <div style="font-size:12px;margin-top:4px;color:var(--text2)">PDF · max 5MB</div>
          </div>
          <input type="file" id="file-input" accept="application/pdf" style="display:none">
          <div id="allegati-pending"></div>
          ${d?.allegati?.length ? `<div style="margin-top:8px"><div style="font-size:12px;color:var(--text2);margin-bottom:6px">${d.allegati.length===1?'Allegato esistente:':`Allegati esistenti (${d.allegati.length}):`}</div><div class="allegati-list">${(d.allegati||[]).map(f=>renderAllegatoItem(f,false)).join('')}</div></div>` : ''}
        </div>

        <div id="vb-err" class="alert alert-warning" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        <button class="btn btn-primary" id="btn-save-verbale" data-id="${d?.id||''}">
          💾 ${isEdit ? 'Salva modifiche' : 'Pubblica verbale'}
        </button>
      </div>
    </div>
  </div>`;
}

function renderModalLavoro(d) {
  const isEdit = !!d?.id;
  const storico = (d?.storicoAggiornamenti||[]).slice().sort((a,b)=>new Date(b.data)-new Date(a.data));
  const delibereOpzioni = getDelibereVisibili().slice().sort((a,b)=>new Date(b.dataApprovazione)-new Date(a.dataApprovazione));
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <h2>${isEdit ? '✏️ Modifica lavoro' : '🛠️ Nuovo lavoro'}</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label>Titolo *</label>
          <input type="text" id="lv-titolo" value="${esc(d?.titolo||'')}" placeholder="Es. Rifacimento facciata cortile interno">
        </div>
        <div class="form-row">
          <div class="field">
            <label>Stato</label>
            <select id="lv-stato">
              <option value="da_avviare" ${(!d?.stato||d.stato==='da_avviare')?'selected':''}>Da avviare</option>
              <option value="in_corso" ${d?.stato==='in_corso'?'selected':''}>In corso</option>
              <option value="completato" ${d?.stato==='completato'?'selected':''}>Completato</option>
              <option value="sospeso" ${d?.stato==='sospeso'?'selected':''}>Sospeso</option>
            </select>
          </div>
          <div class="field">
            <label>Percentuale avanzamento</label>
            <input type="number" id="lv-percentuale" min="0" max="100" step="5" value="${esc(d?.percentuale ?? 0)}">
          </div>
        </div>
        <div class="field">
          <label>Data prevista completamento</label>
          <input type="date" id="lv-data-prevista" value="${esc(d?.dataPrevistaCompletamento||'')}">
        </div>
        <div class="field">
          <label>Delibera di riferimento (opzionale)</label>
          <select id="lv-delibera-rif">
            <option value="">— Nessuna —</option>
            ${delibereOpzioni.map(dl=>`<option value="${dl.id}" ${String(d?.delibereRifId)===String(dl.id)?'selected':''}>${esc(dl.descrizioneSintetica)}</option>`).join('')}
          </select>
          <p class="hint">La delibera che ha approvato questo lavoro, se vuoi tenerne traccia</p>
        </div>
        ${storico.length ? `
        <div class="field">
          <label>Storico aggiornamenti</label>
          <div style="max-height:120px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 10px;font-size:12.5px;color:var(--text2)">
            ${storico.map(s=>`<div style="padding:3px 0">${esc(s.nota)} <span style="color:var(--text2)">— ${esc(s.autore||'')}, ${esc(s.data)}</span></div>`).join('')}
          </div>
        </div>` : ''}
        <div class="field">
          <label>Aggiungi nota (opzionale)</label>
          <textarea id="lv-nota" rows="2" placeholder="Es. Ponteggio montato, lavori avviati..."></textarea>
          <p class="hint">Si aggiunge allo storico, non sostituisce le note precedenti</p>
        </div>
        <div id="lv-err" class="alert alert-warning" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        <button class="btn btn-primary" id="btn-save-lavoro" data-id="${d?.id||''}">
          💾 ${isEdit ? 'Salva modifiche' : 'Aggiungi lavoro'}
        </button>
      </div>
    </div>
  </div>`;
}

function renderModalDelibera(d) {
  const isEdit = !!d?.id;
  const verbaliOpzioni = getVerbaliVisibili().slice().sort((a,b)=>new Date(b.data)-new Date(a.data));
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <h2>${isEdit ? '✏️ Modifica delibera' : '📜 Nuova delibera'}</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label>Descrizione sintetica *</label>
          <input type="text" id="dl-descrizione" value="${esc(d?.descrizioneSintetica||'')}" placeholder="Es. Rifacimento facciata cortile interno">
        </div>
        <div class="form-row">
          <div class="field">
            <label>Data approvazione *</label>
            <input type="date" id="dl-data" value="${esc(d?.dataApprovazione||'')}">
          </div>
          <div class="field">
            <label>Stato</label>
            <select id="dl-stato">
              <option value="approvata" ${(!d?.stato||d.stato==='approvata')?'selected':''}>Approvata</option>
              <option value="in_corso" ${d?.stato==='in_corso'?'selected':''}>In corso</option>
              <option value="completata" ${d?.stato==='completata'?'selected':''}>Completata</option>
              <option value="sospesa" ${d?.stato==='sospesa'?'selected':''}>Sospesa</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label>Responsabile</label>
            <input type="text" id="dl-responsabile" value="${esc(d?.responsabile||'')}" placeholder="Es. Studio Tecnico Rossi">
          </div>
          <div class="field">
            <label>Budget previsto (€)</label>
            <input type="number" id="dl-budget" min="0" step="0.01" value="${esc(d?.budgetPrevisto ?? '')}">
          </div>
        </div>
        <div class="field">
          <label>Verbale di riferimento (opzionale)</label>
          <select id="dl-verbale-rif">
            <option value="">— Nessuno —</option>
            ${verbaliOpzioni.map(v=>`<option value="${v.id}" ${String(d?.verbaleRifId)===String(v.id)?'selected':''}>${esc(v.titolo)} (${esc(v.data)})</option>`).join('')}
          </select>
          <p class="hint">Il verbale d'assemblea in cui è stata approvata questa delibera, se vuoi tenerne traccia</p>
        </div>
        <div class="field">
          <label>Note</label>
          <textarea id="dl-note" rows="2" placeholder="Note aggiuntive...">${esc(d?.note||'')}</textarea>
        </div>
        <div id="dl-err" class="alert alert-warning" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        <button class="btn btn-primary" id="btn-save-delibera" data-id="${d?.id||''}">
          💾 ${isEdit ? 'Salva modifiche' : 'Registra delibera'}
        </button>
      </div>
    </div>
  </div>`;
}

// Schede e pulsanti di bacheca, verbali, lavori e delibere. Chiamata da bindPageActions() (azioni.js).
function bindAzioniVita() {
  // Tab della pagina "Vita condominiale" (Bacheca/Verbali/Lavori/Delibere)
  document.querySelectorAll('[data-vita-tab]').forEach(t => {
    t.onclick = () => setState({vitaTab: t.dataset.vitaTab});
  });
  // Nuovo avviso bacheca
  const bNuovoAvviso = document.getElementById('btn-nuovo-avviso');
  if (bNuovoAvviso) bNuovoAvviso.onclick = () => setState({modal:{type:'avviso', data:null}});
  // Modifica avviso bacheca
  document.querySelectorAll('[data-edit-avviso]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editAvviso);
      const a = state.bacheca.find(x=>x.id===id);
      if (a) setState({modal:{type:'avviso', data:{...a}}});
    };
  });
  // Elimina avviso bacheca
  document.querySelectorAll('[data-del-avviso]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.delAvviso);
      const a = state.bacheca.find(x=>x.id===id);
      if (!a) return;
      if (!confirm(`Eliminare l'avviso "${a.titolo}"?`)) return;
      const bacheca = state.bacheca.filter(x=>x.id!==id);
      save('cm_bacheca', bacheca);
      setState({bacheca});
    };
  });
  // Ricerca verbali (riusa lo stesso state.searchQ di Spese/Entrate)
  const svb = document.getElementById('search-verbali');
  if (svb) svb.oninput = e => setState({searchQ: e.target.value});
  // Nuovo verbale
  const bNuovoVerbale = document.getElementById('btn-nuovo-verbale');
  if (bNuovoVerbale) bNuovoVerbale.onclick = () => setState({modal:{type:'verbale', data:null}, pendingFiles:[]});
  // Modifica verbale
  document.querySelectorAll('[data-edit-verbale]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editVerbale);
      const v = state.verbali.find(x=>x.id===id);
      if (v) setState({modal:{type:'verbale', data:{...v}}, pendingFiles:[]});
    };
  });
  // Elimina verbale (e i suoi allegati su Storage)
  document.querySelectorAll('[data-del-verbale]').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.delVerbale);
      const v = state.verbali.find(x=>x.id===id);
      if (!v) return;
      if (!confirm(`Eliminare il verbale "${v.titolo}"? Verranno eliminati anche gli eventuali allegati.`)) return;
      for (const a of (v.allegati||[])) {
        if (a.storagePath) {
          try {
            const { storage, ref, deleteObject } = window._fb;
            await deleteObject(ref(storage, a.storagePath));
          } catch (err) { console.warn('deleteObject (verbale):', err.message); }
        }
      }
      const verbali = state.verbali.filter(x=>x.id!==id);
      save('cm_verbali', verbali);
      setState({verbali});
    };
  });
  // Nuovo lavoro
  const bNuovoLavoro = document.getElementById('btn-nuovo-lavoro');
  if (bNuovoLavoro) bNuovoLavoro.onclick = () => setState({modal:{type:'lavoro', data:null}});
  // Modifica lavoro
  document.querySelectorAll('[data-edit-lavoro]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editLavoro);
      const l = state.lavori.find(x=>x.id===id);
      if (l) setState({modal:{type:'lavoro', data:{...l}}});
    };
  });
  // Elimina lavoro
  document.querySelectorAll('[data-del-lavoro]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.delLavoro);
      const l = state.lavori.find(x=>x.id===id);
      if (!l) return;
      if (!confirm(`Eliminare il lavoro "${l.titolo}"?`)) return;
      const lavori = state.lavori.filter(x=>x.id!==id);
      save('cm_lavori', lavori);
      setState({lavori});
    };
  });
  // Nuova delibera
  const bNuovaDelibera = document.getElementById('btn-nuova-delibera');
  if (bNuovaDelibera) bNuovaDelibera.onclick = () => setState({modal:{type:'delibera', data:null}});
  // Modifica delibera
  document.querySelectorAll('[data-edit-delibera]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editDelibera);
      const d = state.delibere.find(x=>x.id===id);
      if (d) setState({modal:{type:'delibera', data:{...d}}});
    };
  });
  // Elimina delibera
  document.querySelectorAll('[data-del-delibera]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.delDelibera);
      const d = state.delibere.find(x=>x.id===id);
      if (!d) return;
      if (!confirm(`Eliminare la delibera "${d.descrizioneSintetica}"?`)) return;
      const delibere = state.delibere.filter(x=>x.id!==id);
      save('cm_delibere', delibere);
      setState({delibere});
    };
  });
}

// Schede di avviso, verbale, lavoro e delibera. Chiamata da bindModal() (schede.js).
function bindSchedaVita() {
  // Salva avviso bacheca (crea/modifica)
  const bSaveAv = document.getElementById('btn-save-avviso');
  if (bSaveAv) bSaveAv.onclick = () => {
    const titolo   = document.getElementById('av-titolo')?.value?.trim();
    const testo    = document.getElementById('av-testo')?.value?.trim();
    const scadenza = document.getElementById('av-scadenza')?.value || '';
    const prioritaria = document.getElementById('av-prioritaria')?.checked || false;
    const origId   = bSaveAv.dataset.id;
    const errEl    = document.getElementById('av-err');
    errEl.style.display = 'none';

    if (!titolo) { errEl.textContent='Il titolo è obbligatorio'; errEl.style.display='block'; return; }
    if (!testo)  { errEl.textContent='Il testo è obbligatorio'; errEl.style.display='block'; return; }

    const edificioIdAvviso = origId
      ? (state.bacheca.find(a=>a.id===parseInt(origId))?.edificioId || getUserEdificio(state.user))
      : getUserEdificio(state.user);

    let bacheca;
    if (origId) {
      bacheca = state.bacheca.map(a => a.id===parseInt(origId)
        ? {...a, titolo, testo, scadenza, prioritaria, edificioId: edificioIdAvviso}
        : a);
    } else {
      const avviso = {
        id: newId(), titolo, testo, scadenza, prioritaria,
        edificioId: edificioIdAvviso,
        createdAt: new Date().toISOString(),
        createdBy: state.user?.nome || '',
      };
      bacheca = [...state.bacheca, avviso];
    }
    save('cm_bacheca', bacheca);
    setState({bacheca, modal:null});
  };
  // Salva verbale (crea/modifica)
  const bSaveVb = document.getElementById('btn-save-verbale');
  if (bSaveVb) bSaveVb.onclick = () => {
    const titolo = document.getElementById('vb-titolo')?.value?.trim();
    const data = document.getElementById('vb-data')?.value;
    const tipo = document.getElementById('vb-tipo')?.value || 'ordinaria';
    const argomenti = (document.getElementById('vb-argomenti')?.value||'').split(',').map(s=>s.trim()).filter(Boolean);
    const decisioni = (document.getElementById('vb-decisioni')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean);
    const origId = bSaveVb.dataset.id;
    const errEl = document.getElementById('vb-err');
    errEl.style.display = 'none';

    if (!titolo) { errEl.textContent='Il titolo è obbligatorio'; errEl.style.display='block'; return; }
    if (!data)   { errEl.textContent='La data è obbligatoria'; errEl.style.display='block'; return; }

    const existing = origId ? state.verbali.find(v=>v.id===parseInt(origId)) : null;
    const allegati = [...(existing?.allegati||[]), ...state.pendingFiles];
    const edificioIdVerbale = existing?.edificioId || getUserEdificio(state.user);

    let verbali;
    if (origId) {
      verbali = state.verbali.map(v => v.id===parseInt(origId)
        ? {...v, titolo, data, tipo, argomenti, decisioni, allegati, edificioId: edificioIdVerbale}
        : v);
    } else {
      const verbale = {
        id: newId(), titolo, data, tipo, argomenti, decisioni, allegati,
        edificioId: edificioIdVerbale,
        createdAt: new Date().toISOString(),
        createdBy: state.user?.nome || '',
      };
      verbali = [...state.verbali, verbale];
    }
    save('cm_verbali', verbali);
    setState({verbali, modal:null, pendingFiles:[]});
  };
  // Salva lavoro (crea/modifica) — lo storico è append-only: la nota nuova
  // si aggiunge, non sostituisce mai quelle già salvate (vedi criticità
  // "race condition su storico lavori" nel blueprint).
  const bSaveLv = document.getElementById('btn-save-lavoro');
  if (bSaveLv) bSaveLv.onclick = () => {
    const titolo = document.getElementById('lv-titolo')?.value?.trim();
    const stato = document.getElementById('lv-stato')?.value || 'da_avviare';
    const percentuale = Math.max(0, Math.min(100, parseInt(document.getElementById('lv-percentuale')?.value) || 0));
    const dataPrevistaCompletamento = document.getElementById('lv-data-prevista')?.value || '';
    const delibereRifIdRaw = document.getElementById('lv-delibera-rif')?.value;
    const delibereRifId = delibereRifIdRaw ? parseInt(delibereRifIdRaw) : null;
    const nota = document.getElementById('lv-nota')?.value?.trim();
    const origId = bSaveLv.dataset.id;
    const errEl = document.getElementById('lv-err');
    errEl.style.display = 'none';

    if (!titolo) { errEl.textContent='Il titolo è obbligatorio'; errEl.style.display='block'; return; }

    const existing = origId ? state.lavori.find(l=>l.id===parseInt(origId)) : null;
    const storicoAggiornamenti = [...(existing?.storicoAggiornamenti||[])];
    if (nota) {
      storicoAggiornamenti.push({ data: ymdLocale(new Date()), autore: state.user?.nome||'', nota });
    }
    const edificioIdLavoro = existing?.edificioId || getUserEdificio(state.user);

    let lavori;
    if (origId) {
      lavori = state.lavori.map(l => l.id===parseInt(origId)
        ? {...l, titolo, stato, percentuale, dataPrevistaCompletamento, delibereRifId, storicoAggiornamenti, edificioId: edificioIdLavoro}
        : l);
    } else {
      const lavoro = {
        id: newId(), titolo, stato, percentuale, dataPrevistaCompletamento, delibereRifId, storicoAggiornamenti,
        edificioId: edificioIdLavoro,
        createdAt: new Date().toISOString(),
        createdBy: state.user?.nome || '',
      };
      lavori = [...state.lavori, lavoro];
    }
    save('cm_lavori', lavori);
    setState({lavori, modal:null});
  };
  // Salva delibera (crea/modifica)
  const bSaveDl = document.getElementById('btn-save-delibera');
  if (bSaveDl) bSaveDl.onclick = () => {
    const descrizioneSintetica = document.getElementById('dl-descrizione')?.value?.trim();
    const dataApprovazione = document.getElementById('dl-data')?.value;
    const stato = document.getElementById('dl-stato')?.value || 'approvata';
    const responsabile = document.getElementById('dl-responsabile')?.value?.trim();
    const budgetPrevisto = document.getElementById('dl-budget')?.value;
    const verbaleRifIdRaw = document.getElementById('dl-verbale-rif')?.value;
    const verbaleRifId = verbaleRifIdRaw ? parseInt(verbaleRifIdRaw) : null;
    const note = document.getElementById('dl-note')?.value?.trim();
    const origId = bSaveDl.dataset.id;
    const errEl = document.getElementById('dl-err');
    errEl.style.display = 'none';

    if (!descrizioneSintetica) { errEl.textContent='La descrizione è obbligatoria'; errEl.style.display='block'; return; }
    if (!dataApprovazione)     { errEl.textContent='La data di approvazione è obbligatoria'; errEl.style.display='block'; return; }

    const existing = origId ? state.delibere.find(d=>d.id===parseInt(origId)) : null;
    const edificioIdDelibera = existing?.edificioId || getUserEdificio(state.user);

    let delibere;
    if (origId) {
      delibere = state.delibere.map(d => d.id===parseInt(origId)
        ? {...d, descrizioneSintetica, dataApprovazione, stato, responsabile, budgetPrevisto, verbaleRifId, note, edificioId: edificioIdDelibera}
        : d);
    } else {
      const delibera = {
        id: newId(), descrizioneSintetica, dataApprovazione, stato, responsabile, budgetPrevisto, verbaleRifId, note,
        edificioId: edificioIdDelibera,
        createdAt: new Date().toISOString(),
        createdBy: state.user?.nome || '',
      };
      delibere = [...state.delibere, delibera];
    }
    save('cm_delibere', delibere);
    setState({delibere, modal:null});
  };
}
