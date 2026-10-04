// Popola gli emulatori (progetto demo-qa) con un dataset fittizio:
// 2 edifici, utenti per ogni ruolo, casi limite di login.
// Le password sono SOLO di test, valide unicamente sull'emulatore locale.
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';
const path = require('path');
const req = require('module').createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = req('firebase-admin/app');
const { getAuth } = req('firebase-admin/auth');
const { getFirestore } = req('firebase-admin/firestore');
const { backfill } = require('../scripts/lib/buildings-migration');

const PROJECT = 'demo-qa';
const PASSWORD = 'QaTest-2026!';

// uid, email, claim iniziale (null = nessun claim: provisioning da whoami)
const USERS = [
  { uid: 'u-super',   email: 'superadmin@qa.test', claims: { role: 'superAdmin' } },
  { uid: 'u-admin1',  email: 'admin1@qa.test',     claims: { role: 'adminEdificio', buildingId: '1' } },
  { uid: 'u-editor1', email: 'editor1@qa.test',    claims: { role: 'editor', buildingId: '1' } },
  { uid: 'u-member1', email: 'member1@qa.test',    claims: { role: 'member', buildingId: '1' } },
  { uid: 'u-admin2',  email: 'admin2@qa.test',     claims: { role: 'adminEdificio', buildingId: '2' } },
  { uid: 'u-member2', email: 'member2@qa.test',    claims: { role: 'member', buildingId: '2' } },
  { uid: 'u-newbie',  email: 'newbie@qa.test',     claims: null },  // primo accesso
  { uid: 'u-stranger',email: 'stranger@qa.test',   claims: null },  // account Auth senza profilo
  { uid: 'u-dup',     email: 'dup@qa.test',        claims: null },  // email su 2 profili
  { uid: 'u-disabled',email: 'disabled@qa.test',   claims: { role: 'member', buildingId: '1' } },
  { uid: 'u-hijack',  email: 'hijack@qa.test',     claims: null },  // email di un profilo già collegato ad altro uid
];

const C = (id, nome, apt, email, edificioId, extra = {}) =>
  ({ id, nome, appartamento: apt, email, edificioId, canEdit: false, isAdmin: false, superAdmin: false, color: '#3B82F6', ...extra });

