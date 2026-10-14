// Copia esterna del backup su Google Drive (account notifichecondominio@gmail.com).
// Dopo il backup delle 3 (dailyBackup in index.js) il file viene compresso
// (.json.gz) e caricato nella cartella "Backup Condominio" del Drive. I dati
// restano così anche se il progetto Firebase sparisse o venisse bloccato.
//
// Accesso: autorizzazione OAuth dell'account del Drive con il solo permesso
// "drive.file" (l'app vede e tocca solo i file e la cartella che ha creato).
// Client e refresh token stanno nel segreto DRIVE_BACKUP (JSON con client_id,
// client_secret, refresh_token), creato con scripts/drive-autorizza.js.
// Senza segreto valido la copia viene saltata e segnalata, il backup principale
// non ne risente.
//
// Conservazione nella cartella (tieniDaCancellare): gli ultimi 14 giorni, il
// primo backup di ogni mese per 12 mesi, il primo di ogni anno per sempre.
// Spazio: circa 150 KB al giorno compressi, pochi MB all'anno nei 15 GB gratuiti.
// Ripristino: scaricare il .json.gz dal Drive e usare scripts/restore-backup.js.
//
// Tempo massimo: tutta la copia deve finire entro LIMITE_MS (2 minuti, contro i
// 5 della funzione); oltre, le chiamate a Google vengono interrotte e la copia
// risulta "non riuscita" invece di bloccare la funzione fino al suo arresto.
const zlib = require('zlib');

const CARTELLA = 'Backup Condominio';
const PREFISSO = 'condominio-';
const GIORNI = 14, MESI = 12;
const LIMITE_MS = 120000;
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

async function json(r, cosa) {
  const t = await r.text();
  if (!r.ok) throw new Error(`${cosa}: HTTP ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : {};
}

async function accesso(cred, signal) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal,
    body: new URLSearchParams({ client_id: cred.client_id, client_secret: cred.client_secret, refresh_token: cred.refresh_token, grant_type: 'refresh_token' }),
  });
  return (await json(r, 'Autorizzazione Google Drive')).access_token;
}

async function cartella(token, signal) {
  const auth = { Authorization: 'Bearer ' + token };
  const q = encodeURIComponent(`name='${CARTELLA}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const trovate = await json(await fetch(`${API}/files?q=${q}&fields=files(id)&spaces=drive`, { headers: auth, signal }), 'Ricerca cartella');
  if (trovate.files?.length) return trovate.files[0].id;
  const nuova = await json(await fetch(`${API}/files?fields=id`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ name: CARTELLA, mimeType: 'application/vnd.google-apps.folder' }),
  }), 'Creazione cartella');
  return nuova.id;
}

// Nomi da togliere tra quelli presenti (solo file "condominio-AAAA-MM-GG.json.gz").
function tieniDaCancellare(nomi, oggi) {
  const date = nomi.map((n) => ({ n, d: (n.match(/^condominio-(\d{4}-\d{2}-\d{2})\.json\.gz$/) || [])[1] })).filter((x) => x.d).sort((a, b) => a.d.localeCompare(b.d));
  const tieni = new Set();
  const limiteGiorni = new Date(new Date(oggi + 'T12:00:00Z').getTime() - (GIORNI - 1) * 86400000).toISOString().slice(0, 10);
  const o = new Date(oggi + 'T12:00:00Z');
  const limiteMesi = new Date(Date.UTC(o.getUTCFullYear(), o.getUTCMonth() - (MESI - 1), 1)).toISOString().slice(0, 7);
  const primoMese = new Map(), primoAnno = new Map();
  for (const x of date) {
    if (x.d >= limiteGiorni) tieni.add(x.n);
    if (!primoMese.has(x.d.slice(0, 7))) primoMese.set(x.d.slice(0, 7), x.n);
    if (!primoAnno.has(x.d.slice(0, 4))) primoAnno.set(x.d.slice(0, 4), x.n);
  }
  for (const [mese, n] of primoMese) if (mese >= limiteMesi) tieni.add(n);
  for (const n of primoAnno.values()) tieni.add(n);
  return date.filter((x) => !tieni.has(x.n)).map((x) => x.n);
}

// body: il JSON del backup; giorno: "AAAA-MM-GG" (data italiana del backup).
// limiteMs: solo per i test.
async function copiaSuDrive(credJson, body, giorno, { limiteMs = LIMITE_MS } = {}) {
  let cred;
  try { cred = JSON.parse(credJson || ''); } catch (e) { cred = null; }
  if (!cred?.client_id || !cred?.client_secret || !cred?.refresh_token) return { ok: false, configurata: false, error: 'Copia su Drive non configurata' };
  const signal = AbortSignal.timeout(limiteMs);
  try {
    return await carica(cred, body, giorno, signal);
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error(`Google Drive non ha risposto entro ${Math.round(limiteMs / 1000)} secondi`);
    throw e;
  }
}

async function carica(cred, body, giorno, signal) {
  const token = await accesso(cred, signal);
  const auth = { Authorization: 'Bearer ' + token };
  const idCartella = await cartella(token, signal);
  const nome = `${PREFISSO}${giorno}.json.gz`;
  const gz = zlib.gzipSync(Buffer.from(body, 'utf8'), { level: 9 });

  // Stesso giorno già caricato (nuovo tentativo): si sostituisce il contenuto.
  const q = encodeURIComponent(`'${idCartella}' in parents and trashed=false`);
  const presenti = (await json(await fetch(`${API}/files?q=${q}&fields=files(id,name)&pageSize=1000&spaces=drive`, { headers: auth, signal }), 'Elenco file')).files || [];
  const stesso = presenti.find((f) => f.name === nome);
  const confine = 'confine' + Date.now().toString(36);
  const meta = JSON.stringify(stesso ? { name: nome } : { name: nome, parents: [idCartella] });
  const corpo = Buffer.concat([
    Buffer.from(`--${confine}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${confine}\r\nContent-Type: application/gzip\r\n\r\n`),
    gz, Buffer.from(`\r\n--${confine}--`),
  ]);
  const caricato = await json(await fetch(`${UPLOAD}/files${stesso ? '/' + stesso.id : ''}?uploadType=multipart&fields=id,name,size`, {
    method: stesso ? 'PATCH' : 'POST', headers: { ...auth, 'Content-Type': `multipart/related; boundary=${confine}` }, body: corpo, signal,
  }), 'Caricamento');

  let rimossi = 0;
  const daTogliere = new Set(tieniDaCancellare(presenti.map((f) => f.name).concat(stesso ? [] : [nome]), giorno));
  for (const f of presenti) {
    if (!daTogliere.has(f.name)) continue;
    const r = await fetch(`${API}/files/${f.id}`, { method: 'DELETE', headers: auth, signal });
    if (r.ok || r.status === 404) rimossi++;
  }
  return { ok: true, configurata: true, file: caricato.name, sizeKB: Math.round(gz.length / 1024), rimossi, error: null };
}

module.exports = { copiaSuDrive, tieniDaCancellare, CARTELLA };
