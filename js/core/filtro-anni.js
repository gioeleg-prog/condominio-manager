// Filtro anni a scelta multipla: pulsanti "2025 2026 2027 · Tutti" da accendere
// e spegnere. La selezione delle pagine elenco (Spese, Entrate, Fornitori) è
// state.filterAnni ([] = tutti gli anni); la pagina Confronto anni ha la sua
// (state.confrontoAnni). Dashboard e Bilancio restano su un anno (state.filterAnno),
// tenuto allineato: con più anni scelti vale il più recente, con "Tutti" vale 0.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// Elenco anni pulito: numeri validi, senza doppioni, in ordine crescente.
function normalizzaAnni(arr) {
  return [...new Set((arr || []).map(Number).filter(a => a > 1900 && a < 3000))].sort((a, b) => a - b);
}

// Anni scelti nelle pagine elenco; [] = tutti.
function anniSelezionati() {
  return normalizzaAnni(state.filterAnni);
}

// La data cade in uno degli anni scelti (sempre vero con "Tutti").
function inAnniSelezionati(d, anni = anniSelezionati()) {
  return anni.length === 0 || anni.includes(annoDi(d));
}

// "2026", "2025 + 2026", "2024, 2026, 2027", "tutti gli anni".
function etichettaAnni(anni = anniSelezionati()) {
  if (!anni.length) return 'tutti gli anni';
  if (anni.length <= 3) return anni.join(anni.length === 2 ? ' + ' : ', ');
  return anni[0] + '–' + anni[anni.length - 1] + ' (' + anni.length + ' anni)';
}

// Cambia la selezione; per le pagine elenco aggiorna anche l'anno singolo di Dashboard e Bilancio.
function setFiltroAnni(key, anni) {
  const n = normalizzaAnni(anni);
  if (key === 'filterAnni') setState({ filterAnni: n, filterAnno: n.length ? n[n.length - 1] : 0 });
  else setState({ [key]: n });
}

// Pulsanti degli anni. opts.tutti: mostra "Tutti"; opts.nota: testo dopo i pulsanti.
function renderFiltroAnni(key, anniDisponibili, opts = {}) {
  const sel = normalizzaAnni(state[key]);
  const anni = normalizzaAnni(anniDisponibili);
  const tutti = sel.length === 0;
  const chip = (valore, testo, attivo) => `<button type="button" class="chip-anno${attivo ? ' attivo' : ''}" data-anni-key="${key}" data-anno="${valore}" data-focus-key="anni-${key}-${valore}" aria-pressed="${attivo ? 'true' : 'false'}"><span class="chip-anno-spunta" aria-hidden="true">${attivo ? '✓' : ''}</span>${testo}</button>`;
  return `<div class="filtro-anni" role="group" aria-label="${opts.etichetta || 'Anni da visualizzare'}">
    <span class="filtro-anni-lbl" aria-hidden="true">${opts.etichetta || 'Anni'}</span>
    ${anni.map(a => chip(a, a, !tutti && sel.includes(a))).join('')}
    ${opts.tutti !== false ? chip('tutti', 'Tutti', tutti) : ''}
    ${opts.nota ? `<span class="filtro-anni-nota">${opts.nota}</span>` : ''}
  </div>`;
}

// Un solo gestore per tutti i pulsanti anno (collegato una volta su document).
function bindFiltroAnni() {
  if (window.__filtroAnniBound) return;
  window.__filtroAnniBound = true;
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-anni-key]');
    if (!b) return;
    const key = b.dataset.anniKey;
    const sel = normalizzaAnni(state[key]);
    if (b.dataset.anno === 'tutti') return setFiltroAnni(key, []);
    const a = Number(b.dataset.anno);
    let nuova = sel.length === 0 ? [a] : sel.includes(a) ? sel.filter(x => x !== a) : [...sel, a];
    // Spegnendo l'ultimo anno si torna all'anno corrente, mai a una selezione vuota implicita.
    if (nuova.length === 0) nuova = [new Date().getFullYear()];
    setFiltroAnni(key, nuova);
  });
}
