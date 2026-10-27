// Spese: tabella, schede mobili, quote, ricorrenze, esportazione CSV, scheda di modifica.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// Condomini dell'edificio di una spesa che possono avere una quota salvata: anche chi è uscito dopo
// (stessa regola di quotaSuSpesa, usata da Bilancio e CSV: la quota salvata vale a prescindere dalla data).
function idsConQuotaSalvata(edId) {
  return new Set(state.condomini.filter(c => c.edificioId === edId && !c.superAdmin).map(c => c.id));
}

function renderQuotaCell(spesa) {
  const user = state.user;
  const importoRef = importoNum(spesa.consuntivo||spesa.preventivo);
  if (!importoRef) return '<span style="color:var(--text2);font-size:12px">—</span>';

  // Condomini realmente coinvolti: quelli dell'edificio DI QUESTA SPESA (non l'edificio attivo a schermo),
  // attivi e non-superAdmin. Non usare mai state.condomini.length: include TUTTI gli edifici.
  const edId = spesa.edificioId || state.edificioAttivo;
  // Chi faceva parte del condominio alla data della spesa (subentri).
  const condEd = condominiAllaData(spesa.data, edId);
  const nCond = condEd.length || 1;
  // Split valido = solo righe di condomini di questo edificio con quota > 0 (0% = escluso da questa spesa)
  const idsQuota = idsConQuotaSalvata(edId);
  const validSplit = (spesa.split||[]).filter(s => idsQuota.has(s.id) && (s.perc||0) > 0);

  if (user.isAdmin) {
    // Admin: mostra mini breakdown per tutti
    if (validSplit.length === 0) {
      // Nessuno split salvato (dati legacy) → parti uguali tra tutti i condomini dell'edificio
      return `<div style="font-size:12px;color:var(--text2)">${fmt(importoRef/nCond)} <span>× ${nCond}</span></div>`;
    }
    const refPerc = validSplit[0].perc;
    const isEqual = validSplit.length === nCond && validSplit.every(s=>Math.abs((s.perc||0)-refPerc)<0.1);
    if (isEqual) {
      return `<div style="font-size:12px;color:var(--text2)">${fmt(percEffettiva(spesa.split, refPerc)/100*importoRef)} <span>× ${nCond}</span></div>`;
    }
    const isEqualPartial = validSplit.every(s=>Math.abs((s.perc||0)-refPerc)<0.1);
    if (isEqualPartial) {
      // Suddivisa in parti uguali ma solo tra un sottoinsieme dei condomini (es. 4 su 6)
      return `<div style="font-size:12px;color:var(--text2)">${fmt(percEffettiva(spesa.split, refPerc)/100*importoRef)} <span>× ${validSplit.length}</span></div>`;
    }
    return `<div style="font-size:11px;color:var(--text2)">Split personalizzato <span>(${validSplit.length} cond.)</span></div>`;
  }

  // Utente: mostra la propria quota
  if (validSplit.length === 0) {
    // Senza ripartizione (dati legacy): parti uguali solo tra chi abitava alla data, come quotaSuSpesa.
    if (condEd.length && !condEd.some(c => c.id === user.id)) return '<span style="color:var(--text2);font-size:12px">—</span>';
    return `<span style="font-weight:600;color:var(--accent)">${fmt(importoRef/nCond)}</span>`;
  }
  const mySplit = validSplit.find(s=>s.id===user.id);
  if (!mySplit) return '<span style="color:var(--text2);font-size:12px">—</span>'; // escluso da questa spesa
  const myEuro = percEffettiva(spesa.split, mySplit.perc)/100*importoRef;
  return `<div>
    <div style="font-weight:600;color:var(--accent)">${fmt(myEuro)}</div>
    <div style="font-size:11px;color:var(--text2)">${(mySplit.perc||0).toFixed(1)}%</div>
  </div>`;
}

// ===========================
// MOBILE CARD RENDERERS
// ===========================
// Id delle spese dell'elenco filtrato, aggiornati a ogni renderSpese.
let _idsSpeseFiltrate = [];

