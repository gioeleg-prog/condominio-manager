// Controlli sui file della pagina (css/, js/) dopo la divisione di index.html.
// Eseguito con i test unitari (npm run test:unit) e quindi anche su GitHub.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assetHash } = require('../scripts/stamp-assets');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const refs = (html) => [...html.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+)(?:\?v=([0-9a-f]*))?"/g)].map((m) => ({ file: m[1], v: m[2] }));
const listDir = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? listDir(path.join(d, e.name)) : [path.join(d, e.name).split(path.sep).join('/')]));

describe('FILE DELLA PAGINA — css/ e js/', () => {
  for (const page of ['index.html', 'index.staging.html']) {
    it(`${page}: ogni file citato esiste e ha l'impronta ?v= aggiornata`, () => {
      const r = refs(read(page));
      assert.ok(r.length >= 20, 'troppi pochi file citati: ' + r.length);
      for (const { file, v } of r) {
        assert.ok(fs.existsSync(path.join(root, file)), `${file} non esiste`);
        const hash = assetHash(file);
        assert.strictEqual(v, hash, `${file}: impronta non aggiornata (eseguire node scripts/stamp-assets.js)`);
      }
    });
  }
  it('nessun file di css/ o js/ dimenticato fuori dalla pagina', () => {
    const cited = new Set([...refs(read('index.html')), ...refs(read('index.staging.html'))].map((r) => r.file));
    // js/vendor/ = librerie caricate solo quando servono (es. jsPDF per il rendiconto):
    // controllate dal test sotto, non dalla pagina.
    const orphans = [...listDir('css'), ...listDir('js')].filter((f) => !cited.has(f) && !f.startsWith('js/vendor/'));
    assert.deepStrictEqual(orphans, []);
  });
  it('le librerie caricate su richiesta esistono, con versione nel nome e licenza accanto', () => {
    const code = read('js/sezioni/rendiconto.js');
    const libs = [...code.matchAll(/'(js\/vendor\/[^']+\.js)'/g)].map((m) => m[1]);
    assert.ok(libs.length >= 2, 'elenco delle librerie del rendiconto non trovato');
    for (const f of libs) {
      assert.ok(fs.existsSync(path.join(root, f)), 'manca ' + f);
      assert.match(f, /-\d+\.\d+\.\d+[.-]/, 'la versione va nel nome del file (così il browser non usa una copia vecchia): ' + f);
    }
    const vendor = listDir('js').filter((f) => f.startsWith('js/vendor/') && f.endsWith('.js'));
    assert.deepStrictEqual(vendor.filter((f) => !libs.includes(f)), [], 'file in js/vendor/ non usati');
    assert.ok(fs.existsSync(path.join(root, 'js/vendor/LICENSE-jspdf.txt')) && fs.existsSync(path.join(root, 'js/vendor/LICENSE-jspdf-autotable.txt')));
  });
  it('la pagina di staging è identica a quella di produzione salvo la configurazione', () => {
    const norm = (h) => h.replace(/<script src="js\/config(\.staging)?\.js\?v=[0-9a-f]+"><\/script>/, 'CONFIG');
    assert.strictEqual(norm(read('index.staging.html')), norm(read('index.html')));
    assert.ok(read('index.staging.html').includes('js/config.staging.js'));
    assert.ok(read('index.html').includes('js/config.js'));
  });
  it('nessun codice JavaScript rimasto dentro la pagina; avvio caricato per ultimo', () => {
    const html = read('index.html');
    assert.strictEqual([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/g)].length, 0);
    const scripts = refs(html).filter((r) => r.file.startsWith('js/') && !r.file.startsWith('js/config')).map((r) => r.file);
    assert.strictEqual(scripts[scripts.length - 1], 'js/core/avvio.js');
  });
  it('la Content-Security-Policy consente gli script locali', () => {
    const csp = read('index.html').match(/Content-Security-Policy" content="([^"]+)"/)[1];
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /style-src 'self'/);
  });
});
