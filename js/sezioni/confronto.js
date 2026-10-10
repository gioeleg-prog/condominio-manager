// Confronto anni: i conti del condominio anno per anno, come il bilancio di
// un'azienda. Anno intero o "da inizio anno a oggi" (year to date), sintesi,
// categorie di spesa, ordinario/straordinario e situazione per condomino.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// Anni proposti all'apertura: gli ultimi tre fino all'anno prossimo.
function anniConfrontoPredefiniti() {
  const max = new Date().getFullYear() + 1;
  return getAnni().filter(a => a <= max).slice(0, 3).reverse();
}

// Anni confrontati: quelli accesi; [] = "Tutti"; alla prima apertura (null) i predefiniti.
function anniConfronto() {
  if (state.confrontoAnni == null) return anniConfrontoPredefiniti();
  const a = normalizzaAnni(state.confrontoAnni);
  return a.length ? a : normalizzaAnni(getAnni());
}

// Numeri di un anno (o della parte di anno fino alla data di oggi, se periodo = 'ytd').
function datiAnnoConfronto(anno, periodo) {
  const oggi = new Date();
  const mmgg = String(oggi.getMonth() + 1).padStart(2, '0') + '-' + String(oggi.getDate()).padStart(2, '0');
  const nelPeriodo = (d) => annoDi(d) === anno && (periodo !== 'ytd' || String(d).slice(5, 10) <= mmgg);
  const edOk = (r) => !r.edificioId || r.edificioId === state.edificioAttivo; // come il riporto di cassa
  const spese = state.spese.filter(s => edOk(s) && nelPeriodo(s.data));
  const entrate = state.entrate.filter(e => edOk(e) && nelPeriodo(e.data));
  const num = (v) => parseFloat(v) || 0;
  const somma = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const str = (s) => s.tipoSpesa === 'straordinaria';
  const cons = spese.filter(s => num(s.consuntivo) > 0);
  const chiuseConPrev = cons.filter(s => num(s.preventivo) > 0);
  const d = {
    anno, spese, entrate,
    entrateReali: somma(entrate.filter(e => !e.previsionale), e => num(e.importo)),
    entratePreviste: somma(entrate.filter(e => e.previsionale), e => num(e.importo)),
    usciteCons: somma(cons, s => num(s.consuntivo)),
    usciteConsOrd: somma(cons.filter(s => !str(s)), s => num(s.consuntivo)),
    usciteConsStr: somma(cons.filter(str), s => num(s.consuntivo)),
    preventivo: somma(spese, s => num(s.preventivo)),
    preventivoOrd: somma(spese.filter(s => !str(s)), s => num(s.preventivo)),
    preventivoStr: somma(spese.filter(str), s => num(s.preventivo)),
    daConsuntivare: somma(spese.filter(s => !(num(s.consuntivo) > 0)), s => num(s.preventivo)),
    scostamento: somma(chiuseConPrev, s => num(s.consuntivo) - num(s.preventivo)),
    nChiuseConPrev: chiuseConPrev.length,
  };
  d.risultato = d.entrateReali - d.usciteCons;
  d.cassaFine = getSaldoRiporto(anno) + d.risultato; // cassa reale a fine periodo
  return d;
}

// Importo di una spesa secondo la base scelta.
function importoBase(s, base) {
  const c = parseFloat(s.consuntivo) || 0, p = parseFloat(s.preventivo) || 0;
  return base === 'preventivo' ? p : base === 'misto' ? (c || p) : c;
}


