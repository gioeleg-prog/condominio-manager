// Rendiconto annuale in PDF (pulsante "📄 Rendiconto PDF" nel Bilancio).
// Sintetico: riepilogo finanziario, spese per categoria divise tra ordinarie e
// straordinarie, riparto per condomino, nota dell'amministratore. Dettagliato:
// in più il registro di tutte le spese e di tutti i versamenti. Per un anno
// futuro diventa il bilancio preventivo (importi a preventivo).
// La struttura segue i contenuti del rendiconto condominiale (art. 1130-bis c.c.):
// riepilogo finanziario, registro di contabilità, nota sintetica esplicativa.
// Il PDF si crea nel browser con jsPDF (js/vendor/), caricato solo quando serve.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

const RENDICONTO_LIBRERIE = ['js/vendor/jspdf-4.2.1.umd.min.js', 'js/vendor/jspdf-autotable-5.0.8.min.js'];

// Numeri del documento per un anno (funzione pura sullo stato: la usano anche i test).
function datiRendiconto(anno) {
  const oggi = new Date();
  const annoOggi = oggi.getFullYear();
  const preventivo = anno > annoOggi; // anno non ancora iniziato: bilancio preventivo
  const inCorso = anno === annoOggi;
  const num = (v) => parseFloat(v) || 0;
  const edOk = (r) => !r.edificioId || r.edificioId === state.edificioAttivo; // come il riporto di cassa
  const spese = state.spese.filter(s => edOk(s) && annoDi(s.data) === anno).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const entrate = state.entrate.filter(e => edOk(e) && annoDi(e.data) === anno).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const str = (s) => s.tipoSpesa === 'straordinaria';
  // Importo che conta: il consuntivo per un rendiconto, il preventivo per un preventivo.
  const importo = (s) => preventivo ? num(s.preventivo) : num(s.consuntivo);
  const versamenti = entrate.filter(e => !e.previsionale);
  const previsti = entrate.filter(e => e.previsionale);
  const chiuse = spese.filter(s => num(s.consuntivo) > 0);
  const d = {
    anno, preventivo, inCorso,
    alGiorno: inCorso ? ymdLocale(oggi) : null,
    riporto: preventivo ? getSaldoStimatoInizioAnno(anno).stimato : getSaldoRiporto(anno),
    entrate: versamenti.reduce((a, e) => a + num(e.importo), 0),
    entratePreviste: previsti.reduce((a, e) => a + num(e.importo), 0),
    uscite: spese.reduce((a, s) => a + importo(s), 0),
    usciteOrd: spese.filter(s => !str(s)).reduce((a, s) => a + importo(s), 0),
    usciteStr: spese.filter(str).reduce((a, s) => a + importo(s), 0),
    preventivoTot: spese.reduce((a, s) => a + num(s.preventivo), 0),
    daConsuntivare: spese.filter(s => !(num(s.consuntivo) > 0)).reduce((a, s) => a + num(s.preventivo), 0),
    chiusePrev: chiuse.filter(s => num(s.preventivo) > 0).reduce((a, s) => a + num(s.preventivo), 0),
    chiuseCons: chiuse.filter(s => num(s.preventivo) > 0).reduce((a, s) => a + num(s.consuntivo), 0),
  };
  d.cassaFine = d.riporto + (preventivo ? d.entratePreviste : d.entrate) - d.uscite;
  // Spese per tipo e categoria.
  const cats = getCategorie();
  const gruppi = {};
  spese.forEach(s => {
    const tipo = str(s) ? 'straordinaria' : 'ordinaria';
    const k = tipo + '|' + (s.categoria || 'altro');
    const cat = cats.find(c => c.id === s.categoria) || { label: s.categoria || 'Altro' };
    gruppi[k] = gruppi[k] || { tipo, categoria: cat.label, n: 0, preventivo: 0, consuntivo: 0 };
    gruppi[k].n++; gruppi[k].preventivo += num(s.preventivo); gruppi[k].consuntivo += num(s.consuntivo);
  });
  d.categorie = Object.values(gruppi).sort((a, b) => (a.tipo === b.tipo ? (preventivo ? b.preventivo - a.preventivo : b.consuntivo - a.consuntivo) : a.tipo === 'ordinaria' ? -1 : 1));
  // Riparto per condomino: attivi, più gli archiviati con movimenti nell'anno.
  const condEd = state.condomini.filter(c => c.edificioId === state.edificioAttivo && !c.superAdmin);
  const nAttivi = condEd.filter(c => !c.disabled).length || 1;
  d.riparto = condEd
    // Chi ha fatto parte del condominio nell'anno (anche se poi è uscito per un subentro), o vi ha movimenti.
    .filter(c => attivoNellAnno(c, anno) || entrate.some(e => e.condominoId === c.id) || spese.some(s => s.split?.some(x => x.id === c.id && (x.perc || 0) > 0)))
    .map(c => {
      const ord = spese.filter(s => !str(s)).reduce((a, s) => a + quotaSuSpesa(s, c.id, importo(s), nAttivi), 0);
      const stra = spese.filter(str).reduce((a, s) => a + quotaSuSpesa(s, c.id, importo(s), nAttivi), 0);
      const versato = (preventivo ? previsti : versamenti).filter(e => e.condominoId === c.id).reduce((a, e) => a + num(e.importo), 0);
      const riporto = riportoCondomino(c.id, (dt) => annoDi(dt) < anno, nAttivi);
      return { nome: c.nome, appartamento: c.appartamento || '', archiviato: !!c.disabled, riporto, ord, str: stra, dovuto: ord + stra, versato, saldo: riporto + versato - ord - stra };
    })
    .sort((a, b) => String(a.appartamento).localeCompare(String(b.appartamento), 'it', { numeric: true }) || a.nome.localeCompare(b.nome));
  // Registri per il dettaglio.
  const nomeCond = (id) => (state.condomini.find(c => c.id === id) || {}).nome || '—';
  const nomeForn = (id) => (state.fornitori.find(f => f.id === id) || {}).nome || '';
  d.registroSpese = spese.map(s => ({
    data: s.data, titolo: s.titolo || '', descrizione: s.descrizione || '',
    categoria: (cats.find(c => c.id === s.categoria) || { label: s.categoria || '' }).label,
    fornitore: nomeForn(s.fornitoreId), tipo: str(s) ? 'Straord.' : 'Ord.',
    preventivo: num(s.preventivo), consuntivo: num(s.consuntivo), allegati: (s.allegati || []).length,
  }));
  d.registroVersamenti = versamenti.map(e => ({ data: e.data, condomino: nomeCond(e.condominoId), descrizione: e.descrizione || '', importo: num(e.importo) }));
  d.registroPrevisti = previsti.map(e => ({ data: e.data, condomino: nomeCond(e.condominoId), descrizione: e.descrizione || '', importo: num(e.importo) }));
  return d;
}

