// Fornitori: elenco, schede, storico.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// ===========================
// FORNITORI
// ===========================
const CATEGORIE_FORNITORE = [
  {id:'pulizie',       label:'Pulizie e igiene',       icon:'🧹'},
  {id:'manutenzione',  label:'Manutenzione',           icon:'🔧'},
  {id:'impianti',      label:'Impianti e elettricità', icon:'⚡'},
  {id:'giardinaggio',  label:'Giardinaggio',           icon:'🌿'},
  {id:'ascensore',     label:'Ascensore',              icon:'🛗'},
  {id:'assicurazione', label:'Assicurazione',          icon:'🛡️'},
  {id:'amministrazione',label:'Amministrazione',       icon:'📋'},
  {id:'riscaldamento', label:'Riscaldamento',          icon:'🔥'},
  {id:'idraulica',     label:'Idraulica',              icon:'💧'},
  {id:'edilizia',      label:'Edilizia / Muratura',    icon:'🏗️'},
  {id:'sicurezza',     label:'Sicurezza e videosorveglianza', icon:'📷'},
  {id:'consulenza',    label:'Consulenza / Legale',    icon:'⚖️'},
  {id:'altro',         label:'Altro',                  icon:'📦'},
];

function renderFornitori() {
  const canEdit = canUserEdit(state.user);
  // Mostra fornitori dell'edificio attivo + quelli senza edificioId (da migrare)
  const fornitori = (state.fornitori || []).filter(f => !f.edificioId || f.edificioId === state.edificioAttivo);
  const anno = state.filterAnno || new Date().getFullYear();

  // Stats — coerenti con le altre pagine (stessa base di getSpeseVisibili,
  // include anche eventuali spese storiche non ancora migrate su questo edificio)
  const totFornitoriAttivi = fornitori.filter(f=>!f.disabled).length;
  const _speseEd     = getSpeseVisibili();
  const _speseEdAnno = _speseEd.filter(s=>new Date(s.data).getFullYear()===anno);

  // Con fornitore
  const _conFornAnno = _speseEdAnno.filter(s=>s.fornitoreId);
  const speseAnnoActual   = _conFornAnno.filter(s=>parseFloat(s.consuntivo||0)>0).reduce((a,s)=>a+parseFloat(s.consuntivo||0),0);
  const speseAnnoForecast = _conFornAnno.filter(s=>!parseFloat(s.consuntivo||0)).reduce((a,s)=>a+parseFloat(s.preventivo||0),0);
  const speseTotali       = _speseEd.filter(s=>s.fornitoreId && parseFloat(s.consuntivo||0)>0).reduce((a,s)=>a+parseFloat(s.consuntivo||0),0);

  // Senza fornitore — stesse metriche, per riconciliare col resto dell'app
  const _senzaFornAnno = _speseEdAnno.filter(s=>!s.fornitoreId);
  const senzaAnnoActual   = _senzaFornAnno.filter(s=>parseFloat(s.consuntivo||0)>0).reduce((a,s)=>a+parseFloat(s.consuntivo||0),0);
  const senzaAnnoForecast = _senzaFornAnno.filter(s=>!parseFloat(s.consuntivo||0)).reduce((a,s)=>a+parseFloat(s.preventivo||0),0);
  const senzaTotali       = _speseEd.filter(s=>!s.fornitoreId && parseFloat(s.consuntivo||0)>0).reduce((a,s)=>a+parseFloat(s.consuntivo||0),0);

  // Totali combinati (con + senza fornitore) — questi devono coincidere con Dashboard/Bilancio
  const totaleAnnoActual   = speseAnnoActual + senzaAnnoActual;
  const totaleAnnoForecast = speseAnnoForecast + senzaAnnoForecast;
  const totaleStoricoAll   = speseTotali + senzaTotali;

  return `
  <div>
    <div class="page-header">
      <div><div class="page-title">Fornitori</div><div class="page-sub">${totFornitoriAttivi} fornitori attivi</div></div>
      ${canEdit ? `<button class="btn btn-primary" id="btn-nuovo-fornitore">+ Nuovo fornitore</button>` : ''}
    </div>

    <!-- Filtro anno -->
    <div style="margin-bottom:1rem">
      <select class="spese-filter-sel" onchange="setState({filterAnno:this.value?parseInt(this.value):0})" style="max-width:160px">
        <option value="">Tutti gli anni</option>
        ${getAnni().map(a=>`<option value="${a}" ${a===anno?'selected':''}>${a}</option>`).join('')}
      </select>
    </div>

    <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1.5rem;align-items:stretch">

      <!-- Numeri piccoli: fornitori attivi + categorie -->
      <div style="display:flex;flex-direction:column;gap:.75rem;min-width:80px">
        <div class="stat-card stat-blue" style="flex:1;text-align:center;padding:.625rem .75rem;min-width:80px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:2px">Attivi</div>
          <div style="font-size:2rem;font-weight:800;color:var(--accent);line-height:1">${totFornitoriAttivi}</div>
          <div style="font-size:10px;color:var(--text2)">fornitori</div>
        </div>
        <div class="stat-card" style="flex:1;text-align:center;padding:.625rem .75rem;min-width:80px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:2px">Categorie</div>
          <div style="font-size:2rem;font-weight:800;line-height:1">${new Set(fornitori.filter(f=>!f.disabled).map(f=>f.categoria)).size}</div>
          <div style="font-size:10px;color:var(--text2)">usate</div>
        </div>
      </div>

      <!-- Actual anno -->
      <div class="stat-card stat-red" style="flex:2;min-width:160px">
        <div style="font-size:9px;font-weight:700;color:var(--red);letter-spacing:.06em;margin-bottom:4px">✅ ACTUAL ${anno}</div>
        <div style="font-size:1.8rem;font-weight:800;color:var(--red);line-height:1.1">${fmt(speseAnnoActual)}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:4px">con fornitore</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">+ ${fmt(senzaAnnoActual)} senza fornitore</div>
        <div style="font-size:12px;font-weight:700;color:var(--text);margin-top:5px;padding-top:5px;border-top:1px dashed var(--border)">Totale: ${fmt(totaleAnnoActual)}</div>
      </div>

      <!-- Forecast anno -->
      <div class="stat-card" style="flex:2;min-width:160px;border-top:3px solid #7c3aed">
        <div style="font-size:9px;font-weight:700;color:#7c3aed;letter-spacing:.06em;margin-bottom:4px">🔮 FORECAST ${anno}</div>
        <div style="font-size:1.8rem;font-weight:800;color:${speseAnnoForecast>0?'#7c3aed':'var(--text2)'};line-height:1.1">${speseAnnoForecast>0?fmt(speseAnnoForecast):'—'}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:4px">con fornitore</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">+ ${fmt(senzaAnnoForecast)} senza fornitore</div>
        <div style="font-size:12px;font-weight:700;color:var(--text);margin-top:5px;padding-top:5px;border-top:1px dashed var(--border)">Totale: ${fmt(totaleAnnoForecast)}</div>
      </div>

      <!-- Storico -->
      <div class="stat-card" style="flex:2;min-width:160px;border-top:3px solid #0E7490">
        <div style="font-size:9px;font-weight:700;color:#0E7490;letter-spacing:.06em;margin-bottom:4px">📊 STORICO</div>
        <div style="font-size:1.8rem;font-weight:800;color:#0E7490;line-height:1.1">${fmt(speseTotali)}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:4px">con fornitore</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">+ ${fmt(senzaTotali)} senza fornitore</div>
        <div style="font-size:12px;font-weight:700;color:var(--text);margin-top:5px;padding-top:5px;border-top:1px dashed var(--border)">Totale: ${fmt(totaleStoricoAll)}</div>
      </div>

    </div>

    ${fornitori.filter(f=>!f.disabled).length === 0 ? `
    <div class="empty">${svgEmpty()}<p>Nessun fornitore ancora. Aggiungine uno!</p></div>` : `
    <div class="fornitore-grid">
      ${fornitori.filter(f=>!f.disabled).map(f => renderFornitoreCard(f, canEdit)).join('')}
    </div>`}

    ${fornitori.filter(f=>f.disabled).length > 0 ? `
    <div style="margin-top:1.5rem">
      <div class="section-divider"><h3>📦 Fornitori non più attivi</h3></div>
      <div class="fornitore-grid">
        ${fornitori.filter(f=>f.disabled).map(f => renderFornitoreCard(f, canEdit, true)).join('')}
      </div>
    </div>` : ''}
  </div>`;
}

