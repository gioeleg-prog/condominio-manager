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
const { adminDb, getStorage } = require('../scripts/lib/firebase-admin');
const backupLib = require('module').createRequire(require('path').join(__dirname, '..', 'functions', 'package.json'))('./backup');
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
    it('AUD-04 le delibere compaiono nel registro con la loro descrizione sintetica', async () => {
      const a = await as('admin1@qa.test');
      await fs.setDoc(fs.doc(a.db, 'buildings/1/resolutions/9600'), signed(a, { id: 9600, descrizioneSintetica: 'Rifacimento tetto', stato: 'approvata', edificioId: 1 }));
      const ev = await waitFor(async () => (await auditOf(9600))[0], 30000);
      assert.ok(ev, 'evento non registrato');
      assert.strictEqual(ev.titolo, 'Rifacimento tetto');
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

// Email (functions/notifiche.js). Sugli emulatori nessuna email parte: ogni invio
// è solo registrato in buildings/{b}/invii (simulata: true) con i destinatari.
describe('INTEGRAZIONE — email ai condomini', function () {
  this.timeout(40000);
  beforeEach(async () => { await seed(); });
  const invii = async (b = '1') => (await admin.collection(`buildings/${b}/invii`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
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
    const [v] = await waitFor(async () => { const l = await invii(); return l.length ? l : null; });
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
    const [v] = await waitFor(async () => { const l = await invii(); return l.length ? l : null; });
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
