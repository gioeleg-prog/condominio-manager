// Ricerca in tutto il sito: campo "🔍 Cerca" nella barra laterale (tasto "/"
// per andarci), pagina dei risultati raggruppati per sezione. Cerca solo nei
// dati che l'utente può già vedere: quelli caricati per il suo condominio e,
// per l'elenco dei condomini, solo se è amministratore. Ogni risultato porta
// alla voce: chi può modificare apre la scheda, gli altri vanno alla pagina.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// Minuscole e senza accenti: "perche" trova "perché".
function normalizzaRicerca(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Testo in cui cercare un importo: "1200", "1200,00" e "1.200,00".
function testoImporto(v) {
  const n = parseFloat(v);
  if (!n) return '';
  const fisso = n.toFixed(2);
  return [String(v), fisso, fisso.replace('.', ','), euroPdf(n).replace('€ ', '')].join(' ');
}

// Risultati per sezione. Ogni voce: id, titolo, sotto (righe informative), campi (testi per l'anteprima), apri().
function cercaNelSito(q) {
  const termini = normalizzaRicerca(q).split(/\s+/).filter(t => t.length >= 2);
  if (!termini.length) return { termini, gruppi: [] };
  const trova = (campi) => { const h = normalizzaRicerca(campi.filter(Boolean).join(' · ')); return termini.every(t => h.includes(t)); };
  const cats = getCategorie();
  const catLabel = (id) => (cats.find(c => c.id === id) || { label: id || '' }).label;
  const nomeCond = (id) => (state.condomini.find(c => c.id === id) || {}).nome || '';
  const nomeForn = (id) => (state.fornitori.find(f => f.id === id) || {}).nome || '';
  const canEdit = canUserEdit(state.user), canAdmin = canUserAdmin(state.user);
  const gruppi = [];
  const aggiungi = (chiave, titolo, icona, voci) => { if (voci.length) gruppi.push({ chiave, titolo, icona, voci }); };
  const recenti = (a, b) => String(b.data || '').localeCompare(String(a.data || ''));

  aggiungi('spese', 'Spese', '💸', getSpeseVisibili().filter(s => trova([s.titolo, s.descrizione, catLabel(s.categoria), nomeForn(s.fornitoreId), testoImporto(s.preventivo), testoImporto(s.consuntivo), dataPdf(s.data), ...(s.allegati || []).map(a => a.nome)]))
    .sort(recenti).map(s => ({ id: s.id, data: s.data, titolo: s.titolo || 'Spesa',
      sotto: [dataPdf(s.data), catLabel(s.categoria), parseFloat(s.consuntivo) > 0 ? fmt(parseFloat(s.consuntivo)) + ' consuntivo' : parseFloat(s.preventivo) > 0 ? fmt(parseFloat(s.preventivo)) + ' preventivo' : '', nomeForn(s.fornitoreId)],
      campi: [s.descrizione, (s.allegati || []).map(a => a.nome).join(', ')],
      apri: () => canEdit ? setState({ page: 'spese', modal: { type: 'spesa', data: { ...s } } })
        : setState({ page: 'spese', filterAnni: [annoDi(s.data)].filter(a => a > 0), filterAnno: annoDi(s.data) || state.filterAnno, searchQ: s.titolo || '' }) })));

  aggiungi('entrate', 'Versamenti', '💰', getEntrateVisibili().filter(e => trova([nomeCond(e.condominoId), e.descrizione, testoImporto(e.importo), dataPdf(e.data), e.previsionale ? 'previsto rata' : 'versamento']))
    .sort(recenti).map(e => ({ id: e.id, data: e.data, titolo: nomeCond(e.condominoId) + ' · ' + fmt(parseFloat(e.importo) || 0),
      sotto: [dataPdf(e.data), e.previsionale ? 'previsto' : 'versato', e.descrizione],
      campi: [],
      apri: () => canEdit ? setState({ page: 'entrate', modal: { type: 'entrata', data: e } })
        : setState({ page: 'entrate', filterAnni: [annoDi(e.data)].filter(a => a > 0), filterAnno: annoDi(e.data) || state.filterAnno, searchQ: nomeCond(e.condominoId) }) })));

  const fornitori = (state.fornitori || []).filter(f => !f.edificioId || f.edificioId === state.edificioAttivo);
  aggiungi('fornitori', 'Fornitori', '🏢', fornitori.filter(f => trova([f.nome, (CATEGORIE_FORNITORE.find(c => c.id === f.categoria) || {}).label, f.email, f.telefono, f.riferimento, f.riferimentoTel, f.indirizzo, f.piva, f.note, f.sito]))
    .map(f => ({ id: f.id, titolo: f.nome || 'Fornitore',
      sotto: [(CATEGORIE_FORNITORE.find(c => c.id === f.categoria) || {}).label, f.telefono, f.email, f.disabled ? 'non più attivo' : ''],
      campi: [f.note, f.riferimento, f.indirizzo],
      apri: () => setState({ page: 'fornitori', modal: { type: 'storico-fornitore', data: { ...f } } }) })));

  const vita = (tab, modale, s) => canAdmin ? setState({ page: 'vita', vitaTab: tab, modal: { type: modale, data: { ...s } } }) : setState({ page: 'vita', vitaTab: tab });
  aggiungi('avvisi', 'Avvisi in bacheca', '📌', getBachecaVisibili().filter(a => trova([a.titolo, a.testo, dataPdf(a.data)])).sort(recenti)
    .map(a => ({ id: a.id, data: a.data, titolo: a.titolo || 'Avviso', sotto: [dataPdf(a.data), a.priorita === 'alta' ? 'prioritario' : ''], campi: [a.testo], apri: () => vita('bacheca', 'avviso', a) })));
  const elenco = (x) => (Array.isArray(x) ? x : x ? [x] : []).join(', ');
  aggiungi('verbali', 'Verbali', '📋', getVerbaliVisibili().filter(v => trova([v.titolo, v.tipo, elenco(v.argomenti), elenco(v.decisioni), v.note, dataPdf(v.data)])).sort(recenti)
    .map(v => ({ id: v.id, data: v.data, titolo: v.titolo || 'Verbale', sotto: [dataPdf(v.data), v.tipo], campi: [elenco(v.argomenti), elenco(v.decisioni), v.note], apri: () => vita('verbali', 'verbale', v) })));
  aggiungi('lavori', 'Lavori', '🛠️', getLavoriVisibili().filter(l => trova([l.titolo, l.descrizione, l.responsabile, l.note, l.stato, ...(l.storico || []).map(h => h.nota || h.testo)]))
    .map(l => ({ id: l.id, titolo: l.titolo || 'Lavoro', sotto: [l.stato, l.percentuale != null ? l.percentuale + '%' : '', l.responsabile], campi: [l.descrizione, l.note, ...(l.storico || []).map(h => h.nota || h.testo)], apri: () => vita('lavori', 'lavoro', l) })));
  aggiungi('delibere', 'Delibere', '📜', getDelibereVisibili().filter(d => trova([d.descrizioneSintetica, d.responsabile, d.note, d.stato, dataPdf(d.dataApprovazione)]))
    .map(d => ({ id: d.id, data: d.dataApprovazione, titolo: d.descrizioneSintetica || 'Delibera', sotto: [dataPdf(d.dataApprovazione), d.stato, d.responsabile], campi: [d.note], apri: () => vita('delibere', 'delibera', d) })));

  // L'elenco delle persone resta riservato agli amministratori, come la pagina Condomini.
  if (canAdmin) {
    aggiungi('condomini', 'Condomini', '👥', getCondominiVisibili().filter(c => !c.superAdmin && trova([c.nome, c.appartamento, c.email, c.username]))
      .map(c => ({ id: c.id, titolo: c.nome || 'Condomino', sotto: [c.appartamento, c.email, c.disabled ? 'archiviato' : ''], campi: [], apri: () => setState({ page: 'condomini', modal: { type: 'cond', data: { ...c } } }) })));
  }
  return { termini, gruppi };
}

// Testo con le parole cercate evidenziate; ogni pezzo passa da esc(), quindi è sicuro.
function evidenzia(testo, termini) {
  const t = String(testo == null ? '' : testo);
  if (!termini.length || !t) return esc(t);
  const n = normalizzaRicerca(t);
  // Stessa lunghezza solo se la normalizzazione non cambia il numero di caratteri.
  if (n.length !== t.length) return esc(t);
  const segni = new Array(t.length).fill(false);
  termini.forEach(term => { let i = n.indexOf(term); while (i >= 0) { for (let k = i; k < i + term.length; k++) segni[k] = true; i = n.indexOf(term, i + term.length); } });
  let out = '', dentro = false;
  for (let i = 0; i < t.length; i++) {
    if (segni[i] !== dentro) { out += segni[i] ? '<mark>' : '</mark>'; dentro = segni[i]; }
    out += esc(t[i]);
  }
  return out + (dentro ? '</mark>' : '');
}

// Pezzo di testo attorno alla prima parola trovata.
function anteprimaRicerca(campi, termini) {
  for (const c of campi) {
    if (!c) continue;
    const s = String(c), n = normalizzaRicerca(s);
    const i = Math.min(...termini.map(t => n.indexOf(t)).filter(x => x >= 0));
    if (!isFinite(i)) continue;
    const da = Math.max(0, i - 50), a = Math.min(s.length, i + 90);
    return (da > 0 ? '…' : '') + s.slice(da, a) + (a < s.length ? '…' : '');
  }
  return '';
}

function renderRicerca() {
  const q = state.ricercaQ || '';
  const { termini, gruppi } = cercaNelSito(q);
  const tot = gruppi.reduce((a, g) => a + g.voci.length, 0);
  const MAX = 30;
  return `
  <div>
    <div class="page-header">
      <div><div class="page-title">Ricerca ${btnGuida()}</div><div class="page-sub">${esc(nomeEdificioAttivo())}</div></div>
    </div>
    <form class="ric-form" id="ric-form" role="search">
      <label for="ric-q" class="ric-lbl">Cerca in spese, versamenti, fornitori, bacheca, verbali, lavori e delibere${canUserAdmin(state.user) ? ', condomini' : ''}</label>
      <div class="ric-riga">
        <input type="search" id="ric-q" value="${esc(q)}" placeholder="Es. ascensore, Pulito Srl, 1200, assemblea…" autocomplete="off" data-focus-key="ric-q">
        <button type="submit" class="btn btn-primary" style="width:auto">🔍 Cerca</button>
      </div>
    </form>
    ${!termini.length ? `<p class="ric-vuoto">${q ? 'Scrivi almeno due lettere.' : 'Scrivi una o più parole: trova le voci che le contengono tutte, senza badare a maiuscole e accenti.'}</p>`
      : !tot ? `<p class="ric-vuoto">Nessun risultato per <strong>${esc(q)}</strong>. Prova con meno parole o con un sinonimo.</p>`
      : `<p class="ric-conteggio" role="status">${tot} ${tot === 1 ? 'risultato' : 'risultati'} per <strong>${esc(q)}</strong></p>
        <nav class="ric-salti" aria-label="Vai alla sezione">${gruppi.map(g => `<a href="#ric-${g.chiave}" class="ric-salto">${g.icona} ${g.titolo} <b>${g.voci.length}</b></a>`).join('')}</nav>
        ${gruppi.map(g => `
        <section class="card ric-gruppo" id="ric-${g.chiave}" aria-labelledby="ric-h-${g.chiave}">
          <div class="card-header"><h3 id="ric-h-${g.chiave}">${g.icona} ${g.titolo} <span class="ric-num">${g.voci.length}</span></h3></div>
          <ul class="ric-lista">
            ${g.voci.slice(0, MAX).map((v, i) => {
              const ant = anteprimaRicerca(v.campi, termini);
              return `<li><button type="button" class="ric-voce" data-ric="${g.chiave}:${i}">
                <span class="ric-tit">${evidenzia(v.titolo, termini)}</span>
                <span class="ric-sotto">${v.sotto.filter(Boolean).map(x => evidenzia(x, termini)).join(' · ')}</span>
                ${ant ? `<span class="ric-ant">${evidenzia(ant, termini)}</span>` : ''}
              </button></li>`;
            }).join('')}
          </ul>
          ${g.voci.length > MAX ? `<p class="ric-altri">e altri ${g.voci.length - MAX}: aggiungi una parola per restringere.</p>` : ''}
        </section>`).join('')}`}
  </div>`;
}

function bindAzioniRicerca() {
  const f = document.getElementById('ric-form');
  if (!f) return;
  f.onsubmit = (e) => { e.preventDefault(); setState({ ricercaQ: document.getElementById('ric-q').value.trim() }); };
  const voci = cercaNelSito(state.ricercaQ || '').gruppi;
  document.querySelectorAll('[data-ric]').forEach(b => {
    b.onclick = () => { const [k, i] = b.dataset.ric.split(':'); const v = voci.find(g => g.chiave === k)?.voci[Number(i)]; if (v) v.apri(); };
  });
  document.querySelectorAll('.ric-salto').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  });
}

// Campo "🔍 Cerca" della barra laterale e tasto "/" (fuori dai campi di testo).
function bindCampoRicerca() {
  const c = document.getElementById('ricerca-globale');
  if (c) c.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); setState({ page: 'ricerca', ricercaQ: c.value.trim(), sidebarOpen: false, modal: null }); } };
  const t = document.getElementById('btn-topbar-ricerca');
  if (t) t.onclick = () => setState({ page: 'ricerca', sidebarOpen: false, modal: null });
  if (!window.__ricercaTasto) {
    window.__ricercaTasto = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      if (state.modal || !state.user) return;
      const campo = document.getElementById('ric-q') || document.getElementById('ricerca-globale');
      if (campo && campo.offsetParent !== null) { e.preventDefault(); campo.focus(); }
      else { e.preventDefault(); setState({ page: 'ricerca', sidebarOpen: false }); }
    });
  }
}