function renderFornitoreCard(f, canEdit, archived=false) {
  const catF = CATEGORIE_FORNITORE.find(c=>c.id===f.categoria)||{label:f.categoria||'—', icon:'📦'};
  const _edForn = f.edificioId || getUserEdificio(state.user);
  const _allSpeseF = state.spese.filter(s=>!s.edificioId||s.edificioId===_edForn);
  const speseF = _allSpeseF.filter(s=>s.fornitoreId===f.id).sort((a,b)=>new Date(b.data)-new Date(a.data));
  const anno = state.filterAnno || new Date().getFullYear();

  // Separa actual da forecast — filtrato per anno selezionato
  const speseFAnno   = speseF.filter(s=>new Date(s.data).getFullYear()===anno);
  const actualAnno   = speseFAnno.filter(s=>parseFloat(s.consuntivo||0)>0);
  const forecastAnno = speseFAnno.filter(s=>parseFloat(s.consuntivo||0)===0 && parseFloat(s.preventivo||0)>0);
  const totActual    = actualAnno.reduce((a,s)=>a+parseFloat(s.consuntivo||0),0);
  const totForecast  = forecastAnno.reduce((a,s)=>a+parseFloat(s.preventivo||0),0);
  const totaleStorico= speseF.filter(s=>parseFloat(s.consuntivo||0)>0).reduce((a,s)=>a+parseFloat(s.consuntivo||0),0);
  const ultimaSpesa  = speseF[0];

  return `<div class="fornitore-card${archived?' disabled':''}">
    <div class="fc-head">
      <div class="fc-avatar">${esc(catF.icon)}</div>
      <div style="flex:1;min-width:0">
        <div class="fc-name">${esc(f.nome)}</div>
        <div class="fc-cat">${esc(catF.label)}${f.piva?` · P.IVA ${esc(f.piva)}`:''}</div>
      </div>
      ${archived ? '<span class="badge badge-gray" style="font-size:11px">Inattivo</span>' : '<span class="badge badge-green" style="font-size:11px">Attivo</span>'}
    </div>

    ${f.indirizzo ? `<div style="font-size:12px;color:var(--text2);margin-bottom:4px">📍 ${esc(f.indirizzo)}</div>` : ''}
    ${f.telefono  ? `<div style="font-size:12px;color:var(--text2);margin-bottom:4px">📞 <a href="tel:${esc(f.telefono)}" style="color:var(--accent)">${esc(f.telefono)}</a></div>` : ''}
    ${f.email     ? `<div style="font-size:12px;color:var(--text2);margin-bottom:4px">📧 <a href="mailto:${esc(f.email)}" style="color:var(--accent)">${esc(f.email)}</a></div>` : ''}
    ${f.iban ? `<div style="font-size:11px;color:var(--text2);margin-bottom:6px">IBAN:
      <div class="iban-box"><span>${esc(f.iban)}</span>
        <button class="copy-btn" data-copy-iban="${esc(f.iban)}" title="Copia IBAN">📋</button>
      </div></div>` : ''}
    ${f.note ? `<div style="font-size:12px;color:var(--text2);margin-bottom:6px;font-style:italic">"${esc(f.note)}"</div>` : ''}

    <!-- Spese anno corrente: actual + forecast -->
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:.625rem .75rem;margin-bottom:.5rem">
      <div style="font-size:10px;font-weight:700;color:var(--text2);letter-spacing:.06em;margin-bottom:6px">SPESE ${anno}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">
        <div style="text-align:center;background:${totActual>0?'#fef2f2':'var(--surface)'};border-radius:5px;padding:5px 4px">
          <div style="font-size:9px;color:var(--red);font-weight:700;letter-spacing:.04em">ACTUAL</div>
          <div style="font-size:1rem;font-weight:800;color:${totActual>0?'var(--red)':'var(--text2)'}">${totActual>0?fmt(totActual):'—'}</div>
          <div style="font-size:10px;color:var(--text2)">${actualAnno.length} interventi</div>
        </div>
        <div style="text-align:center;background:${totForecast>0?'#f5f3ff':'var(--surface)'};border-radius:5px;padding:5px 4px">
          <div style="font-size:9px;color:#7c3aed;font-weight:700;letter-spacing:.04em">FORECAST</div>
          <div style="font-size:1rem;font-weight:800;color:${totForecast>0?'#7c3aed':'var(--text2)'}">${totForecast>0?fmt(totForecast):'—'}</div>
          <div style="font-size:10px;color:var(--text2)">${forecastAnno.length} preventivi</div>
        </div>
      </div>
      ${totActual>0||totForecast>0?`<div style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;margin-top:6px;padding-top:5px;border-top:1px solid var(--border)">
        <span style="color:var(--text2)">Totale ${anno}</span>
        <span style="color:#0E7490">${fmt(totActual+totForecast)}</span>
      </div>`:''}
    </div>

    <div class="fc-row"><span style="color:var(--text2);font-size:12px">Storico consuntivato</span><span style="font-size:12px;font-weight:600">${fmt(totaleStorico)}</span></div>
    <div class="fc-row"><span style="color:var(--text2);font-size:12px">N° interventi tot.</span><span style="font-size:12px">${speseF.length}</span></div>
    ${ultimaSpesa ? `<div class="fc-row"><span style="color:var(--text2);font-size:12px">Ultimo intervento</span><span style="font-size:12px">${esc(ultimaSpesa.data)}</span></div>` : ''}

    ${canEdit ? `<div class="fc-actions">
      <button class="btn btn-secondary btn-sm" data-edit-fornitore="${f.id}" style="flex:1">✏️ Modifica</button>
      <button class="btn btn-secondary btn-sm" data-storico-fornitore="${f.id}" style="flex:1">📊 Storico</button>
      ${archived
        ? `<button class="btn btn-success btn-sm" data-enable-fornitore="${f.id}">▶ Riattiva</button>`
        : `<button class="btn btn-secondary btn-sm" data-disable-fornitore="${f.id}" style="color:var(--amber)">⏸</button>`}
      <button class="btn btn-danger btn-sm" data-del-fornitore="${f.id}">🗑</button>
    </div>` : ''}
  </div>`;
}

