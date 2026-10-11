// Valori finti dei segreti per gli emulatori (functions/.secret.local, ignorato
// da git): così l'emulatore non prova a leggerli dal Secret Manager di Google.
// Sugli emulatori le email non partono comunque (functions/notifiche.js).
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'functions', '.secret.local');
if (!fs.existsSync(file)) fs.writeFileSync(file, 'GMAIL_APP_PASSWORD=solo-emulatore-nessuna-email\n');
