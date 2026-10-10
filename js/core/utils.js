// Funzioni di utilità: escape HTML, formattazione di importi e date, identificativi, anni, saldo riportato.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

function fmt(n) {
  return '€ ' + Number(n||0).toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function fmtN(n) {
  return Number(n||0).toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function initials(nome) {
  return esc(String(nome||'').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase());
}

function avatarStyle(color) {
  return `background:${esc(color)}22;color:color-mix(in srgb, ${esc(color)} 55%, #000);`;
}

// Id numerici (molti punti fanno parseInt su data-id). QA: prima era
// millisecondi + casuale 0–999 e gli id creati nello stesso istante (rate,
// occorrenze ricorrenti) collidevano spesso. Ora millisecondi × 1000 + casuale,
// strettamente crescente nella sessione: unico qui, e tra browser diversi una
// collisione richiede stesso millisecondo e stesso numero casuale.
// Resta sotto Number.MAX_SAFE_INTEGER (≈ 9·10^15) fino all'anno 2255.
let _lastId = 0;

function newId() {
  _lastId = Math.max(_lastId + 1, Date.now() * 1000 + Math.floor(Math.random() * 1000));
  return _lastId;
}

// ===========================
// PIANO RATE AUTOMATICO — basato su simulazione di cassa
// ===========================
// Calcola fino a `nRate` proposte di versamento (default 3) per l'anno indicato.
// A differenza di un calendario fisso, le date vengono scelte simulando il saldo
// di cassa giorno per giorno: ogni rata viene posizionata almeno MARGINE_GIORNI
// prima del primo momento in cui la cassa andrebbe sotto zero, così c'è sempre
// un cuscinetto di sicurezza anche se qualche condomino paga in ritardo.
// La 1a rata è sempre il 1° gennaio dell'anno; se quella data è già passata
// (piano generato a metà anno corrente) si usa oggi al suo posto (vedi forzataOggi).
// Formatta una data in AAAA-MM-GG usando i componenti LOCALI (non UTC).
// IMPORTANTE: NON usare date.toISOString().slice(0,10) su date costruite con
// new Date(anno,mese,giorno) — toISOString converte in UTC e, con un fuso orario
// positivo come quello italiano, la data mostrata può slittare indietro di un giorno
// (es. 30 novembre locale diventa "2026-11-29" in UTC). Questa funzione resta sempre
// nel fuso locale del dispositivo, coerente con come le date vengono costruite altrove
// in questa funzione (new Date(anno,mese,giorno), setDate, setMonth sono tutti locali).
function ymdLocale(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const gg = String(d.getDate()).padStart(2,'0');
  return y + '-' + m + '-' + gg;
}

// ===========================
// UTILS
// ===========================
function esc(s) {
  // null/undefined/false → '' (come prima); 0 resta "0" — con s||'' un
  // importo o una percentuale a zero diventava stringa vuota.
  return String(s == null || s === false ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getAnni() {
  const anni = new Set();
  const myEdId = getUserEdificio(state.user);
  const filtSpese   = state.spese.filter(s => !s.edificioId || s.edificioId === state.edificioAttivo);
  const filtEntrate = state.entrate.filter(e => !e.edificioId || e.edificioId === state.edificioAttivo);
  filtSpese.forEach(s => anni.add(new Date(s.data).getFullYear()));
  filtEntrate.forEach(e => anni.add(new Date(e.data).getFullYear()));
  const currYear = new Date().getFullYear();
  anni.add(currYear);
  // Riempi gli anni mancanti tra il primo dato e oggi
  if (anni.size > 0) {
    const min = Math.min(...anni);
    for (let y = min; y <= currYear; y++) anni.add(y);
  }
  return [...anni].sort((a,b)=>b-a);
}

// getAnni per spese/entrate: include opzione "Tutti"
function getAnniConTutti() {
  return getAnni(); // usato nelle pagine spese/entrate dove c'è già l'opzione "Tutti gli anni"
}

// Calcola il saldo cumulativo fino alla fine dell'anno precedente (riporto)
function getSaldoRiporto(annoTarget) {
  const all = [ADMIN, ...state.condomini];
  const spesePrec  =     state.spese.filter(s=>!s.edificioId||s.edificioId===state.edificioAttivo).filter(s=>new Date(s.data).getFullYear() < annoTarget)
  const entratePrec =     state.entrate.filter(e=>(!e.edificioId||e.edificioId===state.edificioAttivo)&&!e.previsionale&&new Date(e.data).getFullYear()<annoTarget)
  const totSpesePrec   = spesePrec.reduce((a,s)=>a+parseFloat(s.consuntivo||0),0);
  const totEntratePrec = entratePrec.reduce((a,e)=>a+parseFloat(e.importo||0),0);
  return totEntratePrec - totSpesePrec; // saldo riportato dagli anni precedenti
}
