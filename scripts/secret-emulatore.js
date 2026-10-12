// Valori finti dei segreti per gli emulatori (functions/.secret.local, ignorato
// da git): così l'emulatore non prova a leggerli dal Secret Manager di Google.
// Sugli emulatori le email non partono comunque (functions/notifiche.js) e la
// copia su Drive risulta "non configurata" (functions/drive.js).
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'functions', '.secret.local');
const VALORI = { GMAIL_APP_PASSWORD: 'solo-emulatore-nessuna-email', DRIVE_BACKUP: 'non-configurato' };
const presenti = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const mancanti = Object.entries(VALORI).filter(([k]) => !new RegExp('^' + k + '=', 'm').test(presenti));
if (mancanti.length) fs.appendFileSync(file, (presenti && !presenti.endsWith('\n') ? '\n' : '') + mancanti.map(([k, v]) => `${k}=${v}\n`).join(''));
