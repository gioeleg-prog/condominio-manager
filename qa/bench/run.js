// Banco di misura delle prestazioni: per ogni volume avvia gli emulatori
// (progetto demo-qa, solo locale), carica i dati sintetici, genera la pagina
// di prova ed esegue le misure; alla fine stampa una tabella riassuntiva.
// Uso:  npm run bench
//       BENCH_VOLUMES=1,10,50 BENCH_LABEL=prima BENCH_REP=3 npm run bench
// Risultati: qa/out/bench/<BENCH_LABEL>-V<volume>.json
const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const VOLUMI = (process.env.BENCH_VOLUMES || '1,10,50').split(',').map((s) => s.trim()).filter(Boolean);
const LABEL = process.env.BENCH_LABEL || 'prima';
const PORTE = [9099, 8080, 9199, 5001, 4400, 4500, 8911];

// Porte occupate (emulatori o server rimasti aperti): chiude quei processi.
function liberaPorte() {
  if (process.platform !== 'win32') {
    for (const p of PORTE) { try { execSync(`lsof -ti tcp:${p} | xargs -r kill -9`, { stdio: 'ignore', shell: '/bin/sh' }); } catch { /* libera */ } }
    return;
  }
  const ps = `$p = Get-NetTCPConnection -State Listen -LocalPort ${PORTE.join(',')} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 }; `
    + `if ($p) { $p | ForEach-Object { Write-Output $_; Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }`;
  const out = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  const pid = (out.stdout || '').trim();
  if (pid) console.log('Porte occupate: chiusi i processi', pid.split(/\s+/).join(', '));
}

function esegui(volume) {
  liberaPorte();
  spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'secret-emulatore.js')], { stdio: 'inherit' });
  const cmd = 'node qa/bench/seed-volume.js && node qa/build-harness.js && npx playwright test -c qa/bench/playwright.bench.config.js';
  const t0 = Date.now();
  const r = spawnSync(`firebase emulators:exec --project demo-qa --only auth,firestore,functions,storage "${cmd}"`, {
    cwd: ROOT, stdio: 'inherit', shell: true,
    env: { ...process.env, BENCH_VOLUME: String(volume), BENCH_LABEL: LABEL },
  });
  console.log(`Volume ${volume}: esito ${r.status} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  liberaPorte();
  return r.status === 0;
}

const f = (x) => (x == null ? '—' : String(Math.round(x)));
function tabella() {
  const righe = [];
  const dati = VOLUMI.map((v) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'qa', 'out', 'bench', `${LABEL}-V${v}.json`), 'utf8')); } catch { return null; } });
  const col = (fn) => dati.map((d) => (d ? fn(d) : '—'));
  const riga = (nome, fn) => righe.push([nome, ...col(fn)]);
  for (const ruolo of ['admin', 'condomino']) {
    const R = (d) => d.ruoli[ruolo] || {};
    riga(`[${ruolo}] record spese/entrate/condomini`, (d) => { const r = R(d).record || {}; return `${r.spese}/${r.entrate}/${r.condomini}`; });
    riga(`[${ruolo}] accesso a freddo (ms)`, (d) => f(R(d).accessoAFreddo?.totaleVisibileMs));
    riga(`[${ruolo}] accesso: totale visibile (ms)`, (d) => f(R(d).accesso?.mediana.totaleVisibileMs));
    for (const k of ['autenticazioneMs', 'appdataMs', 'whoamiMs', 'tokenDopoWhoamiMs', 'datiEdificioMs', 'preparazioneERenderMs', 'primoRenderMs'])
      riga(`[${ruolo}]   ${k}`, (d) => f(R(d).accesso?.mediana.fasi[k]));
    riga(`[${ruolo}] accesso: richieste (firestore/tot)`, (d) => { const q = R(d).accesso?.mediana.richieste || {}; return `${q.firestore ?? 0}/${q.totale ?? 0}`; });
    riga(`[${ruolo}] accesso: documenti letti`, (d) => f(R(d).accesso?.mediana.letture.docsLetti));
    for (const p of ['dashboard', 'spese', 'entrate', 'bilancio', 'confronto', 'fornitori', 'vita', 'condomini', 'impostazioni']) {
      if (!dati.some((d) => d && R(d).navigazione?.[p])) continue;
      riga(`[${ruolo}] vai a ${p}: visibile/rete ferma (ms)`, (d) => { const n = R(d).navigazione?.[p]?.mediana; return n ? `${f(n.visibileMs)}/${f(n.reteFermaMs)}` : '—'; });
      riga(`[${ruolo}] render ${p} (ms, +layout)`, (d) => { const n = R(d).render?.[p]?.mediana; return n ? `${n.renderMs}/${n.renderLayoutMs}` : '—'; });
    }
    if (ruolo === 'admin') for (const k of ['inserisci', 'modifica', 'cancella', 'inserisci10']) {
      riga(`[admin] ${k}: interfaccia/confermata (ms)`, (d) => { const n = R(d).scritture?.[k]?.mediana; return n ? `${f(n.interfacciaMs)}/${f(n.confermataMs)}` : '—'; });
      riga(`[admin] ${k}: richieste/doc scritti`, (d) => { const n = R(d).scritture?.[k]?.mediana; return n ? `${n.richieste.totale ?? 0}/${n.docsScritti}` : '—'; });
    }
    riga(`[${ruolo}] ricerca "${'pulizie'}": visibile (ms)/risultati`, (d) => { const n = R(d).ricerca?.mediana; return n ? `${f(n.visibileMs)}/${n.risultati}` : '—'; });
  }
  const w0 = Math.max(...righe.map((r) => r[0].length));
  const wc = VOLUMI.map((_, i) => Math.max(8, ...righe.map((r) => String(r[i + 1]).length)));
  console.log('\n' + ['Misura'.padEnd(w0), ...VOLUMI.map((v, i) => `V=${v}`.padStart(wc[i]))].join(' | '));
  for (const r of righe) console.log([r[0].padEnd(w0), ...r.slice(1).map((c, i) => String(c).padStart(wc[i]))].join(' | '));
}

if (process.argv.includes('--tabella')) { tabella(); process.exit(0); }
let ok = true;
for (const v of VOLUMI) ok = esegui(v) && ok;
tabella();
process.exit(ok ? 0 : 1);
