// Confronto tra due serie di misure del banco (qa/out/bench/<etichetta>-V<volume>.json).
// Uso: node qa/bench/confronta.js [prima] [dopo]   (volumi presenti in entrambe)
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'out', 'bench');
const [A = 'prima', B = 'dopo'] = process.argv.slice(2);
const volumi = fs.readdirSync(DIR).map((f) => f.match(new RegExp(`^${A}-V(\\d+)\\.json$`))).filter(Boolean).map((m) => m[1])
  .filter((v) => fs.existsSync(path.join(DIR, `${B}-V${v}.json`))).sort((x, y) => x - y);

const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
const ms = (v) => (v == null ? '—' : v >= 1000 ? (v / 1000).toFixed(2) + ' s' : Math.round(v) + ' ms');
const delta = (a, b) => (a == null || b == null || !a ? '' : (b <= a ? '−' : '+') + Math.round(Math.abs(1 - b / a) * 100) + '%' + (b < a && a / b >= 2 ? ` (×${(a / b).toFixed(1)})` : ''));

const MISURE = [
  ['Accesso (dashboard visibile)', 'accesso.mediana.totaleVisibileMs'],
  ['  di cui dati edificio', 'accesso.mediana.fasi.datiEdificioMs'],
  ['  richieste di rete all\'accesso', 'accesso.mediana.richieste.totale', 'n'],
  ...['dashboard', 'spese', 'entrate', 'bilancio', 'confronto', 'fornitori', 'vita', 'condomini', 'impostazioni']
    .map((p) => [`Apri ${p}`, `navigazione.${p}.mediana.visibileMs`]),
  ...['spese', 'entrate', 'bilancio'].map((p) => [`render() ${p}`, `render.${p}.mediana.renderMs`]),
  ['  elementi pagina entrate', 'render.entrate.mediana.nodiDom', 'n'],
  ['Inserisci spesa (risposta)', 'scritture.inserisci.mediana.interfacciaMs'],
  ['Inserisci spesa (confermata)', 'scritture.inserisci.mediana.confermataMs'],
  ['Modifica spesa (confermata)', 'scritture.modifica.mediana.confermataMs'],
  ['Cancella spesa (confermata)', 'scritture.cancella.mediana.confermataMs'],
  ['  richieste per cancellazione', 'scritture.cancella.mediana.richieste.firestore', 'n'],
  ['10 inserimenti di fila', 'scritture.inserisci10.mediana.confermataMs'],
  ['Ricerca "pulizie"', 'ricerca.mediana.visibileMs'],
];

for (const v of volumi) {
  const a = JSON.parse(fs.readFileSync(path.join(DIR, `${A}-V${v}.json`), 'utf8'));
  const b = JSON.parse(fs.readFileSync(path.join(DIR, `${B}-V${v}.json`), 'utf8'));
  for (const ruolo of Object.keys(a.ruoli)) {
    const ra = a.ruoli[ruolo], rb = b.ruoli[ruolo];
    if (!rb) continue;
    console.log(`\n## Volume ×${v} — ${ruolo} (${ra.record?.spese} spese, ${ra.record?.entrate} entrate, ${ra.record?.condomini} condomini)`);
    console.log(`| Misura | ${A} | ${B} | Variazione |\n|---|---|---|---|`);
    for (const [nome, p, tipo] of MISURE) {
      const x = get(ra, p), y = get(rb, p);
      if (x == null && y == null) continue;
      const f = tipo === 'n' ? (n) => (n == null ? '—' : String(n)) : ms;
      console.log(`| ${nome} | ${f(x)} | ${f(y)} | ${delta(x, y)} |`);
    }
  }
}
