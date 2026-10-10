// Aggiorna l'impronta ?v= di ogni file css/ e js/ citato in index.html e
// index.staging.html: cambia solo se cambia il contenuto, così i browser non
// mescolano una pagina nuova con file vecchi tenuti in cache.
// Da eseguire dopo ogni modifica a css/ o js/:  node scripts/stamp-assets.js
// (il test qa/assets.spec.js fallisce se le impronte non sono aggiornate).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..');

// Impronta del contenuto con fine riga normalizzate (LF): su Windows git
// converte in CRLF, mentre GitHub e il sito servono LF; così l'impronta è la
// stessa su ogni computer.
function assetHash(file) {
  const text = fs.readFileSync(path.join(root, file), 'utf8').split('\r\n').join('\n');
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 8);
}

function stamp(htmlFile) {
  const p = path.join(root, htmlFile);
  const html = fs.readFileSync(p, 'utf8');
  const out = html.replace(/((?:src|href)=")((?:css|js)\/[^"?]+)(?:\?v=[0-9a-f]*)?"/g, (m, attr, file) => {
    return `${attr}${file}?v=${assetHash(file)}"`;
  });
  if (out !== html) fs.writeFileSync(p, out);
  return out !== html;
}
if (require.main === module) {
  for (const f of ['index.html', 'index.staging.html']) console.log(f, stamp(f) ? 'aggiornato' : 'già aggiornato');
}
module.exports = { stamp, assetHash };
