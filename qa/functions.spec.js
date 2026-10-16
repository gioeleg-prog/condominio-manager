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
const { adminDb, getStorage, getAuth: adminAuth } = require('../scripts/lib/firebase-admin');
const fnReq = require('module').createRequire(require('path').join(__dirname, '..', 'functions', 'package.json'));
const backupLib = fnReq('./backup');
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
const claimsOf = async (uid) => (await adminAuth().getUser(uid)).customClaims || {};
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
      // Privacy: l'email è nei contatti, non più nel record del condomino (seed: separaContatti).
      assert.strictEqual((await admin.doc('buildings/1/contatti/103').get()).data().emailLower, 'member1@qa.test');
      assert.ok(!('email' in (await admin.doc('buildings/1/members/103').get()).data()));
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
      assert.strictEqual(r.data.profile.email, 'admin1@qa.test', 'la propria email arriva dall\'account');
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
    // Decisione del 2026-10-15: un'email vale per un solo condominio, quello che l'ha inserita per primo.
    it('FT-AUTH-05 email presente in due condomini: vale il profilo inserito per primo, l\'altro resta libero', async () => {
      await admin.doc('buildings/2/members/203').update({ _createdAt: new Date('2025-01-01T10:00:00Z') });
      await admin.doc('buildings/1/members/105').update({ _createdAt: new Date('2026-01-01T10:00:00Z') });
      const u = await as('dup@qa.test');
      const r = await u.call('whoami');
      assert.ok(r.ok, r.message);
      assert.strictEqual(r.data.profile.id, 203);
      assert.strictEqual((await admin.doc('buildings/2/members/203').get()).data().uid, 'u-dup');
      assert.ok(!(await admin.doc('buildings/1/members/105').get()).data().uid, 'collegato anche il profilo inserito dopo');
      await u.user.getIdToken(true);
      assert.strictEqual((await u.user.getIdTokenResult()).claims.buildingId, '2');
    });
    it('FT-AUTH-05b due profili con la stessa email inseriti nello stesso istante → rifiuto esplicito', async () => {
      const t = new Date('2026-01-01T10:00:00Z');
      await admin.doc('buildings/2/members/203').update({ _createdAt: t });
      await admin.doc('buildings/1/members/105').update({ _createdAt: t });
      assert.strictEqual((await (await as('dup@qa.test')).call('whoami')).code, 'functions/failed-precondition');
    });
    it('FT-AUTH-13 uscito da un condominio ed entrato in un altro con la stessa email: entra nel nuovo', async () => {
      await admin.doc('buildings/2/members/202').update({ disabled: true, _updatedBy: 'u-admin2' });
      assert.ok(await waitFor(async () => !(await claimsOf('u-member2')).role, 30000), 'permessi del vecchio condominio non tolti');
      const meta = { _createdAt: new Date(), _createdBy: 'u-admin1', _updatedBy: 'u-admin1', _updatedAt: new Date(), _deleted: false };
      await admin.doc('buildings/1/members/108').set({ id: 108, nome: 'Bice Member2', appartamento: 'Int. 8', edificioId: 1, canEdit: false, isAdmin: false, superAdmin: false, ...meta });
      await admin.doc('buildings/1/contatti/108').set({ id: 108, edificioId: 1, email: 'member2@qa.test', emailLower: 'member2@qa.test', ...meta });
      const u = await as('member2@qa.test');
      const r = await u.call('whoami');
      assert.ok(r.ok && !r.data.profile.disabled, r.message);
      assert.strictEqual(r.data.profile.id, 108);
      await u.user.getIdToken(true);
      assert.deepStrictEqual([(await u.user.getIdTokenResult()).claims.role, (await u.user.getIdTokenResult()).claims.buildingId], ['member', '1']);
    });
    it('FT-AUTH-14 verificaEmail: avvisa l\'amministratore se l\'email è già in un altro condominio, senza dire quale', async () => {
      const a = await as('admin1@qa.test');
      const altro = await a.call('verificaEmail', { buildingId: '1', email: 'Member2@QA.test' });
      assert.ok(altro.ok, altro.message);
      assert.deepStrictEqual(altro.data, { altroCondominio: true });
      assert.deepStrictEqual((await a.call('verificaEmail', { buildingId: '1', email: 'member1@qa.test' })).data, { altroCondominio: false });
      assert.deepStrictEqual((await a.call('verificaEmail', { buildingId: '1', email: 'nessuno@qa.test' })).data, { altroCondominio: false });
      // un profilo archiviato nell'altro condominio non conta
      await admin.doc('buildings/2/members/202').update({ disabled: true });
      assert.deepStrictEqual((await a.call('verificaEmail', { buildingId: '1', email: 'member2@qa.test' })).data, { altroCondominio: false });
      assert.strictEqual((await a.call('verificaEmail', { buildingId: '2', email: 'admin2@qa.test' })).code, 'functions/permission-denied');
      assert.strictEqual((await (await as('member1@qa.test')).call('verificaEmail', { buildingId: '1', email: 'x@qa.test' })).code, 'functions/permission-denied');
    });
    it('FT-AUTH-06 profilo già collegato a un altro account → already-exists', async () => {
      assert.strictEqual((await (await as('hijack@qa.test')).call('whoami')).code, 'functions/already-exists');
    });
    it('FT-AUTH-07 chiamata non autenticata → unauthenticated', async () => {
      assert.strictEqual((await anonCall('whoami')).code, 'functions/unauthenticated');
    });
    it('FT-AUTH-08 profilo disabilitato restituito con disabled:true (il client lo blocca) e senza più permessi', async () => {
      const r = await (await as('disabled@qa.test')).call('whoami');
      assert.ok(r.ok && r.data.profile.disabled === true);
      assert.ok(!(await claimsOf('u-disabled')).role, 'il condomino disattivato ha ancora un ruolo');
      assert.strictEqual((await admin.doc('roles/u-disabled').get()).data().role, null);
    });
    it('FT-AUTH-12 superAdmin per email (cm_config) solo con email verificata', async () => {
      await admin.doc('appdata/cm_config').set({ superAdminUid: 'u-super', superAdminEmail: 'stranger@qa.test' });
      await adminAuth().updateUser('u-stranger', { emailVerified: false });
      assert.strictEqual((await (await as('stranger@qa.test')).call('whoami')).code, 'functions/not-found');
      assert.ok(!(await claimsOf('u-stranger')).role, 'email non verificata promossa a superAdmin');
      await adminAuth().updateUser('u-stranger', { emailVerified: true });
      const r = await (await as('stranger@qa.test')).call('whoami');
      assert.ok(r.ok && r.data.isSuperAdmin, r.message);
    });
    it('FT-AUTH-11 condomino uscito (data di uscita passata): niente ruolo al primo accesso', async () => {
      await admin.doc('buildings/1/members/104').update({ dataUscita: '2000-01-01' });
      const r = await (await as('newbie@qa.test')).call('whoami');
      assert.ok(r.ok && r.data.profile.disabled === true, r.message);
      assert.ok(!(await claimsOf('u-newbie')).role);
      const stats = JSON.parse((await admin.collection('appdata').doc('cm_login_stats').get()).data().value);
      assert.ok(!stats['104'], 'accesso registrato per un condomino uscito');
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
    it('AUD-01 creazione, modifica e cancellazione con autore e valori prima/dopo', async function () {
      this.timeout(90000);
      const ed = await as('editor1@qa.test');
      const ref = fs.doc(ed.db, 'buildings/1/expenses/1500');
      await fs.setDoc(ref, signed(ed, { id: 1500, titolo: 'Ascensore', consuntivo: '100', edificioId: 1 }));
      const created = (await fs.getDoc(ref)).data();
      await fs.setDoc(ref, signed(ed, { id: 1500, titolo: 'Ascensore', consuntivo: '120', edificioId: 1 }, created));
      await fs.setDoc(ref, { ...signed(ed, { id: 1500, titolo: 'Ascensore', consuntivo: '120', edificioId: 1 }, created), _deleted: true, _deletedBy: ed.uid });
      // Attesa lunga: nella suite completa i reset precedenti accodano molti trigger
      // (sul primo test del gruppo l'attesa supera già i 25 secondi).
      const evs = await waitFor(async () => { const e = await auditOf(1500); return e.length >= 3 ? e : null; }, 75000);
      assert.ok(evs, 'eventi di audit non registrati');
      const byType = Object.fromEntries(evs.map((e) => [e.type, e]));
      assert.strictEqual(byType['record.created'].actorUid, 'u-editor1');
      assert.deepStrictEqual(byType['record.updated'].changes.consuntivo, { from: '100', to: '120' });
      assert.strictEqual(byType['record.deleted'].actorUid, 'u-editor1');
      assert.strictEqual(byType['record.updated'].collection, 'expenses');
    });
    it('AUD-04 le delibere compaiono nel registro con la loro descrizione sintetica', async () => {
      const a = await as('admin1@qa.test');
      await fs.setDoc(fs.doc(a.db, 'buildings/1/resolutions/9600'), signed(a, { id: 9600, descrizioneSintetica: 'Rifacimento tetto', stato: 'approvata', edificioId: 1 }));
      const ev = await waitFor(async () => (await auditOf(9600))[0], 30000);
      assert.ok(ev, 'evento non registrato');
      assert.strictEqual(ev.titolo, 'Rifacimento tetto');
    });
    it('AUD-02 la migrazione non genera eventi', async () => {
      await new Promise((r) => setTimeout(r, 1500));
      // (gli eventi role.* sono permessi tolti al condomino già disattivato del seed)
      assert.strictEqual((await admin.collection('auditEvents').where('actorUid', '==', 'backfill').get()).docs.filter((d) => d.data().type.startsWith('record.')).length, 0);
      // (il reset degli emulatori tra un test e l'altro genera eventi 'purged', esclusi)
      assert.strictEqual((await auditOf(1001)).filter((e) => e.type !== 'record.purged').length, 0);
    });
    it('AUD-05 un amministratore che nomina un altro amministratore lascia una voce "Nomina" con il suo nome', async () => {
      const a = await as('admin1@qa.test');
      const ref = fs.doc(a.db, 'buildings/1/members/103');
      const prev = (await fs.getDoc(ref)).data();
      await fs.setDoc(ref, signed(a, { ...prev, isAdmin: true, canEdit: true }, prev));
      const ev = await waitFor(async () => (await admin.collection('auditEvents').where('type', '==', 'role.nominated').get()).docs[0]?.data(), 30000);
      assert.ok(ev, 'nomina non registrata');
      assert.deepStrictEqual([ev.recordId, ev.titolo, ev.role, ev.previousRole, ev.actorUid, ev.buildingId], ['103', 'Marta Member', 'adminEdificio', 'member', 'u-admin1', '1']);
      // togliere il ruolo non è una nomina
      const dopo = (await fs.getDoc(ref)).data();
      await fs.setDoc(ref, signed(a, { ...dopo, isAdmin: false, canEdit: false }, dopo));
      await new Promise((r) => setTimeout(r, 3000));
      assert.strictEqual((await admin.collection('auditEvents').where('type', '==', 'role.nominated').get()).size, 1);
    });
    it('AUD-03 il registro non è leggibile né scrivibile da un adminEdificio', async () => {
      const a = await as('admin1@qa.test');
      assert.ok(await denied(fs.getDocs(fs.collection(a.db, 'auditEvents'))));
      assert.ok(await denied(fs.addDoc(fs.collection(a.db, 'auditEvents'), { type: 'falso' })));
    });
  });

  describe('backup giornaliero e ripristino', () => {
    const bucket = () => getStorage().bucket('demo-qa.appspot.com');
    it('BAK-01 backup, database svuotato, ripristino: dati identici e nessun falso evento di audit', async () => {
      const prima = (await admin.doc('buildings/1/expenses/1003').get()).data();
      const res = await backupLib.runBackup(admin, bucket());
      assert.ok(res.docs > 40, 'backup troppo piccolo: ' + res.docs);
      const [buf] = await bucket().file(res.file).download();
      const backup = JSON.parse(buf.toString());
      // svuota tutto il database
      await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
      assert.strictEqual((await admin.collection('buildings').get()).size, 0);
      await backupLib.restoreBackup(admin, backup);
      const dopo = (await admin.doc('buildings/1/expenses/1003').get()).data();
      assert.strictEqual(dopo.titolo, prima.titolo);
      assert.deepStrictEqual(dopo.split, prima.split);
      assert.strictEqual(dopo._createdAt.toMillis(), prima._createdAt.toMillis());
      assert.ok(await verify(admin), 'dopo il ripristino i dati non combaciano');
      assert.ok((await admin.doc('appdata/cm_config').get()).exists);
      await new Promise((r) => setTimeout(r, 4000));
      const falsi = (await admin.collection('auditEvents').get()).docs.map((d) => d.data()).filter((e) => e.type === 'record.created');
      assert.strictEqual(falsi.length, 0, 'il ripristino ha generato eventi di creazione');
    });
    it('BAK-02 tiene 30 giorni di copie e cancella le più vecchie', async () => {
      await bucket().file('backups/2020-01-01.json').save('{}');
      await bucket().file('backups/altro-file.txt').save('x');
      const res = await backupLib.runBackup(admin, bucket());
      assert.strictEqual(res.removed, 1);
      assert.ok(!(await bucket().file('backups/2020-01-01.json').exists())[0]);
      assert.ok((await bucket().file('backups/altro-file.txt').exists())[0], 'cancellato un file che non è un backup');
    });
    it('BAK-03 un file che non è un backup viene rifiutato dal ripristino', async () => {
      await assert.rejects(backupLib.restoreBackup(admin, { collections: {} }), /non riconosciuto/);
    });
    it('BAK-04 backup notturno: esito salvato prima della copia su Drive; copia fallita non annulla il backup', async () => {
      const status = () => admin.doc('appSettings/backupStatus').get().then((s) => s.data());
      let durante;
      const drive = await backupLib.backupNotturno(admin, bucket(), { copia: async (body, giorno) => {
        durante = await status();
        assert.ok(JSON.parse(body).collections, 'la copia riceve il backup');
        assert.match(giorno, /^\d{4}-\d{2}-\d{2}$/);
        return { ok: true, configurata: true, file: `condominio-${giorno}.json.gz` };
      } });
      // se la funzione venisse interrotta durante la copia, resterebbe questo
      assert.strictEqual(durante.ok, true);
      assert.strictEqual(durante.drive.ok, false);
      assert.strictEqual(durante.drive.error, backupLib.COPIA_NON_CONCLUSA);
      assert.strictEqual(drive.ok, true);
      const dopo = await status();
      assert.strictEqual(dopo.ok, true);
      assert.deepStrictEqual([dopo.drive.ok, dopo.drive.error], [true, undefined]);
      assert.ok(!('body' in dopo), 'il contenuto del backup non va nell\'esito');

      await backupLib.backupNotturno(admin, bucket(), { copia: async () => { throw new Error('Google Drive non ha risposto entro 120 secondi'); } });
      const fallita = await status();
      assert.strictEqual(fallita.ok, true, 'il backup principale resta riuscito');
      assert.deepStrictEqual([fallita.drive.ok, fallita.drive.configurata], [false, true]);
      assert.match(fallita.drive.error, /120 secondi/);
    });
  });

  describe('setUserRole', () => {
    // Decisione del 2026-10-15: l'amministratore nomina nel proprio condominio, con limiti.
    it('SEC-ROLE-01 un adminEdificio assegna ruoli solo nel suo condominio, mai superAdmin, mai a chi sta altrove', async () => {
      const a = await as('admin1@qa.test');
      const ok = await a.call('setUserRole', { targetUid: 'u-member1', role: 'editor', buildingId: '1' });
      assert.ok(ok.ok, ok.message);
      assert.deepStrictEqual(await claimsOf('u-member1'), { role: 'editor', buildingId: '1' });
      const ev = (await admin.collection('auditEvents').where('targetUid', '==', 'u-member1').where('type', '==', 'role.assigned').get()).docs[0]?.data();
      assert.strictEqual(ev?.actorUid, 'u-admin1');
      const negato = async (dati) => (await a.call('setUserRole', dati)).code;
      assert.strictEqual(await negato({ targetUid: 'u-member1', role: 'superAdmin' }), 'functions/permission-denied');
      assert.strictEqual(await negato({ targetUid: 'u-member2', role: 'editor', buildingId: '2' }), 'functions/permission-denied');
      assert.strictEqual(await negato({ targetUid: 'u-member2', role: 'editor', buildingId: '1' }), 'functions/permission-denied');
      assert.strictEqual(await negato({ targetUid: 'u-super', role: 'member', buildingId: '1' }), 'functions/permission-denied');
      assert.strictEqual(await negato({ targetUid: 'u-disabled', role: 'editor', buildingId: '1' }), 'functions/permission-denied');
      assert.strictEqual(await negato({ targetUid: 'u-admin1', role: 'member', buildingId: '1' }), 'functions/permission-denied');
      assert.strictEqual((await claimsOf('u-admin1')).role, 'adminEdificio');
      const m = await (await as('editor1@qa.test')).call('setUserRole', { targetUid: 'u-member1', role: 'adminEdificio', buildingId: '1' });
      assert.strictEqual(m.code, 'functions/permission-denied');
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

  // Audit 2026-10-15: cambiare il record di un condomino allinea i permessi del
  // suo account (functions/permessi.js), ma solo verso il basso.
  describe('permessi dei condomini archiviati o declassati', () => {
    // permessi.js carica notifiche.js: nessuna email reale (come negli altri test)
    const permessi = () => { process.env.FUNCTIONS_EMULATOR = 'true'; return fnReq('./permessi')._test; };
    const modifica = async (a, id, cambi) => {
      const ref = fs.doc(a.db, `buildings/1/members/${id}`);
      const prev = (await fs.getDoc(ref)).data();
      await fs.setDoc(ref, signed(a, { ...prev, ...cambi }, prev));
    };
    it('PERM-01 archiviato dall\'amministratore: permessi tolti, token revocati, traccia nel registro', async () => {
      const a = await as('admin1@qa.test');
      const prima = (await adminAuth().getUser('u-member1')).tokensValidAfterTime;
      // tokensValidAfterTime ha la precisione del secondo: senza attesa, su una
      // macchina veloce la revoca può cadere nello stesso secondo del seed.
      await new Promise((r) => setTimeout(r, 1100));
      await modifica(a, 103, { disabled: true, dataUscita: '2026-01-01' });
      assert.ok(await waitFor(async () => !(await claimsOf('u-member1')).role, 30000), 'permessi non tolti');
      assert.strictEqual((await admin.doc('roles/u-member1').get()).data().role, null);
      assert.notStrictEqual((await adminAuth().getUser('u-member1')).tokensValidAfterTime, prima, 'token non revocati');
      const ev = await waitFor(async () => (await admin.collection('auditEvents').where('targetUid', '==', 'u-member1').get()).docs[0]?.data());
      assert.deepStrictEqual([ev.type, ev.previousRole, ev.actorUid], ['role.revoked', 'member', 'u-admin1']);
    });
    it('PERM-02 tolto "Modifica" a un editor: diventa member dello stesso edificio', async () => {
      await modifica(await as('admin1@qa.test'), 102, { canEdit: false });
      const c = await waitFor(async () => { const x = await claimsOf('u-editor1'); return x.role === 'member' ? x : null; }, 30000);
      assert.deepStrictEqual(c, { role: 'member', buildingId: '1' });
    });
    it('PERM-03 nessun aumento di permessi dal record: un admin che segna "isAdmin" non promuove', async () => {
      const a = await as('admin1@qa.test');
      await modifica(a, 103, { isAdmin: true, canEdit: true });
      await modifica(a, 103, { nome: 'Marta M.' }); // seconda scrittura: quando arriva il suo trigger, il primo è passato
      await new Promise((r) => setTimeout(r, 4000));
      assert.deepStrictEqual(await claimsOf('u-member1'), { role: 'member', buildingId: '1' });
    });
    it('PERM-04 non tocca il superAdmin né chi ha i permessi di un altro edificio', async () => {
      const { riduciPermessi } = permessi();
      assert.strictEqual(await riduciPermessi('u-super', '1', null, 'test'), false);
      assert.strictEqual(await riduciPermessi('u-member2', '1', null, 'test'), false);
      assert.deepStrictEqual(await claimsOf('u-member2'), { role: 'member', buildingId: '2' });
      assert.strictEqual((await claimsOf('u-super')).role, 'superAdmin');
    });
    it('PERM-05 controllo notturno: chi arriva alla data di uscita perde i permessi', async () => {
      await admin.doc('buildings/1/members/103').update({ dataUscita: '2999-01-01' });
      await new Promise((r) => setTimeout(r, 2000));
      assert.strictEqual((await claimsOf('u-member1')).role, 'member', 'uscita futura: permessi ancora validi');
      const { revocaUsciti } = permessi();
      assert.ok(await revocaUsciti('2999-01-01') >= 1);
      assert.ok(!(await claimsOf('u-member1')).role);
      assert.strictEqual((await claimsOf('u-admin1')).role, 'adminEdificio');
    });
    // Non regressione: l'uso normale non deve togliere permessi né scollegare nessuno.
    it('PERM-06 modifica qualunque di un condomino attivo: stessi permessi, nessuna revoca dei token', async () => {
      const prima = (await adminAuth().getUser('u-editor1')).tokensValidAfterTime;
      await modifica(await as('admin1@qa.test'), 102, { note: 'nuovo numero' });
      await new Promise((r) => setTimeout(r, 4000));
      assert.deepStrictEqual(await claimsOf('u-editor1'), { role: 'editor', buildingId: '1' });
      assert.strictEqual((await adminAuth().getUser('u-editor1')).tokensValidAfterTime, prima, 'token revocati senza motivo');
    });
    it('PERM-07 promozione dall\'app (setUserRole, poi record salvato): il permesso nuovo resta', async () => {
      // I trigger delle scritture del seed (migrazione e separazione dei contatti)
      // allineano i permessi al record di allora: devono finire prima della promozione.
      await new Promise((r) => setTimeout(r, 4000));
      const r = await (await as('superadmin@qa.test')).call('setUserRole', { targetUid: 'u-member1', role: 'editor', buildingId: '1' });
      assert.ok(r.ok, r.message);
      await modifica(await as('superadmin@qa.test'), 103, { canEdit: true });
      await modifica(await as('admin1@qa.test'), 103, { nome: 'Marta M.' }); // scrittura successiva qualunque
      await new Promise((r) => setTimeout(r, 4000));
      assert.deepStrictEqual(await claimsOf('u-member1'), { role: 'editor', buildingId: '1' });
    });
  });

  // Privacy (decisione del 2026-10-15): un condomino semplice vede degli altri solo nomi e quote.
  describe('privacy: contatti dei condomini', () => {
    const { separaContatti, verificaContatti } = require('../scripts/lib/contatti-migration');
    it('PRIV-02 un member legge i condomini senza email né telefono; amministratore ed editor leggono i contatti', async () => {
      const m = await as('member1@qa.test');
      const membri = (await fs.getDocs(fs.collection(m.db, 'buildings/1/members'))).docs.map((d) => d.data());
      assert.ok(membri.length >= 5);
      assert.ok(membri.every((x) => !('email' in x) && !('emailLower' in x) && !('telefono' in x)), 'email visibili a un condomino');
      assert.ok(await denied(fs.getDocs(fs.collection(m.db, 'buildings/1/contatti'))));
      for (const chi of ['admin1@qa.test', 'editor1@qa.test']) {
        const c = (await fs.getDocs(fs.collection((await as(chi)).db, 'buildings/1/contatti'))).docs.map((d) => d.data());
        assert.ok(c.some((x) => x.email === 'member1@qa.test'), chi + ' non legge i contatti');
      }
    });
    it('MIG-07 separazione dei contatti: idempotente, verifica pulita, si ferma su un conflitto senza toccare il condomino', async () => {
      assert.deepStrictEqual(await verificaContatti(admin), []);
      const ancora = await separaContatti(admin);
      assert.deepStrictEqual([ancora.daSpostare, ancora.creati, ancora.ripuliti], [0, 0, 0]);
      // record vecchio (non migrato) con un'email diversa da quella dei contatti
      await admin.doc('buildings/1/members/103').update({ email: 'altra@qa.test', emailLower: 'altra@qa.test', telefono: '333' });
      const prova = await separaContatti(admin, { dryRun: true });
      assert.strictEqual(prova.conflitti.length, 1);
      assert.strictEqual((await admin.doc('buildings/1/members/103').get()).data().email, 'altra@qa.test', 'la prova ha scritto');
      const esito = await separaContatti(admin);
      assert.strictEqual(esito.conflitti.length, 1);
      assert.strictEqual((await admin.doc('buildings/1/members/103').get()).data().email, 'altra@qa.test', 'condomino in conflitto toccato');
      assert.strictEqual((await admin.doc('buildings/1/contatti/103').get()).data().email, 'member1@qa.test');
      // record vecchio con la stessa email e un telefono: il telefono passa nei contatti
      await admin.doc('buildings/1/members/103').update({ email: 'member1@qa.test', emailLower: 'member1@qa.test' });
      await separaContatti(admin);
      assert.strictEqual((await admin.doc('buildings/1/contatti/103').get()).data().telefono, '333');
      assert.ok(!('telefono' in (await admin.doc('buildings/1/members/103').get()).data()));
      assert.deepStrictEqual(await verificaContatti(admin), []);
    });
    it('MIG-08 la separazione non crea voci nel registro modifiche', async () => {
      await admin.doc('buildings/1/members/102').update({ email: 'editor1@qa.test', emailLower: 'editor1@qa.test', telefono: '0541' });
      await separaContatti(admin);
      await new Promise((r) => setTimeout(r, 3000));
      const ev = (await admin.collection('auditEvents').where('recordId', '==', '102').get()).docs.map((d) => d.data())
        .filter((e) => e.actorUid === 'migrazione-contatti');
      assert.strictEqual(ev.length, 0);
    });
    it('MIG-09 email di un condomino cambiata dall\'amministratore: whoami e le email usano quella nuova', async () => {
      const a = await as('admin1@qa.test');
      const ref = fs.doc(a.db, 'buildings/1/contatti/104');
      const prev = (await fs.getDoc(ref)).data();
      await fs.setDoc(ref, signed(a, { id: 104, edificioId: 1, email: 'Nuovo@QA.test', emailLower: 'nuovo@qa.test' }, prev));
      await adminAuth().updateUser('u-newbie', { email: 'nuovo@qa.test' });
      const r = await (await as('nuovo@qa.test')).call('whoami');
      assert.ok(r.ok, r.message);
      assert.strictEqual(r.data.profile.id, 104);
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

// Email (functions/notifiche.js). Sugli emulatori nessuna email parte: ogni invio
// è solo registrato in buildings/{b}/invii (simulata: true) con i destinatari.
describe('INTEGRAZIONE — email ai condomini', function () {
  this.timeout(40000);
  beforeEach(async () => { await seed(); });
  const invii = async (b = '1') => (await admin.collection(`buildings/${b}/invii`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  // L'invio è registrato prima "in invio" e subito dopo con l'esito: si aspetta l'esito.
  const emails = (v) => (v.destinatari || []).map((d) => d.email);
  const TUTTI = [101, 102, 103, 104, 105, 106, 107];
  const avviso = (id, extra = {}) => ({ id, titolo: 'Acqua chiusa', testo: 'Martedì dalle 9 alle 12.', edificioId: 1, ...extra });
  async function scrivi(u, coll, rec) {
    const ref = fs.doc(u.db, 'buildings', '1', coll, String(rec.id));
    const prev = (await fs.getDoc(ref)).data();
    await fs.setDoc(ref, signed(u, rec, prev));
  }
  const PDF = Buffer.from('%PDF-1.4\n%prova\n%%EOF').toString('base64');

  it('avviso: va solo ai destinatari scelti, mai ad archiviati o a chi ha tolto "Riceve le email"', async () => {
    const a = await as('admin1@qa.test');
    await admin.doc('buildings/1/members/105').update({ emailNotifiche: false });
    await scrivi(a, 'notices', avviso(9001, { notificaEmail: 'c1', notificaDestinatari: [101, 103, 105, 106] }));
    const [v] = await waitFor(async () => { const l = await invii(); return l.length && l.every((x) => x.stato !== 'in invio') ? l : null; }, 30000);
    assert.strictEqual(v.stato, 'simulata');
    assert.strictEqual(v.tipo, 'avviso');
    assert.match(v.oggetto, /^Nuovo avviso: Acqua chiusa$/);
    assert.deepStrictEqual(emails(v).sort(), ['admin1@qa.test', 'member1@qa.test']);
    assert.deepStrictEqual(v.esclusi.map((e) => e.motivo).sort(), ['archiviato', 'ha tolto "Riceve le email"']);
  });

  it('senza elenco o senza casella nessuna email; stesso codice non rispedisce; codice nuovo sì', async () => {
    const a = await as('admin1@qa.test');
    await scrivi(a, 'notices', avviso(9002));
    await scrivi(a, 'notices', avviso(9002, { notificaEmail: 'c0' })); // senza elenco: mai "tutti" implicito
    await new Promise((r) => setTimeout(r, 2500));
    assert.strictEqual((await invii()).length, 0);
    await scrivi(a, 'notices', avviso(9002, { notificaEmail: 'c1', notificaDestinatari: TUTTI }));
    await waitFor(async () => (await invii()).length === 1);
    await scrivi(a, 'notices', avviso(9002, { notificaEmail: 'c1', notificaDestinatari: TUTTI, testo: 'Corretto.' }));
    await new Promise((r) => setTimeout(r, 2500));
    assert.strictEqual((await invii()).length, 1, 'stesso codice: nessun nuovo invio');
    await scrivi(a, 'notices', avviso(9002, { notificaEmail: 'c2', notificaDestinatari: [103] }));
    assert.ok(await waitFor(async () => (await invii()).length === 2), 'codice nuovo: nuovo invio');
  });

  it('verbale: oggetto e destinatari scelti', async () => {
    const a = await as('admin1@qa.test');
    await scrivi(a, 'minutes', { id: 9003, titolo: 'Assemblea ordinaria', data: '2026-09-30', tipo: 'ordinaria', argomenti: [], decisioni: ['Approvato bilancio'], allegati: [], edificioId: 1, notificaEmail: 'v1', notificaDestinatari: [102] });
    const [v] = await waitFor(async () => { const l = await invii(); return l.length && l.every((x) => x.stato !== 'in invio') ? l : null; }, 30000);
    assert.strictEqual(v.tipo, 'verbale');
    assert.deepStrictEqual(emails(v), ['editor1@qa.test']);
  });

  it("rendiconto PDF dall'app: solo l'amministratore del condominio, ai soli selezionati", async () => {
    const a = await as('admin1@qa.test');
    const r = await a.call('inviaEmail', { tipo: 'rendiconto', buildingId: '1', destinatari: [101, 103, 106], oggetto: 'Rendiconto 2026', messaggio: 'In allegato.', allegato: { nome: 'Rendiconto.pdf', base64: PDF } });
    assert.ok(r.ok, r.message);
    assert.strictEqual(r.data.inviati, 2);
    assert.strictEqual(r.data.esclusi.length, 1);
    const [v] = await invii();
    assert.strictEqual(v.tipo, 'rendiconto');
    assert.strictEqual(v.allegato, 'Rendiconto.pdf');
    assert.strictEqual(v.autoreUid, a.uid);
    const m = await (await as('member1@qa.test')).call('inviaEmail', { tipo: 'rendiconto', buildingId: '1', destinatari: [101], allegato: { nome: 'x.pdf', base64: PDF } });
    assert.strictEqual(m.code, 'functions/permission-denied');
    const altro = await (await as('admin2@qa.test')).call('inviaEmail', { tipo: 'rendiconto', buildingId: '1', destinatari: [101], allegato: { nome: 'x.pdf', base64: PDF } });
    assert.strictEqual(altro.code, 'functions/permission-denied');
    const nonPdf = await a.call('inviaEmail', { tipo: 'rendiconto', buildingId: '1', destinatari: [101], allegato: { nome: 'x.pdf', base64: Buffer.from('<html>').toString('base64') } });
    assert.strictEqual(nonPdf.code, 'functions/invalid-argument');
  });

  it("estratti conto e promemoria dall'app: un'email personale a ciascuno", async () => {
    const a = await as('admin1@qa.test');
    const e = await a.call('inviaEmail', { tipo: 'estratti', buildingId: '1', invii: [{ id: 101, anno: 2026, allegato: { nome: 'E1.pdf', base64: PDF } }, { id: 103, anno: 2026, allegato: { nome: 'E3.pdf', base64: PDF } }] });
    assert.ok(e.ok, e.message);
    assert.strictEqual(e.data.inviati, 2);
    const p = await a.call('inviaEmail', { tipo: 'promemoria', buildingId: '1', invii: [{ id: 103, rataImporto: 150, rataData: '2026-11-15', saldo: -300 }] });
    assert.strictEqual(p.data.inviati, 1);
    const tipi = (await invii()).map((v) => v.tipo).sort();
    assert.deepStrictEqual(tipi, ['estratti', 'promemoria']);
  });

  // Limiti (functions/limiti.js): 5 invii all'ora e 50 destinatari in 24 ore per condominio.
  it("limiti: al sesto invio dell'ora errore chiaro all'app e voce \"bloccata\" nello storico; l'altro condominio non è toccato", async () => {
    const a = await as('admin1@qa.test');
    const rend = (u, b) => u.call('inviaEmail', { tipo: 'rendiconto', buildingId: b, destinatari: [101], allegato: { nome: 'R.pdf', base64: PDF } });
    for (let i = 0; i < 5; i++) assert.ok((await rend(a, '1')).ok, 'invio ' + (i + 1));
    assert.deepStrictEqual((await a.call('inviaEmail', { tipo: 'verifica', buildingId: '1', n: 1 })).data.ok, false);
    const sesto = await rend(a, '1');
    assert.strictEqual(sesto.code, 'functions/resource-exhausted');
    assert.match(sesto.message, /Limite di invii raggiunto per questo condominio \(5 all'ora\): riprova tra (59|60) minuti/);
    const bloccate = (await invii()).filter((v) => v.stato === 'bloccata');
    assert.strictEqual(bloccate.length, 1);
    assert.match(bloccate[0].errore, /5 all'ora/);
    const r2 = await rend(await as('admin2@qa.test'), '2');
    assert.ok(r2.ok, r2.message);
  });

  it('limiti: avviso oltre i 50 destinatari del giorno non parte e resta "bloccata"; il codice scelto dal client non decide l\'invio', async () => {
    const a = await as('admin1@qa.test');
    await admin.doc('limitiEmail/1').set({ voci: [{ t: Date.now() - 3600e3 * 2, n: 49, orario: true }] });
    await scrivi(a, 'notices', avviso(9010, { notificaEmail: 'stesso', notificaDestinatari: [101, 103] }));
    const [v] = await waitFor(async () => { const l = await invii(); return l.length && l.every((x) => x.stato !== 'in invio') ? l : null; }, 30000);
    assert.strictEqual(v.stato, 'bloccata');
    assert.match(v.errore, /50 destinatari in 24 ore, già usati 49\): riprova tra circa 22 ore/);
    assert.ok(!v.id.includes('stesso'), 'id dello storico preso dal codice del client: ' + v.id);
  });

  it("storico: lo legge l'amministratore, non un condomino", async () => {
    await admin.doc('buildings/1/invii/x').set({ tipo: 'avviso', buildingId: '1' });
    assert.ok(!(await denied(fs.getDocs(fs.collection((await as('admin1@qa.test')).db, 'buildings/1/invii')))));
    assert.ok(await denied(fs.getDocs(fs.collection((await as('member1@qa.test')).db, 'buildings/1/invii'))));
  });

  it("promemoria automatici: spenti finché l'amministratore non li accende, poi una volta sola", async () => {
    process.env.FUNCTIONS_EMULATOR = 'true'; // nessuna email reale
    const fnReq = require('module').createRequire(require('path').join(__dirname, '..', 'functions', 'package.json'));
    const { _test } = fnReq('./notifiche');
    const fra3 = _test.dataTraGiorni(3), fra4 = _test.dataTraGiorni(4);
    const rata = (id, data, previsionale = true) => admin.doc(`buildings/1/payments/${id}`).set({ id, condominoId: 103, importo: '150', data, previsionale, edificioId: 1, _deleted: false });
    await Promise.all([rata(7001, fra3), rata(7002, fra4), rata(7003, fra3, false)]);
    assert.strictEqual(await _test.inviaPromemoriaRate(), 0, 'spenti di base');
    await admin.doc('buildings/1/impostazioni/email').set({ promemoriaAuto: true, giorniPreavviso: 3 });
    assert.strictEqual(await _test.inviaPromemoriaRate(), 1);
    assert.strictEqual(await _test.inviaPromemoriaRate(), 0, 'seconda esecuzione: già inviato');
    const v = (await invii()).filter((x) => x.tipo === 'promemoria-auto');
    assert.strictEqual(v.length, 1);
    assert.deepStrictEqual(emails(v[0]), ['member1@qa.test']);
  });
});

// Avvisi automatici al Super Admin (functions/controllo.js), sugli emulatori: email solo simulate.
describe('INTEGRAZIONE — avvisi automatici al Super Admin', function () {
  this.timeout(40000);
  let _test;
  before(() => {
    process.env.FUNCTIONS_EMULATOR = 'true'; // nessuna email reale
    _test = require('module').createRequire(require('path').join(__dirname, '..', 'functions', 'package.json'))('./controllo')._test;
  });
  beforeEach(async () => { await seed(); });
  const avvisi = async () => (await admin.collection('serviceAlerts').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const backupOk = (oreFa = 4) => admin.doc('appSettings/backupStatus').set({ ok: true, at: new Date(Date.now() - oreFa * 3600000), docs: 50, error: null });
  const errori = (n, oreFa = 1) => Promise.all(Array.from({ length: n }, (_, i) =>
    admin.collection('clientErrors').add({ message: i % 3 ? 'TypeError: x is undefined' : 'Salvataggio rifiutato', uid: 'u', at: new Date(Date.now() - oreFa * 3600000) })));

  it('tutto a posto: nessuna email, esito salvato per la schermata', async () => {
    await backupOk();
    await errori(4, 30); // errori vecchi: non contano
    const r = await _test.eseguiControllo();
    assert.strictEqual(r.ok, true, r.problemi.join('; '));
    assert.strictEqual(r.email, 'non necessaria');
    assert.strictEqual((await avvisi()).length, 0);
    const s = (await admin.doc('appSettings/controlloServizio').get()).data();
    assert.strictEqual(s.ok, true);
  });

  it('backup fallito, errori in aumento, email non partita: una sola email al giorno al Super Admin', async () => {
    await admin.doc('appSettings/backupStatus').set({ ok: false, at: new Date(), error: 'quota superata' });
    await errori(12);
    await admin.doc('buildings/1/invii/x1').set({ tipo: 'avviso', oggetto: 'Nuovo avviso: Acqua', stato: 'errore', errore: 'Invalid login', creatoIl: new Date() });
    await admin.doc('buildings/1/invii/x2').set({ tipo: 'avviso', oggetto: 'Ok', stato: 'inviata', creatoIl: new Date() });
    const r = await _test.eseguiControllo();
    assert.deepStrictEqual(r.problemi, ['Backup notturno non riuscito', "12 errori dell'app nelle ultime 24 ore", '1 email ai condomini non partita']);
    assert.strictEqual(r.email, 'simulata');
    const [a] = await avvisi();
    assert.deepStrictEqual(a.destinatari, ['superadmin@qa.test']);
    assert.match(a.oggetto, /3 problemi da controllare/);
    assert.ok(a.problemi[0].righe[0].includes('quota superata'));
    assert.ok(a.problemi[2].righe[0].includes('Invalid login'));
    // il documento leggibile dall'app ha solo i titoli
    const s = (await admin.doc('appSettings/controlloServizio').get()).data();
    assert.ok(!JSON.stringify(s).includes('quota superata'));
    const r2 = await _test.eseguiControllo();
    assert.strictEqual(r2.email, 'già inviata oggi');
    assert.strictEqual((await avvisi()).length, 1);
  });

  it('backup troppo vecchio e pochi errori stabili', async () => {
    await backupOk(40);
    for (let g = 1; g <= 7; g++) await errori(3, g * 24 + 2); // 3 al giorno nella settimana prima
    await errori(6); // oggi 6: sotto 10 e meno del triplo della media
    const r = await _test.eseguiControllo();
    assert.deepStrictEqual(r.problemi, ['Backup notturno non eseguito']);
  });

  it('backup saltato stanotte: alle 7:30 quello di ieri (28,5 ore) è già segnalato', async () => {
    await backupOk(28.5);
    assert.strictEqual((await _test.controllaBackup(Date.now())).titolo, 'Backup notturno non eseguito');
    await backupOk(25);
    assert.strictEqual(await _test.controllaBackup(Date.now()), null);
  });

  it('avviso del giorno rimasto "in invio" o in errore: il controllo successivo riprova; in invio da poco no', async () => {
    const controlli = [['del backup', async () => ({ titolo: 'Backup notturno non riuscito', righe: [] })]];
    assert.strictEqual((await _test.eseguiControllo({ controlli })).email, 'simulata');
    const [a] = await avvisi();
    const ref = admin.doc('serviceAlerts/' + a.id);
    // funzione interrotta tra la creazione e la spedizione, 20 minuti fa
    await ref.update({ stato: 'in invio', inInvioDal: new Date(Date.now() - 20 * 60000) });
    assert.strictEqual((await _test.eseguiControllo({ controlli })).email, 'simulata');
    assert.deepStrictEqual([(await ref.get()).data().stato, (await ref.get()).data().tentativi], ['simulata', 2]);
    // un'altra esecuzione sta spedendo adesso: non si spedisce due volte
    await ref.update({ stato: 'in invio', inInvioDal: new Date() });
    assert.strictEqual((await _test.eseguiControllo({ controlli })).email, 'già in invio');
    // invio precedente in errore: si riprova e l'errore vecchio sparisce
    await ref.update({ stato: 'errore', errore: 'Invalid login' });
    assert.strictEqual((await _test.eseguiControllo({ controlli })).email, 'simulata');
    const dopo = (await ref.get()).data();
    assert.deepStrictEqual([dopo.stato, dopo.errore, dopo.tentativi], ['simulata', undefined, 3]);
    assert.strictEqual((await avvisi()).length, 1);
  });

  it('email ai condomini rimasta "in invio" da prima delle 24 ore: segnalata comunque', async () => {
    const ore = (h) => new Date(Date.now() - h * 3600000);
    await admin.doc('buildings/1/invii/v1').set({ tipo: 'avviso', oggetto: 'Bloccata', stato: 'in invio', creatoIl: ore(25) });
    await admin.doc('buildings/1/invii/v2').set({ tipo: 'avviso', oggetto: 'Vecchia ok', stato: 'inviata', creatoIl: ore(25) });
    await admin.doc('buildings/1/invii/v3').set({ tipo: 'avviso', oggetto: 'In corso', stato: 'in invio', creatoIl: ore(0.5) });
    await admin.doc('buildings/1/invii/v4').set({ tipo: 'avviso', oggetto: 'Ferma', stato: 'in invio', creatoIl: ore(2) });
    const p = await _test.controllaEmail(Date.now());
    assert.strictEqual(p.titolo, '2 email ai condomini non partite');
    assert.ok(p.righe.some((r) => r.includes('Bloccata')) && p.righe.some((r) => r.includes('Ferma')), p.righe.join('\n'));
  });

  it('un controllo che non riesce diventa un problema e non fa perdere gli altri', async () => {
    const controlli = [
      ['del backup', async () => ({ titolo: 'Backup notturno non riuscito', righe: ['quota superata'] })],
      ['degli errori dell\'app', async () => { throw new Error('Firestore non disponibile'); }],
      ['delle email ai condomini', async () => null],
    ];
    const r = await _test.eseguiControllo({ controlli });
    assert.deepStrictEqual(r.problemi, ['Backup notturno non riuscito', 'Controllo degli errori dell\'app non riuscito']);
    assert.strictEqual(r.email, 'simulata');
    const [a] = await avvisi();
    assert.match(a.problemi[1].righe[0], /Firestore non disponibile/);
  });

  it('destinatari: utente cancellato saltato; Auth in errore senza altri indirizzi = email in errore, non "nessun destinatario"', async () => {
    const controlli = [['del backup', async () => ({ titolo: 'Backup notturno non riuscito', righe: [] })]];
    await admin.doc('appdata/cm_config').set({ superAdminEmail: '' }, { merge: true });
    const conErrore = (code, message) => ({ getUser: async () => { throw Object.assign(new Error(message), { code }); } });
    const cancellato = await _test.eseguiControllo({ controlli, auth: conErrore('auth/user-not-found', 'utente non trovato') });
    assert.strictEqual(cancellato.email, 'nessun destinatario');
    await admin.collection('serviceAlerts').get().then((s) => Promise.all(s.docs.map((d) => d.ref.delete())));
    const r = await _test.eseguiControllo({ controlli, auth: conErrore('auth/internal-error', 'Auth non raggiungibile') });
    assert.strictEqual(r.email, 'errore');
    assert.match(r.errore, /Auth non raggiungibile/);
    const s = (await admin.doc('appSettings/controlloServizio').get()).data();
    assert.strictEqual(s.email, 'errore');
  });

  it('email di prova: solo il Super Admin, parte anche se è tutto a posto', async () => {
    await backupOk();
    const m = await (await as('admin1@qa.test')).call('provaAvvisi');
    assert.strictEqual(m.code, 'functions/permission-denied');
    const s = await (await as('superadmin@qa.test')).call('provaAvvisi');
    assert.ok(s.ok, s.message);
    assert.strictEqual(s.data.email, 'simulata');
    assert.strictEqual(s.data.destinatari, 1);
    const [a] = await avvisi();
    assert.strictEqual(a.prova, true);
    assert.match(a.oggetto, /^\[Prova\]/);
  });

  it("i dettagli degli avvisi non sono leggibili dall'app, nemmeno dal Super Admin", async () => {
    await admin.doc('serviceAlerts/x').set({ oggetto: 'x' });
    assert.ok(await denied(fs.getDoc(fs.doc((await as('superadmin@qa.test')).db, 'serviceAlerts/x'))));
  });
});

// Copia del backup su Google Drive (functions/drive.js): regole di conservazione e
// comportamento senza autorizzazione. Il caricamento vero si prova in produzione.
describe('UNITÀ — limiti alle email', function () {
  const { _test: { valuta }, LIMITI } = require('module').createRequire(require('path').join(__dirname, '..', 'functions', 'package.json'))('./limiti');
  const ORA = 3600e3, ora = Date.parse('2026-10-15T12:00:00Z');
  const voci = (...l) => l.map(([minFa, n, orario = true]) => ({ t: ora - minFa * 60e3, n, orario }));

  it('limiti scelti il 2026-10-15', () => {
    assert.deepStrictEqual(LIMITI, { inviiOra: 5, destinatariGiorno: 50, casellaGiorno: 400 });
  });
  it("5 invii nell'ultima ora: il sesto aspetta che esca il più vecchio; i promemoria automatici non contano", () => {
    const cinque = voci([50, 1], [40, 1], [30, 1], [20, 1], [10, 1]);
    const r = valuta(cinque, [], 1, {}, ora);
    assert.strictEqual(r.ok, false);
    assert.match(r.messaggio, /riprova tra 10 minuti/);
    assert.ok(valuta(voci([50, 1, false], [40, 1, false], [30, 1, false], [20, 1, false], [10, 1, false]), [], 1, {}, ora).ok);
    assert.ok(valuta(cinque, [], 1, { orario: false }, ora).ok, 'promemoria automatico bloccato dal limite orario');
    assert.ok(valuta(voci([70, 1], [40, 1], [30, 1], [20, 1], [10, 1]), [], 1, {}, ora).ok, 'invio di più di un\'ora fa contato');
  });
  it('50 destinatari in 24 ore, finestra mobile', () => {
    const r = valuta(voci([23 * 60, 30], [60 * 2, 15]), [], 10, {}, ora);
    assert.strictEqual(r.ok, false);
    assert.match(r.messaggio, /già usati 45\): riprova tra (59|60) minuti/);
    assert.ok(valuta(voci([23 * 60, 30], [60 * 2, 15]), [], 5, {}, ora).ok);
    assert.ok(valuta(voci([25 * 60, 50]), [], 50, {}, ora).ok, 'invio di più di 24 ore fa contato');
    assert.match(valuta([], [], 51, {}, ora).messaggio, /Troppi destinatari in un solo invio/);
  });
  it('casella: 400 destinatari in 24 ore per tutti i condomini insieme', () => {
    const r = valuta([], voci([60, 395]), 10, {}, ora);
    assert.strictEqual(r.ok, false);
    assert.match(r.messaggio, /casella delle notifiche/);
    const ok = valuta([], voci([60, 390]), 10, {}, ora);
    assert.ok(ok.ok);
    assert.strictEqual(ok.casella.length, 2);
    assert.strictEqual(ok.edificio.length, 1);
  });
  it('le voci più vecchie di 24 ore vengono tolte', () => {
    const r = valuta(voci([25 * 60, 10], [60, 1]), voci([25 * 60, 10]), 1, {}, ora);
    assert.deepStrictEqual([r.edificio.length, r.casella.length], [2, 1]);
  });
});

describe('UNITÀ — copia del backup su Google Drive', function () {
  const drive = require('module').createRequire(require('path').join(__dirname, '..', 'functions', 'package.json'))('./drive');
  const nome = (d) => `condominio-${d}.json.gz`;
  const giorni = (da, n) => Array.from({ length: n }, (_, i) => new Date(Date.parse(da + 'T12:00:00Z') + i * 86400000).toISOString().slice(0, 10));

  it('tiene 14 giorni, il primo di ogni mese per 12 mesi, il primo di ogni anno per sempre', () => {
    const tutti = giorni('2024-06-15', 900).map(nome); // fino a fine 2026
    const oggi = '2026-12-01';
    const via = new Set(drive.tieniDaCancellare(tutti.concat(['altro.txt']), oggi));
    const resta = tutti.filter((n) => !via.has(n));
    assert.ok(!via.has('altro.txt'), 'mai toccare file che non sono backup');
    for (const d of giorni('2026-11-18', 14)) assert.ok(resta.includes(nome(d)), 'giorno ' + d);
    for (const m of ['2026-01', '2026-06', '2026-11', '2026-12']) assert.ok(resta.some((n) => n.includes(m + '-01')), 'mese ' + m);
    assert.ok(resta.includes(nome('2024-06-15')) && resta.includes(nome('2025-01-01')), 'primo di ogni anno');
    assert.ok(!resta.includes(nome('2025-11-01')), 'mese oltre i 12 mesi tolto (solo il primo dell\'anno resta)');
    assert.ok(via.has(nome('2026-10-15')), 'giorno qualsiasi vecchio tolto');
    assert.ok(resta.length < 40, 'troppi file: ' + resta.length);
  });

  it('senza autorizzazione: copia saltata e segnalata, nessuna chiamata a Google', async () => {
    for (const v of [undefined, '', 'non-configurato', '{"client_id":"x"}']) {
      const r = await drive.copiaSuDrive(v, '{}', '2026-10-13');
      assert.deepStrictEqual([r.ok, r.configurata], [false, false]);
    }
  });

  it('Google che non risponde: la copia si interrompe dopo il tempo massimo con un errore chiaro', async () => {
    const vero = global.fetch;
    // fetch finto che non risponde mai, ma rispetta l'interruzione
    global.fetch = (url, opz) => new Promise((_, rifiuta) => opz.signal.addEventListener('abort', () => rifiuta(opz.signal.reason)));
    try {
      const cred = JSON.stringify({ client_id: 'x', client_secret: 'y', refresh_token: 'z' });
      await assert.rejects(drive.copiaSuDrive(cred, '{}', '2026-10-14', { limiteMs: 100 }), /non ha risposto entro/);
    } finally { global.fetch = vero; }
  });

  // fetch finto di Google Drive: cartella "cart" con i file presenti; caricato(gz)
  // è la risposta al caricamento, cancella[id] lo stato HTTP della DELETE (o 'rete').
  const cred = JSON.stringify({ client_id: 'x', client_secret: 'y', refresh_token: 'z' });
  const conDriveFinto = async ({ presenti = [], caricato, cancella = {} }, prova) => {
    const vero = global.fetch;
    const risposta = (x, status = 200) => new Response(status === 204 ? null : JSON.stringify(x), { status });
    const cancellati = [];
    global.fetch = async (url, opz = {}) => {
      if (url.startsWith('https://oauth2')) return risposta({ access_token: 't' });
      if (opz.method === 'DELETE') {
        const id = url.split('/').pop();
        cancellati.push(id);
        if (cancella[id] === 'rete') throw new TypeError('fetch failed');
        return risposta({}, cancella[id] || 204);
      }
      if (url.includes('/upload/')) {
        const corpo = Buffer.from(opz.body);
        const inizio = corpo.indexOf('application/gzip\r\n\r\n') + 20;
        return risposta(caricato(corpo.subarray(inizio, corpo.lastIndexOf('\r\n--'))));
      }
      if (decodeURIComponent(url).includes("in parents")) return risposta({ files: presenti });
      return risposta({ files: [{ id: 'cart' }] });
    };
    try { return await prova(cancellati); } finally { global.fetch = vero; }
  };

  it('caricamento senza id o con dimensione diversa: copia non riuscita', async () => {
    await conDriveFinto({ caricato: () => ({ name: 'condominio-2026-10-14.json.gz' }) }, () =>
      assert.rejects(drive.copiaSuDrive(cred, '{"a":1}', '2026-10-14'), /Caricamento incompleto: Drive ha registrato nessun file/));
    await conDriveFinto({ caricato: (gz) => ({ id: 'f', name: 'n', size: String(gz.length - 1) }) }, () =>
      assert.rejects(drive.copiaSuDrive(cred, '{"a":1}', '2026-10-14'), /Caricamento incompleto: Drive ha registrato \d+ byte su \d+/));
    await conDriveFinto({ caricato: (gz) => ({ id: 'f', name: 'n', size: String(gz.length) }) }, async () =>
      assert.strictEqual((await drive.copiaSuDrive(cred, '{"a":1}', '2026-10-14')).ok, true));
  });

  it('copie vecchie che Drive non cancella (403, 5xx, rete): contate nell\'esito, la copia resta riuscita', async () => {
    const presenti = ['2026-08-01', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'].map((d) => ({ id: d, name: nome(d) }));
    const cancella = { '2026-08-11': 403, '2026-08-12': 503, '2026-08-13': 404, '2026-08-14': 'rete' };
    await conDriveFinto({ presenti, cancella, caricato: (gz) => ({ id: 'f', name: nome('2026-10-14'), size: String(gz.length) }) }, async (cancellati) => {
      const r = await drive.copiaSuDrive(cred, '{"a":1}', '2026-10-14');
      assert.deepStrictEqual(cancellati, ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'], 'il primo del mese/anno resta');
      assert.deepStrictEqual([r.ok, r.rimossi, r.nonRimossi], [true, 2, 3]);
    });
  });
});

describe('INTEGRAZIONE — il controllo delle 7:30 segnala la copia su Drive', function () {
  this.timeout(20000);
  let _test;
  before(() => { process.env.FUNCTIONS_EMULATOR = 'true'; _test = require('module').createRequire(require('path').join(__dirname, '..', 'functions', 'package.json'))('./controllo')._test; });
  beforeEach(async () => { await seed(); });
  it('non attiva e non riuscita sono problemi; riuscita no', async () => {
    const stato = (drive) => admin.doc('appSettings/backupStatus').set({ ok: true, at: new Date(), docs: 50, drive });
    await stato({ ok: false, configurata: false });
    assert.strictEqual((await _test.controllaBackup(Date.now())).titolo, 'Copia del backup su Google Drive non attiva');
    await stato({ ok: false, configurata: true, error: 'HTTP 401 invalid_grant' });
    const p = await _test.controllaBackup(Date.now());
    assert.strictEqual(p.titolo, 'Copia del backup su Google Drive non riuscita');
    assert.match(p.righe[0], /invalid_grant/);
    // funzione interrotta durante la copia: resta lo stato scritto prima della copia
    await stato({ ok: false, configurata: true, error: backupLib.COPIA_NON_CONCLUSA });
    assert.strictEqual((await _test.controllaBackup(Date.now())).titolo, 'Copia del backup su Google Drive non riuscita');
    await stato({ ok: true, configurata: true, file: 'condominio-2026-10-13.json.gz', nonRimossi: 3 });
    const v = await _test.controllaBackup(Date.now());
    assert.strictEqual(v.titolo, 'Backup vecchi su Google Drive non cancellati');
    assert.match(v.righe[0], /^3 copie/);
    await stato({ ok: true, configurata: true, file: 'condominio-2026-10-13.json.gz', nonRimossi: 0 });
    assert.strictEqual(await _test.controllaBackup(Date.now()), null);
  });
});
