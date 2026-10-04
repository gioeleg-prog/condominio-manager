// Rigenera index.staging.html da index.html conservando solo il blocco di
// configurazione Firebase di staging. Da eseguire dopo ogni modifica a index.html.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const re = /  \/\/  CONFIGURAZIONE FIREBASE[\s\S]*?const firebaseConfig = \{[\s\S]*?\};/;
const prod = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const stg = fs.readFileSync(path.join(root, 'index.staging.html'), 'utf8');
const block = stg.match(re);
if (!block || !re.test(prod)) { console.error('Blocco di configurazione non trovato'); process.exit(1); }
fs.writeFileSync(path.join(root, 'index.staging.html'), prod.replace(re, block[0]));
console.log('index.staging.html sincronizzato');