// € 1.234,56 sempre con il punto delle migliaia (il formato di Intl in italiano lo toglie sotto 10.000).
function euroPdf(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const [i, dec] = Math.abs(v).toFixed(2).split('.');
  return (v < 0 ? '-' : '') + '€ ' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}
function dataPdf(s) {
  return s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
}

function caricaLibrerieRendiconto() {
  if (window.jspdf?.jsPDF && window.autoTable) return Promise.resolve();
  return RENDICONTO_LIBRERIE.reduce((p, src) => p.then(() => new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => ko(new Error('Impossibile caricare ' + src + ': controlla la connessione e riprova.'));
    document.head.appendChild(s);
  })), Promise.resolve());
}

// ── Scheda di scelta ─────────────────────────────────────────────────────
function renderModalRendiconto(d) {
  const annoOggi = new Date().getFullYear();
  const anni = getAnni().filter(a => a <= annoOggi + 1);
  const anno = d?.anno || state.filterAnno || annoOggi;
  const tipo = d?.tipo || 'sintetico';
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <h2>📄 Rendiconto in PDF</h2>
        <button class="modal-close" id="modal-close" aria-label="Chiudi">✕</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label for="rend-anno">Esercizio</label>
          <select id="rend-anno">
            ${anni.map(a => `<option value="${a}" ${a === anno ? 'selected' : ''}>${a}${a > annoOggi ? ' (preventivo)' : a === annoOggi ? ' (in corso)' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Tipo di documento</label>
          <div class="rend-scelte" role="radiogroup" aria-label="Tipo di documento">
            <label class="rend-scelta"><input type="radio" name="rend-tipo" value="sintetico" ${tipo === 'sintetico' ? 'checked' : ''}>
              <span><b>Sintetico</b> · 2–3 pagine<br><small>Riepilogo della cassa, spese per categoria divise tra ordinarie e straordinarie, riparto per condomino.</small></span></label>
            <label class="rend-scelta"><input type="radio" name="rend-tipo" value="dettagliato" ${tipo === 'dettagliato' ? 'checked' : ''}>
              <span><b>Dettagliato</b><br><small>Il sintetico più il registro di tutte le spese (data, fornitore, preventivo, consuntivo) e di tutti i versamenti.</small></span></label>
          </div>
        </div>
        <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;margin-bottom:1rem;cursor:pointer">
          <input type="checkbox" id="rend-riparto" ${d?.riparto === false ? '' : 'checked'} style="width:16px;height:16px;margin-top:2px">
          <span>Includi il riparto per condomino (quota, versato e saldo di ciascuno). Toglilo se il documento va a persone esterne.</span>
        </label>
        <div class="field">
          <label for="rend-note">Nota dell'amministratore (facoltativa)</label>
          <textarea id="rend-note" rows="4" placeholder="Es. lavori in corso, questioni aperte, decisioni da prendere in assemblea, spese importanti dell'anno…">${esc(d?.note || '')}</textarea>
          <p class="hint">Compare in fondo al documento, prima della firma.</p>
        </div>
        <div id="rend-err" class="alert alert-warning" style="display:none;font-size:13px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        ${canUserAdmin(state.user) ? '<button class="btn btn-secondary" id="btn-rend-email" title="Apre la lista dei condomini: scegli a chi inviare, niente parte subito">📧 Scegli a chi inviare</button>' : ''}
        <button class="btn btn-primary" id="btn-rend-genera">📄 Scarica PDF</button>
      </div>
    </div>
  </div>`;
}

function bindSchedaRendiconto() {
  const b = document.getElementById('btn-rend-genera');
  if (!b || state.modal?.type !== 'rendiconto') return;
  const be = document.getElementById('btn-rend-email');
  if (be) be.onclick = () => setState({ modal: { type: 'emailRendiconto', data: {
    anno: parseInt(document.getElementById('rend-anno').value, 10),
    tipo: document.querySelector('input[name="rend-tipo"]:checked')?.value || 'sintetico',
    riparto: document.getElementById('rend-riparto').checked,
    note: document.getElementById('rend-note').value.trim(),
  } } });
  b.onclick = async () => {
    const opts = {
      anno: parseInt(document.getElementById('rend-anno').value, 10),
      tipo: document.querySelector('input[name="rend-tipo"]:checked')?.value || 'sintetico',
      riparto: document.getElementById('rend-riparto').checked,
      note: document.getElementById('rend-note').value.trim(),
    };
    const err = document.getElementById('rend-err');
    b.disabled = true; b.textContent = '⏳ Preparazione…';
    try {
      await caricaLibrerieRendiconto();
      generaRendicontoPDF(opts);
      setState({ modal: null });
    } catch (e) {
      reportClientError('Rendiconto PDF: ' + (e.message || e), e.stack);
      if (err) { err.textContent = 'Il PDF non è stato creato: ' + (e.message || e); err.style.display = 'block'; }
      b.disabled = false; b.textContent = '📄 Scarica PDF';
    }
  };
}

// ── Documento ────────────────────────────────────────────────────────────
// conFile: invece di scaricare, restituisce { nome, base64 } da allegare a un'email (js/sezioni/email.js).
function generaRendicontoPDF(opts, conFile = false) {
  const d = datiRendiconto(opts.anno);
  const dettagliato = opts.tipo === 'dettagliato';
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const tab = (o) => window.autoTable(doc, o);
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 15;
  const BLU = [29, 78, 216], INK = [27, 42, 74], GRIGIO = [90, 110, 138], RIGA = [238, 242, 247];
  const ed = state.edifici.find(e => e.id === state.edificioAttivo) || {};
  const nomeDoc = d.preventivo ? 'Bilancio preventivo' : 'Rendiconto della gestione';
  let y = M;

  // Intestazione
  doc.setTextColor(...BLU).setFont('helvetica', 'bold').setFontSize(9);
  doc.text((nomeDoc + ' · ' + (dettagliato ? 'dettagliato' : 'sintetico')).toUpperCase(), M, y + 4);
  doc.setTextColor(...INK).setFontSize(20);
  doc.text(ed.nome || nomeEdificioAttivo() || 'Condominio', M, y + 14);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...GRIGIO);
  if (ed.indirizzo) doc.text(ed.indirizzo, M, y + 20);
  const periodo = d.preventivo ? `Esercizio ${d.anno}: 1 gennaio – 31 dicembre ${d.anno} (importi a preventivo)`
    : d.inCorso ? `Esercizio ${d.anno}: situazione al ${dataPdf(d.alGiorno)} (esercizio in corso)`
    : `Esercizio ${d.anno}: 1 gennaio – 31 dicembre ${d.anno}`;
  doc.setTextColor(...INK).text(periodo, M, y + 27);
  doc.setTextColor(...GRIGIO).text(`Redatto il ${dataPdf(ymdLocale(new Date()))} da ${state.user?.nome || 'l\'amministratore'}`, M, y + 32);
  doc.setDrawColor(...BLU).setLineWidth(0.6).line(M, y + 36, W - M, y + 36);
  y += 44;

  const titolo = (t, sotto) => {
    // Una sezione non comincia in fondo alla pagina: titolo e prime righe della tabella stanno insieme.
    if (y > H - 60) { doc.addPage(); y = M + 4; }
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...BLU).text(t, M, y);
    y += 2;
    if (sotto) { doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...GRIGIO).text(doc.splitTextToSize(sotto, W - 2 * M), M, y + 4); y += 4 + 3.6 * doc.splitTextToSize(sotto, W - 2 * M).length; }
    y += 2;
  };
  const stile = {
    margin: { left: M, right: M, bottom: 18 },
    styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: 1.8, lineColor: [216, 226, 238], lineWidth: 0.1 },
    headStyles: { fillColor: RIGA, textColor: GRIGIO, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    footStyles: { fillColor: [255, 255, 255], textColor: INK, fontStyle: 'bold' },
    showHead: 'everyPage', showFoot: 'lastPage', // totale solo alla fine della tabella
    rowPageBreak: 'avoid',                        // una riga (es. un condomino) non si spezza tra due pagine
  };
  const dopo = () => { y = doc.lastAutoTable.finalY + 8; };
  const num = { halign: 'right' };

  // 1. Riepilogo finanziario
  titolo('1. Riepilogo finanziario', d.preventivo
    ? 'Previsione della cassa per l\'esercizio: si parte dal saldo stimato a inizio anno (cassa di oggi, meno le spese ancora da pagare, più i versamenti previsti prima di allora).'
    : 'Movimenti di cassa effettivi dell\'esercizio: versamenti ricevuti e spese consuntivate.');
  const righeRiep = d.preventivo ? [
    ['Saldo stimato a inizio esercizio', euroPdf(d.riporto)],
    ['+ Versamenti previsti (rate)', euroPdf(d.entratePreviste)],
    ['- Spese previste', euroPdf(d.uscite)],
    ['   di cui ordinarie', euroPdf(d.usciteOrd)],
    ['   di cui straordinarie', euroPdf(d.usciteStr)],
  ] : [
    ['Cassa a inizio esercizio (riporto dagli anni precedenti)', euroPdf(d.riporto)],
    ['+ Versamenti ricevuti dai condomini', euroPdf(d.entrate)],
    ['- Spese pagate (consuntivo)', euroPdf(d.uscite)],
    ['   di cui ordinarie', euroPdf(d.usciteOrd)],
    ['   di cui straordinarie', euroPdf(d.usciteStr)],
  ];
  tab({ ...stile, startY: y, head: [['Voce', 'Importo']], body: righeRiep,
    foot: [[d.preventivo ? 'Saldo previsto a fine esercizio' : d.inCorso ? `Cassa al ${dataPdf(d.alGiorno)}` : 'Cassa a fine esercizio', euroPdf(d.cassaFine)]],
    columnStyles: { 1: { ...num, cellWidth: 40 } }, footStyles: { ...stile.footStyles, halign: 'left' },
    didParseCell: (h) => { if (h.section === 'foot' && h.column.index === 1) h.cell.styles.halign = 'right'; if (h.section === 'body' && String(h.cell.raw).startsWith('   ')) h.cell.styles.textColor = GRIGIO; },
  });
  dopo();
  if (!d.preventivo) {
    tab({ ...stile, startY: y, head: [['Confronto con il preventivo', 'Importo']], body: [
      ['Spese a preventivo dell\'esercizio', euroPdf(d.preventivoTot)],
      ['Spese consuntivate che avevano un preventivo: preventivo / consuntivo', euroPdf(d.chiusePrev) + ' / ' + euroPdf(d.chiuseCons)],
      ['Scostamento (positivo = speso più del previsto)', (d.chiuseCons - d.chiusePrev > 0 ? '+' : '') + euroPdf(d.chiuseCons - d.chiusePrev)],
      ['Spese ancora da consuntivare (preventivo)', euroPdf(d.daConsuntivare)],
      ['Versamenti previsti non ancora incassati', euroPdf(d.entratePreviste)],
    ], columnStyles: { 1: { ...num, cellWidth: 62 } } });
    dopo();
  }

  // 2. Spese per categoria
  titolo('2. Spese per categoria', d.preventivo ? 'Importi a preventivo, divisi tra spese ordinarie e straordinarie.' : 'Preventivo e consuntivo per categoria, divisi tra spese ordinarie e straordinarie. Lo scostamento considera le spese già consuntivate.');
  const righeCat = [];
  ['ordinaria', 'straordinaria'].forEach(tipo => {
    const g = d.categorie.filter(c => c.tipo === tipo);
    if (!g.length) return;
    righeCat.push([{ content: tipo === 'ordinaria' ? 'Spese ordinarie' : 'Spese straordinarie', colSpan: d.preventivo ? 3 : 5, styles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: BLU } }]);
    g.forEach(c => righeCat.push(d.preventivo ? [c.categoria, String(c.n), euroPdf(c.preventivo)] : [c.categoria, String(c.n), euroPdf(c.preventivo), euroPdf(c.consuntivo), c.consuntivo ? euroPdf(c.consuntivo - c.preventivo) : '—']));
    const tp = g.reduce((a, c) => a + c.preventivo, 0), tc = g.reduce((a, c) => a + c.consuntivo, 0);
    righeCat.push((d.preventivo ? ['Totale ' + (tipo === 'ordinaria' ? 'ordinarie' : 'straordinarie'), '', euroPdf(tp)] : ['Totale ' + (tipo === 'ordinaria' ? 'ordinarie' : 'straordinarie'), '', euroPdf(tp), euroPdf(tc), '']).map(v => ({ content: v, styles: { fontStyle: 'bold' } })));
  });
  if (righeCat.length) {
    tab({ ...stile, startY: y, head: [d.preventivo ? ['Categoria', 'N.', 'Preventivo'] : ['Categoria', 'N.', 'Preventivo', 'Consuntivo', 'Scostamento']], body: righeCat,
      foot: [d.preventivo ? ['Totale spese', '', euroPdf(d.preventivoTot)] : ['Totale spese', '', euroPdf(d.preventivoTot), euroPdf(d.uscite), '']],
      columnStyles: { 1: { halign: 'center', cellWidth: 12 }, 2: { ...num, cellWidth: 30 }, 3: { ...num, cellWidth: 30 }, 4: { ...num, cellWidth: 28 } },
      didParseCell: (h) => { if (h.section === 'foot' && h.column.index >= 2) h.cell.styles.halign = 'right'; },
    });
    dopo();
  } else {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GRIGIO).text('Nessuna spesa registrata nell\'esercizio.', M, y + 2); y += 10;
  }

  // 3. Riparto per condomino
  if (opts.riparto && d.riparto.length) {
    titolo('3. Riparto per condomino', d.preventivo
      ? 'Quota di ciascuno sulle spese previste e rate già pianificate. Riporto = situazione reale di ciascuno a oggi. Saldo = riporto + rate - quota prevista.'
      : 'Quota di ciascuno sulle spese consuntivate, secondo la ripartizione di ogni spesa. Saldo = riporto dagli anni precedenti + versato - quota; negativo = da versare.');
    const tot = (k) => d.riparto.reduce((a, r) => a + r[k], 0);
    tab({ ...stile, startY: y,
      head: [['Condomino', 'Riporto', 'Quota ord.', 'Quota straord.', 'Totale quota', d.preventivo ? 'Rate previste' : 'Versato', 'Saldo']],
      body: d.riparto.map(r => [r.nome + (r.appartamento ? '\n' + r.appartamento : '') + (r.archiviato ? ' · non più attivo' : ''), euroPdf(r.riporto), euroPdf(r.ord), euroPdf(r.str), euroPdf(r.dovuto), euroPdf(r.versato), euroPdf(r.saldo)]),
      foot: [['Totale', euroPdf(tot('riporto')), euroPdf(tot('ord')), euroPdf(tot('str')), euroPdf(tot('dovuto')), euroPdf(tot('versato')), euroPdf(tot('saldo'))]],
      styles: { ...stile.styles, fontSize: 8 },
      columnStyles: { 0: { cellWidth: 44 }, 1: num, 2: num, 3: num, 4: num, 5: num, 6: { ...num, fontStyle: 'bold' } },
      didParseCell: (h) => {
        if (h.section === 'foot' && h.column.index >= 1) h.cell.styles.halign = 'right';
        if (h.section === 'body' && h.column.index === 6) { const v = d.riparto[h.row.index]?.saldo || 0; h.cell.styles.textColor = v < -0.005 ? [185, 28, 28] : v > 0.005 ? [22, 101, 52] : INK; }
      },
    });
    dopo();
  }

  // 4–5. Registri (solo dettagliato)
  let n = opts.riparto && d.riparto.length ? 4 : 3;
  if (dettagliato) {
    titolo(`${n++}. Registro delle spese`, `${d.registroSpese.length} movimenti in ordine di data.` + (d.preventivo ? '' : ' Consuntivo "—" = spesa non ancora consuntivata.'));
    tab({ ...stile, startY: y,
      head: [['Data', 'Spesa', 'Categoria', 'Fornitore', 'Tipo', 'Preventivo', 'Consuntivo']],
      body: d.registroSpese.map(s => [dataPdf(s.data), s.titolo + (s.descrizione ? '\n' + s.descrizione : '') + (s.allegati ? `\n${s.allegati} allegat${s.allegati === 1 ? 'o' : 'i'}` : ''), s.categoria, s.fornitore, s.tipo, s.preventivo ? euroPdf(s.preventivo) : '—', s.consuntivo ? euroPdf(s.consuntivo) : '—']),
      foot: [['', 'Totale', '', '', '', euroPdf(d.preventivoTot), euroPdf(d.registroSpese.reduce((a, s) => a + s.consuntivo, 0))]],
      styles: { ...stile.styles, fontSize: 7.8 },
      columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 52 }, 2: { cellWidth: 28 }, 3: { cellWidth: 26 }, 4: { cellWidth: 14 }, 5: num, 6: num },
      didParseCell: (h) => { if (h.section === 'foot' && h.column.index >= 5) h.cell.styles.halign = 'right'; },
    });
    dopo();
    const regV = d.preventivo ? d.registroPrevisti : d.registroVersamenti;
    titolo(`${n++}. Registro dei ${d.preventivo ? 'versamenti previsti' : 'versamenti'}`, `${regV.length} movimenti in ordine di data.`);
    tab({ ...stile, startY: y, head: [['Data', 'Condomino', 'Descrizione', 'Importo']],
      body: regV.map(e => [dataPdf(e.data), e.condomino, e.descrizione, euroPdf(e.importo)]),
      foot: [['', 'Totale', '', euroPdf(regV.reduce((a, e) => a + e.importo, 0))]],
      columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 48 }, 3: { ...num, cellWidth: 30 } },
      didParseCell: (h) => { if (h.section === 'foot' && h.column.index === 3) h.cell.styles.halign = 'right'; },
    });
    dopo();
    if (!d.preventivo && d.registroPrevisti.length) {
      titolo(`${n++}. Versamenti previsti non ancora incassati`, 'Rate pianificate: non entrano nella cassa finché non vengono validate.');
      tab({ ...stile, startY: y, head: [['Data prevista', 'Condomino', 'Descrizione', 'Importo']],
        body: d.registroPrevisti.map(e => [dataPdf(e.data), e.condomino, e.descrizione, euroPdf(e.importo)]),
        columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 48 }, 3: { ...num, cellWidth: 30 } } });
      dopo();
    }
  }

  // Nota dell'amministratore e firma
  if (opts.note) {
    titolo(`${n++}. Nota dell'amministratore`);
    const righe = doc.splitTextToSize(opts.note, W - 2 * M);
    righe.forEach(r => { if (y > H - 22) { doc.addPage(); y = M + 4; } doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...INK).text(r, M, y + 2); y += 4.8; });
    y += 6;
  }
  if (y > H - 40) { doc.addPage(); y = M + 10; }
  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...INK);
  doc.text('L\'amministratore', W - M - 70, y + 6);
  doc.setDrawColor(...GRIGIO).setLineWidth(0.2).line(W - M - 70, y + 20, W - M, y + 20);
  doc.setFontSize(8.5).setTextColor(...GRIGIO).text(state.user?.nome || '', W - M - 70, y + 25);

  // Piè di pagina su ogni pagina
  const pagine = doc.getNumberOfPages();
  for (let i = 1; i <= pagine; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIGIO);
    doc.text(`${nomeDoc} ${d.anno} · ${ed.nome || ''}`, M, H - 8);
    doc.text(`Pagina ${i} di ${pagine}`, W - M, H - 8, { align: 'right' });
  }
  const pulito = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const nomeFile = `${d.preventivo ? 'Preventivo' : 'Rendiconto'}_${d.anno}_${pulito(ed.nome)}_${dettagliato ? 'dettagliato' : 'sintetico'}.pdf`;
  if (conFile) return { nome: nomeFile, base64: doc.output('datauristring').split(',')[1] };
  doc.save(nomeFile);
}

