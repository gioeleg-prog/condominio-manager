// Entrate e quote: versamenti, rate previsionali, piano rate e relativo grafico.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

function renderEntrateMobileCards(items, canEdit) {
  if (!items.length) return `<div class="empty">${svgEmpty()}<p>Nessun versamento registrato</p></div>`;
  return `<div class="mobile-card-list">
    ${items.map(e => {
      const cond = state.condomini.find(c=>c.id===e.condominoId)||{nome:'Sconosciuto',color:'#888'};
      const cat  = getCategorie().find(c=>c.id===e.categoria)||{label:'—'};
      return `<div class="entrata-mobile-card ${e.previsionale?'previsionale-entrata':''}">
        <div class="avatar" style="${avatarStyle(cond.color)};width:38px;height:38px;font-size:13px;flex-shrink:0">${initials(cond.nome)}</div>
        <div class="emc-info">
          <div class="emc-name">${esc(cond.nome)} ${e.previsionale?'<span class="prev-badge">🔮 Prev.</span>':''}</div>
          <div class="emc-meta">${esc(e.data)} · ${esc(cond.appartamento)}${e.descrizione?' · '+esc(e.descrizione):''}</div>
          <span class="badge ${e.previsionale?'badge-amber':'badge-green'}" style="font-size:10px;margin-top:3px;display:inline-flex">${esc(cat.label)}</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div class="emc-amount">${fmt(e.importo)}</div>
          ${e.importoPrevisto!=null && Math.abs(parseFloat(e.importoPrevisto)-parseFloat(e.importo))>=0.01 ? `<div style="font-size:10px;color:var(--text2)">previsto ${fmt(e.importoPrevisto)}</div>` : ''}
          ${e.previsionale && canEdit ? `<button class="btn-valida" data-valida-entrata="${e.id}">✅ Valida</button>` : ''}
          ${canEdit ? `<button class="allegato-btn" data-edit-entrata="${e.id}" style="font-size:13px" title="Modifica">✏️</button>` : ''}
          ${canEdit ? `<button class="allegato-btn danger" data-del-entrata="${e.id}" style="font-size:13px" title="Elimina">🗑</button>` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// ===========================
// ENTRATE
// ===========================
function renderEntrate() {
  const canEdit = canUserEdit(state.user);
  const myEdId2 = getUserEdificio(state.user);
  let items = state.entrate.filter(e => e.edificioId === state.edificioAttivo);
  if (state.filterAnno) items = items.filter(e=>new Date(e.data).getFullYear()===state.filterAnno);
  if (state.searchQ) items = items.filter(e=>{
    const cond = state.condomini.find(c=>c.id===e.condominoId)||{nome:''};
    return cond.nome.toLowerCase().includes(state.searchQ.toLowerCase())||e.descrizione?.toLowerCase().includes(state.searchQ.toLowerCase());
  });
  items = [...items].sort((a,b)=>new Date(b.data)-new Date(a.data));
  const totale = items.reduce((a,e)=>a+parseFloat(e.importo||0),0);

  const anni = getAnni();
  const perCondomino = state.condomini.filter(c=>c.edificioId===state.edificioAttivo&&!c.disabled&&!c.superAdmin).map(c=>{
    const tot = items.filter(e=>e.condominoId===c.id).reduce((a,e)=>a+parseFloat(e.importo||0),0);
    return {...c, totale:tot};
  });
  // ── Calcoli quota per condomino con split reali ──────────────────────────
  const _allSpeseEnt = state.spese.filter(s => !s.edificioId || s.edificioId === state.edificioAttivo);
  const speseAnno = _allSpeseEnt.filter(s=>!state.filterAnno||new Date(s.data).getFullYear()===state.filterAnno);
  const nAttiviEnt = state.condomini.filter(c=>c.edificioId===state.edificioAttivo&&!c.disabled&&!c.superAdmin).length || 1;

  // Quota per ogni condomino usando split reali — divisa tra ord/straord
  function getQuotaCondomino(condId) {
    let ord = 0, straord = 0, ordPrev = 0, straordPrev = 0;
    speseAnno.forEach(s => {
      const hasCons = parseFloat(s.consuntivo||0) > 0;
      const hasPrev = parseFloat(s.preventivo||0) > 0;
      const refActual = parseFloat(s.consuntivo||0);
      const refFull   = parseFloat(s.consuntivo||s.preventivo||0);
      const getPerc = (ref) => {
        if (!ref) return 0;
        if (s.split?.length) {
          const e = s.split.find(x=>x.id===condId);
          return e ? (e.perc||0)/100*ref : ref/nAttiviEnt;
        }
        return ref/nAttiviEnt;
      };
      if (hasCons) {
        if (s.tipoSpesa==='straordinaria') straord += getPerc(refActual);
        else ord += getPerc(refActual);
      }
      if (hasPrev && !hasCons) {
        if (s.tipoSpesa==='straordinaria') straordPrev += getPerc(refFull);
        else ordPrev += getPerc(refFull);
      }
    });
    return { ord, straord, ordPrev, straordPrev,
      totActual: ord + straord,
      totFull:   ord + straord + ordPrev + straordPrev };
  }

  return `
  <div>
    <div class="page-header">
      <div><div class="page-title">Entrate / Quote</div><div class="page-sub">${items.length} versamenti</div></div>
      ${canEdit?`<button class="btn btn-primary" id="btn-add-entrata">+ Registra versamento</button>`:''}
    </div>

    <div class="spese-filters">
      <input type="text" class="spese-filter-search" placeholder="🔍 Cerca condomino…" id="search-entrate" value="${esc(state.searchQ)}">
      <div class="spese-filter-row">
        <select class="spese-filter-sel" id="filter-anno-entrate">
          <option value="0">Tutti gli anni</option>
          ${anni.map(a=>`<option value="${a}" ${a===state.filterAnno?'selected':''}>${a}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="card" style="margin-bottom:1.5rem">
      <div class="card-header">
        <h3>Stato versamenti per condomino (${state.filterAnno||'tutti gli anni'})</h3>
      </div>
      <div style="padding:.75rem 1.25rem 1rem">
        <!-- Legenda -->
        <div style="display:flex;gap:1.25rem;flex-wrap:wrap;margin-bottom:1rem;font-size:12px">
          <div style="display:flex;align-items:center;gap:5px"><div style="width:10px;height:10px;border-radius:2px;background:var(--green)"></div><span style="color:var(--text2)">Versato (reale)</span></div>
          <div style="display:flex;align-items:center;gap:5px"><div style="width:10px;height:10px;border-radius:2px;background:var(--accent)"></div><span style="color:var(--text2)">Quota ord. (actual)</span></div>
          <div style="display:flex;align-items:center;gap:5px"><div style="width:10px;height:10px;border-radius:2px;background:var(--purple)"></div><span style="color:var(--text2)">Quota straord. (actual)</span></div>
          <div style="display:flex;align-items:center;gap:5px"><div style="width:10px;height:10px;border-radius:2px;background:#a78bfa;opacity:.6"></div><span style="color:var(--text2)">Da consuntivare (prev.)</span></div>
        </div>

        <div class="condomini-grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
          ${perCondomino.map(c=>{
            const versato       = items.filter(e=>e.condominoId===c.id && !e.previsionale).reduce((a,e)=>a+parseFloat(e.importo||0),0);
            const versatoPrev   = items.filter(e=>e.condominoId===c.id &&  e.previsionale).reduce((a,e)=>a+parseFloat(e.importo||0),0);
            const q             = getQuotaCondomino(c.id);
            // Riporto anni precedenti per questo condomino
            const annoSel       = state.filterAnno || new Date().getFullYear();
            const myEdId2l      = getUserEdificio(state.user);
            const versatiPrec   = (state.entrate.filter(e => !e.edificioId || e.edificioId === state.edificioAttivo))
              .filter(e=>e.condominoId===c.id && !e.previsionale && new Date(e.data).getFullYear()<annoSel)
              .reduce((a,e)=>a+parseFloat(e.importo||0),0);
            const spesePrecQuota= (state.spese.filter(s => !s.edificioId || s.edificioId === state.edificioAttivo))
              .filter(s=>new Date(s.data).getFullYear()<annoSel && parseFloat(s.consuntivo||0)>0)
              .reduce((acc,s)=>{
                const ref=parseFloat(s.consuntivo||0);
                if(s.split?.length){const e=s.split.find(x=>x.id===c.id);return acc+(e?(e.perc||0)/100*ref:ref/nAttiviEnt);}
                return acc+ref/nAttiviEnt;
              },0);
            const riporto       = versatiPrec - spesePrecQuota;
            const diffActual    = versato - q.totActual;
            const saldoCassa    = riporto + diffActual;  // saldo reale con riporto
            const diffFull      = versato + versatoPrev - q.totFull;
            const percActual    = q.totActual>0 ? Math.min(100,Math.round(versato/q.totActual*100)) : 0;
            const percFull      = q.totFull>0   ? Math.min(100,Math.round((versato+versatoPrev)/q.totFull*100)) : 0;
            const coloreBar     = percActual>=100?'var(--green)':percActual>=60?'var(--amber)':'var(--red)';
            const statoOK       = saldoCassa >= 0;

            return `<div class="condomino-card">
              <!-- HEADER -->
              <div class="head">
                <div class="avatar" style="${avatarStyle(c.color)}">${initials(c.nome)}</div>
                <div style="flex:1;min-width:0">
                  <div class="name">${esc(c.nome)}</div>
                  <div class="apt">${esc(c.appartamento)}</div>
                </div>
                <span class="badge ${statoOK?'badge-green':'badge-red'}" style="font-size:10px">${statoOK?'✓ OK':'⚠ Scoperto'}</span>
              </div>

              <!-- SEZIONE 1: CASSA REALE -->
              <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:.625rem .75rem;margin-bottom:.5rem">
                <div style="font-size:10px;font-weight:700;color:var(--green);letter-spacing:.06em;margin-bottom:5px">💰 INCASSI (ACTUAL)</div>
                <div class="row"><span>Versato ${annoSel}</span><span style="font-weight:600;color:var(--green)">${fmt(versato)}</span></div>
                ${riporto!==0?`<div class="row"><span style="color:var(--text2);font-size:12px">Riporto anni prec.</span><span style="font-size:12px;color:${riporto>=0?'var(--green)':'var(--red)'}">${riporto>=0?'+':''}${fmt(riporto)}</span></div>`:''}
                ${versatoPrev>0?`<div class="row"><span style="color:#7c3aed;font-size:12px">🔮 Previsionali attesi</span><span style="font-size:12px;color:#7c3aed">${fmt(versatoPrev)}</span></div>`:''}
              </div>

              <!-- SEZIONE 2: SPESE ACTUAL -->
              <div style="padding:.5rem 0;border-top:1px solid var(--border)">
                <div style="font-size:10px;font-weight:700;color:var(--red);letter-spacing:.06em;margin-bottom:5px">📋 QUOTA SPESE (ACTUAL)</div>
                ${q.ord>0?`<div class="row" style="font-size:12px"><span style="color:var(--accent)">Ordinarie</span><span style="color:var(--accent)">${fmt(q.ord)}</span></div>`:''}
                ${q.straord>0?`<div class="row" style="font-size:12px"><span style="color:var(--purple)">Straordinarie</span><span style="color:var(--purple)">${fmt(q.straord)}</span></div>`:''}
                <div class="row" style="font-weight:700;border-top:1px dashed var(--border);margin-top:3px;padding-top:3px">
                  <span>Totale dovuto</span><span>${fmt(q.totActual)}</span>
                </div>
              </div>

              <!-- SEZIONE 3: SALDO REALE -->
              <div style="padding:.5rem 0;border-top:2px solid var(--border)">
                <div class="row" style="font-weight:700;font-size:14px">
                  <span>Saldo reale${riporto!==0?' (con riporto)':''}</span>
                  <span style="color:${saldoCassa>=0?'var(--green)':'var(--red)'}">${saldoCassa>=0?'+':''}${fmt(saldoCassa)}</span>
                </div>
                <div style="margin-top:5px">
                  <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:3px">
                    <span>Copertura actual</span><span style="font-weight:600;color:${coloreBar}">${percActual}%</span>
                  </div>
                  <div class="progress-wrap">
                    <div class="progress-fill" style="width:${percActual}%;background:${coloreBar}"></div>
                  </div>
                </div>
              </div>

              <!-- SEZIONE 4: FORECAST aggregato (solo totali, dettaglio in fondo pagina) -->
              ${q.ordPrev>0||q.straordPrev>0?`
              <div style="padding:.5rem 0;border-top:1px solid #e9d5ff;margin-top:.25rem">
                <div style="font-size:10px;font-weight:700;color:#7c3aed;letter-spacing:.06em;margin-bottom:5px">🔮 FORECAST</div>
                ${q.ordPrev>0?`<div class="row" style="font-size:12px;color:#7c3aed"><span>Ordinarie</span><span>${fmt(q.ordPrev)}</span></div>`:''}
                ${q.straordPrev>0?`<div class="row" style="font-size:12px;color:#7c3aed"><span>Straordinarie</span><span>${fmt(q.straordPrev)}</span></div>`:''}
                <div class="row" style="font-weight:700;color:#0E7490;border-top:1px dashed #e9d5ff;margin-top:3px;padding-top:3px">
                  <span>Quota proiettata</span><span>${fmt(q.totFull)}</span>
                </div>
                <div class="row" style="font-size:12px">
                  <span style="color:var(--text2)">Saldo proiettato</span>
                  <span style="font-weight:600;color:${diffFull>=0?'var(--green)':'var(--red)'}">${diffFull>=0?'+':''}${fmt(diffFull)}</span>
                </div>
                <div style="margin-top:5px">
                  <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:3px">
                    <span>Copertura proiettata</span><span style="font-weight:600;color:#7c3aed">${percFull}%</span>
                  </div>
                  <div class="progress-wrap">
                    <div class="progress-fill" style="width:${percActual}%;background:${coloreBar}"></div>
                    <div style="width:${Math.max(0,percFull-percActual)}%;background:#7c3aed;opacity:.35;height:100%"></div>
                  </div>
                </div>
              </div>`:''}
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- DETTAGLIO SPESE FORECAST PRO-CAPITE -->
    ${(()=>{
      const speseAperte = speseAnno.filter(s=>parseFloat(s.consuntivo||0)===0 && parseFloat(s.preventivo||0)>0);
      if (speseAperte.length === 0) return '';
      return '<div class="card" style="margin-bottom:1rem">' +
        '<div class="card-header"><h3>🔮 Dettaglio spese forecast — quota per condomino</h3>' +
        '<span style="font-size:12px;color:var(--text2)">' + speseAperte.length + ' spese da consuntivare</span></div>' +
        '<div class="table-wrap"><table>' +
        '<thead><tr>' +
        '<th>Spesa</th><th>Tipo</th><th>Preventivo</th>' +
        perCondomino.map(c=>'<th style="text-align:right;font-size:11px">' + initials(c.nome) + '<br><span style="font-weight:400;color:var(--text2)">' + esc(c.appartamento) + '</span></th>').join('') +
        '</tr></thead><tbody>' +
        speseAperte.map(s=>{
          const ref = parseFloat(s.preventivo||0);
          const quoteCond = perCondomino.map(c=>{
            let q = 0;
            if (s.split?.length) { const e=s.split.find(x=>x.id===c.id); q=e?(e.perc||0)/100*ref:ref/nAttiviEnt; }
            else q = ref/nAttiviEnt;
            return '<td style="text-align:right;font-size:12px;color:#7c3aed">' + fmt(q) + '</td>';
          }).join('');
          return '<tr>' +
            '<td style="font-weight:500;font-size:13px">' + esc(s.titolo) + '</td>' +
            '<td><span class="badge ' + (s.tipoSpesa==='straordinaria'?'badge-purple':'badge-blue') + '" style="font-size:10px">' + (s.tipoSpesa==='straordinaria'?'Straord.':'Ord.') + '</span></td>' +
            '<td style="text-align:right;color:var(--amber);font-weight:500">' + fmt(ref) + '</td>' +
            quoteCond +
          '</tr>';
        }).join('') +
        '<tr style="border-top:2px solid var(--border);font-weight:700">' +
        '<td>Totale forecast</td><td></td>' +
        '<td style="text-align:right;color:var(--amber)">' + fmt(speseAperte.reduce((a,s)=>a+parseFloat(s.preventivo||0),0)) + '</td>' +
        perCondomino.map(c=>{
          const tot = speseAperte.reduce((a,s)=>{
            const ref=parseFloat(s.preventivo||0);
            let q=0;
            if(s.split?.length){const e=s.split.find(x=>x.id===c.id);q=e?(e.perc||0)/100*ref:ref/nAttiviEnt;}
            else q=ref/nAttiviEnt;
            return a+q;
          },0);
          return '<td style="text-align:right;color:#7c3aed">' + fmt(tot) + '</td>';
        }).join('') +
        '</tr></tbody></table></div></div>';
    })()}

    ${renderPianoRateBox(state.filterAnno || new Date().getFullYear(), canEdit)}

    <div class="card">
      <div class="card-header"><h3>Tutti i versamenti</h3><strong style="color:var(--green)">${fmt(totale)}</strong></div>
      ${renderEntrateMobileCards(items, canEdit)}
      <div class="table-wrap">
        ${items.length===0?`<div class="empty">${svgEmpty()}<p>Nessun versamento registrato</p></div>`:
        `<table>
          <thead><tr>
            ${canEdit?'<th style="width:90px">Azioni</th>':''}
            <th>Data</th><th>Condomino</th><th>Descrizione</th><th>Categoria</th><th>Importo</th><th>Stato</th>
          </tr></thead>
          <tbody>
          ${items.map(e=>{
            const cond = state.condomini.find(c=>c.id===e.condominoId)||{nome:'Sconosciuto',color:'#888'};
            const cat  = getCategorie().find(c=>c.id===e.categoria)||{label:e.categoria||'—'};
            return `<tr style="${e.previsionale?'background:#fffbeb;':''}">
              ${canEdit?`<td><div class="inline-actions">
                <button class="btn btn-secondary btn-sm" data-edit-entrata="${e.id}" title="Modifica versamento">✏️</button>
                <button class="btn btn-danger btn-sm" data-del-entrata="${e.id}" title="Elimina versamento">🗑</button>
              </div></td>`:''}
              <td style="white-space:nowrap;font-size:13px">${esc(e.data)}</td>
              <td><div style="display:flex;align-items:center;gap:8px">
                <div class="avatar" style="${avatarStyle(cond.color)};width:28px;height:28px;font-size:11px">${initials(cond.nome)}</div>
                <div>
                  <div style="font-size:13px;font-weight:500">${esc(cond.nome)}</div>
                  <div style="font-size:11px;color:var(--text2)">${esc(cond.appartamento)}</div>
                </div>
              </div></td>
              <td style="font-size:13px">${esc(e.descrizione||'—')}</td>
              <td><span class="badge badge-green" style="font-size:10px">${esc(cat.label)}</span></td>
              <td class="${e.previsionale?'':'amount-pos'}" style="font-weight:700;color:${e.previsionale?'#92400e':'var(--green)'}">
                ${fmt(e.importo)}
                ${e.importoPrevisto!=null && Math.abs(parseFloat(e.importoPrevisto)-parseFloat(e.importo))>=0.01 ? `<div style="font-size:10px;font-weight:400;color:var(--text2)">previsto ${fmt(e.importoPrevisto)}</div>` : ''}
              </td>
              <td>${e.previsionale
                ? `<span class="prev-badge">🔮 Prev.</span>`
                : `<span class="badge badge-green" style="font-size:10px">✓ Effettivo</span>`}
                ${e.previsionale && canEdit ? `<button class="btn-valida" data-valida-entrata="${e.id}" style="margin-top:3px;font-size:11px">✅</button>` : ''}
              </td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>`}
      </div>
    </div>
  </div>`;
}

function renderModalEntrata(d) {
  const isPrevisionale = d?.previsionale || false;
  const isEdit = !!d?.id;
  const condominiList = (state.condomini.filter(c => c.edificioId === state.edificioAttivo)).filter(c=>!c.disabled && !c.superAdmin);
  const catOptions = getCategorie().filter(c=>c.tipo==='entrata'||c.tipo==='ordinaria').map(c=>`<option value="${c.id}" ${c.id===d?.categoria?'selected':''}>${esc(c.label)}</option>`).join('');

  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <h2>${isEdit && isPrevisionale ? '✅ Valida versamento' : isEdit ? 'Modifica versamento' : 'Registra versamento'}</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">

        <!-- Toggle effettivo/previsionale (solo su nuovo) -->
        ${!isEdit ? `
        <div style="display:flex;gap:.5rem;margin-bottom:1rem;background:var(--surface2);border-radius:var(--radius-sm);padding:4px">
          <button id="tab-effettivo" class="btn ${!isPrevisionale?'btn-primary':'btn-secondary'} btn-sm" style="flex:1">💰 Effettivo</button>
          <button id="tab-previsionale" class="btn ${isPrevisionale?'btn-primary':'btn-secondary'} btn-sm" style="flex:1">🔮 Previsionale / Rate</button>
        </div>` : ''}
        <input type="hidden" id="m-previsionale" value="${isPrevisionale?'1':'0'}">

        <!-- INFO PREVISIONALE -->
        <div id="prev-info" style="display:${isPrevisionale&&!isEdit?'block':'none'};margin-bottom:.75rem">
          <div class="alert alert-warning" style="font-size:13px">🔮 I versamenti previsionali compaiono nel cashflow ma non nel saldo reale. Validali in seguito quando il pagamento arriva.</div>
        </div>

        <!-- SEZIONE RATE (solo previsionale nuovo) -->
        <div id="rate-section" style="display:${isPrevisionale&&!isEdit?'block':'none'}">
          <div style="font-weight:600;font-size:14px;margin-bottom:.75rem">📅 Piano versamenti (fino a 4 rate)</div>

          <!-- Condomino e categoria comuni a tutte le rate -->
          <div class="form-row" style="margin-bottom:.75rem">
            <div class="field">
              <label>Condomino *</label>
              <select id="m-condo">
                <option value="">— Seleziona —</option>
                ${condominiList.map(c=>`<option value="${c.id}">${esc(c.nome)} — ${esc(c.appartamento)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Categoria</label>
              <select id="m-cat"><option value="quote">Quote condominiali</option>${catOptions}</select>
            </div>
          </div>
          <div class="field" style="margin-bottom:1rem">
            <label>Descrizione comune</label>
            <input type="text" id="m-desc" placeholder="Es. Piano rate 2026" value="${esc(d?.descrizione||'')}">
          </div>

          <!-- Le 4 rate -->
          ${[1,2,3,4].map(i=>`
          <div class="rata-row" id="rata-row-${i}" style="display:${i<=2?'flex':'none'};align-items:center;gap:.5rem;margin-bottom:.5rem;padding:.625rem .75rem;background:var(--surface2);border-radius:var(--radius-sm)">
            <div style="font-size:12px;font-weight:600;color:var(--accent);min-width:20px">R${i}</div>
            <div class="field" style="flex:1;margin:0">
              <input type="date" id="rata-data-${i}" value="${i===1?ymdLocale(new Date()):''}">
            </div>
            <div class="field" style="flex:1;margin:0">
              <input type="number" id="rata-importo-${i}" placeholder="€ importo" min="0" step="0.01" style="width:100%">
            </div>
            <button class="allegato-btn" id="rata-toggle-${i+1}" title="${i<4?'Aggiungi rata '+(i+1):''}">
              ${i<4?'➕':''}
            </button>
          </div>`).join('')}

          <div id="rate-totale" style="font-size:13px;color:var(--text2);text-align:right;margin-top:.25rem">
            Totale: <strong id="rate-totale-val">€ 0,00</strong>
          </div>
        </div>

        <!-- VERSAMENTO SINGOLO (effettivo o modifica) -->
        <div id="singolo-section" style="display:${!isPrevisionale||isEdit?'block':'none'}">
          <div class="form-row">
            <div class="field">
              <label>Condomino *</label>
              <select id="m-condo-s">
                <option value="">— Seleziona —</option>
                ${condominiList.map(c=>`<option value="${c.id}" ${c.id===d?.condominoId?'selected':''}>${esc(c.nome)} — ${esc(c.appartamento)}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Data *</label><input type="date" id="m-data-s" value="${esc(d?.data||ymdLocale(new Date()))}"></div>
          </div>
          <div class="form-row">
            <div class="field">
              <label>Importo (€) *</label>
              <input type="number" id="m-importo-s" value="${esc(d?.importo||'')}" placeholder="0.00" min="0" step="0.01">
            </div>
            <div class="field">
              <label>Categoria</label>
              <select id="m-cat-s"><option value="quote">Quote condominiali</option>${catOptions}</select>
            </div>
          </div>
          <div class="field"><label>Descrizione</label><input type="text" id="m-desc-s" value="${esc(d?.descrizione||'')}" placeholder="Es. Acconto spese 2024…"></div>
        </div>

        <div id="entrata-err" class="alert alert-warning" style="display:none;margin-top:.5rem"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        ${isEdit && isPrevisionale
          ? `<button class="btn btn-success" id="modal-save">✅ Valida come effettivo</button>`
          : `<button class="btn btn-primary" id="modal-save">💾 ${isPrevisionale?'Pianifica rate':'Registra'}</button>`}
      </div>
    </div>
  </div>`;
}

function calcolaPianoRate(anno, nRate = 3) {
  const MARGINE_GIORNI = 15;
  const MIN_GIORNI_TRA_RATE = 30;
  const oggi = new Date(); oggi.setHours(0,0,0,0);

  // Non ha senso generare un piano per un anno già chiuso
  if (anno < oggi.getFullYear()) {
    return { coperto:false, annoPassato:true, saldoPartenza:0, totDaRaccogliere:0, rate:[], nAttivi:0, margineGiorni:MARGINE_GIORNI };
  }

  const edId = state.edificioAttivo;
  // Stesso criterio di filtro edificio usato nel resto della pagina Entrate (include i dati "legacy" senza edificioId)
  const allSpese   = state.spese.filter(s => !s.edificioId || s.edificioId === edId);
  const allEntrate = state.entrate.filter(e => !e.edificioId || e.edificioId === edId);

  // ── 1. Saldo di partenza: riporto anni precedenti + movimenti reali già avvenuti nell'anno ──
  let saldoPartenza = getSaldoRiporto(anno);
  const speseRealizzateAnno   = allSpese.filter(s => new Date(s.data).getFullYear()===anno && parseFloat(s.consuntivo||0)>0);
  const entrateRealizzateAnno = allEntrate.filter(e => !e.previsionale && new Date(e.data).getFullYear()===anno);
  saldoPartenza += entrateRealizzateAnno.reduce((a,e)=>a+parseFloat(e.importo||0),0)
                 - speseRealizzateAnno.reduce((a,s)=>a+parseFloat(s.consuntivo||0),0);
  saldoPartenza = Math.round(saldoPartenza*100)/100;

  // ── 2. Data della prima rata: 1° gennaio, o oggi se l'anno è già iniziato ──
  const gennaio1 = new Date(anno, 0, 1);
  const dataRata1 = gennaio1 > oggi ? gennaio1 : new Date(oggi);
  const forzataOggi = dataRata1.getTime() !== gennaio1.getTime();

  // ── 3. Condomini attivi e timeline delle uscite previste (solo preventivo, non consuntivate) ──
  const condominiAttivi = state.condomini.filter(c=>c.edificioId===edId && !c.disabled && !c.superAdmin);
  const nAttivi = condominiAttivi.length || 1;

  const speseAperte = allSpese
    .filter(s => new Date(s.data).getFullYear()===anno)
    .filter(s => parseFloat(s.consuntivo||0)===0 && parseFloat(s.preventivo||0)>0);

  const uscite = speseAperte.map(s => {
    let d = new Date(s.data);
    if (d < dataRata1) d = new Date(dataRata1); // spesa scaduta e non ancora pagata → rischio da subito
    return { data:d, importo:parseFloat(s.preventivo) };
  }).sort((a,b)=>a.data-b.data);

  const totDaRaccogliere = Math.round(uscite.reduce((a,u)=>a+u.importo,0)*100)/100;

  if (totDaRaccogliere <= 0) {
    return { coperto:true, motivoCoperto:'nessuna_spesa', annoPassato:false, saldoPartenza, totDaRaccogliere:0, rate:[], nAttivi, margineGiorni:MARGINE_GIORNI, forzataOggi, dataRata1 };
  }

  // ── 4. Simulatore di cassa: dato un elenco di rate {data, importo}, calcola saldo minimo e prima data di rottura ──
  // Definito qui (prima del posizionamento delle rate) perché serve subito al punto 5 per capire
  // se il saldo attuale, DA SOLO, basta già a coprire tutto l'anno senza bisogno di nuove rate.
  function simula(rateArr) {
    const eventi = [
      ...rateArr.map(r => ({ data:r.data, delta: r.importo, entrata:true })),
      ...uscite.map(u => ({ data:u.data, delta: -u.importo, entrata:false })),
    ].sort((a,b) => a.data - b.data || (a.entrata ? -1 : 1)); // a parità di data, le entrate prima delle uscite
    let bal = saldoPartenza, minBal = bal, dataRottura = null;
    for (const ev of eventi) {
      bal += ev.delta;
      if (bal < minBal) minBal = bal;
      if (bal < 0 && !dataRottura) dataRottura = ev.data;
    }
    return { minBal, dataRottura, saldoFinale: bal };
  }

  // ── 5. Il saldo attuale copre già da solo tutte le spese previsionali dell'anno, senza mai
  //       andare sotto zero? Allora non serve proporre NESSUNA nuova rata, anche se ci sono
  //       spese previsionali > 0 (es. saldo 2568€, spese previste 2211€ → coperto). ──
  const testSenzaRate = simula([]);
  if (testSenzaRate.minBal >= -0.005) {
    return {
      coperto:true, motivoCoperto:'saldo_sufficiente', annoPassato:false,
      saldoPartenza, totDaRaccogliere, rate:[], nAttivi, margineGiorni:MARGINE_GIORNI,
      forzataOggi, dataRata1, saldoMinimoPrevisto: Math.round(testSenzaRate.minBal*100)/100,
    };
  }

  // ── 6. Quota di ciascun condomino sul totale da raccogliere (rispetta gli split % definiti sulle spese, stessa logica usata altrove nell'app) ──
  const quotaCondomino = {};
  condominiAttivi.forEach(c => quotaCondomino[c.id] = 0);
  speseAperte.forEach(s => {
    const ref = parseFloat(s.preventivo||0);
    if (!ref) return;
    condominiAttivi.forEach(c => {
      const split = s.split?.find(x=>x.id===c.id);
      quotaCondomino[c.id] += split ? (split.perc||0)/100*ref : ref/nAttivi;
    });
  });

  // ── 7. Posizionamento greedy delle rate: la 1a è fissa, le successive si piazzano
  //       MARGINE_GIORNI prima del primo rischio di rottura previsto ──
  const importoBase = Math.round(totDaRaccogliere / nRate * 100) / 100;
  const rate = [{ n:1, data:new Date(dataRata1), importo:importoBase }];

  for (let i = 2; i <= nRate; i++) {
    const test = simula(rate);
    let prossima;
    if (test.dataRottura) {
      prossima = new Date(test.dataRottura);
      prossima.setDate(prossima.getDate() - MARGINE_GIORNI);
    } else {
      // nessuna criticità prevista con le rate piazzate finora: mantieni comunque
      // una cadenza di fatturazione regolare (più prevedibile per i condomini)
      prossima = new Date(anno, 0, 1);
      prossima.setMonth(Math.round(12 / nRate * (i-1)));
    }
    // Spaziatura minima dalla rata precedente: questa vince SEMPRE, anche sul tetto di
    // fine anno qui sotto — due rate non devono mai poter cadere sulla stessa data.
    const minSucc = new Date(rate[rate.length-1].data);
    minSucc.setDate(minSucc.getDate() + MIN_GIORNI_TRA_RATE);
    if (prossima < minSucc) prossima = minSucc;
    // Tetto: non oltre il 30 novembre, per lasciare tempo di incassare entro l'anno —
    // ma solo se rispettarlo non violerebbe la spaziatura minima appena imposta sopra.
    const capMax = new Date(anno, 10, 30);
    if (prossima > capMax) prossima = (minSucc > capMax) ? minSucc : capMax;
    rate.push({ n:i, data:prossima, importo:importoBase });
  }

  // ── 8. Verifica finale + ribilanciamento: se anche con tutte le rate piazzate si rischia
  //       comunque di andare sotto zero (es. spesa enorme molto ravvicinata), rinforza la 1a
  //       rata e riduci le successive, così il totale complessivo resta invariato ──
  let esito = simula(rate);
  let tentativi = 0;
  while (esito.minBal < 0 && tentativi < 6 && nRate > 1) {
    const mancante = Math.round(-esito.minBal * 100) / 100;
    rate[0].importo = Math.round((rate[0].importo + mancante) * 100) / 100;
    const perAltre = mancante / (nRate - 1);
    for (let i = 1; i < nRate; i++) rate[i].importo = Math.max(0, Math.round((rate[i].importo - perAltre) * 100) / 100);
    esito = simula(rate);
    tentativi++;
  }

  // ── 9. Split per condomino di ciascuna rata, proporzionale alla propria quota totale,
  //       con correzione dell'arrotondamento così il totale della rata torna esatto ──
  const meseNomi = ['','Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const rateFinali = rate.map(r => {
    const pct = totDaRaccogliere > 0 ? r.importo / totDaRaccogliere : 0;
    const perCondo = condominiAttivi.map(c => ({
      id:c.id, nome:c.nome,
      importo: Math.round(quotaCondomino[c.id] * pct * 100) / 100,
    }));
    const sommaCondo = perCondo.reduce((a,c)=>a+c.importo,0);
    const scarto = Math.round((r.importo - sommaCondo) * 100) / 100;
    if (perCondo.length && Math.abs(scarto) >= 0.01) {
      perCondo[perCondo.length-1].importo = Math.round((perCondo[perCondo.length-1].importo + scarto) * 100) / 100;
    }
    return {
      n: r.n,
      dataObj: r.data,
      data: ymdLocale(r.data),
      mese: meseNomi[r.data.getMonth()+1],
      importoTotale: r.importo,
      importoPerCondo: Math.round(r.importo / nAttivi * 100) / 100,
      perCondomino: perCondo,
    };
  });

  // ── 10. Serie mensile del saldo cumulato (per il grafico) ──
  const meseNomiFull = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const eventiFinali = [
    ...rate.map(r => ({ data:r.data, delta:r.importo })),
    ...uscite.map(u => ({ data:u.data, delta:-u.importo })),
  ].sort((a,b)=>a.data-b.data);
  const serieMensile = meseNomiFull.map((mese, m) => {
    const fine = new Date(anno, m+1, 0); // ultimo giorno del mese
    const bal = eventiFinali.filter(e=>e.data<=fine).reduce((a,e)=>a+e.delta, saldoPartenza);
    return { mese, saldo: Math.round(bal*100)/100 };
  });

  return {
    coperto: false,
    annoPassato: false,
    saldoPartenza,
    totDaRaccogliere,
    rate: rateFinali,
    nAttivi,
    margineGiorni: MARGINE_GIORNI,
    forzataOggi,
    dataRata1,
    saldoMinimoPrevisto: Math.round(esito.minBal*100)/100,
    ancoraInRottura: esito.minBal < -0.005,
    serieMensile,
  };
}

// ===========================
// PIANO RATE BOX
// ===========================
function renderPianoRateBox(annoSel, canEdit) {
  if (!canEdit || !annoSel || annoSel === 0) return '';
  const piano = calcolaPianoRate(annoSel);

  if (piano.annoPassato) return '';

  // Proposte già create in precedenza per quest'anno, ancora in sospeso (non validate) —
  // calcolato qui perché serve sia nel caso "coperto" (per offrire la pulizia) sia in quello normale.
  const edId0 = state.edificioAttivo;
  const proposteEsistenti0 = state.entrate.filter(e =>
    (!e.edificioId || e.edificioId === edId0) && e.previsionale && e.pianoRataAuto && e.pianoAnno === annoSel
  );

  if (piano.coperto) {
    const msg = piano.motivoCoperto === 'saldo_sufficiente'
      ? '✅ <strong>Anno ' + annoSel + ' coperto</strong> — il saldo di cassa attuale (' + fmt(piano.saldoPartenza) + ') copre già da solo le spese previsionali dell\'anno (' + fmt(piano.totDaRaccogliere) + '), restando sempre sopra zero (minimo previsto ' + fmt(piano.saldoMinimoPrevisto) + '). Nessuna nuova rata necessaria per ora.'
      : '✅ <strong>Anno ' + annoSel + ' coperto</strong> — nessuna spesa previsionale ancora da finanziare con nuove rate.';
    const inConferma0 = state.pianoRateConferma === annoSel;
    const pulizia = proposteEsistenti0.length
      ? (inConferma0
        ? '<div style="margin-top:.625rem;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:var(--radius-sm);padding:.75rem 1rem">' +
          '<div style="font-size:12px;color:#5b21b6;margin-bottom:.625rem">Le ' + proposteEsistenti0.length + ' proposte create in precedenza per il ' + annoSel + ' non sono più necessarie: verranno rimosse (i versamenti già validati come reali non vengono toccati). Nessuna nuova rata verrà creata.</div>' +
          '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
            '<button class="btn btn-primary btn-sm" id="btn-conferma-rate-piano">🗑️ Rimuovi le ' + proposteEsistenti0.length + ' proposte</button>' +
            '<button class="btn btn-secondary btn-sm" id="btn-annulla-rate-piano">✖️ Annulla</button>' +
          '</div></div>'
        : '<div style="margin-top:.625rem;font-size:12px">⚠️ Ci sono ancora ' + proposteEsistenti0.length + ' versamenti previsionali generati in precedenza, non più necessari. <button class="btn btn-secondary btn-sm" id="btn-crea-rate-piano">Rimuovili</button></div>')
      : '';
    return '<div class="alert alert-success" style="margin-bottom:1rem;font-size:13px">' + msg + pulizia + '</div>';
  }
  if (piano.rate.length === 0) return '';

  const proposteEsistenti = proposteEsistenti0;
  const btnLabel = proposteEsistenti.length
    ? '🔁 Aggiorna proposta (' + proposteEsistenti.length + ' in sospeso)'
    : '➕ Crea versamenti previsionali';
  const inConferma = state.pianoRateConferma === annoSel;
  const nNuovi = piano.rate.reduce((a,r)=>a+r.perCondomino.length, 0);

  const rateHtml = piano.rate.map(function(r) {
    const dettaglioRighe = r.perCondomino.map(c =>
      '<tr><td style="padding:2px 8px 2px 0">' + esc(c.nome) + '</td><td style="padding:2px 0;text-align:right;font-weight:600">' + fmt(c.importo) + '</td></tr>'
    ).join('');
    return '<div style="flex:1;min-width:170px;background:#f5f3ff;border-radius:var(--radius-sm);padding:.875rem;border-left:3px solid #7c3aed">' +
      '<div style="font-weight:700;color:#7c3aed;margin-bottom:2px;text-align:center">Rata ' + r.n + ' — ' + r.mese + '</div>' +
      '<div style="font-size:11px;color:var(--text2);margin-bottom:.5rem;text-align:center">' + r.data + '</div>' +
      '<div style="font-size:1.3rem;font-weight:800;color:#5b21b6;text-align:center">' + fmt(r.importoTotale) + '</div>' +
      '<div style="font-size:11px;color:var(--text2);text-align:center">totale &middot; media ' + fmt(r.importoPerCondo) + '/cond.</div>' +
      '<details style="margin-top:.5rem"><summary style="cursor:pointer;font-size:11px;color:var(--accent)">Dettaglio per condomino</summary>' +
      '<table style="width:100%;font-size:11px;margin-top:4px">' + dettaglioRighe + '</table></details>' +
    '</div>';
  }).join('');

  const noteOggi = piano.forzataOggi
    ? '<div style="font-size:11px;color:var(--text2);margin-top:5px">ℹ️ Il 1° gennaio ' + annoSel + ' è già passato: la prima rata è fissata su oggi (' + ymdLocale(piano.dataRata1) + ') invece che al 1° gennaio.</div>'
    : '';

  const avviso = piano.ancoraInRottura
    ? '<div class="alert alert-warning" style="margin-top:.75rem;font-size:12px">⚠️ Anche con queste rate il modello prevede un saldo minimo di ' + fmt(piano.saldoMinimoPrevisto) + ' durante l\'anno: valuta di anticipare/rateizzare diversamente una spesa importante o di aumentare la prima rata.</div>'
    : '';

  // Pannello di conferma: sostituisce il vecchio window.confirm(). Resta visibile finché non si
  // clicca esplicitamente Conferma o Annulla, così c'è tutto il tempo di rivedere le rate sopra.
  const pannelloConferma = inConferma
    ? '<div style="margin-top:.875rem;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:var(--radius-sm);padding:.875rem 1rem">' +
      '<div style="font-weight:700;color:#5b21b6;margin-bottom:4px">' + (proposteEsistenti.length ? '🔁 Confermi l\'aggiornamento?' : '➕ Confermi la creazione?') + '</div>' +
      '<div style="font-size:12px;color:#5b21b6;margin-bottom:.75rem">' +
        (proposteEsistenti.length
          ? 'Le <strong>' + proposteEsistenti.length + ' proposte</strong> già create (non ancora validate) per il ' + annoSel + ' verranno aggiornate agli importi/date mostrati sopra (senza cancellarle e ricrearle). Se qualche rata non serve più, verrà rimossa.'
          : 'Verranno creati <strong>' + nNuovi + ' versamenti</strong> previsionali per il ' + annoSel + ', come mostrato sopra.') +
        ' I versamenti già validati come reali non verranno mai toccati.' +
      '</div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
        '<button class="btn btn-primary btn-sm" id="btn-conferma-rate-piano">✅ ' + (proposteEsistenti.length ? 'Conferma e aggiorna' : 'Conferma e crea ' + nNuovi + ' versamenti') + '</button>' +
        '<button class="btn btn-secondary btn-sm" id="btn-annulla-rate-piano">✖️ Annulla</button>' +
      '</div>' +
    '</div>'
    : '';

  return '<div class="card" style="margin-bottom:1rem;border-top:3px solid #7c3aed">' +
    '<div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">' +
    '<h3>📅 Piano rate suggerito ' + annoSel + '</h3>' +
    (inConferma
      ? '<span style="font-size:12px;color:#7c3aed;font-weight:600">⏳ In attesa di conferma qui sotto…</span>'
      : '<button class="btn btn-secondary btn-sm" id="btn-crea-rate-piano">' + btnLabel + '</button>') +
    '</div>' +
    '<div style="padding:.75rem 1.25rem 1rem">' +
    '<div style="display:flex;gap:1.25rem;flex-wrap:wrap;margin-bottom:.75rem;font-size:13px;background:var(--surface2);padding:.625rem .875rem;border-radius:var(--radius-sm)">' +
    '<div>Saldo di partenza: <strong style="color:' + (piano.saldoPartenza>=0?'var(--green)':'var(--red)') + '">' + fmt(piano.saldoPartenza) + '</strong></div>' +
    '<div>Da raccogliere: <strong style="color:#7c3aed">' + fmt(piano.totDaRaccogliere) + '</strong></div>' +
    '<div>Margine di sicurezza: <strong>' + piano.margineGiorni + ' giorni</strong></div>' +
    '<div>Condomini: <strong>' + piano.nAttivi + '</strong></div>' +
    '<div>Saldo minimo previsto: <strong style="color:' + (piano.saldoMinimoPrevisto>=0?'var(--green)':'var(--red)') + '">' + fmt(piano.saldoMinimoPrevisto) + '</strong></div>' +
    '</div>' +
    noteOggi +
    '<div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-top:.5rem">' + rateHtml + '</div>' +
    renderMiniCashflowRateChart(piano, annoSel) +
    avviso +
    '<div style="font-size:11px;color:var(--text2);margin-top:.75rem">💡 Le date sono calcolate per non far mai scendere la cassa sotto zero, con almeno ' + piano.margineGiorni + ' giorni di margine prima di ogni criticità prevista. Ricalcolando, le proposte non ancora validate per questo anno vengono aggiornate (non cancellate e ricreate); i versamenti già validati come reali non vengono mai toccati.</div>' +
    pannelloConferma +
    '</div></div>';
}

// ===========================
// PIANO RATE — MINI GRAFICO CASSA
// ===========================
// Mostra il saldo cumulato mese per mese lungo l'anno, con un marker viola nel
// mese di ciascuna rata proposta. Barre verdi = cassa positiva, rosse = a rischio.
function renderMiniCashflowRateChart(piano, anno) {
  if (!piano.serieMensile || !piano.serieMensile.length) return '';
  const W = 760, H = 170, padL = 46, padR = 10, padT = 22, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const vals = piano.serieMensile.map(s=>s.saldo);
  const maxV = Math.max(...vals, 0);
  const minV = Math.min(...vals, 0);
  const range = (maxV - minV) || 1;
  const n = piano.serieMensile.length;
  const xFor = i => padL + (n>1 ? (plotW/(n-1))*i : plotW/2);
  const yFor = v => padT + plotH - ((v - minV)/range)*plotH;
  const yZero = yFor(0);
  const barW = Math.max(8, Math.min(30, plotW/n - 6));

  const bars = piano.serieMensile.map((s,i) => {
    const x = xFor(i) - barW/2;
    const yTop = s.saldo>=0 ? yFor(s.saldo) : yZero;
    const h = Math.max(1, Math.abs(yFor(s.saldo) - yZero));
    const color = s.saldo>=0 ? 'var(--green)' : 'var(--red)';
    return '<rect x="'+x.toFixed(1)+'" y="'+yTop.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+h.toFixed(1)+'" fill="'+color+'" opacity=".75" rx="2"><title>'+s.mese+': '+fmt(s.saldo)+'</title></rect>';
  }).join('');

  const labels = piano.serieMensile.map((s,i) =>
    '<text x="'+xFor(i).toFixed(1)+'" y="'+(H-6)+'" font-size="10" fill="var(--text2)" text-anchor="middle">'+s.mese+'</text>'
  ).join('');

  const markers = piano.rate.map(r => {
    const x = xFor(r.dataObj.getMonth());
    return '<g><circle cx="'+x.toFixed(1)+'" cy="'+(padT-10).toFixed(1)+'" r="7" fill="#7c3aed"/>' +
      '<text x="'+x.toFixed(1)+'" y="'+(padT-6).toFixed(1)+'" font-size="9" fill="#fff" text-anchor="middle" font-weight="700">R'+r.n+'</text></g>';
  }).join('');

  return '<div style="overflow-x:auto;margin-top:.875rem">' +
    '<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-width:760px;height:auto;display:block">' +
    '<line x1="'+padL+'" y1="'+yZero.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+yZero.toFixed(1)+'" stroke="var(--border)" stroke-dasharray="3,3"/>' +
    bars + labels + markers +
    '</svg>' +
    '<div style="font-size:11px;color:var(--text2);margin-top:2px">🟣 mese della rata &nbsp; 🟩 cassa positiva &nbsp; 🟥 cassa a rischio &nbsp; (linea tratteggiata = zero)</div>' +
    '</div>';
}
