// Ruoli e visibilità: edificio attivo, cosa vede e cosa può fare ogni ruolo.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// ===========================
// EDIFICIO HELPERS
// ===========================
function getEdificio() {
  const ed = state.edifici.find(e=>e.id===state.edificioAttivo);
  return ed || state.edifici[0] || {id:1, nome:'—', indirizzo:'', colore:'#2563EB'};
}

// Filtra condomini per edificio attivo
function getCondominiEdificio() {
  return state.condomini.filter(c => !c.edificioId || c.edificioId === state.edificioAttivo);
}

// Filtra spese per edificio attivo
function getSpeseEdificio() {
  return state.spese.filter(s => !s.edificioId || s.edificioId === state.edificioAttivo);
}

// Filtra entrate per edificio attivo
function getEntrateEdificio() {
  return state.entrate.filter(e => !e.edificioId || e.edificioId === state.edificioAttivo);
}

// ===========================
// ROLE HELPERS — SISTEMA MULTI-CONDOMINIO
// ===========================
// Quattro ruoli:
//   superAdmin      → Gioele — globale, vede TUTTO, gestisce tutti gli edifici
//   isAdmin         → Amm. edificio — vede/gestisce solo il SUO edificio
//   canEdit         → Modifica — aggiunge/modifica dati del suo edificio
//   default (lettura) → solo consultazione del suo edificio

function isSuperAdmin(u) {
  if (!u) return false;
  if (u.superAdmin) return true;
  if (SUPER_ADMIN_UID && u.uid && u.uid === SUPER_ADMIN_UID) return true;
  return false;
}

function isAdminEdificio(u) { return !!(u?.isAdmin && !u?.superAdmin); }

function canUserEdit(u) { return !!(u?.superAdmin || u?.isAdmin || u?.canEdit); }

function canUserAdmin(u) { return !!(u?.superAdmin || u?.isAdmin); }

function canUserSeeImpostazioni(u) { return !!(u?.superAdmin || u?.isAdmin); }

// Edificio a cui l'utente appartiene (superAdmin → edificioAttivo)
function getUserEdificio(u) {
  if (isSuperAdmin(u)) return state.edificioAttivo;
  return u?.edificioId || state.edificioAttivo;
}

// Filtra condomini visibili all'utente corrente
function getCondominiVisibili() {
  const edId = isSuperAdmin(state.user) ? state.edificioAttivo : getUserEdificio(state.user);
  return state.condomini.filter(c => !c.edificioId || c.edificioId === edId);
}

// Filtra spese visibili all'utente corrente
function getSpeseVisibili() {
  const edId = isSuperAdmin(state.user) ? state.edificioAttivo : getUserEdificio(state.user);
  return state.spese.filter(s => !s.edificioId || s.edificioId === edId);
}

// Filtra entrate visibili all'utente corrente
function getEntrateVisibili() {
  const edId = isSuperAdmin(state.user) ? state.edificioAttivo : getUserEdificio(state.user);
  return state.entrate.filter(e => !e.edificioId || e.edificioId === edId);
}

// Filtra avvisi bacheca visibili all'utente corrente
function getBachecaVisibili() {
  const edId = isSuperAdmin(state.user) ? state.edificioAttivo : getUserEdificio(state.user);
  return state.bacheca.filter(a => !a.edificioId || a.edificioId === edId);
}

// Filtra verbali visibili all'utente corrente
function getVerbaliVisibili() {
  const edId = isSuperAdmin(state.user) ? state.edificioAttivo : getUserEdificio(state.user);
  return state.verbali.filter(v => !v.edificioId || v.edificioId === edId);
}

// Filtra lavori visibili all'utente corrente
function getLavoriVisibili() {
  const edId = isSuperAdmin(state.user) ? state.edificioAttivo : getUserEdificio(state.user);
  return state.lavori.filter(l => !l.edificioId || l.edificioId === edId);
}

// Filtra delibere visibili all'utente corrente
function getDelibereVisibili() {
  const edId = isSuperAdmin(state.user) ? state.edificioAttivo : getUserEdificio(state.user);
  return state.delibere.filter(d => !d.edificioId || d.edificioId === edId);
}

function getRuolo(u) {
  if (u.superAdmin) return 'superadmin';
  if (u.isAdmin) return 'adminedificio';
  if (u.canEdit) return 'modifica';
  return 'lettura';
}

function getRuoloLabel(u) {
  if (u.superAdmin) return 'Super Admin';
  if (u.isAdmin) return 'Amm. Edificio';
  if (u.canEdit) return 'Modifica';
  return 'Lettura';
}

function getRuoloBadgeClass(u) {
  if (u.superAdmin) return 'badge-purple';
  if (u.isAdmin) return 'badge-blue';
  if (u.canEdit) return 'badge-green';
  return 'badge-gray';
}
