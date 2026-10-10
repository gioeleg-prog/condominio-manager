// Dati in memoria e costanti: colori, condomini e categorie predefiniti, marchio, stato dell'app (state/setState), cache load/save.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

const COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4'];

const CONDOMINI_DEFAULT = [
  {id:1, nome:'Mario Rossi', appartamento:'Int. 1', email:'mario@example.com', username:'mario.rossi', canEdit:true, color:COLORS[0]},
  {id:2, nome:'Lucia Bianchi', appartamento:'Int. 2', email:'lucia@example.com', canEdit:false, color:COLORS[1]},
  {id:3, nome:'Giorgio Ferrari', appartamento:'Int. 3', email:'giorgio@example.com', canEdit:false, color:COLORS[2]},
  {id:4, nome:'Anna Conti', appartamento:'Int. 4', email:'anna@example.com', canEdit:false, color:COLORS[3]},
  {id:5, nome:'Paolo Esposito', appartamento:'Int. 5', email:'paolo@example.com', canEdit:false, color:COLORS[4]},
  {id:6, nome:'Stefania Mancini', appartamento:'Int. 6', email:'stefania@example.com', canEdit:false, color:COLORS[5]},
];

let SUPER_ADMIN_UID   = null;

 // caricato da Firestore cm_config
let SUPER_ADMIN_EMAIL = null;

 // fallback email per riconoscere superAdmin
const ADMIN = null;

 // rimosso — superAdmin identificato da UID Firebase
// ⚠️ superAdmin:true → unico super-amministratore globale, vede tutti i condomini

const CATEGORIE_DEFAULT = [
  {id:'pulizie',        label:'Pulizie',                  tipo:'ordinaria',    icon:'🧹', builtin:true},
  {id:'luce_comuni',    label:'Luce parti comuni',        tipo:'ordinaria',    icon:'💡', builtin:true},
  {id:'acqua',          label:'Acqua',                    tipo:'ordinaria',    icon:'💧', builtin:true},
  {id:'ascensore',      label:'Ascensore (manutenzione)', tipo:'ordinaria',    icon:'🛗', builtin:true},
  {id:'giardinaggio',   label:'Giardinaggio',             tipo:'ordinaria',    icon:'🌿', builtin:true},
  {id:'assicurazione',  label:'Assicurazione',            tipo:'ordinaria',    icon:'🛡️', builtin:true},
  {id:'amministrazione',label:'Spese amministrazione',    tipo:'ordinaria',    icon:'📋', builtin:true},
  {id:'riparazioni',    label:'Riparazioni ordinarie',    tipo:'ordinaria',    icon:'🔧', builtin:true},
  {id:'riscaldamento',  label:'Riscaldamento',            tipo:'ordinaria',    icon:'🔥', builtin:true},
  {id:'ristrutturazione',label:'Ristrutturazione',        tipo:'straordinaria',icon:'🏗️', builtin:true},
  {id:'impianti',       label:'Impianti nuovi',           tipo:'straordinaria',icon:'⚡', builtin:true},
  {id:'facciate',       label:'Rifacimento facciate',     tipo:'straordinaria',icon:'🏢', builtin:true},
  {id:'tetto',          label:'Rifacimento tetto',        tipo:'straordinaria',icon:'🏠', builtin:true},
  {id:'quote',          label:'Quote condomino',          tipo:'entrata',      icon:'💰', builtin:true},
  {id:'altro',          label:'Altro',                    tipo:'ordinaria',    icon:'📦', builtin:true},
];

// Marchio (fase 2 QA): prima "Neri da Rimini 20" era scritto nel codice in 11
// punti. Ora il nome del prodotto e del fornitore stanno in appdata/cm_branding
// (modificabili dal superAdmin in Impostazioni) e l'intestazione mostra il nome
// dell'edificio attivo. Prima del login valgono i valori predefiniti.
const BRANDING_DEFAULT = { nomeProdotto: 'Condominio Manager', fornitore: 'Gioele Consulting' };

function getBranding() {
  const b = load('cm_branding', null);
  return { ...BRANDING_DEFAULT, ...(b && typeof b === 'object' ? b : {}) };
}

function nomeEdificioAttivo() {
  return (state.edifici.find(e => e.id === state.edificioAttivo) || {}).nome || '';
}

// CATEGORIE è ora dinamica — letta/salvata in localStorage
function getCategorie() {
  return load('cm_categorie', CATEGORIE_DEFAULT);
}

function saveCategorie(cats) {
  save('cm_categorie', cats);
}

// Alias per compatibilità con tutto il codice esistente
Object.defineProperty(window, 'CATEGORIE', { get: () => getCategorie(), configurable: true });

// ═══════════════════════════════════════════════════════
//  LAYER DI PERSISTENZA — Firebase Firestore
//  load/save sincroni per compatibilità con il codice
//  esistente; i dati Firestore vengono cachati in memoria
// ═══════════════════════════════════════════════════════
const _cache = {};

   // cache locale in memoria

function load(key, def) {
  return _cache[key] !== undefined ? _cache[key] : def;
}

function save(key, val) {
  _cache[key] = val;
  // scrivi su Firestore in background (non blocking)
  fbSaveKey(key, val);
}

let state = {
  page: 'dashboard',
  user: null,
  edifici: load('cm_edifici', []),
  edificioAttivo: load('cm_edificio_attivo', 1),
  condomini: load('cm_condomini', CONDOMINI_DEFAULT),
  spese: load('cm_spese', []),
  fornitori: load('cm_fornitori', []),
  entrate: load('cm_entrate', []),
  bacheca: load('cm_bacheca', []),
  verbali: load('cm_verbali', []),
  lavori: load('cm_lavori', []),
  delibere: load('cm_delibere', []),
  loginStats: load('cm_login_stats', {}), // { condominoId: { nome, ultimoLogin, totale, mensile:{'AAAA-MM':n} } }
  modal: null,
  filterCat: 'all',
  filterTipo: 'all',
  filterStato: 'all',
  filterFornitore: 'all',
  filterAnno: new Date().getFullYear(),
  // Verbali ha un archivio storico spesso sparso su pochi anni: un default
  // "anno corrente" (come Spese/Entrate) nasconderebbe silenziosamente tutto
  // il resto con il filtro che sembra "Tutti gli anni" nel <select> — campo
  // dedicato, non condiviso con filterAnno, che parte su "tutti gli anni".
  filterAnnoVerbali: 0,
  sortCol: 'data',   // colonna di ordinamento spese
  sortDir: 'desc',   // 'asc' | 'desc'
  speseSelezionate: new Set(), // ids selezionate per eliminazione massiva
  tab: 'spese',
  searchQ: '',
  sidebarOpen: false,
  viewer: null,
  pendingFiles: [],
  wizardStep: 1,
  wizardData: {},
  bilancioTab: 'overview',
  bilancioCondId: null,  // id condomino selezionato per dettaglio
  vitaTab: 'bacheca',    // tab attiva nella pagina "Vita condominiale"
  pianoRateConferma: null, // anno per cui è in attesa di conferma la generazione/rigenerazione del piano rate
  loginEmail: '',
  loginStep: 1,
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}