// ===========================================================================
// ESTRATTO CONTO DEL SINGOLO CONDOMINO
// ===========================================================================
// Come l'estratto della banca: saldo iniziale (riporto), quote delle spese
// consuntivate (addebiti), versamenti (accrediti), saldo progressivo; poi le
// prossime scadenze (quote sulle spese ancora da consuntivare e rate previste).
// Il saldo finale coincide con quello del riparto nel rendiconto dello stesso anno.

function datiEstratto(condId, anno) {
  const oggi = new Date();
  const preventivo = anno > oggi.getFullYear();
  const num = (v) => parseFloat(v) || 0;
  const edOk = (r) => !r.edificioId || r.edificioId === state.edificioAttivo;
  const cond = state.condomini.find(c => c.id === condId) || { id: condId, nome: '—' };
  const nAttivi = state.condomini.filter(c => c.edificioId === state.edificioAttivo && !c.disabled && !c.superAdmin).length || 1;
  const cats = getCategorie();
  const catLabel = (id) => (cats.find(c => c.id === id) || { label: id || '' }).label;
  const spese = state.spese.filter(s => edOk(s) && annoDi(s.data) === anno);
  const entrate = state.entrate.filter(e => edOk(e) && annoDi(e.data) === anno && e.condominoId === condId);
  const riporto = riportoCondomino(condId, (d) => annoDi(d) < anno, nAttivi);
  const movimenti = [];
  spese.filter(s => num(s.consuntivo) > 0).forEach(s => {
    const quota = quotaSuSpesa(s, condId, num(s.consuntivo), nAttivi);
    if (quota <= 0.004) return;
    const perc = (Math.round(quota / num(s.consuntivo) * 10000) / 100).toString().replace('.', ',');
    movimenti.push({ data: s.data, tipo: 'quota', descrizione: s.titolo || 'Spesa',
      dettaglio: catLabel(s.categoria) + ' · ' + (s.tipoSpesa === 'straordinaria' ? 'straordinaria' : 'ordinaria') + ' · spesa ' + euroPdf(num(s.consuntivo)) + ' · tua quota ' + perc + '%',
      straordinaria: s.tipoSpesa === 'straordinaria', addebito: quota, accredito: 0 });
  });
  entrate.filter(e => !e.previsionale).forEach(e => movimenti.push({ data: e.data, tipo: 'versamento',
    descrizione: 'Versamento' + (e.descrizione ? ': ' + e.descrizione : ''), dettaglio: '', addebito: 0, accredito: num(e.importo) }));
  // In ordine di data; nello stesso giorno prima i versamenti.
  movimenti.sort((a, b) => String(a.data).localeCompare(String(b.data)) || (a.tipo === 'versamento' ? -1 : 1));
  let saldo = riporto;
  movimenti.forEach(m => { saldo += m.accredito - m.addebito; m.saldo = saldo; });
  const daConsuntivare = spese.filter(s => !(num(s.consuntivo) > 0) && num(s.preventivo) > 0)
    .map(s => ({ data: s.data, descrizione: s.titolo || 'Spesa', categoria: catLabel(s.categoria), quota: quotaSuSpesa(s, condId, num(s.preventivo), nAttivi) }))
    .filter(x => x.quota > 0.004).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const rate = entrate.filter(e => e.previsionale).map(e => ({ data: e.data, descrizione: e.descrizione || 'Rata prevista', importo: num(e.importo) }))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const quoteOrd = movimenti.filter(m => m.tipo === 'quota' && !m.straordinaria).reduce((a, m) => a + m.addebito, 0);
  const quoteStr = movimenti.filter(m => m.tipo === 'quota' && m.straordinaria).reduce((a, m) => a + m.addebito, 0);
  const versato = movimenti.reduce((a, m) => a + m.accredito, 0);
  return {
    anno, preventivo, inCorso: anno === oggi.getFullYear(), alGiorno: ymdLocale(oggi),
    condomino: { id: cond.id, nome: cond.nome, appartamento: cond.appartamento || '' },
    riporto, quoteOrd, quoteStr, versato, saldo: riporto + versato - quoteOrd - quoteStr,
    movimenti, daConsuntivare, rate,
    quotaPrevista: daConsuntivare.reduce((a, x) => a + x.quota, 0), ratePreviste: rate.reduce((a, r) => a + r.importo, 0),
  };
}

