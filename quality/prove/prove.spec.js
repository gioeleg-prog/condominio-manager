// Prove locali delle piste dell'audit 2026-10-30 (security-audit-skill, run-1).
// Girano SOLO sugli emulatori del progetto demo-qa (loopback), con dati fittizi del seed QA.
// Ogni prova PASSA quando il comportamento vulnerabile viene osservato, FALLISCE quando la pista è smentita.
//   npx firebase emulators:exec --project demo-qa --only auth,firestore,functions,storage "mocha quality/prove/prove.spec.js --timeout 90000 --exit"
const assert = require('assert');
const fsNode = require('fs');
const path = require('path');
const { seed, PASSWORD, PROJECT } = require('../../qa/seed');
const { loadApp } = require('../../qa/load-app');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const fs = require('firebase/firestore');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const { getStorage: getClientStorage, connectStorageEmulator, ref: sRef, uploadBytes, deleteObject } = require('firebase/storage');
const { adminDb, getStorage, getAuth: adminAuth } = require('../../scripts/lib/firebase-admin');

const admin = adminDb(PROJECT);
const apps = [];
let seq = 0;
const OUT = path.join(__dirname, 'risultati.json');
const risultati = {};
const nota = (k, v) => { risultati[k] = v; fsNode.writeFileSync(OUT, JSON.stringify(risultati, null, 2)); console.log('  >>', k, JSON.stringify(v)); };

