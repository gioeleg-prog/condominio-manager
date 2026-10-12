// Grafici a colonne dell'app (Dashboard, Bilancio, Confronto anni, piano rate).
// Stesso aspetto ovunque: asse con valori in euro, griglia leggera, colonne
// sottili con l'estremo arrotondato, legenda sempre presente con due o più serie.
// Il dettaglio di ogni colonna compare al passaggio del mouse, al tocco e con la
// tastiera (Tab porta sul grafico, frecce ← → tra le colonne, Esc chiude); gli
// stessi valori sono anche nella tabella "Valori in tabella" sotto il grafico.
// Colori (css/base.css, --g-*): blu entrate, arancio uscite, verde acqua
// preventivo, rosso cassa sotto zero; il "previsto" è la tinta tenue della
// stessa serie. Verificati per il daltonismo in chiaro e in scuro.
// Grafici in HTML (non SVG): i testi restano leggibili a ogni larghezza.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// Valori dell'asse "puliti" (1, 2, 2,5, 5 × 10^n), sempre con lo zero.
function grafScala(min, max) {
  if (max - min < 1) max = min + 1;
  const grezzo = (max - min) / 4;
  const pot = Math.pow(10, Math.floor(Math.log10(grezzo)));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= grezzo);
  const da = Math.floor(min / passo) * passo, a = Math.ceil(max / passo) * passo;
  const tacche = [];
  for (let v = da; v <= a + passo / 2; v += passo) tacche.push(Math.round(v * 100) / 100);
  return { min: da, max: a, tacche };
}