// Pulsanti "📄 Estratto conto" (Bilancio, Condomini, Dashboard): aprono la scheda.
function bindPulsantiEstratto() {
  document.querySelectorAll('[data-estratto-cond]').forEach(b => {
    b.onclick = () => setState({ modal: { type: 'estratto', data: { condId: Number(b.dataset.estrattoCond), anno: state.filterAnno || new Date().getFullYear() } } });
  });
}

function renderModalEstratto(d) {
  const annoOggi = new Date().getFullYear();
  const anni = getAnni().filter(a => a <= annoOggi + 1);
  const anno = d?.anno || annoOggi;
  // Chi gestisce sceglie qualunque condomino dell'edificio; un condomino vede solo il proprio.
  const puoScegliere = canUserEdit(state.user);
  const condEd = state.condomini.filter(c => c.edificioId === state.edificioAttivo && !c.superAdmin)
    .sort((a, b) => String(a.appartamento || '').localeCompare(String(b.appartamento || ''), 'it', { numeric: true }));
  const scelto = puoScegliere ? (d?.condId || condEd[0]?.id) : state.user.id;
  const elenco = puoScegliere ? condEd : condEd.filter(c => c.id === scelto);
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <h2>📄 Estratto conto</h2>
        <button class="modal-close" id="modal-close" aria-label="Chiudi">✕</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label for="estr-cond">Condomino</label>
          <select id="estr-cond" ${puoScegliere ? '' : 'disabled'}>
            ${elenco.map(c => `<option value="${c.id}" ${c.id === scelto ? 'selected' : ''}>${esc(c.nome)}${c.appartamento ? ' · ' + esc(c.appartamento) : ''}${c.disabled ? ' (non più attivo)' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="estr-anno">Anno</label>
          <select id="estr-anno">
            ${anni.map(a => `<option value="${a}" ${a === anno ? 'selected' : ''}>${a}${a > annoOggi ? ' (previsioni)' : a === annoOggi ? ' (in corso)' : ''}</option>`).join('')}
          </select>
        </div>
        <p class="hint">Saldo iniziale, quote delle spese e versamenti in ordine di data con il saldo progressivo, poi le prossime scadenze.</p>
        <div id="estr-err" class="alert alert-warning" style="display:none;font-size:13px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        ${canUserAdmin(state.user) ? '<button class="btn btn-secondary" id="btn-estr-email" title="Apre la lista dei condomini: scegli a chi inviare, niente parte subito">📧 Scegli a chi inviare</button>' : ''}
        <button class="btn btn-primary" id="btn-estr-genera">📄 Scarica PDF</button>
      </div>
    </div>
  </div>`;
}

function bindSchedaEstratto() {
  const b = document.getElementById('btn-estr-genera');
  if (!b || state.modal?.type !== 'estratto') return;
  const be = document.getElementById('btn-estr-email');
  if (be) be.onclick = () => setState({ modal: { type: 'emailEstratti', data: {
    anno: parseInt(document.getElementById('estr-anno').value, 10),
    condId: Number(document.getElementById('estr-cond').value),
  } } });
  b.onclick = async () => {
    const condId = canUserEdit(state.user) ? Number(document.getElementById('estr-cond').value) : state.user.id;
    const anno = parseInt(document.getElementById('estr-anno').value, 10);
    const err = document.getElementById('estr-err');
    b.disabled = true; b.textContent = '⏳ Preparazione…';
    try {
      await caricaLibrerieRendiconto();
      generaEstrattoPDF(condId, anno);
      setState({ modal: null });
    } catch (e) {
      reportClientError('Estratto conto PDF: ' + (e.message || e), e.stack);
      if (err) { err.textContent = 'Il PDF non è stato creato: ' + (e.message || e); err.style.display = 'block'; }
      b.disabled = false; b.textContent = '📄 Scarica PDF';
    }
  };
}

function generaEstrattoPDF(condId, anno, conFile = false) {
  const d = datiEstratto(condId, anno);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const tab = (o) => window.autoTable(doc, o);
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 15;
  const BLU = [29, 78, 216], INK = [27, 42, 74], GRIGIO = [90, 110, 138], RIGA = [238, 242, 247], ROSSO = [185, 28, 28], VERDE = [22, 101, 52];
  const ed = state.edifici.find(e => e.id === state.edificioAttivo) || {};
  let y = M;
  doc.setTextColor(...BLU).setFont('helvetica', 'bold').setFontSize(9).text('ESTRATTO CONTO DEL CONDOMINO', M, y + 4);
  doc.setTextColor(...INK).setFontSize(18).text(d.condomino.nome, M, y + 13);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...GRIGIO);
  doc.text([d.condomino.appartamento, ed.nome, ed.indirizzo].filter(Boolean).join(' · '), M, y + 19);
  const periodo = d.preventivo ? `Anno ${d.anno}: previsioni (l'anno non è ancora iniziato)`
    : d.inCorso ? `Anno ${d.anno}: movimenti fino al ${dataPdf(d.alGiorno)}` : `Anno ${d.anno}: 1 gennaio – 31 dicembre ${d.anno}`;
  doc.setTextColor(...INK).text(periodo, M, y + 26);
  doc.setTextColor(...GRIGIO).text(`Emesso il ${dataPdf(d.alGiorno)}`, M, y + 31);
  doc.setDrawColor(...BLU).setLineWidth(0.6).line(M, y + 35, W - M, y + 35);
  y += 43;
  const stile = {
    margin: { left: M, right: M, bottom: 18 },
    styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: 1.8, lineColor: [216, 226, 238], lineWidth: 0.1 },
    headStyles: { fillColor: RIGA, textColor: GRIGIO, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    footStyles: { fillColor: [255, 255, 255], textColor: INK, fontStyle: 'bold' },
    showHead: 'everyPage', showFoot: 'lastPage', rowPageBreak: 'avoid',
  };
  const titolo = (t, sotto) => {
    if (y > H - 60) { doc.addPage(); y = M + 4; }
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...BLU).text(t, M, y); y += 2;
    if (sotto) { const r = doc.splitTextToSize(sotto, W - 2 * M); doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...GRIGIO).text(r, M, y + 4); y += 4 + 3.6 * r.length; }
    y += 2;
  };
  const dopo = () => { y = doc.lastAutoTable.finalY + 8; };
  const num = { halign: 'right' };
  const colSaldo = (v) => (v < -0.005 ? ROSSO : v > 0.005 ? VERDE : INK);
  const segno = (v) => (v > 0.005 ? 'a credito' : v < -0.005 ? 'da versare' : 'in pari');

  // Riepilogo
  titolo('Riepilogo', 'Saldo positivo = a credito, negativo = da versare.');
  const voceSaldo = (d.inCorso ? `Saldo al ${dataPdf(d.alGiorno)}` : d.preventivo ? 'Saldo attuale' : 'Saldo a fine anno') + ' (' + segno(d.saldo) + ')';
  tab({ ...stile, startY: y, head: [['Voce', 'Importo']], body: [
    ['Saldo iniziale (dagli anni precedenti, ' + segno(d.riporto) + ')', euroPdf(d.riporto)],
    ['- Quote delle spese ordinarie', euroPdf(d.quoteOrd)],
    ['- Quote delle spese straordinarie', euroPdf(d.quoteStr)],
    ['+ Versamenti', euroPdf(d.versato)],
  ], foot: [[voceSaldo, euroPdf(d.saldo)]],
  columnStyles: { 1: { ...num, cellWidth: 40 } },
  didParseCell: (h) => { if (h.section === 'foot' && h.column.index === 1) { h.cell.styles.halign = 'right'; h.cell.styles.textColor = colSaldo(d.saldo); } } });
  dopo();

  // Movimenti
  if (!d.preventivo) {
    titolo('Movimenti', `${d.movimenti.length} movimenti in ordine di data. Le quote sono calcolate sulle spese consuntivate, secondo la ripartizione di ciascuna.`);
    tab({ ...stile, startY: y,
      head: [['Data', 'Descrizione', 'Addebito', 'Accredito', 'Saldo']],
      body: [[{ content: 'Saldo iniziale', colSpan: 4, styles: { fontStyle: 'italic', textColor: GRIGIO } }, euroPdf(d.riporto)],
        ...d.movimenti.map(m => [dataPdf(m.data), m.descrizione + (m.dettaglio ? '\n' + m.dettaglio : ''), m.addebito ? euroPdf(m.addebito) : '', m.accredito ? euroPdf(m.accredito) : '', euroPdf(m.saldo)])],
      foot: [['', 'Totali', euroPdf(d.quoteOrd + d.quoteStr), euroPdf(d.versato), euroPdf(d.saldo)]],
      styles: { ...stile.styles, fontSize: 8.3 },
      columnStyles: { 0: { cellWidth: 20 }, 2: { ...num, cellWidth: 26 }, 3: { ...num, cellWidth: 26 }, 4: { ...num, cellWidth: 28, fontStyle: 'bold' } },
      didParseCell: (h) => {
        if (h.section === 'foot' && h.column.index >= 2) h.cell.styles.halign = 'right';
        if (h.section === 'body' && h.column.index === 4) { const v = h.row.index === 0 ? d.riporto : (d.movimenti[h.row.index - 1] || {}).saldo || 0; h.cell.styles.textColor = colSaldo(v); }
      },
    });
    dopo();
  }

  // Prossime scadenze
  if (d.daConsuntivare.length || d.rate.length) {
    titolo(d.preventivo ? 'Previsioni dell\'anno' : 'Prossime scadenze', 'Importi previsti: non sono ancora nel saldo.');
    if (d.daConsuntivare.length) {
      tab({ ...stile, startY: y, head: [['Data', 'Spesa prevista', 'Categoria', 'Tua quota']],
        body: d.daConsuntivare.map(x => [dataPdf(x.data), x.descrizione, x.categoria, euroPdf(x.quota)]),
        foot: [['', 'Totale quote previste', '', euroPdf(d.quotaPrevista)]],
        columnStyles: { 0: { cellWidth: 20 }, 3: { ...num, cellWidth: 30 } },
        didParseCell: (h) => { if (h.section === 'foot' && h.column.index === 3) h.cell.styles.halign = 'right'; } });
      dopo();
    }
    if (d.rate.length) {
      tab({ ...stile, startY: y, head: [['Data', 'Rata pianificata', 'Importo']],
        body: d.rate.map(r => [dataPdf(r.data), r.descrizione, euroPdf(r.importo)]),
        foot: [['', 'Totale rate', euroPdf(d.ratePreviste)]],
        columnStyles: { 0: { cellWidth: 20 }, 2: { ...num, cellWidth: 30 } },
        didParseCell: (h) => { if (h.section === 'foot' && h.column.index === 2) h.cell.styles.halign = 'right'; } });
      dopo();
    }
  }
  if (y > H - 30) { doc.addPage(); y = M + 4; }
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...GRIGIO);
  doc.text(doc.splitTextToSize('Per chiarimenti rivolgiti all\'amministratore del condominio. Le quote seguono la ripartizione salvata su ogni spesa; le spese senza ripartizione sono divise in parti uguali tra i condomini attivi.', W - 2 * M), M, y + 2);
  const pagine = doc.getNumberOfPages();
  for (let i = 1; i <= pagine; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIGIO);
    doc.text(`Estratto conto ${d.anno} · ${d.condomino.nome} · ${ed.nome || ''}`, M, H - 8);
    doc.text(`Pagina ${i} di ${pagine}`, W - M, H - 8, { align: 'right' });
  }
  const pulito = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const nomeFile = `EstrattoConto_${d.anno}_${pulito(d.condomino.nome)}.pdf`;
  if (conFile) return { nome: nomeFile, base64: doc.output('datauristring').split(',')[1] };
  doc.save(nomeFile);
}
