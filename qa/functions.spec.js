// Test di integrazione sugli emulatori (auth, firestore, functions) del
// progetto demo-qa: Cloud Functions, regole e migrazione, con il vero SDK
// client di Firebase e utenti reali per ogni ruolo. Ogni test riparte da un
// seed pulito (vecchio formato + migrazione reale). Eseguire con:
//   npm run test:functions
const assert = require('assert');
const { seed, PASSWORD, PROJECT } = require('./seed');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const fs = require('firebase/firestore');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const { adminDb } = require('../scripts/lib/firebase-admin');
const { backfill, verify, markCutover } = require('../scripts/lib/buildings-migration');

const admin = adminDb(PROJECT);
const apps = [];
let appSeq = 0;

// Un "browser" autenticato come `email`: { db, uid, call(fn, data) }.
async function as(email) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, authDomain: 'demo-qa.firebaseapp.com' }, `u${appSeq++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = fs.getFirestore(app);
  fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const cred = await signInWithEmailAndPassword(auth, email, PASSWORD);
  const call = async (name, data = {}) => {
    try { return { ok: true, data: (await httpsCallable(fns, name)(data)).data }; }
    catch (e) { return { ok: false, code: e.code, message: e.message }; }
  };
  return { db, uid: cred.user.uid, call, user: cred.user };
}
async function anonCall(name) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, `anon${appSeq++}`);
  apps.push(app);
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  try { await httpsCallable(fns, name)({}); return { ok: true }; } catch (e) { return { ok: false, code: e.code }; }
}
// Scrittura come la fa l'app: record + firma dell'autore. `prev` = documento letto
// con lo stesso SDK client (conserva autore e data di creazione).
function signed(u, rec, prev) {
  return { ...rec, _createdBy: prev ? prev._createdBy : u.uid, _createdAt: prev ? prev._createdAt : fs.serverTimestamp(),
    _updatedBy: u.uid, _updatedAt: fs.serverTimestamp(), _deleted: false };
}
const denied = async (p) => { try { await p; return false; } catch (e) { return /permission/i.test(e.code || e.message); } };
const waitFor = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 200)); }
  return null;
};
const auditOf = async (recordId) => (await admin.collection('auditEvents').where('recordId', '==', String(recordId)).get()).docs.map((d) => d.data());

describe('INTEGRAZIONE — modello per edificio su emulatori', function () {
  this.timeout(40000);
  beforeEach(async () => { await seed(); });
  afterEach(async () => { while (apps.length) await deleteApp(apps.pop()).catch(() => {}); });

  describe('migrazione dal vecchio formato', () => {
    it('MIG-01 copia tutti i record con conteggi, id e somme identici', async () => {
      assert.ok(await verify(admin), 'verifica fallita dopo il seed');
      const e = (await admin.doc('buildings/1/expenses/1003').get()).data();
      assert.strictEqual(e.titolo, 'Facciata');
      assert.strictEqual(e._createdBy, 'backfill');
      assert.strictEqual((await admin.doc('buildings/1/members/103').get()).data().emailLower, 'member1@qa.test');
    });
    it('MIG-02 rieseguirla non duplica nulla (idempotente)', async () => {
      await backfill(admin);
      assert.ok(await verify(admin));
      assert.strictEqual((await admin.collection('buildings/1/expenses').get()).size, 3);
    });
    it('MIG-03 si ferma senza scrivere se trova dati incoerenti', async () => {
      await seed({ legacyOnly: true });
      const ref = admin.collection('appdata').doc('cm_spese');
      const arr = JSON.parse((await ref.get()).data().value);
      arr.push({ id: 9999, titolo: 'Orfana', edificioId: 42 });
      await ref.set({ value: JSON.stringify(arr) });
      await assert.rejects(backfill(admin), /ABORTITA/);
      assert.strictEqual((await admin.collection('buildings').get()).size, 0);
    });
    it('MIG-05 sostituisce le copie di una prova precedente (metadati vecchi, record non più esistenti)', async () => {
      await admin.doc('buildings/1/expenses/1001').set({ id: 1001, titolo: 'vecchia copia', version: 1, createdAt: new Date() });
      await admin.doc('buildings/1/expenses/555').set({ id: 555, titolo: 'non più esistente' });
      await admin.doc('buildings/77').set({ id: 77, nome: 'edificio fantasma' });
      await admin.doc('buildings/77/expenses/1').set({ id: 1 });
      await backfill(admin);
      const e = (await admin.doc('buildings/1/expenses/1001').get()).data();
      assert.strictEqual(e.titolo, 'Pulizie scale');
      assert.ok(!('version' in e) && !('createdAt' in e));
      assert.ok(!(await admin.doc('buildings/1/expenses/555').get()).exists);
      assert.ok(!(await admin.doc('buildings/77').get()).exists && !(await admin.doc('buildings/77/expenses/1').get()).exists);
      assert.ok(await verify(admin));
    });
    it('MIG-06 dopo il cutover la copia dal vecchio formato è bloccata', async () => {
      await markCutover(admin, 'test');
      await assert.rejects(backfill(admin), /già conclusa/);
    });
    it('MIG-04 il blob originale resta intatto', async () => {
      const blob = JSON.parse((await admin.collection('appdata').doc('cm_spese').get()).data().value);
      assert.strictEqual(blob.length, 4);
    });
  });

  describe('whoami — identificazione al login', () => {
    it('FT-AUTH-01 superAdmin (da cm_config) riceve il profilo sintetico', async () => {
      const r = await (await as('superadmin@qa.test')).call('whoami');
      assert.ok(r.ok && r.data.isSuperAdmin, r.message);
    });
    it('FT-AUTH-02 adminEdificio riceve SOLO il proprio record, senza metadati né flag superAdmin', async () => {
      const r = await (await as('admin1@qa.test')).call('whoami');
      assert.ok(r.ok, r.message);
      assert.strictEqual(r.data.profile.id, 101);
      assert.ok(!('superAdmin' in r.data.profile) && !Object.keys(r.data.profile).some((k) => k.startsWith('_')));
    });
    it('FT-AUTH-03 primo accesso: collega uid e provisiona il ruolo dai flag legacy', async () => {
      const u = await as('newbie@qa.test');
      const r = await u.call('whoami');
      assert.ok(r.ok, r.message);
      assert.strictEqual((await admin.doc('buildings/1/members/104').get()).data().uid, 'u-newbie');
      await u.user.getIdToken(true);
      const claims = (await u.user.getIdTokenResult()).claims;
      assert.strictEqual(claims.role, 'editor');
      assert.strictEqual(claims.buildingId, '1');
    });
    it('FT-AUTH-04 account senza profilo → not-found', async () => {
      assert.strictEqual((await (await as('stranger@qa.test')).call('whoami')).code, 'functions/not-found');
    });
    it('FT-AUTH-05 email presente in due edifici → rifiuto esplicito', async () => {
      assert.strictEqual((await (await as('dup@qa.test')).call('whoami')).code, 'functions/failed-precondition');
    });
    it('FT-AUTH-06 profilo già collegato a un altro account → already-exists', async () => {
      assert.strictEqual((await (await as('hijack@qa.test')).call('whoami')).code, 'functions/already-exists');
    });
    it('FT-AUTH-07 chiamata non autenticata → unauthenticated', async () => {
      assert.strictEqual((await anonCall('whoami')).code, 'functions/unauthenticated');
    });
    it('FT-AUTH-08 profilo disabilitato restituito con disabled:true (il client lo blocca)', async () => {
      const r = await (await as('disabled@qa.test')).call('whoami');
      assert.ok(r.ok && r.data.profile.disabled === true);
    });
    it('FT-AUTH-09 ogni accesso viene registrato lato server', async () => {
      const u = await as('member1@qa.test');
      await u.call('whoami'); await u.call('whoami');
      const stats = JSON.parse((await admin.collection('appdata').doc('cm_login_stats').get()).data().value);
      assert.strictEqual(stats['103'].totale, 2);
    });
    it('FT-AUTH-10 un profilo cancellato non consente l\'accesso', async () => {
      await admin.doc('buildings/1/members/103').update({ _deleted: true });
      assert.strictEqual((await (await as('member1@qa.test')).call('whoami')).code, 'functions/not-found');
    });
  });

  describe('isolamento tra edifici', () => {
    it('SEC-ISO-01 un member legge il proprio edificio e non l\'altro', async () => {
      const u = await as('member1@qa.test');
      const mine = await fs.getDocs(fs.collection(u.db, 'buildings/1/expenses'));
      assert.strictEqual(mine.size, 3);
      assert.ok(await denied(fs.getDocs(fs.collection(u.db, 'buildings/2/expenses'))));
      assert.ok(await denied(fs.getDoc(fs.doc(u.db, 'buildings/2'))));
    });
    it('SEC-ISO-02 un member non può cercare profili in tutti gli edifici', async () => {
      const u = await as('member1@qa.test');
      assert.ok(await denied(fs.getDocs(fs.query(fs.collectionGroup(u.db, 'members'), fs.where('emailLower', '==', 'admin2@qa.test')))));
    });
    it('SEC-ISO-03 il superAdmin legge tutti gli edifici', async () => {
      const u = await as('superadmin@qa.test');
      assert.strictEqual((await fs.getDocs(fs.collection(u.db, 'buildings'))).size, 2);
      assert.strictEqual((await fs.getDocs(fs.collection(u.db, 'buildings/2/expenses'))).size, 1);
    });
  });

  describe('scritture e matrice ruoli', () => {
    it('FT-SAVE-01 un editor salva una spesa; un member no; un editor non scrive la bacheca', async () => {
      const ed = await as('editor1@qa.test');
      await fs.setDoc(fs.doc(ed.db, 'buildings/1/expenses/1099'), signed(ed, { id: 1099, titolo: 'Nuova', edificioId: 1 }));
      const m = await as('member1@qa.test');
      assert.ok(await denied(fs.setDoc(fs.doc(m.db, 'buildings/1/expenses/1098'), signed(m, { id: 1098, titolo: 'X', edificioId: 1 }))));
      assert.ok(await denied(fs.setDoc(fs.doc(ed.db, 'buildings/1/notices/7099'), signed(ed, { id: 7099, titolo: 'X', edificioId: 1 }))));
    });
    it('SEC-SAVE-02 un admin non scrive nell\'altro edificio', async () => {
      const a = await as('admin1@qa.test');
      assert.ok(await denied(fs.setDoc(fs.doc(a.db, 'buildings/2/expenses/2099'), signed(a, { id: 2099, titolo: 'X', edificioId: 2 }))));
    });
    it('SEC-SAVE-03 un admin non promuove un condomino a superAdmin né ne cambia l\'account', async () => {
      const a = await as('admin1@qa.test');
      const prev = (await fs.getDoc(fs.doc(a.db, 'buildings/1/members/103'))).data();
      const ref = fs.doc(a.db, 'buildings/1/members/103');
      assert.ok(await denied(fs.setDoc(ref, signed(a, { ...prev, superAdmin: true }, prev))));
      assert.ok(await denied(fs.setDoc(ref, signed(a, { ...prev, uid: 'u-attaccante' }, prev))));
      await fs.setDoc(ref, signed(a, { ...prev, nome: 'Marta M.' }, prev));
    });
    it('REL-SAVE-04 admin ed editor che inseriscono insieme non si cancellano i dati', async () => {
      const [a, e] = await Promise.all([as('admin1@qa.test'), as('editor1@qa.test')]);
      await Promise.all([
        fs.setDoc(fs.doc(a.db, 'buildings/1/expenses/1801'), signed(a, { id: 1801, titolo: 'Admin', edificioId: 1 })),
        fs.setDoc(fs.doc(e.db, 'buildings/1/expenses/1802'), signed(e, { id: 1802, titolo: 'Editor', edificioId: 1 })),
      ]);
      const ids = (await admin.collection('buildings/1/expenses').get()).docs.map((d) => d.id);
      assert.ok(ids.includes('1801') && ids.includes('1802') && ids.length === 5);
    });
    it('ROB-SAVE-05 testo con < > accettato; campi di forma sbagliata rifiutati', async () => {
      const a = await as('admin1@qa.test');
      await fs.setDoc(fs.doc(a.db, 'buildings/1/notices/7100'), signed(a, { id: 7100, titolo: 'Quota 5 > 3', edificioId: 1 }));
      assert.ok(await denied(fs.setDoc(fs.doc(a.db, 'buildings/1/minutes/8100'), signed(a, { id: 8100, titolo: 'X', argomenti: 'bilancio', edificioId: 1 }))));
    });
  });

  describe('auditTrail — registro delle modifiche', () => {
    it('AUD-01 creazione, modifica e cancellazione con autore e valori prima/dopo', async () => {
      const ed = await as('editor1@qa.test');
      const ref = fs.doc(ed.db, 'buildings/1/expenses/1500');
      await fs.setDoc(ref, signed(ed, { id: 1500, titolo: 'Ascensore', consuntivo: '100', edificioId: 1 }));
      const created = (await fs.getDoc(ref)).data();
      await fs.setDoc(ref, signed(ed, { id: 1500, titolo: 'Ascensore', consuntivo: '120', edificioId: 1 }, created));
      await fs.setDoc(ref, { ...signed(ed, { id: 1500, titolo: 'Ascensore', consuntivo: '120', edificioId: 1 }, created), _deleted: true, _deletedBy: ed.uid });
      // Attesa lunga: nella suite completa i reset precedenti accodano molti trigger.
      const evs = await waitFor(async () => { const e = await auditOf(1500); return e.length >= 3 ? e : null; }, 30000);
      assert.ok(evs, 'eventi di audit non registrati');
      const byType = Object.fromEntries(evs.map((e) => [e.type, e]));
      assert.strictEqual(byType['record.created'].actorUid, 'u-editor1');
      assert.deepStrictEqual(byType['record.updated'].changes.consuntivo, { from: '100', to: '120' });
      assert.strictEqual(byType['record.deleted'].actorUid, 'u-editor1');
      assert.strictEqual(byType['record.updated'].collection, 'expenses');
    });
    it('AUD-02 la migrazione non genera eventi', async () => {
      await new Promise((r) => setTimeout(r, 1500));
      assert.strictEqual((await admin.collection('auditEvents').where('actorUid', '==', 'backfill').get()).size, 0);
      // (il reset degli emulatori tra un test e l'altro genera eventi 'purged', esclusi)
      assert.strictEqual((await auditOf(1001)).filter((e) => e.type !== 'record.purged').length, 0);
    });
    it('AUD-03 il registro non è leggibile né scrivibile da un adminEdificio', async () => {
      const a = await as('admin1@qa.test');
      assert.ok(await denied(fs.getDocs(fs.collection(a.db, 'auditEvents'))));
      assert.ok(await denied(fs.addDoc(fs.collection(a.db, 'auditEvents'), { type: 'falso' })));
    });
  });

  describe('setUserRole', () => {
    it('SEC-ROLE-01 un adminEdificio non può assegnare ruoli', async () => {
      const r = await (await as('admin1@qa.test')).call('setUserRole', { targetUid: 'u-member1', role: 'adminEdificio', buildingId: '1' });
      assert.strictEqual(r.code, 'functions/permission-denied');
    });
    it('FT-ROLE-02 il superAdmin assegna un ruolo e lascia traccia', async () => {
      const r = await (await as('superadmin@qa.test')).call('setUserRole', { targetUid: 'u-member1', role: 'editor', buildingId: '1' });
      assert.ok(r.ok, r.message);
      assert.strictEqual((await admin.collection('auditEvents').where('type', '==', 'role.assigned').get()).size, 1);
    });
    it('FT-ROLE-03 edificio inesistente → invalid-argument', async () => {
      const r = await (await as('superadmin@qa.test')).call('setUserRole', { targetUid: 'u-member1', role: 'member', buildingId: '99' });
      assert.strictEqual(r.code, 'functions/invalid-argument');
    });
  });

  describe('dati globali (appdata)', () => {
    it('PRIV-01 un member non legge registro accessi né cm_config', async () => {
      const u = await as('member1@qa.test');
      assert.ok(await denied(fs.getDoc(fs.doc(u.db, 'appdata/cm_login_stats'))));
      assert.ok(await denied(fs.getDoc(fs.doc(u.db, 'appdata/cm_config'))));
    });
    it('INT-02 nessuno scrive più nel vecchio formato, nemmeno il superAdmin', async () => {
      const s = await as('superadmin@qa.test');
      assert.ok(await denied(fs.setDoc(fs.doc(s.db, 'appdata/cm_spese'), { value: '[]' })));
      const m = await as('member1@qa.test');
      assert.ok(await denied(fs.setDoc(fs.doc(m.db, 'appdata/cm_login_stats'), { value: '{}' })));
    });
    it('FT-GLOB-03 le vecchie funzioni ponte non esistono più', async () => {
      const r = await (await as('admin1@qa.test')).call('saveBuildingData', { key: 'cm_spese', records: [] });
      assert.ok(!r.ok);
    });
  });
});