function renderSpeseMobileCards(items, canEdit) {
  if (!items.length) return `<div class="empty">${svgEmpty()}<p>Nessuna spesa trovata</p></div>`;
  return `<div class="mobile-card-list" style="padding:10px 10px 6px">
    ${items.map(s => {
      const cat    = trovaPerId(getCategorie(), s.categoria)||{label:s.categoria, icon:'📦'};
      const hasCons = s.consuntivo && parseFloat(s.consuntivo)>0;
      const hasPrev = s.preventivo && parseFloat(s.preventivo)>0;
      const amount  = s.consuntivo||s.preventivo;
      const myQuota = renderQuotaCellText(s);
      const isStr   = s.tipoSpesa==='straordinaria';
      return `<div class="spesa-mobile-card">

        <!-- Riga 1: titolo + importo -->
        <div class="smc-head">
          <div style="flex:1;min-width:0">
            <div class="smc-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.titolo)}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:1px">${esc(s.data)}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div class="smc-amount">${fmt(amount)}</div>
            ${myQuota ? `<div style="font-size:11px;color:var(--accent);font-weight:500">tua: ${myQuota}</div>` : ''}
          </div>
        </div>

        <!-- Riga 2: badge -->
        <div class="smc-meta" style="margin-top:6px">
          <span class="badge ${isStr?'badge-purple':'badge-blue'}" style="font-size:10px;padding:2px 6px">${isStr?'Straord.':'Ord.'}</span>
          <span class="badge badge-gray" style="font-size:10px;padding:2px 6px">${esc(cat.icon||'📦')} ${esc(cat.label)}</span>
          ${hasCons
            ? '<span class="badge badge-green" style="font-size:10px;padding:2px 6px">✓ Definitiva</span>'
            : '<span class="badge badge-amber" style="font-size:10px;padding:2px 6px">~ Previsionale</span>'}
          ${hasPrev&&hasCons ? `<span style="font-size:10px;color:var(--text2)">prev.${fmt(s.preventivo)}</span>` : ''}
          ${s.allegati?.length ? `<span class="attach-chip" style="font-size:10px">📎${s.allegati.length}</span>` : ''}
          ${s.ricorrente ? `<span class="ricorrente-badge">🔁 ${esc(s.frequenza||'mensile')}</span>` : ''}
          ${(()=>{
            if (!s.fornitoreId) return '';
            const forn = trovaPerId(state.fornitori, s.fornitoreId);
            if (!forn) return '';
            const catF = CATEGORIE_FORNITORE.find(c=>c.id===forn.categoria)||{icon:'📦'};
            return `<span class="badge badge-gray" style="font-size:10px">${esc(catF.icon)} ${esc(forn.nome)}</span>`;
          })()}
        </div>

        <!-- Riga 3: azioni (solo se canEdit) -->
        ${canEdit ? `<div style="display:flex;justify-content:flex-end;gap:4px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
          <button class="allegato-btn" data-edit-spesa="${s.id}" style="font-size:16px;min-width:36px;min-height:36px">✏️</button>
          <button class="allegato-btn danger" data-del-spesa="${s.id}" style="font-size:16px;min-width:36px;min-height:36px">🗑</button>
        </div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

function renderQuotaCellText(spesa) {
  const user = state.user;
  const importoRef = importoNum(spesa.consuntivo||spesa.preventivo);
  if (!importoRef) return '';
  const edId = spesa.edificioId || state.edificioAttivo;
  // Chi faceva parte del condominio alla data della spesa (subentri).
  const condEd = condominiAllaData(spesa.data, edId);
  const nCond = condEd.length || 1;
  const idsQuota = idsConQuotaSalvata(edId);
  const validSplit = (spesa.split||[]).filter(s => idsQuota.has(s.id) && (s.perc||0) > 0);
  if (validSplit.length === 0) {
    // Senza ripartizione (dati legacy): solo chi abitava alla data ha una quota, come quotaSuSpesa.
    if (condEd.length && !condEd.some(c => c.id === user.id)) return '';
    return fmt(importoRef/nCond);
  }
  const mySplit = validSplit.find(s=>s.id===user.id);
  if (!mySplit) return ''; // escluso da questa spesa → nessuna riga "tua" mostrata
  return fmt(percEffettiva(spesa.split, mySplit.perc)/100*importoRef);
}

// ===========================
// SPESE RICORRENTI
// ===========================
// Ripartizione di una spesa ricorrente adattata alla data di una sua occorrenza (D4: la spesa segue la data).
// split = ripartizione scritta per la data dataBase. Chi aveva una quota ma alla data dell'occorrenza non abita più
// la perde: passa a chi è subentrato nello stesso appartamento (entrato dopo dataBase); se non c'è un subentrante,
// si ridistribuisce in proporzione tra chi abita e ha già una quota (o in parti uguali tra chi abita). Il totale
// non cambia (calcolo in centesimi di punto). Se nessuno esce dal gruppo la ripartizione resta identica.
function splitPerOccorrenza(split, data, dataBase, edificioId) {
  if (!split || !split.length) return split;
  const ed = edificioId || state.edificioAttivo;
  const presenti = condominiAllaData(data, ed);
  if (!presenti.length) return split;
  const idsPresenti = new Set(presenti.map(c => c.id));
  const uscenti = split.filter(x => (x.perc || 0) > 0 && !idsPresenti.has(x.id));
  if (!uscenti.length) return split;
  const alBase = new Set(condominiAllaData(dataBase, ed).map(c => c.id));
  const norm = (a) => String(a || '').trim().toLowerCase();
  const righe = new Map(); // id -> centesimi di punto (si mantiene l'ordine d'inserimento)
  const extra = new Map(); // id -> riga originale (per locked e altri campi)
  split.forEach(x => { righe.set(x.id, Math.round((parseFloat(x.perc) || 0) * 100)); extra.set(x.id, x); });
  const aggiungi = (id, cent) => righe.set(id, (righe.get(id) || 0) + cent);
  const ripartisci = (ids, cent, pesi) => {
    const W = pesi.reduce((a, p) => a + p, 0);
    let dati = 0;
    const quote = ids.map((id, i) => { const q = Math.floor(cent * pesi[i] / W); dati += q; return q; });
    for (let i = 0; dati < cent; i = (i + 1) % ids.length) { quote[i] += 1; dati += 1; }
    ids.forEach((id, i) => aggiungi(id, quote[i]));
  };
  let pool = 0;
  uscenti.forEach(u => {
    const cent = righe.get(u.id) || 0;
    righe.delete(u.id);
    const apt = norm(state.condomini.find(c => c.id === u.id)?.appartamento);
    // Subentrante: stesso appartamento, entrato dopo dataBase; oppure, se l'uscente non abitava già alla data di
    // partenza (subentro registrato prima dell'occorrenza da cui si riparte), chi abita lì e non ha una quota propria.
    const uscitoGiaAlBase = !alBase.has(u.id);
    const succ = apt ? presenti.filter(c => c.id !== u.id && norm(c.appartamento) === apt
      && (!alBase.has(c.id) || (uscitoGiaAlBase && !(parseFloat(extra.get(c.id)?.perc) > 0)))) : [];
    if (succ.length) ripartisci(succ.map(c => c.id), cent, succ.map(() => 1));
    else pool += cent;
  });
  if (pool > 0) {
    const con = [...righe.entries()].filter(([id, c]) => idsPresenti.has(id) && c > 0);
    if (con.length) ripartisci(con.map(([id]) => id), pool, con.map(([, c]) => c));
    else ripartisci(presenti.map(c => c.id), pool, presenti.map(() => 1));
  }
  return [...righe.entries()].map(([id, cent]) => ({ ...(extra.get(id) || { locked: false }), id, perc: cent / 100 }));
}

function generaOccorrenze(spesaBase, fineStr) {
  const freq = spesaBase.frequenza || 'mensile';
  if (!fineStr) return []; // data fine obbligatoria
  // QA: calcolo in date di calendario locali, sempre a partire dalla data
  // iniziale. Prima si sommavano i mesi alla data precedente e si formattava
  // in UTC: con l'ora legale le scadenze cadevano il giorno prima, e da un
  // 29–31 il mese corto veniva saltato (31/01 → 03/03 → 02/04…).
  const [y0, m0, g0] = String(spesaBase.data).split('-').map(Number);
  const mesiMap = {mensile:1, bimestrale:2, trimestrale:3, semestrale:6, annuale:12};
  const occorrenze = [];
  // Limite di sicurezza ampio (10 anni settimanali): prima il tetto di 52
  // troncava in silenzio, ad esempio, una mensile su 5 anni.
  for (let i = 1; i <= 520; i++) {
    let d;
    if (freq === 'settimanale') d = new Date(y0, m0 - 1, g0 + 7 * i);
    else {
      const mesi = (mesiMap[freq] || 1) * i;
      const ultimoGiorno = new Date(y0, m0 - 1 + mesi + 1, 0).getDate();
      d = new Date(y0, m0 - 1 + mesi, Math.min(g0, ultimoGiorno));
    }
    const data = ymdLocale(d);
    if (data > fineStr) break;
    occorrenze.push({
      ...spesaBase,
      id: newId(),
      data,
      // Gli allegati sono della sola spesa a cui sono stati aggiunti: se le occorrenze li
      // copiassero, toglierne uno da una lo toglierebbe da tutte (QA-CONS-027).
      allegati: [],
      // La ripartizione segue la data di ciascuna occorrenza (subentri nel corso della serie).
      ...(spesaBase.split?.length ? { split: splitPerOccorrenza(spesaBase.split, data, spesaBase.data, spesaBase.edificioId) } : {}),
      // Le future sono solo preventivo; se la prima aveva solo il consuntivo,
      // quell'importo diventa il preventivo delle successive (prima restavano a zero).
      preventivo: spesaBase.preventivo || spesaBase.consuntivo || '',
      consuntivo: '',
    });
  }
  return occorrenze;
}

// ===========================
// SPESE
// ===========================
function renderSpese() {
  const canEdit = canUserEdit(state.user);
  const myEdId = getUserEdificio(state.user);
  let items = state.spese.filter(s => s.edificioId === state.edificioAttivo);
  // Anni scelti con i pulsanti (uno o più; nessuno = tutti): i totali sommano gli anni scelti.
  items = items.filter(s=>inAnniSelezionati(s.data));
  if (state.filterCat !== 'all') items = items.filter(s=>s.categoria===state.filterCat);
  if (state.filterTipo !== 'all') items = items.filter(s=>s.tipoSpesa===state.filterTipo);
  if (state.searchQ) items = items.filter(s=>s.titolo.toLowerCase().includes(state.searchQ.toLowerCase())||s.descrizione?.toLowerCase().includes(state.searchQ.toLowerCase()));
  if (state.filterStato === 'definitiva')   items = items.filter(s=>importoNum(s.consuntivo)>0);
  if (state.filterStato === 'previsionale') items = items.filter(s=>importoNum(s.consuntivo)===0 && importoNum(s.preventivo)>0);
  if (state.filterFornitore !== 'all')      items = items.filter(s=>String(s.fornitoreId)===state.filterFornitore);
  // La selezione per "Elimina selezionate" vale solo per le spese visibili: cambiando
  // anno, filtri, ricerca o condominio quelle nascoste escono dalla selezione.
  // Prima restavano selezionate e venivano cancellate senza che si vedessero.
  if (state.speseSelezionate?.size) {
    const visibili = new Set(items.map(s => s.id));
    const restano = [...state.speseSelezionate].filter(id => visibili.has(id));
    if (restano.length !== state.speseSelezionate.size) state.speseSelezionate = new Set(restano);
  }

  // ── Ordinamento ──────────────────────────────────────────────────────────
  const col = state.sortCol || 'data';
  const dir = state.sortDir || 'desc';
  items = [...items].sort((a, b) => {
    let va, vb;
    switch(col) {
      case 'data':       va = a.data||''; vb = b.data||''; break;
      case 'titolo':     va = (a.titolo||'').toLowerCase(); vb = (b.titolo||'').toLowerCase(); break;
      case 'categoria':  { const ca=trovaPerId(getCategorie(), a.categoria); const cb=trovaPerId(getCategorie(), b.categoria); va=(ca?.label||'').toLowerCase(); vb=(cb?.label||'').toLowerCase(); break; }
      case 'tipo':       va = (a.tipoSpesa||'').toLowerCase(); vb = (b.tipoSpesa||'').toLowerCase(); break;
      case 'fornitore':  { const fa=trovaPerId(state.fornitori, a.fornitoreId); const fb=trovaPerId(state.fornitori, b.fornitoreId); va=(fa?.nome||'zzz').toLowerCase(); vb=(fb?.nome||'zzz').toLowerCase(); break; }
      case 'preventivo': va = importoNum(a.preventivo); vb = importoNum(b.preventivo); break;
      case 'consuntivo': va = importoNum(a.consuntivo); vb = importoNum(b.consuntivo); break;
      case 'stato':      va = importoNum(a.consuntivo)>0?'1':'0'; vb = importoNum(b.consuntivo)>0?'1':'0'; break;
      default:           va = a.data||''; vb = b.data||'';
    }
    if (va < vb) return dir==='asc' ? -1 : 1;
    if (va > vb) return dir==='asc' ?  1 : -1;
    return 0;
  });
  // Elenco filtrato completo (anche le righe non ancora disegnate): lo usano
  // "Seleziona tutte", l'esportazione e "Elimina selezionate" (bindAzioniSpese).
  _idsSpeseFiltrate = items.map(s => parseInt(s.id)); // come gli id letti dalle caselle (parseInt)

  // Helper: intestazione cliccabile
  const thSort = (label, colId) => {
    const isActive = col === colId;
    const icon = isActive ? (dir==='asc' ? '▲' : '▼') : '⇅';
    return `<th class="th-sort ${isActive?'active':''}" data-sort-col="${colId}">${label}<span class="sort-icon">${icon}</span></th>`;
  };

  const anni = getAnni();
  const totCons = items.reduce((a,s)=>a+(importoNum(s.consuntivo)),0);
  const totPrev = items.reduce((a,s)=>a+(importoNum(s.preventivo)),0);
  // Scarto: solo su spese già consuntivate (ha senso solo quando entrambi i valori esistono)
  const speseChiuse     = items.filter(s=>importoNum(s.consuntivo)>0 && importoNum(s.preventivo)>0);
  const totPrevChiuse   = speseChiuse.reduce((a,s)=>a+importoNum(s.preventivo),0);
  const totConsChiuse   = speseChiuse.reduce((a,s)=>a+importoNum(s.consuntivo),0);
  const scarto          = totConsChiuse - totPrevChiuse;
  const nSpeseAperte    = items.filter(s=>importoNum(s.consuntivo)===0 && importoNum(s.preventivo)>0).length;
  // nAttivi per calcolo quote (esclude superAdmin)
  const nAttiviSpese = state.condomini.filter(c=>c.edificioId===state.edificioAttivo&&!c.disabled&&!c.superAdmin).length || 1;

  return `
  <div>
    <div class="page-header spese-page-header">
      <div><div class="page-title">Spese ${btnGuida()}</div><div class="page-sub">${items.length} voci</div></div>
      <div style="display:flex;gap:.5rem">
        ${canEdit?`<button class="btn btn-primary btn-add-spesa" id="btn-add-spesa">+ Aggiungi spesa</button>`:''}
        <button class="btn btn-secondary" id="btn-export-spese" title="Esporta in Excel — tutte le spese visibili, o solo quelle selezionate">📊 Esporta Excel</button>
      </div>
    </div>

    <!-- Barra selezione multipla -->
    ${state.speseSelezionate && state.speseSelezionate.size > 0 ? `
    <div class="sel-count-bar">
      <span>${state.speseSelezionate.size} spese selezionate</span>
      <button id="btn-sel-all">Seleziona tutte (${items.length})</button>
      <button id="btn-sel-none">Deseleziona</button>
      <button class="danger" id="btn-del-sel">🗑 Elimina selezionate</button>
    </div>` : ''}

    <div class="stats-grid spese-stats" style="margin-bottom:1rem;grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">

      <!-- 1. ACTUAL -->
      <div class="stat-card stat-red">
        <div class="stat-label" style="display:flex;align-items:center;gap:5px">
          <span style="font-size:9px;background:var(--red-light);color:var(--red);border-radius:3px;padding:1px 5px;font-weight:700">ACTUAL</span>
          Uscite consuntivate
        </div>
        <div class="stat-value">${fmt(totCons)}</div>
        <div class="stat-sub">${speseChiuse.length} spese chiuse</div>
      </div>

      <!-- 2. FORECAST -->
      <div class="stat-card" style="border-top:3px solid var(--purple)">
        <div class="stat-label" style="display:flex;align-items:center;gap:5px">
          <span style="font-size:9px;background:var(--purple-light);color:var(--purple);border-radius:3px;padding:1px 5px;font-weight:700">FORECAST</span>
          Da consuntivare
        </div>
        <div class="stat-value" style="color:var(--purple)">${nSpeseAperte>0?fmt(totPrev-totPrevChiuse):'—'}</div>
        <div class="stat-sub">${nSpeseAperte>0?nSpeseAperte+' spese aperte':'Nessuna spesa aperta'}</div>
      </div>

      <!-- 3. QUOTA ACTUAL -->
      <div class="stat-card stat-blue">
        <div class="stat-label" style="display:flex;align-items:center;gap:5px">
          <span style="font-size:9px;background:var(--accent-light);color:var(--accent);border-radius:3px;padding:1px 5px;font-weight:700">ACTUAL</span>
          Quota / cond.
        </div>
        <div class="stat-value">${fmt(totCons/nAttiviSpese)}</div>
        <div class="stat-sub">Solo spese chiuse</div>
      </div>

      <!-- 4. QUOTA PROIETTATA -->
      <div class="stat-card" style="border-top:3px solid var(--teal)">
        <div class="stat-label" style="display:flex;align-items:center;gap:5px">
          <span style="font-size:9px;background:var(--teal-light);color:var(--teal);border-radius:3px;padding:1px 5px;font-weight:700">PROIEZIONE</span>
          Quota / cond. full
        </div>
        <div class="stat-value" style="color:var(--teal)">${fmt((totCons + (totPrev - totPrevChiuse)) / nAttiviSpese)}</div>
        <div class="stat-sub">Actual + ${nSpeseAperte} spese aperte</div>
      </div>

    </div>

    <!-- Scarto: visibile solo se ci sono spese chiuse con entrambi i valori -->
    ${speseChiuse.length>0?`
    <div style="display:flex;align-items:center;gap:.75rem;padding:.5rem .875rem;background:${scarto<=0?'var(--green-light)':'var(--red-light)'};border-radius:var(--radius-sm);margin-bottom:1rem;font-size:13px">
      <span style="font-weight:600;color:${scarto<=0?'var(--green)':'var(--red)'}">
        ${scarto<=0?'✅':'⚠️'} Scarto prev/cons (spese chiuse): ${scarto>0?'+':''}${fmt(scarto)}
      </span>
      <span style="color:var(--text2)">${speseChiuse.length} spese · prev. ${fmt(totPrevChiuse)} → cons. ${fmt(totConsChiuse)}</span>
    </div>`:''}

    ${renderSegnalazioniEditor('spesa')}
    ${renderFiltroAnni('filterAnni', anni, { nota: anniSelezionati().length > 1 ? 'importi sommati' : '' })}
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center">
      <!-- Ricerca: max metà schermo -->
      <input type="text" class="spese-filter-search" placeholder="🔍 Cerca…" id="search-spese"
        value="${esc(state.searchQ)}" style="flex:0 1 220px;min-width:120px;max-width:280px">

      <!-- Tipo -->
      <select class="spese-filter-sel" id="filter-tipo-spese" style="flex:0 1 110px;min-width:90px">
        <option value="all">Tutti tipi</option>
        <option value="ordinaria"     ${state.filterTipo==='ordinaria'?'selected':''}>Ordinaria</option>
        <option value="straordinaria" ${state.filterTipo==='straordinaria'?'selected':''}>Straord.</option>
      </select>

      <!-- Stato (nuovo) -->
      <select class="spese-filter-sel" id="filter-stato-spese" style="flex:0 1 120px;min-width:100px">
        <option value="all">Tutti stati</option>
        <option value="definitiva"   ${state.filterStato==='definitiva'?'selected':''}>✅ Definitiva</option>
        <option value="previsionale" ${state.filterStato==='previsionale'?'selected':''}>🔮 Previsionale</option>
      </select>

      <!-- Categoria -->
      <select class="spese-filter-sel" id="filter-cat-spese" style="flex:0 1 140px;min-width:110px">
        <option value="all">Tutte cat.</option>
        ${getCategorie().filter(c=>c.tipo!=='entrata').map(c=>`<option value="${esc(c.id)}" ${c.id===state.filterCat?'selected':''}>${esc(c.icon||'')} ${esc(c.label)}</option>`).join('')}
      </select>

      <!-- Fornitore (nuovo) -->
      <select class="spese-filter-sel" id="filter-fornitore-spese" style="flex:0 1 130px;min-width:100px">
        <option value="all">Tutti forn.</option>
        ${(state.fornitori||[]).filter(f=>!f.disabled&&(!f.edificioId||f.edificioId===state.edificioAttivo)).map(f=>`<option value="${f.id}" ${String(f.id)===state.filterFornitore?'selected':''}>${esc(f.nome)}</option>`).join('')}
      </select>

      <!-- Reset filtri (appare se c'è qualche filtro attivo) -->
      ${state.filterTipo!=='all'||state.filterCat!=='all'||state.filterStato!=='all'||state.filterFornitore!=='all'||state.searchQ?
        `<button class="btn btn-secondary btn-sm" id="btn-reset-filtri" title="Azzera filtri" style="white-space:nowrap;padding:7px 10px">✕ Reset</button>`:''
      }
    </div>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-top:.5rem">
      ${renderSpeseMobileCards(items.slice(0, righeMostrate('spese')), canEdit)}
      <div class="table-wrap">
        ${items.length===0?`<div class="empty">${svgEmpty()}<p>Nessuna spesa trovata</p></div>`:
        `<table>
          <thead><tr>
            ${state.speseSelezionate !== undefined ? `<th style="width:28px;padding:0 4px"><input type="checkbox" id="chk-all-spese" title="Seleziona/deseleziona tutte"></th>` : ''}
            ${canEdit?'<th class="col-azioni">Azioni</th>':''}
            ${thSort('Data','data')}
            ${thSort('Titolo / Descrizione','titolo')}
            ${thSort('Categoria','categoria')}
            ${thSort('Tipo','tipo')}
            ${thSort('Fornitore','fornitore')}
            ${thSort('Preventivo','preventivo')}
            ${thSort('Consuntivo','consuntivo')}
            ${thSort('Stato','stato')}
            <th class="col-quota">Quota</th>
            <th class="col-allegati">Allegati</th>
          </tr></thead>
          <tbody>
          ${items.slice(0, righeMostrate('spese')).map(s=>{
            const cat = trovaPerId(getCategorie(), s.categoria)||{label:s.categoria};
            const hasPrev = s.preventivo && parseFloat(s.preventivo)>0;
            const hasCons = s.consuntivo && parseFloat(s.consuntivo)>0;
            const isSel = state.speseSelezionate?.has(s.id);
            return `<tr class="${isSel?'spesa-row-sel':''}">
              <td style="width:28px;padding:0 4px;text-align:center"><input type="checkbox" class="chk-spesa" data-spesa-id="${s.id}" ${isSel?'checked':''}></td>
              ${canEdit?`<td class="col-azioni"><div class="inline-actions">
                <button class="btn btn-secondary btn-sm" data-edit-spesa="${s.id}" title="Modifica spesa">✏️</button>
                <button class="btn btn-danger btn-sm" data-del-spesa="${s.id}" title="Elimina spesa">🗑</button>
              </div></td>`:''}
              <td class="col-data" style="font-size:13px">${esc(s.data)}</td>
              <td class="col-title">
                <div style="font-weight:500">${esc(s.titolo)}${renderAllegatiClip(s)}</div>
                ${s.descrizione?`<div class="testo-2-righe" style="font-size:12px;color:var(--text2)" title="${esc(s.descrizione)}">${esc(s.descrizione)}</div>`:''}
                ${s.ricorrente?`<span class="ricorrente-badge">🔁 ${esc(s.frequenza||'mensile')}</span>`:''}
              </td>
              <td><span class="badge badge-gray">${esc(cat.label)}</span></td>
              <td><span class="badge ${s.tipoSpesa==='straordinaria'?'badge-purple':'badge-blue'}">${s.tipoSpesa==='straordinaria'?'Str.':'Ord.'}</span></td>
              <td style="white-space:nowrap">${(()=>{
                if (!s.fornitoreId) return '<span style="color:var(--text2);font-size:12px">—</span>';
                const forn = trovaPerId(state.fornitori, s.fornitoreId);
                if (!forn) return '<span style="color:var(--text2);font-size:12px">—</span>';
                const catF = CATEGORIE_FORNITORE.find(c=>c.id===forn.categoria)||{icon:'📦'};
                return '<span style="font-size:12px;font-weight:500">'+catF.icon+' '+esc(forn.nome)+'</span>';
              })()}</td>
              <td style="text-align:right;white-space:nowrap">${hasPrev?`<span style="color:var(--amber);font-weight:500">${fmt(s.preventivo)}</span>`:'<span style="color:var(--text2)">—</span>'}</td>
              <td style="text-align:right;white-space:nowrap">${hasCons?`<span class="amount-neg">${fmt(s.consuntivo)}</span>`:'<span style="color:var(--text2)">—</span>'}</td>
              <td class="col-stato">
                ${hasCons?'<span class="badge badge-green">Definitiva</span>':'<span class="badge badge-amber">Previsionale</span>'}
              </td>
              <td class="col-quota">${renderQuotaCell(s)}</td>
              <td class="col-allegati">${renderAllegatiChip(s)}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>`}
      </div>
      ${pulsanteAltreRighe('spese', items.length)}
    </div>
  </div>`;
}

// Riga della tabella di ripartizione. base = fa parte del gruppo di chi abitava alla data
// (partecipa al ricalcolo automatico); le altre righe (aggiunte a mano, o di chi è uscito
// con una quota già salvata) tengono la quota scritta.
function htmlRigaSplit(c, sd, base, importoRef) {
  const nCondEdificio = state.condomini.filter(x=>x.edificioId===state.edificioAttivo&&!x.disabled&&!x.superAdmin).length || 1;
  const perc = sd?.perc ?? (100/nCondEdificio);
  return `<tr data-base="${base ? '1' : '0'}">
      <td><div style="display:flex;align-items:center;gap:6px">
        <div class="avatar" style="${avatarStyle(c.color)};width:22px;height:22px;font-size:9px">${initials(c.nome)}</div>
        <span style="font-weight:500">${esc(c.nome)}</span>
        <span style="font-size:11px;color:var(--text2)">${esc(c.appartamento)}</span>${c.disabled ? '<span class="badge badge-gray" style="font-size:10px">non più attivo</span>' : (!base ? '<span class="badge badge-gray" style="font-size:10px">aggiunto a mano</span>' : '')}
      </div></td>
      <td>
        <input type="number" class="split-perc-inp" data-cid="${c.id}" value="${perc.toFixed(2)}" min="0" max="100" step="0.01" placeholder="0.00" aria-label="Quota di ${esc(c.nome)}, percentuale">
        <span style="color:var(--text2);font-size:12px"> %</span>
      </td>
      <td>
        <input type="number" class="split-euro-inp" data-cid="${c.id}" value="${importoRef>0?(perc/100*importoRef).toFixed(2):''}" min="0" step="0.01" placeholder="0.00" aria-label="Quota di ${esc(c.nome)}, euro">
        <span style="color:var(--text2);font-size:12px"> €</span>
      </td>
      <td style="text-align:center">
        <button type="button" class="split-lock-btn${sd?.locked ? ' locked' : ''}" data-lock-cid="${c.id}" data-locked="${sd?.locked ? '1' : '0'}" aria-pressed="${sd?.locked ? 'true' : 'false'}" aria-label="Blocca la quota di ${esc(c.nome)}" title="${sd?.locked ? 'Quota bloccata: premi per sbloccarla' : 'Blocca questa quota'}">${sd?.locked?'🔒':'🔓'}</button>
      </td>
    </tr>`;
}

function renderModalSpesa(d) {
  const isEdit = !!d?.id;
  const catSpesa = getCategorie().filter(c=>c.tipo!=='entrata');
  const selCat = d?.categoria||'';
  const defTipo = selCat ? (getCategorie().find(c=>c.id===selCat)?.tipo||'ordinaria') : 'ordinaria';

  // Build split rows from existing data or default equal split
  // Split: STRICT — solo condomini con edificioId esattamente uguale all'edificio attivo
  // Non usiamo il fallback !c.edificioId perché nello split la segregazione deve essere assoluta
  const _condSplit = state.condomini
    .filter(c => c.edificioId === state.edificioAttivo && !c.disabled && !c.superAdmin);
  // Se nessun condomino ha edificioId assegnato → avvisa che serve la migrazione
  const splitWarning = _condSplit.length === 0
    ? '<div class="alert alert-warning" style="font-size:12px;margin-bottom:.5rem">⚠️ Nessun condomino associato a questo edificio. Vai in Impostazioni → Migrazione per assegnare i condomini.</div>'
    : '';
  // Carica split da DB oppure calcola uguale
  // Se viene da DB, filtra solo i condomini dell'edificio attivo e ricalibra le %
  let splitData;
  // Righe della tabella: i condomini attivi più, per una spesa già salvata,
  // chi aveva una quota ed è stato archiviato dopo (mostrato come "non più
  // attivo"). Così aprire e salvare una spesa di un anno passato non riscrive
  // la sua ripartizione con i condomini di oggi.
  // Spesa nuova (o senza ripartizione salvata): le righe sono chi abitava alla data della spesa,
  // non chi abita oggi (bolletta arrivata in ritardo dopo un subentro). L'amministratore può
  // aggiungere a mano chi è uscito. Per una spesa già salvata le quote salvate non cambiano.
  const _dataRighe = d?.data || ymdLocale(new Date());
  // Anche per una spesa già salvata il gruppo di base è chi abitava alla data della spesa (non chi abita oggi):
  // chi è entrato dopo non entra nei ricalcoli ("Parti uguali", modifica di una quota) e si può aggiungere a mano.
  const _allaData = condominiAllaData(_dataRighe).filter(c => c.edificioId === state.edificioAttivo);
  const _condBase = _allaData.length ? _allaData : _condSplit;
  let _righeSplit = _condBase;
  const _condEdificio = state.condomini.filter(c => c.edificioId === state.edificioAttivo && !c.superAdmin);
  const _salvatoValido = (d?.split || []).filter(s => _condEdificio.some(c => c.id === s.id));
  if (_salvatoValido.length > 0) {
    // Righe fuori base: chi ha una quota salvata ma non abitava alla data (uscito dopo, o entrato dopo).
    const exAttivi = _condEdificio.filter(c => !_condBase.some(b => b.id === c.id) && _salvatoValido.some(s => s.id === c.id && (s.perc || 0) > 0));
    _righeSplit = [..._condBase, ...exAttivi];
    // Percentuali salvate così come sono; chi non era nella ripartizione parte da 0%.
    splitData = _righeSplit.map(c => _salvatoValido.find(s => s.id === c.id) || { id: c.id, perc: 0, locked: false });
  } else if (d?.split && d.split.length > 0) {
    const validIds = new Set(_condSplit.map(c=>c.id));
    const filtered = d.split.filter(s => validIds.has(s.id));
    if (filtered.length === 0) {
      // Nessun condomino valido nel split salvato → rigenera uguale
      splitData = _condSplit.map((c,i)=>({id:c.id, perc: partiUguali(_condSplit.length)[i], locked:false}));
    } else {
      // Ricalibra: normalizza le % al 100% escludendo i rimossi
      const totPerc = filtered.reduce((a,s)=>a+(s.perc||0), 0);
      splitData = totPerc > 0
        ? filtered.map(s=>({...s, perc: parseFloat((s.perc/totPerc*100).toFixed(4))}))
        : _condSplit.map((c,i)=>({id:c.id, perc: partiUguali(_condSplit.length)[i], locked:false}));
    }
  } else {
    splitData = _condBase.map((c,i)=>({id:c.id, perc: partiUguali(_condBase.length)[i], locked:false}));
  }
  // Millesimi (solo se il condominio li ha accesi): spesa nuova = proposta dalla
  // tabella della categoria; per le altre c'è il pulsante "Millesimi".
  const _millOn = typeof configMillesimi === 'function' && !!configMillesimi()?.attivo && tabelleMillesimi().length > 0;
  const _spesaNuova = !(d?.split && d.split.length);
  const _dataSpesa = d?.data || ymdLocale(new Date());
  const _tabMill = _millOn ? (d?.tabellaMillesimi || tabellaPerCategoria(d?.categoria || '')) : '';
  let _notaMill = '';
  if (_millOn && _spesaNuova && millesimiAttiviAlla(_dataSpesa)) {
    const p = propostaMillesimi(_tabMill, _dataSpesa);
    if (p) {
      splitData = _righeSplit.map(c => p.split.find(s => s.id === c.id) || { id: c.id, perc: 0, locked: false });
      _notaMill = 'Proposta dai millesimi, tabella "' + p.tabella.nome + '"' + (p.senza.length ? ' · senza millesimi: ' + p.senza.join(', ') : '') + (p.senzaRappresentante.length ? ' · manca il rappresentante di: ' + p.senzaRappresentante.join(', ') + ' (peso diviso tra i suoi condomini)' : '') + '. Puoi modificarla.';
    }
  }
  const importoRef = importoNum(d?.consuntivo||d?.preventivo);

  const _baseIds = new Set(_condBase.map(c => c.id));
  const splitRow = (c, sd) => htmlRigaSplit(c, sd, _baseIds.has(c.id), importoRef);
  // Condomini dell'edificio che non hanno una riga: si possono aggiungere a mano (es. chi è uscito).
  const _aggiungibili = _condEdificio.filter(c => !_righeSplit.some(r => r.id === c.id));

  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:620px">
      <div class="modal-header">
        <h2>${isEdit?'Modifica spesa':'Nuova spesa'}</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">

        <div class="field"><label>Titolo *</label><input type="text" id="m-titolo" value="${esc(d?.titolo||'')}" placeholder="Es. Bolletta luce gennaio"></div>
        <div class="field"><label>Descrizione</label><textarea id="m-desc" rows="2" placeholder="Dettagli aggiuntivi…">${esc(d?.descrizione||'')}</textarea></div>

        <div class="form-row">
          <div class="field">
            <label>Categoria *</label>
            <select id="m-cat">
              <option value="">— Seleziona —</option>
              ${catSpesa.map(c=>`<option value="${esc(c.id)}" data-tipo="${esc(c.tipo)}" ${c.id===selCat?'selected':''}>${esc(c.label)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Tipo spesa</label>
            <select id="m-tipo">
              <option value="ordinaria" ${(d?.tipoSpesa||defTipo)==='ordinaria'?'selected':''}>Ordinaria</option>
              <option value="straordinaria" ${(d?.tipoSpesa||defTipo)==='straordinaria'?'selected':''}>Straordinaria</option>
            </select>
            <p class="hint">Default dalla categoria</p>
          </div>
        </div>

        <div class="form-row">
          <div class="field">
            <label>Importo preventivo (€)</label>
            <input type="number" id="m-prev" value="${esc(d?.preventivo||'')}" placeholder="0.00" min="0" step="0.01">
            <p class="hint">Stima iniziale</p>
          </div>
          <div class="field">
            <label>Importo consuntivo (€)</label>
            <input type="number" id="m-cons" value="${esc(d?.consuntivo||'')}" placeholder="0.00" min="0" step="0.01">
            <p class="hint">Importo definitivo</p>
          </div>
        </div>

        <div class="form-row">
          <div class="field"><label>Data *</label><input type="date" id="m-data" value="${esc(d?.data||ymdLocale(new Date()))}"></div>
          <div class="field">
            <label>Fornitore</label>
            <select id="m-fornitore">
              <option value="">— Nessun fornitore —</option>
              ${(state.fornitori||[]).filter(f=>!f.disabled && (!f.edificioId||f.edificioId===getUserEdificio(state.user))).map(f=>{
                const cat = CATEGORIE_FORNITORE.find(c=>c.id===f.categoria)||{icon:'📦'};
                return `<option value="${f.id}" ${f.id===d?.fornitoreId?'selected':''}>${esc(cat.icon)} ${esc(f.nome)}</option>`;
              }).join('')}
            </select>
            <p class="hint">Facoltativo — collega la spesa a un fornitore</p>
          </div>
        </div>

        <!-- ═══ RICORRENZA ═══ -->
        <div class="field" style="margin-bottom:.5rem">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="m-ricorrente" ${d?.ricorrente?'checked':''} style="width:16px;height:16px">
            <span>🔁 Spesa ricorrente</span>
          </label>
        </div>
        <div id="ricorrenza-box" style="display:${d?.ricorrente?'block':'none'};background:var(--surface2);border-radius:var(--radius-sm);padding:.875rem;margin-bottom:1rem">
          <div class="form-row">
            <div class="field">
              <label>Frequenza *</label>
              <select id="m-freq">
                <option value="settimanale" ${d?.frequenza==='settimanale'?'selected':''}>Ogni settimana</option>
                <option value="mensile"     ${d?.frequenza==='mensile'||!d?.frequenza?'selected':''}>Ogni mese</option>
                <option value="bimestrale"  ${d?.frequenza==='bimestrale'?'selected':''}>Ogni 2 mesi</option>
                <option value="trimestrale" ${d?.frequenza==='trimestrale'?'selected':''}>Ogni 3 mesi</option>
                <option value="semestrale"  ${d?.frequenza==='semestrale'?'selected':''}>Ogni 6 mesi</option>
                <option value="annuale"     ${d?.frequenza==='annuale'?'selected':''}>Ogni anno</option>
              </select>
            </div>
            <div class="field">
              <label>Data fine *</label>
              <input type="date" id="m-freq-fine" value="${esc(d?.ricorrenzaFine||'')}" required>
              <p class="hint" style="margin:4px 0 0">Ultima data in cui può scattare la spesa.</p>
            </div>
          </div>

          <!-- Anteprima occorrenze -->
          <div id="ricorrenza-preview" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.75rem;margin-top:.5rem;font-size:12px">
            <div style="font-weight:600;margin-bottom:.4rem;color:var(--text2)">📅 Anteprima occorrenze</div>
            <div id="ricorrenza-preview-list" style="color:var(--text2)">Seleziona frequenza e data fine per vedere l'anteprima</div>
          </div>
        </div>
        ${renderBoxSerie(d)}

        <!-- ═══ SEZIONE SUDDIVISIONE ═══ -->
        ${splitWarning}
        <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:1rem">
          <div class="split-header" style="padding:.75rem 1rem;background:var(--surface2);border-bottom:1px solid var(--border)">
            <div>
              <div style="font-weight:600;font-size:14px">⚖️ Suddivisione spesa</div>
              <div style="font-size:12px;color:var(--text2)" id="split-mill-nota">${_notaMill ? esc(_notaMill) : 'Modifica % o € per ogni condomino'}</div>
            </div>
            <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
              ${_millOn ? `<select id="split-tabella" class="spese-filter-sel" style="flex:0 0 auto;min-width:0" aria-label="Tabella millesimale" data-nuova="${_spesaNuova ? '1' : '0'}" ${_notaMill ? 'data-applicata="1"' : ''}>${tabelleMillesimi().map(t => `<option value="${esc(t.id)}" ${t.id === _tabMill ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select>
              <button class="btn btn-secondary btn-sm" id="split-millesimi" title="Ripartisce secondo la tabella scelta">⚖️ Millesimi</button>` : ''}
              <button class="btn btn-secondary btn-sm" id="split-equal">↔ Parti uguali</button>
              <button class="btn btn-secondary btn-sm" id="split-reset-lock">🔓 Sblocca tutti</button>
            </div>
          </div>
          <div style="padding:.5rem .75rem .75rem">
            <div id="split-warn" role="status" aria-live="polite" style="display:none;font-size:12px;padding:4px 8px;background:var(--amber-light);color:var(--amber);border-radius:4px;margin-bottom:.5rem"></div>
            <div id="split-data-avviso" class="alert alert-warning" role="status" aria-live="polite" style="display:none;font-size:12px;margin-bottom:.5rem">⚠️ Hai cambiato la data: le quote <strong>non sono state ricalcolate</strong>, restano quelle salvate. Per ricalcolarle su chi abitava alla nuova data: salva, riapri la spesa e usa "↔ Parti uguali" (o "⚖️ Millesimi", se attivi), portando a 0% chi non abitava a quella data.</div>
            <table class="split-table">
              <thead><tr>
                <th>Condomino</th>
                <th>Percentuale</th>
                <th>Importo (€)</th>
                <th title="Blocca: questa quota non si ricalcola automaticamente"><span aria-hidden="true">🔒</span><span class="sr-only">Blocca la quota</span></th>
              </tr></thead>
              <tbody id="split-tbody" data-segue-data="${d?.split?.length ? '0' : '1'}"${d?.split?.length ? ` data-data-originale="${esc(d.data || '')}"` : ''}>
                ${_righeSplit.map(c => splitRow(c, splitData.find(s=>s.id===c.id))).join('')}
              </tbody>
            </table>
            <div id="split-annuncio" class="sr-only" role="status" aria-live="polite"></div>
            <div id="split-aggiungi-box" style="display:${_aggiungibili.length ? 'flex' : 'none'};gap:.5rem;align-items:center;margin-top:.5rem;flex-wrap:wrap">
              <select id="split-aggiungi" class="spese-filter-sel" style="flex:0 0 auto;min-width:0" aria-label="Aggiungi un condomino alla ripartizione">${_aggiungibili.map(c => `<option value="${c.id}">${esc(c.nome)}${c.appartamento ? ' · ' + esc(c.appartamento) : ''}${c.disabled ? ' (non più attivo)' : ''}</option>`).join('')}</select>
              <button type="button" class="btn btn-secondary btn-sm" id="split-aggiungi-btn" title="Aggiunge una riga a mano, per esempio per chi è uscito">＋ Aggiungi condomino</button>
            </div>
            <div class="split-bar-wrap" id="split-bar"></div>
            <div class="split-total-row">
              <span style="color:var(--text2)">Totale %</span>
              <span id="split-total-perc" style="font-weight:700">100.00 %</span>
            </div>
            <div class="split-total-row" id="split-total-euro-row" style="display:${importoRef>0?'flex':'none'}">
              <span style="color:var(--text2)">Totale €</span>
              <span id="split-total-euro" style="font-weight:700">${fmt(importoRef)}</span>
            </div>
          </div>
        </div>

        <!-- ALLEGATI -->
        <div class="field">
          <label>Allegati (PDF, immagini, documenti — max 5MB cad.)</label>
          <div class="dropzone" id="dropzone">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <div>Trascina i file qui oppure <strong>clicca per selezionare</strong></div>
            <div style="font-size:12px;margin-top:4px;color:var(--text2)">PDF · JPG · PNG · DOCX · XLSX e altri</div>
          </div>
          <input type="file" id="file-input" multiple accept="*/*" style="display:none">
          <div id="allegati-pending"></div>
          ${d?.allegati?.length ? `<div style="margin-top:8px"><div style="font-size:12px;color:var(--text2);margin-bottom:6px">Allegati esistenti:</div><div class="allegati-list">${(d.allegati||[]).map(f=>renderAllegatoItem(f,false)).join('')}</div></div>` : ''}
        </div>

        <div class="alert alert-info" style="font-size:13px">
          💡 <strong>Preventivo</strong> → spesa <em>Previsionale</em>. <strong>Consuntivo</strong> → spesa <em>Definitiva</em>. Puoi avere solo uno dei due. &nbsp;|&nbsp; 🔒 Blocca una quota per fissarla mentre ricalcoli le altre.
        </div>
        <div id="m-err" class="alert alert-warning" role="alert" tabindex="-1" style="display:none;margin-top:.75rem"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        <button class="btn btn-primary" id="modal-save">💾 ${isEdit?'Salva modifiche':'Aggiungi spesa'}</button>
      </div>
    </div>
  </div>`;
}

// ===========================
// BIND ACTIONS
// ===========================
// ===========================
// ESPORTA SPESE (Excel/CSV)
// ===========================
// Genera un CSV (si apre correttamente in Excel, incluso il formato numerico italiano) con una
// riga per spesa e una colonna per ogni condomino attivo con la sua quota — stessa logica di
// ripartizione già usata in renderQuotaCell (split % se definito sulla spesa, altrimenti parti
// uguali tra i condomini attivi dell'edificio DI QUELLA spesa).
function esportaSpeseCSV(spese, nomeFile) {
  if (!spese.length) { avvisa('Nessuna spesa da esportare.'); return; }

  function quotaCondomino(spesa, condId, condEd) {
    const importoRef = importoNum(spesa.consuntivo||spesa.preventivo);
    if (!importoRef) return 0;
    return quotaSuSpesa(spesa, condId, importoRef, condEd.length); // regola comune (subentri compresi)
  }
  const csvField = csvCampo; // js/core/utils.js (escape CSV e protezione dalle formule di Excel)
  function numCSV(n) {
    // Virgola come separatore decimale: coerente con Excel in locale italiano quando il
    // separatore di campo è il punto e virgola (altrimenti Excel legge tutto in una colonna)
    return n ? Number(n).toFixed(2).replace('.', ',') : '';
  }

  // I condomini coinvolti possono differire da spesa a spesa se cambiano edificio: prendo l'unione
  // di tutti i condomini attivi di tutti gli edifici toccati dalle spese esportate, così ogni riga
  // ha comunque le colonne corrette (0 per i condomini di un edificio diverso da quello della spesa).
  const edificiCoinvolti = [...new Set(spese.map(s => s.edificioId || state.edificioAttivo))];
  // Colonne anche per chi è uscito ma ha una quota su almeno una spesa esportata: altrimenti la somma
  // delle colonne resta sotto l'importo (stessa regola di quotaSuSpesa usata dal Bilancio).
  const haQuota = (c) => spese.some(s => (s.split || []).some(x => x.id === c.id && (x.perc || 0) > 0));
  // Spese senza ripartizione (dati legacy): si dividono tra chi abitava alla data, quindi anche chi è uscito dopo ha la colonna.
  const presenteSenzaSplit = (c) => spese.some(s => !(s.split || []).length && (s.edificioId || state.edificioAttivo) === c.edificioId
    && condominiAllaData(s.data, c.edificioId).some(x => x.id === c.id));
  const condTotali = state.condomini.filter(c => edificiCoinvolti.includes(c.edificioId) && !c.superAdmin && (!c.disabled || haQuota(c) || presenteSenzaSplit(c)));

  const intestazione = ['Data','Titolo','Descrizione','Categoria','Tipo','Fornitore','Preventivo','Consuntivo','Stato', ...condTotali.map(c=>c.nome)];
  const righe = spese.map(s => {
    const cat = getCategorie().find(c=>c.id===s.categoria) || {label:s.categoria||''};
    const forn = s.fornitoreId ? state.fornitori.find(f=>f.id===s.fornitoreId) : null;
    const stato = importoNum(s.consuntivo) > 0 ? 'Definitiva' : 'Previsionale';
    const condEdSpesa = state.condomini.filter(c => c.edificioId === (s.edificioId||state.edificioAttivo) && !c.disabled && !c.superAdmin);
    const base = [
      s.data || '',
      s.titolo || '',
      s.descrizione || '',
      cat.label || '',
      s.tipoSpesa === 'straordinaria' ? 'Straordinaria' : 'Ordinaria',
      forn ? forn.nome : '',
      numCSV(s.preventivo),
      numCSV(s.consuntivo),
      stato,
    ];
    const exConQuota = (c) => c.disabled && c.edificioId === (s.edificioId||state.edificioAttivo) && (s.split || []).some(x => x.id === c.id && (x.perc || 0) > 0);
    // Senza ripartizione: ha la colonna anche chi abitava alla data e poi è uscito.
    const exPresenteAllaData = (c) => !(s.split || []).length && c.disabled && c.edificioId === (s.edificioId||state.edificioAttivo)
      && condominiAllaData(s.data, c.edificioId).some(x => x.id === c.id);
    const quote = condTotali.map(c => condEdSpesa.some(ce=>ce.id===c.id) || exConQuota(c) || exPresenteAllaData(c) ? numCSV(quotaCondomino(s, c.id, condEdSpesa)) : '');
    return [...base, ...quote];
  });

  const corpo = [intestazione, ...righe].map(r => r.map(csvField).join(';')).join('\r\n');
  const BOM = '\uFEFF'; // necessario perché Excel riconosca correttamente UTF-8 (accenti, simbolo €)
  const blob = new Blob([BOM + corpo], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  a.click();
  URL.revokeObjectURL(url);
}

// ===========================
// ANTEPRIMA SPESE RICORRENTI
// ===========================
function aggiornaAnteprimaRicorrenza() {
  const preview    = document.getElementById('ricorrenza-preview-list');
  const mData      = document.getElementById('m-data');
  const mFreqFine  = document.getElementById('m-freq-fine');
  const mFreq      = document.getElementById('m-freq');
  if (!preview) return;

  const dataInizio = mData?.value;
  const dataFine   = mFreqFine?.value;
  const freq       = mFreq?.value || 'mensile';

  if (!dataInizio || !dataFine) {
    preview.innerHTML = '<span style="color:var(--text2)">Seleziona frequenza e data fine per vedere l\'anteprima</span>';
    return;
  }
  if (new Date(dataFine) <= new Date(dataInizio)) {
    preview.innerHTML = '<span style="color:var(--red)">⚠️ La data fine deve essere successiva alla data della prima spesa</span>';
    return;
  }
  const baseItem = { data: dataInizio, ricorrente:true, frequenza:freq };
  const occ = generaOccorrenze(baseItem, dataFine);
  if (occ.length === 0) {
    preview.innerHTML = '<span style="color:var(--text2)">Nessuna occorrenza nel periodo selezionato</span>';
    return;
  }
  const max   = 6;
  const shown = occ.slice(0, max);
  const rest  = occ.length - max;
  const freqLabel = {
    settimanale:'settimana', mensile:'mese', bimestrale:'2 mesi',
    trimestrale:'3 mesi', semestrale:'6 mesi', annuale:'anno'
  }[freq] || freq;
  preview.innerHTML = `
    <div style="margin-bottom:5px">
      <span style="color:var(--accent);font-weight:600">${occ.length} occorrenze</span>
      <span style="color:var(--text2)"> · ogni ${freqLabel} · fino al ${dataFine}</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">
      ${shown.map(o=>`<span style="background:var(--accent-light);color:var(--accent);border-radius:4px;padding:2px 7px;font-size:11px;font-weight:500">${esc(o.data)}</span>`).join('')}
      ${rest>0?`<span style="color:var(--text2);font-size:11px;align-self:center">+${rest} altre…</span>`:''}
    </div>`;
}

// Pulsanti, filtri, selezione multipla ed esportazione della pagina Spese. Chiamata da bindPageActions() (azioni.js).
function bindAzioniSpese() {
  // Checkbox singola spesa
  document.querySelectorAll('.chk-spesa').forEach(chk => {
    chk.onchange = () => {
      const id = parseInt(chk.dataset.spesaId);
      const sel = new Set(state.speseSelezionate || []);
      if (chk.checked) sel.add(id); else sel.delete(id);
      state.speseSelezionate = sel;
      // Aggiorna stile riga
      const row = chk.closest('tr');
      if (row) row.className = chk.checked ? 'spesa-row-sel' : '';
      // Aggiorna la barra selezione senza un render completo quando possibile (più leggero),
      // ma un render completo è necessario quando la barra deve COMPARIRE (non esiste ancora
      // nel DOM) o SPARIRE (il conteggio è tornato a zero) — un aggiornamento del solo testo,
      // in quei due casi, lasciava la barra a mostrare "0 spese selezionate" invece di sparire.
      const bar = document.querySelector('.sel-count-bar span');
      if (sel.size === 0 || !bar) render();
      else bar.textContent = sel.size + ' spese selezionate';
    };
  });
  // Esporta Excel: le spese SELEZIONATE se ce n'è almeno una, altrimenti tutte quelle attualmente
  // visibili a schermo (rispettando i filtri correnti — ricerca, anno, tipo, stato, categoria, fornitore).
  // Gli id sono quelli dell'elenco filtrato calcolato da renderSpese (_idsSpeseFiltrate), anche le
  // righe non ancora disegnate ("Mostra altre"): stessi filtri di quello che si vede.
  const bExportSpese = document.getElementById('btn-export-spese');
  if (bExportSpese) bExportSpese.onclick = () => {
    const idsVisibili = [..._idsSpeseFiltrate];
    const sel = state.speseSelezionate;
    const idsDaEsportare = (sel && sel.size > 0) ? idsVisibili.filter(id => sel.has(id)) : idsVisibili;
    const daEsportare = new Set(idsDaEsportare);
    const speseDaEsportare = state.spese.filter(s => daEsportare.has(s.id));
    const nomeFile = 'spese-condominio-' + (sel && sel.size > 0 ? 'selezionate-' : '') + ymdLocale(new Date()) + '.csv';
    esportaSpeseCSV(speseDaEsportare, nomeFile);
  };
  // Seleziona tutte — tutte le spese dell'elenco filtrato (anche quelle sotto "Mostra altre")
  const bSelAll = document.getElementById('btn-sel-all');
  if (bSelAll) bSelAll.onclick = () => {
    const ids = [..._idsSpeseFiltrate];
    state.speseSelezionate = new Set(ids);
    render();
  };
  // Deseleziona tutte
  const bSelNone = document.getElementById('btn-sel-none');
  if (bSelNone) bSelNone.onclick = () => {
    state.speseSelezionate = new Set();
    render();
  };
  // Checkbox "seleziona tutte" nell'header — stesso fix di bSelAll qui sopra
  const chkAll = document.getElementById('chk-all-spese');
  if (chkAll) chkAll.onchange = () => {
    if (chkAll.checked) {
      const ids = [..._idsSpeseFiltrate];
      state.speseSelezionate = new Set(ids);
    } else {
      state.speseSelezionate = new Set();
    }
    render();
  };
  // Elimina selezionate
  const bDelSel = document.getElementById('btn-del-sel');
  if (bDelSel) bDelSel.onclick = async () => {
    // Solo le spese selezionate E nell'elenco filtrato (come l'esportazione).
    const idsVisibili = new Set([..._idsSpeseFiltrate]);
    const sel = new Set([...(state.speseSelezionate || [])].filter(id => idsVisibili.has(id)));
    if (sel.size === 0) return;
    // Mostra dettaglio di cosa si sta eliminando
    const toDelete = state.spese.filter(s=>sel.has(s.id));
    const msg = 'Eliminare ' + sel.size + ' spese?\n\n' +
      toDelete.slice(0,5).map(s=>'- ' + s.titolo + ' (' + s.data + ')').join('\n') +
      (toDelete.length > 5 ? '\n- ... e altre ' + (toDelete.length-5) : '') +
      (toDelete.some(s => modificaAnnoPassato(s, null, CAMPI_ANNO_SPESA)) ? '\n\n' + MSG_ANNO_PASSATO : '');
    if (!await chiedi(msg)) return;
    const spese = state.spese.filter(s=>!sel.has(s.id));
    save('cm_spese', spese);
    state.speseSelezionate = new Set();
    setState({spese});
  };
  // Ordinamento colonne spese
  document.querySelectorAll('[data-sort-col]').forEach(th => {
    th.onclick = () => {
      const colId = th.dataset.sortCol;
      const newDir = state.sortCol===colId && state.sortDir==='desc' ? 'asc' : 'desc';
      setState({sortCol: colId, sortDir: newDir});
    };
  });
  // Spese filters
  const ss = document.getElementById('search-spese');
  if (ss) ss.oninput = e => setState({searchQ: e.target.value});
  const fts = document.getElementById('filter-tipo-spese');
  if (fts) fts.onchange = e => setState({filterTipo: e.target.value});
  const fcs = document.getElementById('filter-cat-spese');
  if (fcs) fcs.onchange = e => setState({filterCat: e.target.value});
  const fss = document.getElementById('filter-stato-spese');
  if (fss) fss.onchange = e => setState({filterStato: e.target.value});
  const ffs = document.getElementById('filter-fornitore-spese');
  if (ffs) ffs.onchange = e => setState({filterFornitore: e.target.value});
  const bRF = document.getElementById('btn-reset-filtri');
  if (bRF) bRF.onclick = () => setState({filterTipo:'all',filterCat:'all',filterStato:'all',filterFornitore:'all',searchQ:''});
  // Add buttons
  const bAddSpesa = document.getElementById('btn-add-spesa');
  // Prima di aprire la scheda si rileggono i millesimi se sono vecchi (ADV-FUNC-026).
  const aggiornaMillesimi = async () => { try { if (typeof rileggiMillesimiSeVecchi === 'function') await rileggiMillesimiSeVecchi(); } catch (e) {} };
  if (bAddSpesa) bAddSpesa.onclick = async () => { await aggiornaMillesimi(); setState({modal:{type:'spesa',data:null}, pendingFiles:[]}); };
  // Edit/delete spese
  document.querySelectorAll('[data-edit-spesa]').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.editSpesa);
      const item = state.spese.find(s=>s.id===id);
      if (item) { await aggiornaMillesimi(); setState({modal:{type:'spesa',data:{...item}}, pendingFiles:[]}); }
    };
  });
  document.querySelectorAll('[data-del-spesa]').forEach(btn => {
    btn.onclick = async () => {
      const daEliminare = state.spese.find(s=>s.id===parseInt(btn.dataset.delSpesa));
      if (!await chiedi('Eliminare questa spesa?' + (modificaAnnoPassato(daEliminare, null, CAMPI_ANNO_SPESA) ? '\n\n' + MSG_ANNO_PASSATO : ''))) return;
      const spese = state.spese.filter(s=>s.id!==parseInt(btn.dataset.delSpesa));
      save('cm_spese', spese);
      setState({spese});
    };
  });
}

// Scheda spesa: ricorrenza, ripartizione, tipo in base alla categoria. Chiamata da bindModal() (schede.js).
function bindSchedaSpese() {
  bindSerieSpesa();
  // Toggle ricorrenza + aggiorna anteprima
  const mRic = document.getElementById('m-ricorrente');
  const mFreq = document.getElementById('m-freq');
  const mFreqFine = document.getElementById('m-freq-fine');
  const mData = document.getElementById('m-data');
  if (mRic) mRic.onchange = () => {
    const box = document.getElementById('ricorrenza-box');
    if (!box) return;
    const checked = mRic.checked;
    box.style.display = checked ? 'block' : 'none';
    if (checked) {
      // Default data fine = 31 dicembre dell'anno della spesa (non dell'anno di
      // oggi: una spesa del preventivo dell'anno prossimo avrebbe una fine già
      // passata e nessuna occorrenza).
      const mFreqFineEl = document.getElementById('m-freq-fine');
      if (mFreqFineEl && !mFreqFineEl.value) {
        const annoSpesa = parseInt(String(mData?.value || '').slice(0, 4)) || new Date().getFullYear();
        mFreqFineEl.value = annoSpesa + '-12-31';
      }
      aggiornaAnteprimaRicorrenza();
    }
  };
  if (mFreq)     mFreq.onchange     = aggiornaAnteprimaRicorrenza;
  if (mFreqFine) mFreqFine.onchange = aggiornaAnteprimaRicorrenza;
  if (mData)     mData.onchange     = aggiornaAnteprimaRicorrenza;
  // Split spesa
  bindSplit();
  // Auto-fill tipo from categoria
  const mcat = document.getElementById('m-cat');
  if (mcat && state.modal?.type==='spesa') {
    mcat.onchange = e => {
      const selId = mcat.value;
      const catObj = getCategorie().find(c=>c.id===selId);
      const tipo = catObj?.tipo;
      const mTipo = document.getElementById('m-tipo');
      if (tipo && mTipo && tipo !== 'entrata') mTipo.value = tipo;
    };
  }
}

// Salvataggio della scheda spesa (nuova o modificata, con eventuali occorrenze ricorrenti). Chiamata da saveModal() (schede.js).
// Errore che blocca il salvataggio: resta nella scheda finché non si corregge (role="alert", UXA-001),
// non sparisce dopo qualche secondo come un avviso; il focus va al messaggio così il lettore di schermo lo legge.
// Senza il riquadro (scheda non disegnata) ripiega sull'avviso in basso.
function erroreSchedaSpesa(msg) {
  const errEl = document.getElementById('m-err');
  if (!errEl) { avvisa(msg); return; }
  errEl.textContent = msg;
  errEl.style.display = 'block';
  if (errEl.scrollIntoView) errEl.scrollIntoView({ block: 'nearest' });
  if (errEl.focus) errEl.focus({ preventScroll: true });
}

async function salvaSchedaSpesa(m) {
    const erroreVecchio = document.getElementById('m-err');
    if (erroreVecchio) { erroreVecchio.style.display = 'none'; erroreVecchio.textContent = ''; }
    const titolo = document.getElementById('m-titolo')?.value?.trim();
    const desc = document.getElementById('m-desc')?.value?.trim();
    const cat = document.getElementById('m-cat')?.value;
    const tipo = document.getElementById('m-tipo')?.value;
    const prev = document.getElementById('m-prev')?.value;
    const cons = document.getElementById('m-cons')?.value;
    const data = document.getElementById('m-data')?.value;
    if (!titolo || !cat || !data) { avvisa('Compila i campi obbligatori (Titolo, Categoria, Data)'); return; }
    if (!prev && !cons) { avvisa('Inserisci almeno un importo (preventivo o consuntivo)'); return; }
    // Solo importi positivi (QA-CONS-020): l'errore compare nella scheda, come per il blocco al 100%.
    // Un valore già salvato e lasciato com'è non blocca la modifica di altri campi (come nelle regole).
    const nuovoNonValido = (v, vecchio) => v && !importoValido(v) && String(vecchio ?? '') !== v;
    if (nuovoNonValido(prev, m.data?.preventivo) || nuovoNonValido(cons, m.data?.consuntivo)) {
      erroreSchedaSpesa(MSG_IMPORTO);
      return;
    }
    const existingAllegati = m.data?.allegati||[];
    const allegati = [...existingAllegati, ...state.pendingFiles];
    const split = readSplitFromDOM();
    // "Il totale deve fare 100%": la ripartizione non si salva se si scosta oltre 0,05 punti
    // (prima bastava l'avviso giallo e si salvavano addebiti sopra o sotto la spesa).
    const totSplit = split.reduce((a, x) => a + (x.perc || 0), 0);
    // Ogni quota è tra 0% e 100%: il totale al 100% non basta (120% e -20% sommano 100% ma sono un errore).
    const fuoriScala = split.some(x => (x.perc || 0) < -0.005 || (x.perc || 0) > 100.005);
    if (split.length && (fuoriScala || Math.abs(totSplit - 100) > 0.05)) {
      // Spesa vecchia il cui dato salvato cita un condomino che non c'è più (CR-005): la tabella non mostra
      // la sua riga, quindi mancano quei punti. Il blocco al 100% resta, ma si spiega la causa e il rimedio.
      const idEsistenti = new Set(state.condomini.filter(c => c.edificioId === state.edificioAttivo && !c.superAdmin).map(c => c.id));
      const orfane = (m.data?.id ? (m.data.split || []) : []).filter(x => !idEsistenti.has(x.id) && (parseFloat(x.perc) || 0) > 0.005);
      const percOrfane = orfane.reduce((a, x) => a + (parseFloat(x.perc) || 0), 0);
      const msg = fuoriScala
        ? 'Ogni quota deve essere tra 0% e 100%. Correggi le quote prima di salvare.'
        : 'La ripartizione deve fare 100%: ora fa ' + fmtN(totSplit) + '%. '
          + (percOrfane > 0.005
            ? 'Questa spesa ha salvata una quota del ' + fmtN(percOrfane) + '% per ' + (orfane.length === 1 ? 'un condomino che' : orfane.length + ' condomini che')
              + ' non esiste più e non compare nella tabella. Assegna quella quota a chi è presente (aggiungi la riga di chi ne risponde, o usa «Parti uguali») e salva di nuovo.'
            : 'Correggi le quote prima di salvare.');
      erroreSchedaSpesa(msg);
      return;
    }
    // Tabella millesimale usata (solo informativa: la ripartizione resta quella salvata qui sopra).
    const selMill = document.getElementById('split-tabella');
    const tabellaMillesimi = selMill && selMill.dataset.applicata === '1' ? selMill.value : (m.data?.tabellaMillesimi || '');
    const fornitoreId = parseInt(document.getElementById('m-fornitore')?.value)||null;
    const ricorrente = document.getElementById('m-ricorrente')?.checked || false;
    const frequenza  = document.getElementById('m-freq')?.value || 'mensile';
    const ricorrenzaFine = document.getElementById('m-freq-fine')?.value || '';
    // Validazione: data fine obbligatoria per spese ricorrenti
    if (ricorrente && !ricorrenzaFine) {
      erroreSchedaSpesa('Inserisci la data di fine per la spesa ricorrente');
      return;
    }
    // La fine deve venire dopo la prima spesa, altrimenti non si crea nessuna
    // occorrenza e il preventivo risulta più basso senza avvisi. Solo quando la
    // ricorrenza nasce o cambia: l'ultima occorrenza può cadere proprio nella
    // data di fine e deve restare modificabile (es. per consuntivarla).
    const ricorrenzaCambiata = !m.data?.id || !m.data?.ricorrente || m.data.frequenza !== frequenza || m.data.ricorrenzaFine !== ricorrenzaFine;
    if (ricorrente && ricorrenzaCambiata && ricorrenzaFine <= data) {
      const msg = 'La data di fine della ricorrenza deve essere successiva alla data della spesa';
      erroreSchedaSpesa(msg);
      return;
    }
    // Serie con un importo vecchio non valido (DAT-003): le occorrenze nuove copiano il preventivo (o il
    // consuntivo) della spesa, e le regole rifiutano per intero il lotto se quell'importo è zero, negativo o
    // con troppi decimali (un valore vecchio lasciato com'è passa per la spesa, non per le copie). Si avvisa
    // prima, nella scheda, invece di lasciare un errore generico di permessi.
    const importoSerie = prev || cons || '';
    const creaSerie = ricorrente && ricorrenzaCambiata;
    const applicaSerie = !creaSerie && !!m.data?.id && !!document.getElementById('m-serie-applica')?.checked;
    if (((creaSerie && importoSerie) ? !importoValido(importoSerie) : false)
        || (applicaSerie && prev && !importoValido(prev) && occorrenzeSuccessive(m.data).some(s => String(s.preventivo ?? '') !== prev))) {
      const msg = 'Le occorrenze della serie copiano l\'importo di questa spesa, che non è valido. ' + MSG_IMPORTO
        + ' Correggi l\'importo e salva di nuovo.';
      erroreSchedaSpesa(msg);
      return;
    }
    const ricGruppoId = m.data?.ricGruppoId || (ricorrente ? newId() : null);
    const item = { id: m.data?.id||newId(), titolo, descrizione:desc, categoria:cat, tipoSpesa:tipo, preventivo:prev||'', consuntivo:cons||'', data, allegati, split, fornitoreId, edificioId: state.edificioAttivo, ricorrente, frequenza: ricorrente?frequenza:null, ricorrenzaFine: ricorrente?ricorrenzaFine:'', ricGruppoId, ...(tabellaMillesimi ? { tabellaMillesimi } : {}) };
    // Anno già passato (QA-CONS-029): nessun blocco, ma l'amministratore conferma prima di salvare.
    if (modificaAnnoPassato(m.data?.id ? m.data : null, item, CAMPI_ANNO_SPESA) && !await confermaAnnoPassato()) return;
    let spese;
    if (m.data?.id) {
      // Modifica spesa esistente
      spese = state.spese.map(s=>s.id===item.id ? item : s);
      // Se la ricorrenza è stata AGGIUNTA o MODIFICATA rispetto all'originale:
      // genera le nuove occorrenze future partendo dal giorno dopo la data della spesa
      const eraRicorrente = !!m.data?.ricorrente;
      const cambiataFreq  = m.data?.frequenza !== frequenza;
      const cambiatiFine  = m.data?.ricorrenzaFine !== ricorrenzaFine;
      if (ricorrente && (!eraRicorrente || cambiataFreq || cambiatiFine)) {
        // Si rigenerano solo le occorrenze SUCCESSIVE a questa e ancora da
        // consuntivare. Prima si cancellava tutto il gruppo, anche le righe
        // passate e quelle già consuntivate (perdita di dati e di cassa reale).
        const sostituibile = (s) => item.ricGruppoId && s.ricGruppoId === item.ricGruppoId && s.id !== item.id
          && s.data > item.data && !(parseFloat(s.consuntivo) > 0);
        const daSostituire = spese.filter(sostituibile).length;
        spese = spese.filter(s => !sostituibile(s));
        // Le date ancora occupate da righe del gruppo (consuntivate) non vengono duplicate.
        const occupate = new Set(spese.filter(s => item.ricGruppoId && s.ricGruppoId === item.ricGruppoId).map(s => s.data));
        const occorrenze = generaOccorrenze(item, ricorrenzaFine).filter(o => !occupate.has(o.data));
        spese = [...spese, ...occorrenze];
        if (occorrenze.length > 0 || daSostituire > 0) {
          avvisa('✅ Ricorrenza aggiornata: ' + occorrenze.length + ' occorrenze successive create'
            + (daSostituire ? ' (sostituite ' + daSostituire + ' ancora da consuntivare)' : '')
            + '. Le righe precedenti e quelle già consuntivate non sono state toccate.');
        }
      }
      // Serie: modifiche applicate anche alle occorrenze successive non consuntivate
      // (se la ricorrenza è cambiata quelle sono già state rigenerate dai nuovi valori).
      else if (document.getElementById('m-serie-applica')?.checked) {
        const succ = new Set(occorrenzeSuccessive(m.data).map(s => s.id));
        spese = spese.map(s => succ.has(s.id) ? { ...s, titolo, descrizione: desc, categoria: cat, tipoSpesa: tipo, preventivo: prev || '', fornitoreId, split: splitPerOccorrenza(split, s.data, data, item.edificioId) } : s);
      }
    } else {
      spese = [...state.spese, item];
      // Genera occorrenze future se ricorrente (nuova spesa)
      if (ricorrente) {
        const occorrenze = generaOccorrenze(item, ricorrenzaFine);
        spese = [...spese, ...occorrenze];
      }
    }
    save('cm_spese', spese);
    setState({spese, modal:null, pendingFiles:[]});
}

// ===========================
// SPESE RICORRENTI COME SERIE
// ===========================
// Occorrenze della stessa serie successive a questa e non ancora consuntivate:
// sono quelle che si possono aggiornare o eliminare in un colpo solo.
function occorrenzeSuccessive(d) {
  if (!d?.id || !d.ricGruppoId) return [];
  return state.spese.filter(s => s.ricGruppoId === d.ricGruppoId && s.id !== d.id && s.data > d.data && !(parseFloat(s.consuntivo) > 0));
}

// Riquadro nella scheda di una spesa ricorrente già salvata: applica le modifiche
// alle occorrenze successive, oppure eliminale (prima si faceva riga per riga).
function renderBoxSerie(d) {
  const succ = occorrenzeSuccessive(d);
  if (!succ.length) return '';
  const fino = succ.map(s => s.data).sort().at(-1).split('-').reverse().join('/');
  return `<div class="serie-box" style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:.75rem .875rem;margin-bottom:1rem">
    <div style="font-weight:600;font-size:13px;margin-bottom:.4rem">🔁 Serie: ${succ.length} ${succ.length === 1 ? 'occorrenza successiva' : 'occorrenze successive'} non ancora consuntivate (fino al ${fino})</div>
    <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer">
      <input type="checkbox" id="m-serie-applica" style="width:16px;height:16px;margin-top:2px">
      <span>Applica anche a quelle le modifiche di titolo, descrizione, categoria, tipo, preventivo, fornitore e ripartizione. Date, consuntivi e allegati di ciascuna restano com'erano.</span>
    </label>
    <button type="button" class="btn btn-secondary btn-sm" id="btn-serie-elimina" style="margin-top:.6rem;color:var(--red)">🗑 Elimina le ${succ.length} successive</button>
  </div>`;
}

function bindSerieSpesa() {
  const b = document.getElementById('btn-serie-elimina');
  if (!b || state.modal?.type !== 'spesa') return;
  b.onclick = async () => {
    const d = state.modal.data;
    const succ = occorrenzeSuccessive(d);
    if (!succ.length) return;
    if (!await chiedi('Eliminare le ' + succ.length + ' occorrenze successive non consuntivate di questa serie? Questa spesa e quelle già consuntivate restano.'
      + (succ.some(s => modificaAnnoPassato(s, null, CAMPI_ANNO_SPESA)) ? '\n\n' + MSG_ANNO_PASSATO : ''))) return;
    const via = new Set(succ.map(s => s.id));
    // La serie ora finisce con questa occorrenza.
    const spese = state.spese.filter(s => !via.has(s.id)).map(s => s.id === d.id ? { ...s, ricorrenzaFine: s.data } : s);
    save('cm_spese', spese);
    setState({ spese, modal: null, pendingFiles: [] });
  };
}