function renderConfronto() {
  // Alla prima apertura i pulsanti mostrano accesi gli anni predefiniti (e il clic parte da quelli).
  if (state.confrontoAnni == null) state.confrontoAnni = anniConfrontoPredefiniti();
  const periodo = state.confrontoPeriodo === 'ytd' ? 'ytd' : 'anno';
  const base = ['preventivo', 'misto'].includes(state.confrontoBase) ? state.confrontoBase : 'reale';
  const anni = anniConfronto();
  const annoOggi = new Date().getFullYear();
  const oggi = new Date();
  const dataYtd = oggi.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
  const D = anni.map(a => datiAnnoConfronto(a, periodo));
  const futuro = (a) => a > annoOggi;
  const baseLbl = { reale: 'importi reali (consuntivo)', preventivo: 'importi a preventivo', misto: 'reali, o previsti se non ancora consuntivati' }[base];

  // Variazione rispetto alla colonna precedente. senso: +1 se crescere è bene (entrate), −1 se è male (spese).
  const delta = (cur, prev, senso) => {
    if (prev == null || !prev || cur == null) return '';
    const pct = Math.round((cur - prev) / Math.abs(prev) * 100);
    if (!isFinite(pct) || pct === 0) return '<div class="cf-delta">= 0%</div>';
    const bene = senso === 0 ? null : (pct > 0) === (senso > 0);
    return `<div class="cf-delta ${bene === null ? '' : bene ? 'bene' : 'male'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%</div>`;
  };
  // Cella: valore, o "—" per i dati reali di un anno che non è ancora iniziato.
  const cella = (val, i, senso, opts = {}) => {
    if (opts.reale && futuro(anni[i])) return '<td class="cf-num cf-vuoto">—</td>';
    const prevVal = i > 0 && !(opts.reale && futuro(anni[i - 1])) ? opts.prev(i - 1) : null;
    return `<td class="cf-num">${opts.formato ? opts.formato(val) : fmt(val)}${delta(val, prevVal, senso)}</td>`;
  };
  const riga = (etichetta, f, senso, opts = {}) => `<tr class="${opts.cls || ''}"><th scope="row">${etichetta}</th>${D.map((d, i) => cella(f(d), i, senso, { ...opts, prev: (j) => f(D[j]) })).join('')}</tr>`;
  const intestAnni = `<tr><th scope="col">Voce</th>${anni.map(a => `<th scope="col" class="cf-num">${a}${futuro(a) ? '<span class="cf-badge prev">preventivo</span>' : a === annoOggi && periodo === 'anno' ? '<span class="cf-badge corso">in corso</span>' : ''}</th>`).join('')}</tr>`;

  // ── Sintesi ──
  const sintesi = `
    <table class="cf-tab">
      <thead>${intestAnni}</thead>
      <tbody>
        ${riga('Entrate reali (versamenti)', d => d.entrateReali, +1, { reale: true })}
        ${riga('Uscite reali (consuntivo)', d => d.usciteCons, -1, { reale: true })}
        ${riga('— di cui ordinarie', d => d.usciteConsOrd, -1, { reale: true, cls: 'cf-sotto' })}
        ${riga('— di cui straordinarie', d => d.usciteConsStr, -1, { reale: true, cls: 'cf-sotto' })}
        ${riga('<strong>Risultato (entrate − uscite)</strong>', d => d.risultato, +1, { reale: true, cls: 'cf-forte' })}
        ${riga('Cassa a fine periodo', d => d.cassaFine, 0, { reale: true })}
        ${riga('Spese a preventivo (budget)', d => d.preventivo, -1)}
        ${riga('Ancora da consuntivare', d => d.daConsuntivare, 0)}
        ${riga('Scostamento consuntivo − preventivo', d => d.scostamento, -1, { reale: true, formato: v => (v > 0 ? '+' : '') + fmt(v) })}
        ${riga('Versamenti previsti (rate)', d => d.entratePreviste, 0)}
      </tbody>
    </table>
    <p class="cf-nota">Lo scostamento confronta solo le spese già consuntivate che avevano un preventivo: positivo = si è speso più del previsto. "—" = anno non ancora iniziato.</p>`;

  // ── Grafico entrate / uscite / preventivo ──
  const maxBar = Math.max(1, ...D.flatMap(d => [d.entrateReali, d.usciteCons, d.preventivo]));
  const barra = (val, cls, lbl) => `<div class="cf-barra-riga"><span class="cf-barra-lbl">${lbl}</span><div class="cf-barra-wrap"><div class="cf-barra ${cls}" style="width:${Math.max(0.5, val / maxBar * 100).toFixed(1)}%"></div></div><span class="cf-barra-val">${fmt(val)}</span></div>`;
  const grafico = `<div class="cf-grafico">${D.map(d => `
      <div class="cf-grafico-anno">
        <div class="cf-grafico-tit">${d.anno}</div>
        ${futuro(d.anno) ? '' : barra(d.entrateReali, 'entrate', 'Entrate')}
        ${futuro(d.anno) ? '' : barra(d.usciteCons, 'uscite', 'Uscite')}
        ${barra(d.preventivo, 'prev', 'Preventivo')}
      </div>`).join('')}</div>`;

  // ── Per categoria ──
  const cats = getCategorie();
  const catIds = [...new Set(D.flatMap(d => d.spese.map(s => s.categoria || 'altro')))];
  const perCat = catIds.map(id => {
    const valori = D.map(d => d.spese.filter(s => (s.categoria || 'altro') === id).reduce((a, s) => a + importoBase(s, base), 0));
    const cat = cats.find(c => c.id === id) || { label: id, icon: '📦' };
    return { id, cat, valori, max: Math.max(...valori) };
  }).filter(r => r.max > 0).sort((a, b) => b.max - a.max);
  const totCat = D.map((_, i) => perCat.reduce((a, r) => a + r.valori[i], 0));
  const tabCat = perCat.length ? `
    <table class="cf-tab">
      <thead><tr><th scope="col">Categoria</th>${anni.map(a => `<th scope="col" class="cf-num">${a}</th>`).join('')}</tr></thead>
      <tbody>
        ${perCat.map(r => `<tr><th scope="row">${esc(r.cat.icon || '')} ${esc(r.cat.label)}</th>${r.valori.map((v, i) => `<td class="cf-num">${v ? fmt(v) : '—'}${delta(v, i > 0 ? r.valori[i - 1] : null, -1)}</td>`).join('')}</tr>`).join('')}
      </tbody>
      <tfoot><tr><th scope="row">Totale</th>${totCat.map((v, i) => `<td class="cf-num">${fmt(v)}${delta(v, i > 0 ? totCat[i - 1] : null, -1)}</td>`).join('')}</tr></tfoot>
    </table>` : '<p class="cf-nota">Nessuna spesa nel periodo con la base scelta.</p>';

  // ── Ordinario / straordinario ──
  const ordStr = D.map(d => {
    const ord = d.spese.filter(s => s.tipoSpesa !== 'straordinaria').reduce((a, s) => a + importoBase(s, base), 0);
    const str = d.spese.filter(s => s.tipoSpesa === 'straordinaria').reduce((a, s) => a + importoBase(s, base), 0);
    return { anno: d.anno, ord, str, tot: ord + str };
  });
  const tabOrdStr = `
    <table class="cf-tab">
      <thead><tr><th scope="col">Tipo</th>${anni.map(a => `<th scope="col" class="cf-num">${a}</th>`).join('')}</tr></thead>
      <tbody>
        <tr><th scope="row">Ordinarie</th>${ordStr.map((o, i) => `<td class="cf-num">${fmt(o.ord)}${delta(o.ord, i > 0 ? ordStr[i - 1].ord : null, -1)}</td>`).join('')}</tr>
        <tr><th scope="row">Straordinarie</th>${ordStr.map((o, i) => `<td class="cf-num">${fmt(o.str)}${delta(o.str, i > 0 ? ordStr[i - 1].str : null, -1)}</td>`).join('')}</tr>
        <tr class="cf-forte"><th scope="row">Totale</th>${ordStr.map((o, i) => `<td class="cf-num">${fmt(o.tot)}${delta(o.tot, i > 0 ? ordStr[i - 1].tot : null, -1)}</td>`).join('')}</tr>
        <tr class="cf-sotto"><th scope="row">Quota straordinaria</th>${ordStr.map(o => `<td class="cf-num">${o.tot ? Math.round(o.str / o.tot * 100) + '%' : '—'}</td>`).join('')}</tr>
      </tbody>
    </table>
    <div class="cf-stack-wrap">${ordStr.map(o => `<div class="cf-stack-riga"><span class="cf-barra-lbl">${o.anno}</span><div class="cf-stack" role="img" aria-label="${o.anno}: ordinarie ${fmt(o.ord)}, straordinarie ${fmt(o.str)}">${o.tot ? `<div class="cf-stack-ord" style="width:${(o.ord / o.tot * 100).toFixed(1)}%"></div><div class="cf-stack-str" style="width:${(o.str / o.tot * 100).toFixed(1)}%"></div>` : ''}</div></div>`).join('')}
      <div class="cf-legenda"><span><i class="cf-stack-ord"></i>Ordinarie</span><span><i class="cf-stack-str"></i>Straordinarie</span></div>
    </div>`;

  // ── Per condomino ──
  const condEd = state.condomini.filter(c => c.edificioId === state.edificioAttivo && !c.superAdmin);
  const nAttivi = condEd.filter(c => !c.disabled).length || 1;
  const perCond = condEd.map(c => {
    const anniC = D.map(d => {
      const quota = d.spese.reduce((a, s) => a + quotaSuSpesa(s, c.id, importoBase(s, base), nAttivi), 0);
      const versato = d.entrate.filter(e => e.condominoId === c.id && !e.previsionale).reduce((a, e) => a + (parseFloat(e.importo) || 0), 0);
      return { quota, versato, diff: versato - quota };
    });
    return { c, anniC };
  }).filter(r => !r.c.disabled || r.anniC.some(x => x.quota || x.versato));
  const tabCond = perCond.length ? `
    <div class="cf-scroll" tabindex="0" role="region" aria-label="Situazione per condomino, anno per anno">
    <table class="cf-tab cf-tab-cond">
      <thead>
        <tr><th scope="col" rowspan="2">Condomino</th>${anni.map(a => `<th scope="colgroup" colspan="3" class="cf-num cf-gruppo">${a}</th>`).join('')}</tr>
        <tr>${anni.map(() => '<th scope="col" class="cf-num">Quota</th><th scope="col" class="cf-num">Versato</th><th scope="col" class="cf-num">Saldo</th>').join('')}</tr>
      </thead>
      <tbody>
        ${perCond.map(r => `<tr><th scope="row">${esc(r.c.nome)}<div class="cf-sub">${esc(r.c.appartamento || '')}${r.c.disabled ? ' · non più attivo' : ''}</div></th>${r.anniC.map(x => `<td class="cf-num">${fmt(x.quota)}</td><td class="cf-num">${fmt(x.versato)}</td><td class="cf-num ${x.diff < -0.005 ? 'male' : x.diff > 0.005 ? 'bene' : ''}">${x.diff > 0.005 ? '+' : ''}${fmt(x.diff)}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table></div>
    <p class="cf-nota">Saldo = versato − quota dell'anno (senza riporto degli anni precedenti; la situazione cumulativa è in Entrate). Le spese senza ripartizione sono divise in parti uguali tra i condomini attivi di oggi.</p>` : '<p class="cf-nota">Nessun condomino.</p>';

  const toggle = (key, valore, testo, attuale) => `<button type="button" class="chip-anno${attuale === valore ? ' attivo' : ''}" data-confronto-${key}="${valore}" data-focus-key="cf-${key}-${valore}" aria-pressed="${attuale === valore ? 'true' : 'false'}">${testo}</button>`;

  return `
  <div>
    <div class="page-header">
      <div><div class="page-title">Confronto anni ${btnGuida()}</div><div class="page-sub">${esc(nomeEdificioAttivo())} · ${periodo === 'ytd' ? 'dal 1° gennaio al ' + dataYtd + ' di ogni anno' : 'anno intero'}</div></div>
      <button class="btn btn-secondary" id="btn-confronto-csv">📊 Esporta Excel</button>
    </div>

    <div class="cf-comandi">
      ${renderFiltroAnni('confrontoAnni', getAnni(), { etichetta: 'Anni', tutti: true })}
      <div class="filtro-anni" role="group" aria-label="Periodo">
        <span class="filtro-anni-lbl" aria-hidden="true">Periodo</span>
        ${toggle('periodo', 'anno', 'Anno intero', periodo)}
        ${toggle('periodo', 'ytd', 'Da inizio anno a oggi', periodo)}
      </div>
    </div>

    ${anni.length < 2 ? '<div class="alert alert-info" style="font-size:13px;margin-bottom:1rem">Accendi almeno due anni per confrontarli.</div>' : ''}

    <div class="card cf-card">
      <div class="card-header"><h3>📋 Sintesi</h3></div>
      <div class="cf-scroll" tabindex="0" role="region" aria-label="Sintesi anno per anno">${sintesi}</div>
      ${grafico}
    </div>

    <div class="filtro-anni cf-base" role="group" aria-label="Importi da usare per categorie, tipo e condomini">
      <span class="filtro-anni-lbl" aria-hidden="true">Importi</span>
      ${toggle('base', 'reale', 'Reali', base)}
      ${toggle('base', 'preventivo', 'Preventivo', base)}
      ${toggle('base', 'misto', 'Reali + previsti', base)}
      <span class="filtro-anni-nota">${baseLbl}</span>
    </div>

    <div class="card cf-card">
      <div class="card-header"><h3>🏷️ Per categoria di spesa</h3></div>
      <div class="cf-scroll" tabindex="0" role="region" aria-label="Spese per categoria, anno per anno">${tabCat}</div>
    </div>

    <div class="card cf-card">
      <div class="card-header"><h3>⚖️ Ordinarie e straordinarie</h3></div>
      <div class="cf-scroll" tabindex="0" role="region" aria-label="Ordinarie e straordinarie, anno per anno">${tabOrdStr}</div>
    </div>

    <div class="card cf-card">
      <div class="card-header"><h3>👥 Per condomino</h3></div>
      ${tabCond}
    </div>
  </div>`;
}

function bindAzioniConfronto() {
  document.querySelectorAll('[data-confronto-periodo]').forEach(b => {
    b.onclick = () => setState({ confrontoPeriodo: b.dataset.confrontoPeriodo });
  });
  document.querySelectorAll('[data-confronto-base]').forEach(b => {
    b.onclick = () => setState({ confrontoBase: b.dataset.confrontoBase });
  });
  const csv = document.getElementById('btn-confronto-csv');
  if (csv) csv.onclick = esportaConfrontoCSV;
}

// Sintesi e categorie in un file per Excel (una colonna per anno).
function esportaConfrontoCSV() {
  const periodo = state.confrontoPeriodo === 'ytd' ? 'ytd' : 'anno';
  const base = ['preventivo', 'misto'].includes(state.confrontoBase) ? state.confrontoBase : 'reale';
  const anni = anniConfronto();
  const D = anni.map(a => datiAnnoConfronto(a, periodo));
  const n = (v) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
  const righe = [
    ['Confronto anni', nomeEdificioAttivo(), periodo === 'ytd' ? 'Da inizio anno a oggi' : 'Anno intero'],
    [],
    ['Sintesi', ...anni],
    ['Entrate reali', ...D.map(d => n(d.entrateReali))],
    ['Uscite reali', ...D.map(d => n(d.usciteCons))],
    ['- ordinarie', ...D.map(d => n(d.usciteConsOrd))],
    ['- straordinarie', ...D.map(d => n(d.usciteConsStr))],
    ['Risultato', ...D.map(d => n(d.risultato))],
    ['Cassa a fine periodo', ...D.map(d => n(d.cassaFine))],
    ['Spese a preventivo', ...D.map(d => n(d.preventivo))],
    ['Ancora da consuntivare', ...D.map(d => n(d.daConsuntivare))],
    ['Scostamento consuntivo - preventivo', ...D.map(d => n(d.scostamento))],
    ['Versamenti previsti', ...D.map(d => n(d.entratePreviste))],
    [],
    ['Categoria (' + base + ')', ...anni],
  ];
  const cats = getCategorie();
  const ids = [...new Set(D.flatMap(d => d.spese.map(s => s.categoria || 'altro')))];
  ids.forEach(id => {
    const lbl = (cats.find(c => c.id === id) || { label: id }).label;
    righe.push([lbl, ...D.map(d => n(d.spese.filter(s => (s.categoria || 'altro') === id).reduce((a, s) => a + importoBase(s, base), 0)))]);
  });
  scaricaCSV('confronto-anni-' + anni.join('-') + (periodo === 'ytd' ? '-ytd' : '') + '.csv', righe);
}
