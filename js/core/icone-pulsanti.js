// Icone a linea dei pulsanti, dal set Lucide (https://lucide.dev, licenza ISC:
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part
// of Feather (MIT). All other copyright (c) for Lucide are held by Lucide
// Contributors 2022). Stesso stile del sito di riferimento (shadcn/ui).
//
// Le pagine continuano a scrivere le emoji nei pulsanti (✏️, 🗑, ✕, 📄…): qui
// vengono sostituite dall'icona corrispondente, una volta sola per pulsante,
// anche per quelli aggiunti dopo (osservatore sul documento). I pulsanti con la
// sola icona ricevono un nome leggibile dai lettori di schermo.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

const ICONE = {
  matita: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  cestino: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  documento: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  foglio: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
  ripeti: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  scambio: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  archivio: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  disabilita: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5"/><path d="m22 8-5 5"/>',
  riabilita: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  riattiva: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  chiave: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  grafico: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  scarica: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  occhio: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  busta: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  graffetta: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  ok: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  errore: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  attenzione: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  stampante: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
};

function ico(nome, classe) {
  return `<svg class="ico${classe ? ' ' + classe : ''}" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONE[nome] || ''}</svg>`;
}

// Emoji usate nei pulsanti → [icona, nome per i lettori di schermo, classe].
// Alcune dipendono dal testo del pulsante (📊 Esporta Excel ≠ 📊 Bilancio).
function iconaPerEmoji(emoji, testo) {
  switch (emoji) {
    case '✏': return ['matita', 'Modifica'];
    case '🗑': return ['cestino', 'Elimina', 'ico-elimina'];
    case '✕': return ['x', 'Chiudi'];
    case '📄': return ['documento', 'Documento'];
    case '🔁': return /subentro/i.test(testo) ? ['scambio', 'Subentro'] : ['ripeti', 'Ricorrente'];
    case '⏸': return /archivia/i.test(testo) ? ['archivio', 'Archivia'] : ['disabilita', 'Disabilita'];
    case '▶': return /riabilita/i.test(testo) ? ['riabilita', 'Riabilita'] : ['riattiva', 'Riattiva'];
    case '🔑': return ['chiave', 'Password'];
    case '📊': return /excel|esporta/i.test(testo) ? ['foglio', 'Esporta'] : ['grafico', 'Grafico'];
    case '⬇': return ['scarica', 'Scarica'];
    case '👁': return ['occhio', 'Apri'];
    case '📎': return ['graffetta', 'Allegati'];
    case '📧': return ['busta', 'Email'];
    case '🖨': return ['stampante', 'Stampa'];
    default: return null;
  }
}
const EMOJI_ICONA = /^\s*(✏|🗑|✕|📄|🔁|⏸|▶|🔑|📊|⬇|👁|📎|📧|🖨)️?\s?/u;

function applicaIcone(radice) {
  if (!radice || !radice.querySelectorAll) return;
  const pulsanti = radice.matches?.('button, a.btn') ? [radice] : radice.querySelectorAll('button, a.btn');
  for (const b of pulsanti) {
    if (b.dataset.icona) continue;
    const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    let nodo = walker.nextNode();
    while (nodo && !nodo.nodeValue.trim()) nodo = walker.nextNode();
    if (!nodo) continue;
    const m = nodo.nodeValue.match(EMOJI_ICONA);
    if (!m) continue;
    const info = iconaPerEmoji(m[1], b.textContent);
    if (!info) continue;
    const [nome, etichetta, classe] = info;
    nodo.nodeValue = nodo.nodeValue.slice(m[0].length);
    const tmp = document.createElement('span');
    tmp.innerHTML = ico(nome, classe);
    nodo.parentNode.insertBefore(tmp.firstChild, nodo);
    b.dataset.icona = nome;
    if (!b.textContent.trim()) {
      b.classList.add('btn-icona');
      if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', b.getAttribute('title') || etichetta);
      if (!b.getAttribute('title')) b.setAttribute('title', etichetta);
    }
    if (classe === 'ico-elimina') b.classList.add('btn-elimina');
  }
}

// Ogni volta che la pagina cambia (render, schede, liste aggiornate a parte).
if (typeof MutationObserver === 'function' && typeof document !== 'undefined' && document.documentElement?.nodeType === 1) {
  const osserva = () => {
    applicaIcone(document.body);
    new MutationObserver((mut) => {
      for (const r of mut) for (const n of r.addedNodes) if (n.nodeType === 1) applicaIcone(n);
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) osserva(); else document.addEventListener('DOMContentLoaded', osserva);
}