// ===========================
// MODAL FORNITORE
// ===========================
function renderModalFornitore(d) {
  const isEdit = !!d?.id;
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:580px">
      <div class="modal-header">
        <h2>${isEdit ? '✏️ Modifica fornitore' : '🏢 Nuovo fornitore'}</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">

        <div class="form-row">
          <div class="field" style="flex:2">
            <label>Ragione sociale / Nome *</label>
            <input type="text" id="fn-nome" value="${esc(d?.nome||'')}" placeholder="Es. Pulizie Bianchi Srl">
          </div>
          <div class="field">
            <label>Categoria *</label>
            <select id="fn-cat">
              <option value="">— Seleziona —</option>
              ${CATEGORIE_FORNITORE.map(c=>`<option value="${c.id}" ${c.id===d?.categoria?'selected':''}>${c.icon} ${c.label}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="field">
            <label>P.IVA / Cod. Fiscale</label>
            <input type="text" id="fn-piva" value="${esc(d?.piva||'')}" placeholder="IT12345678901">
          </div>
          <div class="field">
            <label>Telefono</label>
            <input type="tel" id="fn-tel" value="${esc(d?.telefono||'')}" placeholder="+39 0541 123456">
          </div>
        </div>

        <div class="form-row">
          <div class="field">
            <label>Email</label>
            <input type="email" id="fn-email" value="${esc(d?.email||'')}" placeholder="info@fornitore.it">
          </div>
          <div class="field">
            <label>Sito web</label>
            <input type="text" id="fn-web" value="${esc(d?.web||'')}" placeholder="www.fornitore.it">
          </div>
        </div>

        <div class="field">
          <label>Indirizzo</label>
          <input type="text" id="fn-indirizzo" value="${esc(d?.indirizzo||'')}" placeholder="Via Roma 1, 00100 Roma (RM)">
        </div>

        <div class="field">
          <label>IBAN</label>
          <input type="text" id="fn-iban" value="${esc(d?.iban||'')}" placeholder="IT60 X054 2811 1010 0000 0123 456" style="font-family:monospace">
          <p class="hint">Usato per i pagamenti — visibile solo agli amministratori</p>
        </div>

        <div class="form-row">
          <div class="field">
            <label>Persona di riferimento</label>
            <input type="text" id="fn-ref" value="${esc(d?.riferimento||'')}" placeholder="Mario Bianchi">
          </div>
          <div class="field">
            <label>Telefono diretto riferimento</label>
            <input type="tel" id="fn-reftel" value="${esc(d?.riferimentoTel||'')}" placeholder="+39 333 1234567">
          </div>
        </div>

        <div class="field">
          <label>Note interne</label>
          <textarea id="fn-note" rows="2" placeholder="Es. Disponibile solo mattina, sconto 10% per condomini…">${esc(d?.note||'')}</textarea>
        </div>

        <div id="fn-err" class="alert alert-warning" style="display:none;margin-top:.5rem"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        <button class="btn btn-primary" id="btn-save-fornitore" data-id="${d?.id||''}">
          💾 ${isEdit ? 'Salva modifiche' : 'Aggiungi fornitore'}
        </button>
      </div>
    </div>
  </div>`;
}

function renderModalStoricoFornitore(f) {
  const _edFornSt = f.edificioId || getUserEdificio(state.user);
  const speseF = state.spese.filter(s=>s.fornitoreId===f.id && (!s.edificioId||s.edificioId===_edFornSt))
    .sort((a,b)=>new Date(b.data)-new Date(a.data));
  const totale = speseF.reduce((a,s)=>a+parseFloat(s.consuntivo||s.preventivo||0), 0);
  const anno = new Date().getFullYear();
  const totAnno = speseF.filter(s=>new Date(s.data).getFullYear()===anno)
    .reduce((a,s)=>a+parseFloat(s.consuntivo||s.preventivo||0), 0);

  // Raggruppa per anno
  const perAnno = {};
  speseF.forEach(s => {
    const y = new Date(s.data).getFullYear();
    if (!perAnno[y]) perAnno[y] = [];
    perAnno[y].push(s);
  });

  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:620px">
      <div class="modal-header">
        <h2>📊 Storico — ${esc(f.nome)}</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.75rem;margin-bottom:1.25rem">
          <div class="fornitore-stat"><div style="font-size:11px;color:var(--text2)">Interventi totali</div><div style="font-size:1.3rem;font-weight:700;color:var(--accent)">${speseF.length}</div></div>
          <div class="fornitore-stat"><div style="font-size:11px;color:var(--text2)">Anno ${anno}</div><div style="font-size:1.3rem;font-weight:700;color:var(--red)">${fmt(totAnno)}</div></div>
          <div class="fornitore-stat"><div style="font-size:11px;color:var(--text2)">Totale storico</div><div style="font-size:1.3rem;font-weight:700">${fmt(totale)}</div></div>
        </div>

        ${Object.keys(perAnno).sort((a,b)=>b-a).map(y => {
          const items = perAnno[y];
          const totY = items.reduce((a,s)=>a+parseFloat(s.consuntivo||s.preventivo||0), 0);
          return `<div style="margin-bottom:1.25rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
              <div style="font-weight:600;font-size:14px">📅 ${y}</div>
              <div style="font-weight:700;color:var(--red)">${fmt(totY)}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${items.map(s => {
                const cat = getCategorie().find(c=>c.id===s.categoria)||{label:s.categoria||'—', icon:'📦'};
                return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surface2);border-radius:var(--radius-sm)">
                  <div style="font-size:16px">${esc(cat.icon||'📦')}</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:500;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.titolo)}</div>
                    <div style="font-size:11px;color:var(--text2)">${esc(s.data)} · ${esc(cat.label)}</div>
                  </div>
                  <div style="font-weight:600;font-size:13px;color:var(--red);white-space:nowrap">${fmt(s.consuntivo||s.preventivo)}</div>
                </div>`;
              }).join('')}
            </div>
          </div>`;
        }).join('')}

        ${speseF.length === 0 ? '<div class="empty"><p>Nessuna spesa associata a questo fornitore</p></div>' : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Chiudi</button>
      </div>
    </div>
  </div>`;
}

// Pulsanti della pagina Fornitori. Chiamata da bindPageActions() (azioni.js).
function bindAzioniFornitori() {
  // Nuovo fornitore
  const bNuovoFornitore = document.getElementById('btn-nuovo-fornitore');
  if (bNuovoFornitore) bNuovoFornitore.onclick = () => setState({modal:{type:'fornitore', data:null}});
  // Edit fornitore
  document.querySelectorAll('[data-edit-fornitore]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editFornitore);
      const f = state.fornitori.find(x=>x.id===id);
      if (f) setState({modal:{type:'fornitore', data:{...f}}});
    };
  });
  // Storico fornitore
  document.querySelectorAll('[data-storico-fornitore]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.storicoFornitore);
      const f = state.fornitori.find(x=>x.id===id);
      if (f) setState({modal:{type:'storico-fornitore', data:{...f}}});
    };
  });
  // Disabilita fornitore
  document.querySelectorAll('[data-disable-fornitore]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.disableFornitore);
      if (!confirm('Disabilitare questo fornitore? Rimarrà nello storico.')) return;
      const fornitori = state.fornitori.map(f=>f.id===id?{...f,disabled:true}:f);
      save('cm_fornitori', fornitori);
      setState({fornitori});
    };
  });
  // Riabilita fornitore
  document.querySelectorAll('[data-enable-fornitore]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.enableFornitore);
      const fornitori = state.fornitori.map(f=>f.id===id?{...f,disabled:false}:f);
      save('cm_fornitori', fornitori);
      setState({fornitori});
    };
  });
  // Elimina fornitore
  document.querySelectorAll('[data-del-fornitore]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.delFornitore);
      const f = state.fornitori.find(x=>x.id===id);
      if (!f) return;
      const myEdIdForn = getUserEdificio(state.user);
      const usato = state.spese.filter(s=>s.fornitoreId===id && (!s.edificioId||s.edificioId===myEdIdForn)).length;
      const msg = usato > 0
        ? `"${f.nome}" è associato a ${usato} spese. Eliminandolo le spese perderanno il riferimento. Procedere?`
        : `Eliminare definitivamente "${f.nome}"?`;
      if (!confirm(msg)) return;
      const fornitori = state.fornitori.filter(x=>x.id!==id);
      save('cm_fornitori', fornitori);
      setState({fornitori});
    };
  });
  // Copia IBAN
  document.querySelectorAll('[data-copy-iban]').forEach(btn => {
    btn.onclick = () => {
      navigator.clipboard.writeText(btn.dataset.copyIban).then(()=>{
        btn.textContent='✅';
        setTimeout(()=>btn.textContent='📋', 2000);
      });
    };
  });
}

