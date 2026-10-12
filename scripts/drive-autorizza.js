// Autorizza la copia del backup su Google Drive (functions/drive.js). Si esegue
// una volta sola, dal proprio computer, dopo aver creato il client OAuth
// "App desktop" nella console Google Cloud del progetto (vedi la PR).
//
//   node scripts/drive-autorizza.js                      (progetto di produzione)
//   node scripts/drive-autorizza.js --file=<client_secret_….json>
//   node scripts/drive-autorizza.js --project=neridarimini-staging
//
// 1. legge ID client e chiave dal file JSON scaricato alla creazione del client
//    (--file, oppure il più recente client_secret_*.json nella cartella Download);
//    in mancanza li chiede qui (da incollare nel terminale, MAI in chat);
// 2. apre il browser: si entra con l'account del Drive (notifichecondominio@gmail.com)
//    e si concede il permesso "vedere e gestire solo i file creati da questa app";
// 3. prova l'accesso creando (o ritrovando) la cartella "Backup Condominio";
// 4. salva client e refresh token nel segreto DRIVE_BACKUP con la CLI di Firebase
//    (file temporaneo cancellato subito dopo). Poi vanno ripubblicate le funzioni.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.match(/^--([^=]+)(?:=(.*))?$/)).filter(Boolean).map((m) => [m[1], m[2] ?? true]));
const PROGETTO = args.project || 'condominio-manager-9e99a';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ACCOUNT = 'notifichecondominio@gmail.com';

let _rl;
const chiedi = (domanda) => new Promise((ok) => {
  _rl = _rl || readline.createInterface({ input: process.stdin, output: process.stdout });
  _rl.question(domanda, (r) => ok(r.trim()));
});
const chiudiDomande = () => { if (_rl) { _rl.close(); _rl = null; } };

// File JSON del client OAuth ("installed" per App desktop, "web" per gli altri tipi).
function leggiFileClient(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const c = j.installed || j.web || j;
  return { clientId: String(c.client_id || ''), clientSecret: String(c.client_secret || '') };
}
function fileClientInDownload() {
  const dir = path.join(os.homedir(), 'Downloads');
  try {
    return fs.readdirSync(dir).filter((n) => /^client_secret_.*\.json$/i.test(n))
      .map((n) => path.join(dir, n)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
  } catch (e) { return null; }
}

async function credenzialiClient() {
  const idValido = (s) => /\.apps\.googleusercontent\.com$/.test(s);
  const file = typeof args.file === 'string' ? args.file : fileClientInDownload();
  if (file) {
    const c = leggiFileClient(file);
    if (idValido(c.clientId) && c.clientSecret) { console.log('Client letto da ' + file); return c; }
    console.log('Il file ' + file + ' non contiene ID client e chiave: li chiedo qui.');
  }
  console.log('Incolla con clic destro (o Ctrl+Maiusc+V), poi Invio.');
  let clientId = '', clientSecret = '';
  while (!idValido(clientId)) clientId = await chiedi('ID client (finisce con .apps.googleusercontent.com): ');
  while (!clientSecret) clientSecret = await chiedi('Chiave segreta del client: ');
  return { clientId, clientSecret };
}

async function codiceDalBrowser(clientId) {
  const stato = crypto.randomBytes(16).toString('hex');
  return new Promise((ok, ko) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (!u.searchParams.has('code') && !u.searchParams.has('error')) { res.writeHead(404); res.end(); return; }
      const valido = u.searchParams.get('state') === stato && u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(valido ? '<p style="font-family:sans-serif">Autorizzazione ricevuta: puoi chiudere questa scheda e tornare al terminale.</p>'
        : '<p style="font-family:sans-serif">Autorizzazione non riuscita: torna al terminale.</p>');
      server.close();
      if (valido) ok({ code: u.searchParams.get('code'), redirect: `http://127.0.0.1:${porta}` });
      else ko(new Error('Autorizzazione rifiutata o non valida: ' + (u.searchParams.get('error') || 'stato diverso')));
    });
    let porta;
    server.listen(0, '127.0.0.1', () => {
      porta = server.address().port;
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: clientId, redirect_uri: `http://127.0.0.1:${porta}`, response_type: 'code', scope: SCOPE,
        access_type: 'offline', prompt: 'consent', login_hint: ACCOUNT, state: stato,
      });
      console.log(`\nSi apre il browser. Entra con ${ACCOUNT} e concedi l'accesso.\nSe non si apre, copia questo indirizzo nel browser:\n${url}\n`);
      const apri = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
      spawnSync(apri[0], apri[1], { stdio: 'ignore', windowsVerbatimArguments: true });
    });
    setTimeout(() => { server.close(); ko(new Error('Nessuna risposta dal browser entro 5 minuti.')); }, 5 * 60000).unref();
  });
}

(async () => {
  console.log(`Copia del backup su Google Drive — progetto ${PROGETTO}\n`);
  const { clientId, clientSecret } = await credenzialiClient();
  chiudiDomande();

  const { code, redirect } = await codiceDalBrowser(clientId);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code' }),
  });
  const tok = await r.json();
  if (!r.ok || !tok.refresh_token) throw new Error('Google non ha restituito il refresh token: ' + JSON.stringify(tok.error_description || tok.error || tok).slice(0, 200));

  // Prova: crea o ritrova la cartella dei backup.
  const auth = { Authorization: 'Bearer ' + tok.access_token };
  const q = encodeURIComponent("name='Backup Condominio' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const trovate = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, { headers: auth })).json();
  if (!trovate.files?.length) {
    const c = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Backup Condominio', mimeType: 'application/vnd.google-apps.folder' }) });
    if (!c.ok) throw new Error('Accesso al Drive non riuscito: ' + (await c.text()).slice(0, 200));
    console.log('Cartella "Backup Condominio" creata nel Drive.');
  } else console.log('Cartella "Backup Condominio" già presente nel Drive.');

  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'drive-')), 'drive.json');
  try {
    fs.writeFileSync(tmp, JSON.stringify({ client_id: clientId, client_secret: clientSecret, refresh_token: tok.refresh_token }), { mode: 0o600 });
    console.log('\nSalvo il segreto DRIVE_BACKUP con la CLI di Firebase…');
    const esito = spawnSync('npx', ['-y', 'firebase-tools@15', 'functions:secrets:set', 'DRIVE_BACKUP', '--project', PROGETTO, '--data-file', tmp], { stdio: 'inherit', shell: true });
    if (esito.status !== 0) throw new Error('Salvataggio del segreto non riuscito (codice ' + esito.status + ').');
  } finally {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
  console.log('\nFatto. Ora vanno ripubblicate le funzioni (firebase deploy --only functions).');
})().catch((e) => { console.error('\n' + (e.message || e)); process.exit(1); });
