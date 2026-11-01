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

// Un colore finisce dentro style="…": esc() ferma le virgolette ma non il ";",
// quindi un valore come "red;position:fixed;inset:0" iniettava altro CSS.
// Audit 2026-10-21: si accetta solo un esadecimale (#RGB…#RRGGBBAA) o una
// variabile del tema (var(--accent)); altrimenti il colore di riserva.
function coloreSicuro(v, riserva) {
  const s = String(v == null ? '' : v).trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(s) || /^var\(--[a-z0-9-]{1,30}\)$/.test(s) ? s : (riserva || '#888888');
}

function avatarStyle(color) {
  const c = coloreSicuro(color);
  return `background:${c}22;color:color-mix(in srgb, ${c} 55%, var(--text));`;
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
  // Anche l'apice singolo (audit 2026-10-15): il risultato è sicuro sia negli
  // attributi tra virgolette sia in quelli tra apici singoli.
  return String(s == null || s === false ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Valore JSON da mettere in un attributo data-* (es. data-view-allegato):
// l'escape lo rende sicuro qualunque sia il delimitatore dell'attributo, e
// dataset restituisce il JSON originale per JSON.parse.
function attrJson(v) {
  return esc(JSON.stringify(v));
}

// Anno di una data 'AAAA-MM-GG' letto dal testo: new Date('2027-01-01') è
// mezzanotte UTC e in un fuso orario negativo getFullYear() darebbe 2026.
// Restituisce NaN se la data non è valida.
function annoDi(d) {
  const a = parseInt(String(d || '').slice(0, 4), 10);
  return a > 1900 && a < 3000 ? a : NaN;
}

// Mese (0-11) di una data 'AAAA-MM-GG' letto dal testo, come annoDi; NaN se non valida.
function meseDi(d) {
  const m = parseInt(String(d || '').slice(5, 7), 10);
  return m >= 1 && m <= 12 ? m - 1 : NaN;
}

function getAnni() {
  const anni = new Set();
  const filtSpese   = state.spese.filter(s => !s.edificioId || s.edificioId === state.edificioAttivo);
  const filtEntrate = state.entrate.filter(e => !e.edificioId || e.edificioId === state.edificioAttivo);
  filtSpese.forEach(s => anni.add(annoDi(s.data)));
  filtEntrate.forEach(e => anni.add(annoDi(e.data)));
  anni.delete(NaN); // date non valide: niente opzione "NaN"
  const currYear = new Date().getFullYear();
  anni.add(currYear);
  // L'anno prossimo c'è sempre, per poter impostare il preventivo prima di
  // inserire dati; l'anno scelto c'è sempre, così il menu mostra davvero
  // l'anno dei dati visualizzati (anche dopo un cambio di condominio).
  anni.add(currYear + 1);
  if (state.filterAnno) anni.add(state.filterAnno);
  // Riempi gli anni mancanti tra il primo e l'ultimo
  const min = Math.min(...anni), max = Math.max(...anni);
  for (let y = min; y <= max; y++) anni.add(y);
  return [...anni].sort((a,b)=>b-a);
}

// Saldo con cui si stima di iniziare un anno. Per l'anno corrente o passato
// coincide con il riporto reale. Per un anno futuro parte dalla cassa reale di
// oggi e aggiunge quello che deve ancora succedere negli anni in mezzo (dall'anno
// corrente all'anno prima di quello scelto): meno le spese con solo preventivo,
// più i versamenti previsionali. Le voci rimaste aperte negli anni già chiusi
// non contano (non sono più attese).
function getSaldoStimatoInizioAnno(anno) {
  const reale = getSaldoRiporto(anno);
  const annoOggi = new Date().getFullYear();
  if (!(anno > annoOggi)) return { reale, speseAperte: 0, entratePreviste: 0, stimato: reale };
  const inMezzo = (d) => { const a = annoDi(d); return a >= annoOggi && a < anno; };
  const edOk = (r) => !r.edificioId || r.edificioId === state.edificioAttivo;
  const speseAperte = state.spese
    .filter(s => edOk(s) && inMezzo(s.data) && !(parseFloat(s.consuntivo) > 0))
    .reduce((a, s) => a + (parseFloat(s.preventivo) || 0), 0);
  const entratePreviste = state.entrate
    .filter(e => edOk(e) && e.previsionale && inMezzo(e.data))
    .reduce((a, e) => a + (parseFloat(e.importo) || 0), 0);
  const stimato = Math.round((reale - speseAperte + entratePreviste) * 100) / 100;
  return { reale, speseAperte, entratePreviste, stimato };
}

// Quota di un condomino su una spesa: la percentuale salvata nella ripartizione;
// se la spesa ha una ripartizione e lui non c'è, zero (come la pagina Spese e
// l'export); senza ripartizione, parti uguali tra i condomini attivi.
// Prima Bilancio, Dashboard ed Entrate davano a chi mancava dalla ripartizione
// anche una parte uguale: un condomino arrivato dopo pagava quote di spese
// vecchie e il totale delle quote superava la spesa.
function quotaSuSpesa(s, condId, importo, nAttivi) {
  if (!importo) return 0;
  if (s.split?.length) {
    const e = s.split.find(x => x.id === condId);
    return e ? percEffettiva(s.split, e.perc) / 100 * importo : 0;
  }
  // Senza ripartizione: parti uguali tra chi faceva parte del condominio alla
  // data della spesa (subentri: chi è entrato dopo o uscito prima non paga).
  const partecipanti = condominiDellaSpesa(s, s.edificioId || state.edificioAttivo);
  if (partecipanti.length) return idsDi(partecipanti).has(condId) ? importo / partecipanti.length : 0;
  return importo / (nAttivi || 1);
}

// ── Subentri: periodo in cui un condomino fa parte del condominio ─────────
// Inizio = data di ingresso (vuota = da sempre). Fine = data di uscita; per chi
// è archiviato senza data di uscita vale la data dell'archiviazione, e se manca
// anche quella non partecipa (come prima dei subentri). La data di uscita è il
// primo giorno in cui non partecipa più: a quella data subentra il nuovo.
// Ingresso ancora da venire (DAT-001). Come sul server (ingressoFuturo in functions/notifiche.js):
// conta solo una data AAAA-MM-GG esistente; un altro formato vale "nessuna data".
function dataIsoValida(t) {
  if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(`${t}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}
function ingressoFuturo(c, oggi = ymdLocale(new Date())) {
  const t = c && c.dataIngresso;
  return dataIsoValida(t) && t > oggi;
}
// Uscita arrivata (ADV-TECH-025), come uscitaArrivata in functions/notifiche.js: una data non AAAA-MM-GG vale "nessuna uscita".
function uscitaArrivata(c, oggi = ymdLocale(new Date())) {
  const t = c && c.dataUscita;
  return dataIsoValida(t) && t <= oggi;
}
// Uscita ancora da venire (stessa validazione).
function uscitaFutura(c, oggi = ymdLocale(new Date())) {
  const t = c && c.dataUscita;
  return dataIsoValida(t) && t > oggi;
}
function periodoCondomino(c) {
  const inizio = /^\d{4}-\d{2}-\d{2}/.test(c.dataIngresso || '') ? c.dataIngresso.slice(0, 10) : '';
  let fine = /^\d{4}-\d{2}-\d{2}/.test(c.dataUscita || '') ? c.dataUscita.slice(0, 10) : '';
  if (!fine && c.disabled) fine = /^\d{4}-\d{2}-\d{2}/.test(c.disabledOn || '') ? c.disabledOn.slice(0, 10) : '0000-00-00';
  return { inizio, fine };
}
function attivoAllaData(c, data) {
  const d = /^\d{4}-\d{2}-\d{2}/.test(data || '') ? String(data).slice(0, 10) : ymdLocale(new Date());
  const { inizio, fine } = periodoCondomino(c);
  return (!inizio || d >= inizio) && (!fine || d < fine);
}
// Ha fatto parte del condominio per almeno un giorno dell'anno.
function attivoNellAnno(c, anno) {
  const { inizio, fine } = periodoCondomino(c);
  return (!inizio || inizio <= anno + '-12-31') && (!fine || fine > anno + '-01-01');
}
function condominiAllaData(data, edificioId = state.edificioAttivo) {
  const calcola = () => state.condomini.filter(c => c.edificioId === edificioId && !c.superAdmin && attivoAllaData(c, data));
  if (!_memoRender) return calcola();
  const k = edificioId + '|' + (/^\d{4}-\d{2}-\d{2}/.test(data || '') ? String(data).slice(0, 10) : '');
  let v = _memoRender.cond.get(k);
  if (!v) { v = calcola(); _memoRender.cond.set(k, v); }
  return v;
}
// ── Competenza per mese (rate e spese ricorrenti, dal 2027) ───────────────
// Una spesa puntuale segue il GIORNO (condominiAllaData). Rate e spese
// ricorrenti si arrotondano al mese: il mese è di chi ha il condominio per più
// giorni; a parità (febbraio, 14 giorni a testa) di chi subentra. Così nessuna
// rata o occorrenza viene divisa a metà. Conta sempre la data della voce, non
// il giorno in cui la si inserisce. Vale dalla data COMPETENZA_MESE_DAL in
// poi: rendiconti e bilanci già chiusi non cambiano.
const COMPETENZA_MESE_DAL = '2027-01-01';
function ha2(n) { return String(n).padStart(2, '0'); }
// Giorni del mese di `data` in cui c fa parte del condominio (ingresso compreso, uscita esclusa).
function giorniNelMese(c, data) {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(data || '');
  if (!m) return { giorni: 0, lunghezza: 0, entraNelMese: false };
  const anno = +m[1], mese = +m[2];
  const lunghezza = new Date(anno, mese, 0).getDate();
  const primo = anno + '-' + m[2] + '-01', ultimo = anno + '-' + m[2] + '-' + ha2(lunghezza);
  const { inizio, fine } = periodoCondomino(c);
  const dal = inizio && inizio > primo ? (inizio > ultimo ? lunghezza + 1 : +inizio.slice(8, 10)) : 1;
  const al = fine && fine <= ultimo ? (fine <= primo ? 1 : +fine.slice(8, 10)) : lunghezza + 1;
  return { giorni: Math.max(0, al - dal), lunghezza, entraNelMese: !!inizio && inizio >= primo && inizio <= ultimo };
}
// Il mese di `data` è suo? Più della metà dei giorni; a metà esatta solo se subentra in quel mese.
function haIlMese(c, data) {
  const { giorni, lunghezza, entraNelMese } = giorniNelMese(c, data);
  if (!lunghezza) return false;
  return giorni * 2 > lunghezza || (giorni * 2 === lunghezza && entraNelMese);
}
function condominiPerMese(data, edificioId = state.edificioAttivo) {
  const calcola = () => state.condomini.filter(c => c.edificioId === edificioId && !c.superAdmin && haIlMese(c, data));
  if (!_memoRender) return calcola();
  const k = 'm|' + edificioId + '|' + String(data || '').slice(0, 10);
  let v = _memoRender.cond.get(k);
  if (!v) { v = calcola(); _memoRender.cond.set(k, v); }
  return v;
}
// Chi paga una voce a quella data: per mese se è una rata o una spesa ricorrente
// da COMPETENZA_MESE_DAL in poi, altrimenti per giorno.
function condominiCompetenza(data, edificioId, aMese) {
  const d = String(data || '').slice(0, 10);
  return aMese && d >= COMPETENZA_MESE_DAL ? condominiPerMese(d, edificioId) : condominiAllaData(d, edificioId);
}
// Chi paga la spesa s (ricorrente = per mese, puntuale = per giorno).
function condominiDellaSpesa(s, edificioId) {
  return condominiCompetenza(s.data, edificioId || s.edificioId || state.edificioAttivo, !!s.ricGruppoId);
}

// ── Memoria di un render (prestazioni, 2026-10-21) ────────────────────────
// Bilancio, Entrate, Confronto e Rendiconto chiedono migliaia di volte chi era
// nel condominio a una data e il totale di una ripartizione: con 2000 spese e
// 70 condomini erano milioni di filtri a ogni ridisegno (Entrate 10 s). Durante
// un render() i dati non cambiano, quindi i risultati si tengono da parte e si
// buttano alla fine del render: nessun valore vecchio fuori dal render, e le
// formule sono le stesse di prima (cambia solo quante volte si calcolano).
let _memoRender = null;
function conMemoRender(fn) {
  if (_memoRender) return fn();
  _memoRender = { cond: new Map(), ids: new WeakMap(), split: new WeakMap(), idx: new WeakMap() };
  try { return fn(); } finally { _memoRender = null; }
}
// Primo elemento con quell'id (come lista.find(x => x.id === id)), con un
// indice costruito una volta per render invece di scorrere la lista a ogni riga.
function trovaPerId(lista, id) {
  if (!_memoRender) return lista.find(x => x.id === id);
  let m = _memoRender.idx.get(lista);
  if (!m) { m = new Map(); lista.forEach(x => { if (!m.has(x.id)) m.set(x.id, x); }); _memoRender.idx.set(lista, m); }
  return m.get(id);
}

// Elenchi lunghi (Spese, Entrate): se ne disegnano RIGHE_PER_VOLTA alla volta,
// con "Mostra altre" in fondo. Totali, selezione ed esportazione restano
// sull'elenco intero. Prima con 2000 spese la pagina aveva 40.000 elementi e
// ogni ridisegno durava secondi.
const RIGHE_PER_VOLTA = 200;
function righeMostrate(chiave) { return (state.righeMostrate && state.righeMostrate[chiave]) || RIGHE_PER_VOLTA; }
function pulsanteAltreRighe(chiave, totale) {
  const n = righeMostrate(chiave);
  if (totale <= n) return '';
  return `<div class="altre-righe"><button type="button" class="btn btn-secondary btn-sm" data-altre-righe="${chiave}">Mostra altre ${Math.min(RIGHE_PER_VOLTA, totale - n)}</button><span class="hint">${n} di ${totale}</span></div>`;
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-altre-righe]');
    if (!b) return;
    const k = b.dataset.altreRighe;
    setState({ righeMostrate: { ...(state.righeMostrate || {}), [k]: righeMostrate(k) + RIGHE_PER_VOLTA } });
  });
}
// Insieme degli id di un elenco di condomini (memorizzato durante un render).
function idsDi(lista) {
  if (!_memoRender) return new Set(lista.map(c => c.id));
  let v = _memoRender.ids.get(lista);
  if (!v) { v = new Set(lista.map(c => c.id)); _memoRender.ids.set(lista, v); }
  return v;
}

// Percentuale da usare nei calcoli: le caselle della ripartizione hanno due
// decimali, quindi in parti uguali si salvava ad esempio 6 × 16,67% = 100,02%
// (6 € in più su 30.000 €). Una ripartizione che per arrotondamento somma tra
// 99,9% e 100,1% viene letta come 100% esatto, anche per le spese già salvate.
function percEffettiva(split, perc) {
  let tot = _memoRender && split ? _memoRender.split.get(split) : undefined;
  if (tot === undefined) {
    tot = (split || []).reduce((a, x) => a + (parseFloat(x.perc) || 0), 0);
    if (_memoRender && split) _memoRender.split.set(split, tot);
  }
  return tot > 99.9 && tot < 100.1 ? (parseFloat(perc) || 0) * 100 / tot : (parseFloat(perc) || 0);
}

// n parti uguali che sommano esattamente a 100,00%: si divide in centesimi e il
// resto va ai primi (stessa regola del pulsante "Parti uguali").
function partiUguali(n) {
  n = n || 1;
  return Array.from({ length: n }, (_, i) => (Math.floor(10000 / n) + (i < 10000 % n ? 1 : 0)) / 100);
}

// Vero se il condomino ha una quota maggiore di zero nella ripartizione di almeno una delle spese date
// (anche se è uscito prima: quota aggiunta a mano). Usata da Bilancio, Rendiconto ed Entrate.
function haQuotaNelleSpese(condId, spese) {
  return (spese || []).some(s => s.split?.some(x => x.id === condId && (x.perc || 0) > 0));
}

// Vero se il condomino ha movimenti registrati: una quota maggiore di zero in una spesa o un
// versamento (anche previsionale). Il riporto deriva da questi due, quindi li comprende.
// Un condomino con movimenti non si elimina, si archivia (CONS-025, ADV-FUNC-012): eliminarlo
// lo toglie dalle viste per condomino ma le sue quote restano nei totali.
function haMovimenti(condId, spese, entrate) {
  return (entrate || []).some(e => e.condominoId === condId) || haQuotaNelleSpese(condId, spese);
}

// Segnalazione per l'amministratore (CONS-028, decisione RA-7): versamenti e spese con una
// quota che un editor (può modificare, non è amministratore) ha inserito o modificato per
// ultimo e che riguardano il condomino collegato al suo stesso account. Nessun blocco: l'editor
// resta libero di farlo, ma l'amministratore lo vede. autore(tipo, record) restituisce
// { by: uid, at: millisecondi } dell'ultima scrittura (da _updatedBy/_updatedAt). La
// segnalazione dura 60 giorni; se un amministratore ritocca il record l'autore cambia e
// scompare. Con più di un record dello stesso editor si elencano tutti.
const GIORNI_SEGNALAZIONE_EDITOR = 60;
function segnalazioniEditor({ condomini, entrate, spese, autore, edificioId, adesso }) {
  const ora = adesso == null ? Date.now() : adesso;
  const limite = ora - GIORNI_SEGNALAZIONE_EDITOR * 86400000;
  const editorPerUid = new Map();
  (condomini || []).forEach(c => {
    if (c && c.uid && c.canEdit && !c.isAdmin && !c.superAdmin && String(c.edificioId) === String(edificioId)) editorPerUid.set(c.uid, c);
  });
  if (!editorPerUid.size) return [];
  const out = [];
  const esamina = (tipo, rec, riguarda) => {
    if (!rec || String(rec.edificioId) !== String(edificioId)) return;
    const a = autore(tipo, rec);
    if (!a || !a.by || (a.at != null && a.at < limite)) return;
    const ed = editorPerUid.get(a.by);
    const esito = ed && riguarda(ed);
    if (esito) out.push({ tipo, rec, editor: ed, at: a.at, ...(typeof esito === 'string' ? { quota: esito } : {}) });
  };
  (entrate || []).forEach(e => esamina('entrata', e, ed => String(e.condominoId) === String(ed.id)));
  // Spese (ADV-FUNC-017): oltre a chi ha una quota > 0, si segnala l'editor che era nel condominio alla data
  // della spesa ma ora ha la quota a 0% ('zero') o non ha più la riga ('assente'): è il modo di togliersi una
  // spesa. Serve una data valida per sapere chi c'era; senza data si segnala solo la quota > 0.
  (spese || []).forEach(s => esamina('spesa', s, ed => {
    const riga = (s.split || []).find(x => String(x.id) === String(ed.id));
    if (riga && (parseFloat(riga.perc) || 0) > 0) return true;
    if (!/^\d{4}-\d{2}-\d{2}/.test(s.data || '') || !attivoAllaData(ed, s.data)) return false;
    return riga ? 'zero' : 'assente';
  }));
  return out.sort((x, y) => (y.at || 0) - (x.at || 0));
}

// Riquadro di avviso (solo amministratori) con le segnalazioni di un tipo: 'entrata' o 'spesa'.
function renderSegnalazioniEditor(tipo) {
  if (!canUserAdmin(state.user)) return '';
  const chiave = tipo === 'entrata' ? 'cm_entrate' : 'cm_spese';
  const voci = segnalazioniEditor({
    condomini: state.condomini, entrate: state.entrate, spese: state.spese,
    autore: (t, r) => autoreRecord(t === 'entrata' ? 'cm_entrate' : 'cm_spese', r),
    edificioId: state.edificioAttivo,
  }).filter(v => v.tipo === tipo);
  if (!voci.length) return '';
  const riga = (v) => {
    const quando = v.at ? new Date(v.at).toLocaleDateString('it-IT') : '';
    const cosa = tipo === 'entrata'
      ? `versamento del ${esc(v.rec.data || '')} di ${fmt(v.rec.importo)}`
      : `spesa "${esc(v.rec.titolo || '')}" del ${esc(v.rec.data || '')}`;
    const nota = v.quota === 'zero' ? ' — la sua quota è a 0%' : (v.quota === 'assente' ? ' — senza la sua riga di ripartizione' : '');
    return `<li>${esc(v.editor.nome)}: ${cosa}${nota}${quando ? ` (modificato il ${esc(quando)})` : ''}</li>`;
  };
  const frase = tipo === 'entrata'
    ? 'Versamenti registrati o modificati dall\'editor a proprio nome'
    : 'Spese inserite o modificate dall\'editor in cui lui è condomino (con una sua quota, o con la quota azzerata o tolta)';
  return `<div class="alert alert-warning" style="font-size:13px;margin-bottom:1rem" data-segnalazioni-editor="${chiave}">
    <strong>👁 ${frase} (ultimi ${GIORNI_SEGNALAZIONE_EDITOR} giorni, ${voci.length})</strong>
    <ul style="margin:.4rem 0 0 1.1rem;padding:0">${voci.slice(0, 5).map(riga).join('')}</ul>
    ${voci.length > 5 ? `<div style="margin-top:.3rem">… e altri ${voci.length - 5}.</div>` : ''}
    <div style="margin-top:.4rem;color:var(--text2)">Non è un blocco: serve a controllare. La voce resta qui finché non passano ${GIORNI_SEGNALAZIONE_EDITOR} giorni o finché un amministratore non la modifica.</div>
  </div>`;
}

// Lettura uniforme di un importo salvato (di solito un testo: "1200.50"). Un valore vuoto
// o non numerico vale 0, così non diventa NaN nei totali (consolidato QA-CONS-020).
function importoNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Importo ammesso in un nuovo salvataggio: strettamente maggiore di zero, al massimo due
// decimali, punto come separatore (QA-CONS-020, scelta del proprietario: solo importi positivi).
function importoValido(v) {
  const t = String(v ?? '').trim();
  return /^\d+(\.\d{1,2})?$/.test(t) && parseFloat(t) > 0;
}
const MSG_IMPORTO = 'L\'importo deve essere maggiore di zero, con al massimo due decimali (niente zero né negativi). '
  + 'Una nota di credito o un rimborso si registra come entrata, oppure riducendo l\'importo della spesa originale.';

// Anno già passato (QA-CONS-029, ADV-FUNC-018, scelta del proprietario: nessun blocco, ma avviso).
// Inserire, modificare o eliminare una spesa o un versamento con data in un anno precedente a
// quello di oggi cambia i riporti e i rendiconti già inviati: prima di salvare l'amministratore
// deve confermare. Per una modifica l'avviso compare solo se cambia qualcosa che tocca i conti:
// data, importi, ripartizione tra i condomini (per un versamento: il condomino). Il solo testo
// (titolo, descrizione, categoria, allegati) non avvisa.
const MSG_ANNO_PASSATO = 'Stai modificando un anno già passato: i riporti e i rendiconti già inviati cambiano.';
const CAMPI_ANNO_SPESA = ['data', 'preventivo', 'consuntivo', 'split'];
const CAMPI_ANNO_ENTRATA = ['data', 'condominoId', 'importo', 'previsionale'];
function dataInAnnoPassato(data, oggi = ymdLocale(new Date())) {
  const a = parseInt(String(data ?? '').slice(0, 4), 10);
  return Number.isFinite(a) && a < parseInt(String(oggi).slice(0, 4), 10);
}
// Ripartizione in forma confrontabile: le righe a zero equivalgono a righe assenti.
function _quoteConfronto(split) {
  return (split || []).filter(x => (parseFloat(x.perc) || 0) > 0)
    .map(x => x.id + ':' + (parseFloat(x.perc) || 0).toFixed(2)).sort().join('|');
}
// prima = record com'era (null se nuovo), dopo = record com'è (null se eliminato).
function modificaAnnoPassato(prima, dopo, campi, oggi) {
  if (!prima && !dopo) return false;
  if (!dataInAnnoPassato(prima?.data, oggi) && !dataInAnnoPassato(dopo?.data, oggi)) return false;
  if (!prima || !dopo) return true;
  return campi.some(k => {
    if (k === 'split') return _quoteConfronto(prima.split) !== _quoteConfronto(dopo.split);
    if (k === 'preventivo' || k === 'consuntivo' || k === 'importo') return importoNum(prima[k]) !== importoNum(dopo[k]);
    if (k === 'previsionale') return !!prima[k] !== !!dopo[k];
    return String(prima[k] ?? '') !== String(dopo[k] ?? '');
  });
}
// Domanda di conferma per i salvataggi: true se si può procedere.
// Dove c'è già una domanda di conferma (eliminazioni) si aggiunge il testo alla stessa domanda.
function confermaAnnoPassato() {
  return chiedi(MSG_ANNO_PASSATO, { titolo: 'Anno già passato', conferma: 'Continua', pericolo: false });
}

// ── Avvisi di competenza (subentri) ───────────────────────────────────────
// Una spesa con ripartizione scritta a mano può assegnare una quota a chi, a
// quella data, non fa parte del condominio (esce prima, entra dopo), oppure
// lasciare a zero chi c'è. Lo si segnala al salvataggio: l'amministratore può
// salvare lo stesso (decisione: avviso, mai blocco). Solo se nel condominio ci
// sono subentri; per le ricorrenze vale il mese, per le spese puntuali il giorno.
// La data di uscita è il primo giorno in cui non c'è più: l'ultimo giorno è il precedente.
function giornoPrima(iso) { const d = new Date(iso.slice(0, 10) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
function dataItaliana(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
function avvisiCompetenzaSpesa(item) {
  const split = (item.split || []).filter(x => (parseFloat(x.perc) || 0) > 0);
  if (!split.length || !/^\d{4}-\d{2}-\d{2}/.test(item.data || '')) return [];
  const ed = item.edificioId || state.edificioAttivo;
  const tutti = state.condomini.filter(c => c.edificioId === ed && !c.superAdmin);
  if (!tutti.some(c => c.dataIngresso || c.dataUscita || c.disabled)) return [];
  const aMese = !!item.ricGruppoId || !!item.ricorrente;
  const presenti = new Set(condominiCompetenza(item.data, ed, aMese).map(c => c.id));
  const quando = aMese && String(item.data).slice(0, 10) >= COMPETENZA_MESE_DAL ? 'in questo mese' : 'in questa data';
  const periodo = (c) => {
    const { inizio, fine } = periodoCondomino(c);
    return [inizio ? 'dal ' + dataItaliana(inizio) : '', fine && fine !== '0000-00-00' ? 'fino al ' + dataItaliana(giornoPrima(fine)) : (c.disabled ? 'archiviato' : '')].filter(Boolean).join(', ');
  };
  const righe = [];
  split.forEach(x => {
    const c = tutti.find(t => t.id === x.id);
    if (c && !presenti.has(c.id)) righe.push('• ' + c.nome + ' ha il ' + fmtN(parseFloat(x.perc)) + '% ma ' + quando + ' non fa parte del condominio' + (periodo(c) ? ' (' + periodo(c) + ')' : '') + '.');
  });
  const conQuota = new Set(split.map(x => x.id));
  tutti.filter(c => presenti.has(c.id) && !conQuota.has(c.id))
    .forEach(c => righe.push('• ' + c.nome + ' fa parte del condominio ' + quando + ' ma non ha nessuna quota.'));
  return righe;
}
async function confermaCompetenzaSpesa(item) {
  const righe = avvisiCompetenzaSpesa(item);
  if (!righe.length) return true;
  return chiedi('Controlla la competenza di questa spesa (' + dataItaliana(item.data) + '):\n\n' + righe.join('\n')
    + '\n\nPuoi salvare lo stesso se è voluto.', { titolo: 'Competenza della spesa', conferma: 'Salva lo stesso', annulla: 'Torna a correggere', pericolo: false });
}

// Riporto di un condomino: versamenti reali meno quota delle spese consuntivate,
// sui movimenti la cui data soddisfa nelRiporto (es. tutti gli anni prima di quello scelto).
function riportoCondomino(condId, nelRiporto, nAttivi) {
  const edOk = (r) => !r.edificioId || r.edificioId === state.edificioAttivo;
  const versati = state.entrate.filter(e => edOk(e) && e.condominoId === condId && !e.previsionale && nelRiporto(e.data))
    .reduce((a, e) => a + (parseFloat(e.importo) || 0), 0);
  const quote = state.spese.filter(s => edOk(s) && nelRiporto(s.data))
    .reduce((a, s) => a + quotaSuSpesa(s, condId, parseFloat(s.consuntivo) || 0, nAttivi), 0);
  return versati - quote;
}

// Campo CSV (separatore ";"): virgolette se contiene separatore, virgolette o a-capo.
// QA (CSV injection): un testo che inizia con = + - @ verrebbe eseguito da
// Excel come formula (es. =HYPERLINK). Si antepone un apice, che Excel
// non mostra; i numeri (anche negativi) restano numeri.
function csvCampo(v) {
  const s = String(v ?? '');
  const t = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(,\d+)?$/.test(s) ? "'" + s : s;
  return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g,'""') + '"' : t;
}

// Scarica righe (array di array) come CSV con BOM, così Excel riconosce gli accenti.
function scaricaCSV(nomeFile, righe) {
  const corpo = righe.map(r => r.map(csvCampo).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + corpo], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeFile; a.click();
  URL.revokeObjectURL(url);
}

// getAnni per spese/entrate: include opzione "Tutti"
function getAnniConTutti() {
  return getAnni(); // usato nelle pagine spese/entrate dove c'è già l'opzione "Tutti gli anni"
}

// Calcola il saldo cumulativo fino alla fine dell'anno precedente (riporto)
function getSaldoRiporto(annoTarget) {
  const spesePrec  =     state.spese.filter(s=>!s.edificioId||s.edificioId===state.edificioAttivo).filter(s=>annoDi(s.data) < annoTarget)
  const entratePrec =     state.entrate.filter(e=>(!e.edificioId||e.edificioId===state.edificioAttivo)&&!e.previsionale&&annoDi(e.data)<annoTarget)
  const totSpesePrec   = spesePrec.reduce((a,s)=>a+importoNum(s.consuntivo),0);
  const totEntratePrec = entratePrec.reduce((a,e)=>a+importoNum(e.importo),0);
  return totEntratePrec - totSpesePrec; // saldo riportato dagli anni precedenti
}
