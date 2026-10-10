// Rigenera index.staging.html da index.html: identica, ma carica
// js/config.staging.js (progetto neridarimini-staging) al posto di js/config.js.
// Da eseguire dopo ogni modifica a index.html.
const fs = require('fs');
const path = require('path');
const { stamp } = require('./stamp-assets');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const re = /<script src="js\/config\.js(\?v=[0-9a-f]*)?"><\/script>/;
if (!re.test(html)) { console.error('Riferimento a js/config.js non trovato in index.html'); process.exit(1); }
fs.writeFileSync(path.join(root, 'index.staging.html'), html.replace(re, '<script src="js/config.staging.js"></script>'));
stamp('index.staging.html');
console.log('index.staging.html sincronizzato');
