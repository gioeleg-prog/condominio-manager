// Carica la logica dell'app (lo <script> classico di index.html) in una
// sandbox Node, senza browser né Firebase, per i test unitari delle funzioni
// pure (calcoli, date, CSV, escape). initApp() non viene avviata.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadApp({ file = 'index.html', now } = {}) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const code = scripts.sort((a, b) => b.length - a.length)[0].replace(/\ninitApp\(\);\s*$/, '\n');

  const el = () => ({ innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, setAttribute() {} });
  const downloads = [];
  const sandbox = {
    console, setTimeout, clearTimeout, Intl, Date, Math, JSON, Promise,
    alert: (m) => sandbox.__alerts.push(m), __alerts: [], confirm: () => true,
    document: { getElementById: () => null, addEventListener() {}, querySelectorAll: () => [],
      querySelector: () => null, body: el(), documentElement: el(),
      createElement: () => ({ ...el(), click() { downloads.push({ href: this.href, download: this.download }); } }) },
    navigator: { userAgent: 'node' }, localStorage: { getItem: () => null, setItem() {} },
    Blob: class { constructor(parts) { this.text = parts.join(''); } },
    URL: { createObjectURL: (b) => { downloads.push({ blob: b }); return 'blob:x'; }, revokeObjectURL() {} },
    __downloads: downloads,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  // `let state`/`const` top-level non diventano proprietà del contesto:
  // si espongono con un piccolo accessor in coda.
  vm.runInContext(code + `\n;globalThis.__get = (n) => eval(n); globalThis.__set = (n, v) => eval(n + ' = v');`, sandbox, { filename: file });
  return sandbox;
}
module.exports = { loadApp };