async function as(email) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, authDomain: 'demo-qa.firebaseapp.com', storageBucket: 'demo-qa.appspot.com' }, `p${seq++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = fs.getFirestore(app);
  fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fns = getFunctions(app, 'europe-west1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const storage = getClientStorage(app);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  const cred = await signInWithEmailAndPassword(auth, email, PASSWORD);
  const call = async (name, data = {}) => {
    try { return { ok: true, data: (await httpsCallable(fns, name)(data)).data }; }
    catch (e) { return { ok: false, code: e.code, message: e.message }; }
  };
  return { db, storage, uid: cred.user.uid, call, user: cred.user };
}
function signed(u, rec, prev) {
  return { ...rec, _createdBy: prev ? prev._createdBy : u.uid, _createdAt: prev ? prev._createdAt : fs.serverTimestamp(),
    _updatedBy: u.uid, _updatedAt: fs.serverTimestamp(), _deleted: false };
}
const tryP = async (p) => { try { await p; return { ok: true }; } catch (e) { return { ok: false, code: e.code || e.message }; } };
const waitFor = async (fn, ms = 12000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 250)); }
  return null;
};
const claimsOf = async (uid) => (await adminAuth().getUser(uid)).customClaims || {};
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));

describe('PROVE LOCALI — piste audit 2026-10-30', function () {
  this.timeout(90000);
  beforeEach(async () => { await seed(); });
  afterEach(async () => { while (apps.length) await deleteApp(apps.pop()).catch(() => {}); });

  it('01 XSS lavori: la regola accetta HTML in storico[].data e la scheda lo stampa senza escape', async () => {
    const PAY = '<img src=x onerror=window.__x=1>';
    const a = await as('admin1@qa.test');
    const w = await tryP(fs.setDoc(fs.doc(a.db, 'buildings/1/works/9901'), signed(a, { id: 9901, titolo: 'Prova', stato: 'in_corso', percentuale: 10, edificioId: 1,
      storicoAggiornamenti: [{ data: PAY, nota: 'n', autore: 'a' }] })));
    const m = await as('member1@qa.test');
    const snap = await fs.getDoc(fs.doc(m.db, 'buildings/1/works/9901'));
    const stored = snap.exists() ? snap.data().storicoAggiornamenti[0].data : null;
    const sb = loadApp();
    const html = sb.renderLavoroCard({ id: 9901, titolo: 'Prova', stato: 'in_corso', percentuale: 10, storicoAggiornamenti: [{ data: PAY, nota: 'n', autore: 'a' }] }, false);
    const csp = (fsNode.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8').match(/Content-Security-Policy"[^>]*content="([^"]+)"/) || [])[1] || '';
    nota('01_xss_lavori', { scritturaAdmin: w, letturaMemberRaw: stored === PAY, htmlContieneTagNonEscapato: html.includes(PAY), htmlHaVersioneEscapata: html.includes('&lt;img src=x'), cspUnsafeInline: /script-src[^;]*'unsafe-inline'/.test(csp) });
    assert.ok(w.ok && stored === PAY && html.includes(PAY));
  });

  it('02 XSS spese: un editor scrive una spesa di serie con data HTML; il riquadro serie la stampa senza escape', async () => {
    const PAY = '9<img src=x onerror=window.__x=1>';
    await admin.doc('buildings/1/expenses/9801').set({ id: 9801, titolo: 'Serie', data: '2026-01-01', ricGruppoId: 'g1', edificioId: 1, _deleted: false, _createdBy: 'u-super', _updatedBy: 'u-super' });
    const ed = await as('editor1@qa.test');
    const w = await tryP(fs.setDoc(fs.doc(ed.db, 'buildings/1/expenses/9802'), signed(ed, { id: 9802, titolo: 'x', data: PAY, ricGruppoId: 'g1', edificioId: 1 })));
    const sb = loadApp();
    const st = sb.__get('state');
    st.spese = [{ id: 9801, data: '2026-01-01', ricGruppoId: 'g1', consuntivo: '' }, { id: 9802, data: PAY, ricGruppoId: 'g1', consuntivo: '' }];
    const html = sb.renderBoxSerie(st.spese[0]);
    nota('02_xss_spese', { scritturaEditor: w, htmlContieneTagNonEscapato: html.includes('<img src=x onerror=window.__x=1>') });
    assert.ok(w.ok && html.includes('<img src=x onerror=window.__x=1>'));
  });

  it('03 whoami: un account con email NON verificata viene collegato al profilo e riceve il ruolo', async () => {
    await adminAuth().updateUser('u-newbie', { emailVerified: false });
    const u = await as('newbie@qa.test');
    const r = await u.call('whoami');
    const claims = await claimsOf('u-newbie');
    const rec = (await admin.doc('buildings/1/members/104').get()).data();
    nota('03_whoami_email_non_verificata', { emailVerified: u.user.emailVerified, risposta: r.ok ? 'ok' : r, claims, uidCollegato: rec && rec.uid });
    assert.ok(r.ok && claims.role && rec.uid === 'u-newbie');
  });

  it('04 admin revocato: con il token vecchio riattiva il proprio record e whoami gli ridà il ruolo; notificaVita invia lo stesso', async () => {
    const a = await as('admin1@qa.test');
    const ref = fs.doc(a.db, 'buildings/1/members/101');
    await admin.doc('buildings/1/members/101').update({ _deleted: true, _deletedBy: 'u-super', _updatedBy: 'u-super', _updatedAt: new Date() });
    const revocato = await waitFor(async () => { const c = await claimsOf('u-admin1'); return !c.role; }, 20000);
    // con il vecchio token (ancora in memoria) scrive un avviso con invio email
    const prevN = null;
    const avviso = await tryP(fs.setDoc(fs.doc(a.db, 'buildings/1/notices/9955'), signed(a, { id: 9955, titolo: 'Avviso da admin revocato', testo: 'prova', edificioId: 1,
      notificaEmail: 'cod1', notificaDestinatari: [103] }, prevN)));
    const invio = await waitFor(async () => { const q = await admin.collection('buildings/1/invii').get(); return q.docs.find((d) => (d.data().recordId || '') === '9955') || null; }, 15000);
    // si riattiva il record
    const cur = (await fs.getDoc(ref)).data();
    let flip = await tryP(fs.setDoc(ref, signed(a, { ...cur, _deleted: false }, cur)));
    if (!flip.ok) { const c2 = { ...cur }; delete c2._deletedBy; flip = { primo: flip, secondo: await tryP(fs.setDoc(ref, signed(a, { ...c2, _deleted: false }, cur))) }; }
    await new Promise((r) => setTimeout(r, 3000));
    const claimsDopoFlip = await claimsOf('u-admin1');
    const fresh = await as('admin1@qa.test');
    const w = await fresh.call('whoami');
    const claimsFinali = await claimsOf('u-admin1');
    nota('04_admin_revocato', { claimsAzzeratiDalServer: !!revocato, avvisoConVecchioToken: avviso, invioEmailCreato: !!invio, ripristinoRecord: flip, claimsDopoRipristino: claimsDopoFlip, whoami: w.ok ? 'ok' : w, claimsFinali });
    nota('06_notificaVita_senza_riverifica', { avvisoConVecchioToken: avviso, invioCreatoDalTrigger: !!invio });
    assert.ok(claimsFinali.role === 'adminEdificio');
  });

  it('05 Storage: un editor sovrascrive e cancella allegati di verbali (record riservato agli admin)', async () => {
    const bucket = getStorage().bucket('demo-qa.appspot.com');
    await bucket.file('buildings/1/allegati/9900_verbale.pdf').save(Buffer.from('%PDF-1.4 ORIGINALE'), { contentType: 'application/pdf' });
    await bucket.file('buildings/1/allegati/9901_altro.pdf').save(Buffer.from('%PDF-1.4 ALTRO'), { contentType: 'application/pdf' });
    const ed = await as('editor1@qa.test');
    const over = await tryP(uploadBytes(sRef(ed.storage, 'buildings/1/allegati/9900_verbale.pdf'), new Uint8Array(Buffer.from('%PDF-1.4 MANOMESSO')), { contentType: 'application/pdf' }));
    const [dopo] = await bucket.file('buildings/1/allegati/9900_verbale.pdf').download();
    const del = await tryP(deleteObject(sRef(ed.storage, 'buildings/1/allegati/9900_verbale.pdf')));
    const m = await as('member1@qa.test');
    const delMember = await tryP(deleteObject(sRef(m.storage, 'buildings/1/allegati/9901_altro.pdf')));
    const a2 = await as('admin2@qa.test');
    const delAltroEdificio = await tryP(deleteObject(sRef(a2.storage, 'buildings/1/allegati/9901_altro.pdf')));
    nota('05_storage_editor', { sovrascrittaEditor: over, contenutoDopo: dopo.toString(), cancellazioneEditor: del, controlloMemberCancella: delMember, controlloAdminAltroEdificio: delAltroEdificio });
    assert.ok(over.ok && dopo.toString().includes('MANOMESSO') && del.ok);
  });

  it('06 storagePath: la regola accetta un allegato che punta al file di un altro edificio; il superAdmin può cancellare quel file, l\'admin no', async () => {
    const bucket = getStorage().bucket('demo-qa.appspot.com');
    await bucket.file('buildings/2/allegati/vittima.pdf').save(Buffer.from('%PDF-1.4 VITTIMA'), { contentType: 'application/pdf' });
    const a = await as('admin1@qa.test');
    const w = await tryP(fs.setDoc(fs.doc(a.db, 'buildings/1/expenses/9811'), signed(a, { id: 9811, titolo: 'x', edificioId: 1,
      allegati: [{ id: 1, nome: 'x.pdf', mime: 'application/pdf', size: 10, storagePath: 'buildings/2/allegati/vittima.pdf' }] })));
    const delAdmin = await tryP(deleteObject(sRef(a.storage, 'buildings/2/allegati/vittima.pdf')));
    const s = await as('superadmin@qa.test');
    const delSuper = await tryP(deleteObject(sRef(s.storage, 'buildings/2/allegati/vittima.pdf')));
    nota('15_storagePath_altro_edificio', { scritturaRecordConPathAltroEdificio: w, adminEliminaFileAltroEdificio: delAdmin, superAdminEliminaFileAltroEdificio: delSuper });
    assert.ok(w.ok && !delAdmin.ok && delSuper.ok);
  });

  it('07 clientErrors: un membro crea 300 documenti senza alcun limite aggregato', async () => {
    const m = await as('member1@qa.test');
    let ok = 0, ko = 0;
    for (let i = 0; i < 300; i += 50) {
      const batch = await Promise.all(Array.from({ length: 50 }, (_, j) => tryP(fs.addDoc(fs.collection(m.db, 'clientErrors'),
        { message: 'flood ' + (i + j), stack: '', page: 'x', uid: m.uid, role: 'member', buildingId: '1', ua: 'prova', at: fs.serverTimestamp() }))));
      batch.forEach((r) => (r.ok ? ok++ : ko++));
    }
    const n = (await admin.collection('clientErrors').get()).size;
    nota('09_clientErrors_flood', { creati: ok, rifiutati: ko, documentiPresenti: n });
    assert.ok(ok === 300);
  });

  it('08 login stats: un admin crea il membro id 0 e il suo login sovrascrive la riga del superAdmin', async () => {
    const sample = (await admin.doc('buildings/1/contatti/105').get()).data();
    const msample = (await admin.doc('buildings/1/members/105').get()).data();
    await adminAuth().createUser({ uid: 'u-fresh0', email: 'fresh0@qa.test', password: PASSWORD, emailVerified: true });
    const sup = await as('superadmin@qa.test');
    await sup.call('whoami');
    const stats0 = async () => { const v = (await admin.collection('appdata').doc('cm_login_stats').get()).data(); return v ? (JSON.parse(v.value) || {}) : {}; };
    const prima = (await stats0())['0'] || null;
    const a = await as('admin1@qa.test');
    const wm = await tryP(fs.setDoc(fs.doc(a.db, 'buildings/1/members/0'), signed(a, { ...strip(msample), id: 0, nome: 'INTRUSO', edificioId: 1, uid: null, isAdmin: false, canEdit: false })));
    const wc = await tryP(fs.setDoc(fs.doc(a.db, 'buildings/1/contatti/0'), signed(a, { ...strip(sample), id: 0, email: 'fresh0@qa.test', emailLower: 'fresh0@qa.test', edificioId: 1 })));
    const f = await as('fresh0@qa.test');
    const w = await f.call('whoami');
    const dopo = (await stats0())['0'] || null;
    nota('12_loginstats_id0', { sceltaSuperAdminPrima: prima, scritturaMembro0: wm, scritturaContatti0: wc, whoamiFresh: w.ok ? 'ok' : w, rigaDopo: dopo });
    assert.ok(wm.ok && w.ok && dopo && dopo.nome === 'INTRUSO');
  });

  it('09 login stats: un admin scrive un nome da 600 KB e il blob globale ne risulta gonfiato', async () => {
    const sample = (await admin.doc('buildings/1/contatti/105').get()).data();
    const msample = (await admin.doc('buildings/1/members/105').get()).data();
    await adminAuth().createUser({ uid: 'u-fresh7', email: 'fresh7@qa.test', password: PASSWORD, emailVerified: true });
    const a = await as('admin1@qa.test');
    const grande = 'A'.repeat(600000);
    const wm = await tryP(fs.setDoc(fs.doc(a.db, 'buildings/1/members/777'), signed(a, { ...strip(msample), id: 777, nome: grande, edificioId: 1, uid: null, isAdmin: false, canEdit: false })));
    const wc = await tryP(fs.setDoc(fs.doc(a.db, 'buildings/1/contatti/777'), signed(a, { ...strip(sample), id: 777, email: 'fresh7@qa.test', emailLower: 'fresh7@qa.test', edificioId: 1 })));
    const f = await as('fresh7@qa.test');
    const w = await f.call('whoami');
    const v = (await admin.collection('appdata').doc('cm_login_stats').get()).data();
    nota('11_loginstats_nome_grande', { scritturaMembroNome600KB: wm, scritturaContatti: wc, whoami: w.ok ? 'ok' : w, byteBlobStatistiche: v ? v.value.length : null });
    assert.ok(wm.ok && w.ok && v && v.value.length > 500000);
  });

  it('10 squatting: un admin dell\'edificio 2 registra l\'email di un futuro condomino e whoami lo lega all\'edificio sbagliato', async () => {
    const csample = (await admin.doc('buildings/2/contatti/202').get()).data();
    const msample = (await admin.doc('buildings/2/members/202').get()).data();
    await adminAuth().createUser({ uid: 'u-victim', email: 'victim@qa.test', password: PASSWORD, emailVerified: true });
    const a2 = await as('admin2@qa.test');
    const wm = await tryP(fs.setDoc(fs.doc(a2.db, 'buildings/2/members/301'), signed(a2, { ...strip(msample), id: 301, nome: 'Squatter', edificioId: 2, uid: null, isAdmin: false, canEdit: false })));
    const wc = await tryP(fs.setDoc(fs.doc(a2.db, 'buildings/2/contatti/301'), signed(a2, { ...strip(csample), id: 301, email: 'victim@qa.test', emailLower: 'victim@qa.test', edificioId: 2 })));
    const v = await as('victim@qa.test');
    const w = await v.call('whoami');
    const claims = await claimsOf('u-victim');
    nota('13_squatting', { scritturaProfilo: [wm, wc], whoami: w.ok ? { ok: true, edificio: w.data && (w.data.edificioId || w.data.buildingId) } : w, claims });
    assert.ok(wm.ok && wc.ok && claims.buildingId === '2');
  });

  it('11 record enormi: un editor scrive una spesa con 8000 elementi in split e la regola non pone limiti', async () => {
    const ed = await as('editor1@qa.test');
    const split = Array.from({ length: 8000 }, () => ({ id: 101, perc: 0.01 }));
    const w = await tryP(fs.setDoc(fs.doc(ed.db, 'buildings/1/expenses/9821'), signed(ed, { id: 9821, titolo: 'Enorme', edificioId: 1, split })));
    nota('14_record_enormi', { scrittura8000ElementiSplit: w });
    assert.ok(w.ok);
  });

  it('12 mioProfilo: un membro che alterna una preferenza 20 volte genera 20 eventi di audit permanenti', async () => {
    const m = await as('member1@qa.test');
    const prima = (await admin.collection('auditEvents').get()).size;
    let ok = 0;
    for (let i = 0; i < 20; i++) { const r = await m.call('mioProfilo', { modifiche: { emailNotifiche: i % 2 === 0 } }); if (r.ok) ok++; }
    await new Promise((r) => setTimeout(r, 6000));
    const dopo = (await admin.collection('auditEvents').get()).size;
    nota('10_mioProfilo_audit', { chiamateRiuscite: ok, auditPrima: prima, auditDopo: dopo, nuoviEventi: dopo - prima });
    assert.ok(ok >= 18 && dopo - prima >= 10);
  });
});