function grafEuroAsse(v) {
  const a = Math.abs(v);
  const s = a >= 10000 ? (a / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'k' : a.toLocaleString('it-IT', { maximumFractionDigits: 0 });
  return (v < 0 ? '−' : '') + '€ ' + s;
}

// opz: { titolo?, sottotitolo?, classe? ("piatto": senza riquadro), aria, legenda: [{ colore, tenue?, nome }],
//   gruppi: [{ etichetta, oggi?, segno?, colonne: [[{ valore, colore, tenue? }]],
//              tip: { titolo, righe: [{ colore?, tenue?, nome, valore, forte? }] } }],
//   tabella: { intestazioni: [..], righe: [[..]] }, nota? }
// Ogni colonna è una pila di pezzi; un valore negativo scende sotto lo zero.
function graficoBarre(opz) {
  const totali = opz.gruppi.flatMap((g) => g.colonne.map((c) => c.reduce((a, p) => a + Math.max(0, p.valore || 0), 0)));
  const negativi = opz.gruppi.flatMap((g) => g.colonne.flatMap((c) => c.map((p) => Math.min(0, p.valore || 0))));
  const sc = grafScala(Math.min(0, ...negativi), Math.max(0, ...totali));
  const pct = (v) => ((v - sc.min) / (sc.max - sc.min)) * 100;
  const zero = pct(0);

  const pezzi = (col) => {
    let base = 0;
    const pos = col.filter((p) => (p.valore || 0) > 0);
    const out = pos.map((p, i) => {
      const h = (p.valore / (sc.max - sc.min)) * 100;
      const html = `<span class="graf-pezzo${p.tenue ? ' tenue' : ''}${i === pos.length - 1 ? ' cima' : ''}${i > 0 ? ' sopra' : ''}" style="--c:${p.colore};bottom:${(zero + base).toFixed(2)}%;height:${h.toFixed(2)}%"></span>`;
      base += h;
      return html;
    });
    col.filter((p) => (p.valore || 0) < 0).forEach((p) => {
      const h = (-p.valore / (sc.max - sc.min)) * 100;
      out.push(`<span class="graf-pezzo neg${p.tenue ? ' tenue' : ''}" style="--c:${p.colore};top:${(100 - zero).toFixed(2)}%;height:${h.toFixed(2)}%"></span>`);
    });
    return out.join('');
  };

  const riga = (r) => `<div class="graf-tip-riga${r.forte ? ' forte' : ''}">${r.colore ? `<i class="graf-tip-chiave${r.tenue ? ' tenue' : ''}" style="--c:${r.colore}"></i>` : '<i></i>'}<b>${esc(r.valore)}</b><span>${esc(r.nome)}</span></div>`;
  const gruppi = opz.gruppi.map((g, i) => {
    const aria = `${g.tip.titolo}: ${g.tip.righe.map((r) => `${r.nome} ${r.valore}`).join('; ')}`;
    return `<div class="graf-gruppo${g.oggi ? ' oggi' : ''}" role="listitem" tabindex="${i === 0 ? 0 : -1}" data-graf-i="${i}" aria-label="${esc(aria)}">
      <div class="graf-colonne">${g.colonne.map((c) => `<div class="graf-col">${pezzi(c)}</div>`).join('')}</div>
      <template><div class="graf-tip-titolo">${esc(g.tip.titolo)}</div>${g.tip.righe.map(riga).join('')}</template>
    </div>`;
  }).join('');

  const legenda = opz.legenda.length > 1 || opz.legenda.some((l) => l.sempre)
    ? `<ul class="graf-legenda">${opz.legenda.map((l) => `<li><i class="graf-chiave${l.tenue ? ' tenue' : ''}${l.segno ? ' segno' : ''}" style="--c:${l.colore || 'transparent'}">${l.segno ? esc(l.segno) : ''}</i>${esc(l.nome)}</li>`).join('')}</ul>` : '';
  const tabella = opz.tabella ? `<details class="graf-dati"><summary>Valori in tabella</summary><div class="table-wrap"><table>
      <thead><tr>${opz.tabella.intestazioni.map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${opz.tabella.righe.map((r) => `<tr>${r.map((v, i) => i ? `<td class="num">${esc(v)}</td>` : `<th scope="row">${esc(v)}</th>`).join('')}</tr>`).join('')}</tbody>
    </table></div></details>` : '';

  return `<figure class="graf${opz.classe ? ' ' + opz.classe : ''}" data-graf>
    ${opz.titolo ? `<figcaption class="graf-testa"><div class="graf-titolo">${esc(opz.titolo)}</div>${opz.sottotitolo ? `<div class="graf-sub">${esc(opz.sottotitolo)}</div>` : ''}</figcaption>` : ''}
    ${legenda}
    <div class="graf-corpo">
      <div class="graf-asse" aria-hidden="true">${sc.tacche.map((t) => `<span style="bottom:${pct(t).toFixed(2)}%">${grafEuroAsse(t)}</span>`).join('')}</div>
      <div class="graf-piano">
        ${sc.tacche.map((t) => `<i class="graf-linea${t === 0 ? ' zero' : ''}" style="bottom:${pct(t).toFixed(2)}%"></i>`).join('')}
        <div class="graf-gruppi" role="list" aria-label="${esc(opz.aria)}. Frecce sinistra e destra per scorrere.">${gruppi}</div>
      </div>
      <div></div>
      <div class="graf-etichette" aria-hidden="true">${opz.gruppi.map((g) => `<span class="${g.oggi ? 'oggi' : ''}">${esc(g.etichetta)}${g.segno ? `<em class="graf-segno">${esc(g.segno)}</em>` : ''}</span>`).join('')}</div>
    </div>
    <div class="graf-tip" role="tooltip" hidden></div>
    ${tabella}
    ${opz.nota ? `<p class="graf-nota">${opz.nota}</p>` : ''}
  </figure>`;
}

// ─── Cassa mese per mese (Dashboard e Bilancio) ─────────────────────
// mesi: [{ mese, incassi, incPrevis, cons, prevForecast, isCurrent }]
function graficoCassaMensile(mesi, { titolo, sottotitolo } = {}) {
  const E = 'var(--g-entrate)', U = 'var(--g-uscite)';
  return graficoBarre({
    titolo, sottotitolo, aria: 'Entrate e uscite mese per mese',
    legenda: [{ colore: E, nome: 'Entrate reali' }, { colore: E, tenue: true, nome: 'Entrate previste' },
      { colore: U, nome: 'Uscite reali' }, { colore: U, tenue: true, nome: 'Uscite da consuntivare' }],
    gruppi: mesi.map((m) => {
      const diff = m.incassi + m.incPrevis - m.cons - m.prevForecast;
      return {
        etichetta: m.mese, oggi: m.isCurrent,
        colonne: [[{ valore: m.incassi, colore: E }, { valore: m.incPrevis, colore: E, tenue: true }],
          [{ valore: m.cons, colore: U }, { valore: m.prevForecast, colore: U, tenue: true }]],
        tip: { titolo: m.mese + (m.isCurrent ? ' (mese in corso)' : ''), righe: [
          { colore: E, nome: 'Entrate reali', valore: fmt(m.incassi) },
          { colore: E, tenue: true, nome: 'Entrate previste', valore: fmt(m.incPrevis) },
          { colore: U, nome: 'Uscite reali', valore: fmt(m.cons) },
          { colore: U, tenue: true, nome: 'Uscite da consuntivare', valore: fmt(m.prevForecast) },
          { nome: 'Differenza del mese', valore: (diff > 0 ? '+' : '') + fmt(diff), forte: true }] },
      };
    }),
    tabella: { intestazioni: ['Mese', 'Entrate reali', 'Entrate previste', 'Uscite reali', 'Uscite da consuntivare', 'Differenza'],
      righe: mesi.map((m) => [m.mese, fmt(m.incassi), fmt(m.incPrevis), fmt(m.cons), fmt(m.prevForecast), fmt(m.incassi + m.incPrevis - m.cons - m.prevForecast)]) },
  });
}

// ─── Comportamento: dettaglio al passaggio, al tocco e da tastiera ───
function grafMostra(gruppo) {
  const fig = gruppo.closest('[data-graf]');
  const tip = fig?.querySelector('.graf-tip');
  if (!tip) return;
  fig.querySelectorAll('.graf-gruppo.attivo').forEach((g) => g.classList.remove('attivo'));
  gruppo.classList.add('attivo');
  tip.innerHTML = gruppo.querySelector('template').innerHTML;
  tip.hidden = false;
  const fr = fig.getBoundingClientRect(), gr = gruppo.getBoundingClientRect();
  const piano = fig.querySelector('.graf-piano').getBoundingClientRect();
  const tw = tip.offsetWidth;
  // Accanto alla colonna (a destra se c'è posto, altrimenti a sinistra), mai sopra.
  let x = gr.right - fr.left + 6;
  if (x + tw > fr.width - 4) x = gr.left - fr.left - tw - 6;
  tip.style.left = Math.max(4, x) + 'px';
  tip.style.top = (piano.top - fr.top) + 'px';
}
function grafNascondi(fig) {
  if (!fig) return;
  const tip = fig.querySelector('.graf-tip');
  if (tip) tip.hidden = true;
  fig.querySelectorAll('.graf-gruppo.attivo').forEach((g) => g.classList.remove('attivo'));
}

if (typeof document !== 'undefined' && document.addEventListener) {
  const gruppoDi = (t) => (t && t.closest ? t.closest('.graf-gruppo') : null);
  document.addEventListener('pointerover', (e) => { const g = gruppoDi(e.target); if (g && e.pointerType !== 'touch') grafMostra(g); });
  document.addEventListener('pointerout', (e) => {
    const g = gruppoDi(e.target);
    if (g && !gruppoDi(e.relatedTarget) && e.pointerType !== 'touch' && document.activeElement !== g) grafNascondi(g.closest('[data-graf]'));
  });
  document.addEventListener('click', (e) => {
    const g = gruppoDi(e.target);
    document.querySelectorAll('[data-graf]').forEach((f) => { if (!g || !f.contains(g)) grafNascondi(f); });
    if (g) grafMostra(g);
  });
  document.addEventListener('focusin', (e) => { const g = gruppoDi(e.target); if (g) grafMostra(g); });
  document.addEventListener('focusout', (e) => { const g = gruppoDi(e.target); if (g && !gruppoDi(e.relatedTarget)) grafNascondi(g.closest('[data-graf]')); });
  document.addEventListener('keydown', (e) => {
    const g = gruppoDi(e.target);
    if (!g) return;
    if (e.key === 'Escape') { grafNascondi(g.closest('[data-graf]')); return; }
    const tutti = [...g.parentElement.children];
    const i = tutti.indexOf(g);
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tutti.length - 1 }[e.key];
    if (j === undefined || !tutti[j]) return;
    e.preventDefault();
    g.tabIndex = -1; tutti[j].tabIndex = 0; tutti[j].focus();
  });
}
