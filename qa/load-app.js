// Carica la logica dell'app (gli script classici di js/, nello stesso ordine
// di index.html) in una sandbox Node, senza browser né Firebase, per i test
// unitari delle funzioni pure (calcoli, date, CSV, escape). Esclusi la
// configurazione e il modulo Firebase; initApp() non viene avviata.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
function appScripts(file = 'index.html') {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  return [...html.matchAll(/<script src="(js\/[^"?]+)(?:\?v=[0-9a-f]*)?"><\/script>/g)]
    .map((m) => m[1])
    .filter((f) => !/^js\/config(\.staging)?\.js$/.test(f));
}

function loadApp({ file = 'index.html', now } = {}) {
  const files = appScripts(file);
  if (!files.length) throw new Error('Nessuno script dell\'app trovato in ' + file);

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
    addEventListener() {}, removeEventListener() {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  // Uno script per file, come nel browser: condividono le dichiarazioni globali.
  for (const f of files) {
    let code = fs.readFileSync(path.join(root, f), 'utf8');
    if (f === 'js/core/avvio.js') code = code.replace(/\ninitApp\(\);\s*$/, '\n');
    vm.runInContext(code, sandbox, { filename: f });
  }
  // `let state`/`const` top-level non diventano proprietà del contesto:
  // si espongono con un piccolo accessor.
  vm.runInContext(`globalThis.__get = (n) => eval(n); globalThis.__set = (n, v) => eval(n + ' = v');`, sandbox);
  return sandbox;
}
module.exports = { loadApp, appScripts };