// Scheda fornitore. Chiamata da bindModal() (schede.js).
function bindSchedaFornitori() {
  // Salva fornitore
  const bSaveF = document.getElementById('btn-save-fornitore');
  if (bSaveF) bSaveF.onclick = () => {
    const nome     = document.getElementById('fn-nome')?.value?.trim();
    const cat      = document.getElementById('fn-cat')?.value;
    const piva     = document.getElementById('fn-piva')?.value?.trim();
    const tel      = document.getElementById('fn-tel')?.value?.trim();
    const email    = document.getElementById('fn-email')?.value?.trim();
    const web      = document.getElementById('fn-web')?.value?.trim();
    const indirizzo= document.getElementById('fn-indirizzo')?.value?.trim();
    const iban     = document.getElementById('fn-iban')?.value?.trim().replace(/\s/g,'');
    const ref      = document.getElementById('fn-ref')?.value?.trim();
    const reftel   = document.getElementById('fn-reftel')?.value?.trim();
    const note     = document.getElementById('fn-note')?.value?.trim();
    const origId   = bSaveF.dataset.id;
    const errEl    = document.getElementById('fn-err');
    errEl.style.display = 'none';

    if (!nome) { errEl.textContent='Il nome è obbligatorio'; errEl.style.display='block'; return; }
    if (!cat)  { errEl.textContent='Seleziona una categoria'; errEl.style.display='block'; return; }

    if (iban && (iban.length < 15 || iban.length > 34)) {
      errEl.textContent='IBAN non valido (lunghezza errata)'; errEl.style.display='block'; return;
    }

    // Edificio: mantieni quello esistente se modifica, assegna quello attivo se nuovo
    const edificioIdFornitore = origId
      ? (state.fornitori.find(f=>f.id===parseInt(origId))?.edificioId || getUserEdificio(state.user))
      : getUserEdificio(state.user);

    const fornitore = {
      id: origId ? parseInt(origId) : newId(),
      nome, categoria:cat, piva, telefono:tel, email, web,
      indirizzo, iban, riferimento:ref, riferimentoTel:reftel, note,
      disabled: false,
      edificioId: edificioIdFornitore,
    };

    let fornitori;
    if (origId) {
      fornitori = state.fornitori.map(f=>f.id===fornitore.id?fornitore:f);
    } else {
      fornitori = [...state.fornitori, fornitore];
    }
    save('cm_fornitori', fornitori);
    setState({fornitori, modal:null});
  };
}