const condomini = [
  C(101, 'Anna Admin',   'Int. 1', 'admin1@qa.test',  1, { isAdmin: true, canEdit: true, uid: 'u-admin1' }),
  C(102, 'Elio Editor',  'Int. 2', 'editor1@qa.test', 1, { canEdit: true, uid: 'u-editor1' }),
  C(103, 'Marta Member', 'Int. 3', 'member1@qa.test', 1, { uid: 'u-member1' }),
  C(104, 'Nino Nuovo',   'Int. 4', 'newbie@qa.test',  1, { canEdit: true }),
  C(105, 'Dora Doppia',  'Int. 5', 'dup@qa.test',     1),
  C(106, 'Dino Disab.',  'Int. 6', 'disabled@qa.test',1, { disabled: true, uid: 'u-disabled' }),
  C(107, 'Ugo Usato',    'Int. 7', 'hijack@qa.test',  1, { uid: 'u-someone-else' }),
  C(201, 'Bruno Admin2', 'Int. A', 'admin2@qa.test',  2, { isAdmin: true, canEdit: true, uid: 'u-admin2' }),
  C(202, 'Bice Member2', 'Int. B', 'member2@qa.test', 2, { uid: 'u-member2' }),
  C(203, 'Dora Doppia',  'Int. C', 'dup@qa.test',     2),
];
const Y = new Date().getFullYear();
const spese = [
  { id: 1001, titolo: 'Pulizie scale', categoria: 'pulizie', tipoSpesa: 'ordinaria', preventivo: '1200', consuntivo: '1200', data: `${Y}-01-31`, edificioId: 1, allegati: [], split: [] },
  { id: 1002, titolo: 'Ascensore', categoria: 'ascensore', tipoSpesa: 'ordinaria', preventivo: '900', consuntivo: '', data: `${Y}-11-15`, edificioId: 1, allegati: [], split: [] },
  { id: 1003, titolo: 'Facciata', categoria: 'facciate', tipoSpesa: 'straordinaria', preventivo: '30000', consuntivo: '', data: `${Y + 1}-04-01`, edificioId: 1, allegati: [],
    split: [{ id: 101, perc: 40 }, { id: 102, perc: 30 }, { id: 103, perc: 30 }] },
  { id: 2001, titolo: 'SEGRETO edificio 2', categoria: 'altro', tipoSpesa: 'ordinaria', preventivo: '500', consuntivo: '500', data: `${Y}-02-10`, edificioId: 2, allegati: [], split: [] },
];
const entrate = [
  { id: 3001, condominoId: 101, importo: '500', data: `${Y}-01-10`, descrizione: 'Rata 1', categoria: 'quote', edificioId: 1, previsionale: false },
  { id: 3002, condominoId: 103, importo: '500', data: `${Y}-12-10`, descrizione: 'Rata 2', categoria: 'quote', edificioId: 1, previsionale: true },
  { id: 4001, condominoId: 201, importo: '800', data: `${Y}-01-10`, descrizione: 'Quota B2', categoria: 'quote', edificioId: 2, previsionale: false },
];
const fornitori = [
  { id: 5001, nome: 'Pulito Srl', categoria: 'pulizie', email: 'info@pulito.test', telefono: '0541000000', edificioId: 1 },
  { id: 6001, nome: 'Fornitore Edificio 2', categoria: 'altro', edificioId: 2 },
];
const bacheca = [
  { id: 7001, titolo: 'Chiusura acqua', testo: 'Martedì mattina', data: `${Y}-10-01`, priorita: 'alta', edificioId: 1 },
  { id: 7002, titolo: 'Avviso edificio 2', testo: 'riservato', data: `${Y}-10-01`, edificioId: 2 },
];
const verbali = [{ id: 8001, titolo: 'Assemblea ordinaria', data: `${Y}-03-20`, tipo: 'ordinaria', argomenti: ['bilancio', 'facciata'], decisioni: ['Approvato bilancio consuntivo'], edificioId: 1 }];
const lavori = [{ id: 9001, titolo: 'Rifacimento facciata', stato: 'in_corso', percentuale: 40, edificioId: 1 }];
const delibere = [{ id: 9501, titolo: 'Facciata', stato: 'approvata', budget: 30000, responsabile: 'Amministratore', edificioId: 1 }];

// legacyOnly: solo il vecchio formato (appdata/cm_*), per provare la migrazione.
async function seed({ legacyOnly = false } = {}) {
  const app = getApps()[0] || initializeApp({ projectId: PROJECT });
  const auth = getAuth(app);
  const db = getFirestore(app);

  // reset
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

  for (const u of USERS) {
    await auth.createUser({ uid: u.uid, email: u.email, password: PASSWORD, emailVerified: true });
    if (u.claims) {
      await auth.setCustomUserClaims(u.uid, u.claims);
      await db.collection('roles').doc(u.uid).set({ role: u.claims.role, buildingId: u.claims.buildingId || null });
    }
  }
  const put = (k, v) => db.collection('appdata').doc(k).set({ value: JSON.stringify(v) });
  await Promise.all([
    put('cm_edifici', [
      { id: 1, nome: 'Edificio QA Uno', indirizzo: 'Via Test 1', colore: '#2563EB', note: '' },
      { id: 2, nome: 'Edificio QA Due', indirizzo: 'Via Test 2', colore: '#10B981', note: '' },
    ]),
    put('cm_edificio_attivo', 1),
    put('cm_condomini', condomini), put('cm_spese', spese), put('cm_entrate', entrate),
    put('cm_fornitori', fornitori), put('cm_bacheca', bacheca), put('cm_verbali', verbali),
    put('cm_lavori', lavori), put('cm_delibere', delibere), put('cm_login_stats', {}),
    db.collection('appdata').doc('cm_config').set({ superAdminUid: 'u-super', superAdminEmail: 'superadmin@qa.test' }),
  ]);
  // Il modello per edificio si ottiene con la VERA migrazione: ogni seed la collauda.
  if (!legacyOnly) await backfill(db);
}
module.exports = { seed, USERS, PASSWORD, PROJECT };
if (require.main === module) seed().then(() => { console.log('Seed completato'); process.exit(0); }, (e) => { console.error(e); process.exit(1); });
