const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'neridarimini-local',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

describe('appdata — modello attuale', () => {
  it('utente NON autenticato non può leggere nulla', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('appdata').doc('cm_config').get());
  });

  it('un member NON può scrivere appdata/cm_config (identità superAdmin)', async () => {
    const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_config').set({ value: '{}' }));
  });

  it('un superAdmin PUÒ scrivere appdata/cm_config', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertSucceeds(db.collection('appdata').doc('cm_config').set({ value: '{}' }));
  });

  it('un member semplice NON può scrivere appdata/cm_condomini (blocca l\'auto-promozione, riga 5306)', async () => {
    const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_condomini').set({ value: '[]' }));
  });

  // P0 (bug di sovrascrittura cross-edificio, scoperto pianificando REB-01):
  // cm_condomini/cm_spese/cm_entrate/cm_fornitori non sono più scrivibili
  // direttamente dal client da nessuno tranne il superAdmin — un
  // adminEdificio o un member passano da saveBuildingData (Admin SDK), che
  // fonde solo la propria fetta invece di sovrascrivere l'intero blob.
  it('un adminEdificio NON può scrivere appdata/cm_condomini direttamente (passa da saveBuildingData)', async () => {
    const db = testEnv.authenticatedContext('u_admin', { role: 'adminEdificio', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_condomini').set({ value: '[]' }));
  });

  it('un member NON può scrivere appdata/cm_spese direttamente (passa da saveBuildingData)', async () => {
    const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_spese').set({ value: '[]' }));
  });

  it('un adminEdificio NON può scrivere appdata/cm_entrate o cm_fornitori direttamente', async () => {
    const db = testEnv.authenticatedContext('u_admin', { role: 'adminEdificio', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_entrate').set({ value: '[]' }));
    await assertFails(db.collection('appdata').doc('cm_fornitori').set({ value: '[]' }));
  });

  it('fase 2: nemmeno il superAdmin scrive più cm_condomini/cm_spese/cm_entrate/cm_fornitori (sola lettura, dati in buildings/**)', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_condomini').set({ value: '[]' }));
    await assertFails(db.collection('appdata').doc('cm_spese').set({ value: '[]' }));
  });

  // cm_bacheca (comunicazioni ufficiali dell'amministratore): stesso
  // trattamento di cm_condomini — solo adminEdificio/superAdmin, mai
  // scrittura diretta dal client per gli altri, sempre tramite
  // saveBuildingData. Lettura resta aperta a isSignedIn() (non è dato
  // economico come cm_spese/cm_entrate/cm_fornitori).
  // Hardening: la lettura diretta di cm_bacheca/cm_verbali/cm_lavori non è
  // più aperta — il blob contiene tutti gli edifici, i non-superAdmin li
  // ricevono già filtrati da getBuildingData.
  it('un member NON può leggere direttamente appdata/cm_bacheca (passa da getBuildingData)', async () => {
    const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_bacheca').get());
  });

  it('un editor NON può scrivere appdata/cm_bacheca direttamente (passa da saveBuildingData)', async () => {
    const db = testEnv.authenticatedContext('u_editor', { role: 'editor', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_bacheca').set({ value: '[]' }));
  });

  it('un adminEdificio NON può scrivere appdata/cm_bacheca direttamente (passa da saveBuildingData)', async () => {
    const db = testEnv.authenticatedContext('u_admin', { role: 'adminEdificio', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_bacheca').set({ value: '[]' }));
  });

  it('fase 2: nemmeno il superAdmin scrive più appdata/cm_bacheca (sola lettura, dati in buildings/**)', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_bacheca').set({ value: '[]' }));
  });

  // cm_verbali (atti ufficiali di assemblea): stesso trattamento di
  // cm_bacheca/cm_condomini — solo adminEdificio/superAdmin, mai
  // scrittura diretta dal client per gli altri.
  it('un member NON può leggere direttamente appdata/cm_verbali (passa da getBuildingData)', async () => {
    const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_verbali').get());
  });

  it('un editor NON può scrivere appdata/cm_verbali direttamente (passa da saveBuildingData)', async () => {
    const db = testEnv.authenticatedContext('u_editor', { role: 'editor', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_verbali').set({ value: '[]' }));
  });

  it('un adminEdificio NON può scrivere appdata/cm_verbali direttamente (passa da saveBuildingData)', async () => {
    const db = testEnv.authenticatedContext('u_admin', { role: 'adminEdificio', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_verbali').set({ value: '[]' }));
  });

  it('fase 2: nemmeno il superAdmin scrive più appdata/cm_verbali (sola lettura, dati in buildings/**)', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_verbali').set({ value: '[]' }));
  });

  // cm_lavori (checklist lavori, dato operativo): stesso trattamento di
  // cm_bacheca/cm_verbali — lettura aperta, scrittura solo adminEdificio/
  // superAdmin.
  it('un member NON può leggere direttamente appdata/cm_lavori (passa da getBuildingData)', async () => {
    const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_lavori').get());
  });

  it('un editor NON può scrivere appdata/cm_lavori direttamente (passa da saveBuildingData)', async () => {
    const db = testEnv.authenticatedContext('u_editor', { role: 'editor', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_lavori').set({ value: '[]' }));
  });

  it('un adminEdificio NON può scrivere appdata/cm_lavori direttamente (passa da saveBuildingData)', async () => {
    const db = testEnv.authenticatedContext('u_admin', { role: 'adminEdificio', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_lavori').set({ value: '[]' }));
  });

  it('fase 2: nemmeno il superAdmin scrive più appdata/cm_lavori (sola lettura, dati in buildings/**)', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_lavori').set({ value: '[]' }));
  });

  // cm_delibere (atto formale + budget): stesso trattamento di cm_spese —
  // lettura ristretta al superAdmin (gli altri via getBuildingData),
  // scrittura solo adminEdificio/superAdmin.
  it('un member NON può leggere direttamente appdata/cm_delibere (dato economico, passa da getBuildingData)', async () => {
    const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_delibere').get());
  });

  it('un superAdmin PUÒ leggere direttamente appdata/cm_delibere', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertSucceeds(db.collection('appdata').doc('cm_delibere').get());
  });

  it('un editor NON può scrivere appdata/cm_delibere direttamente (passa da saveBuildingData)', async () => {
    const db = testEnv.authenticatedContext('u_editor', { role: 'editor', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_delibere').set({ value: '[]' }));
  });

  it('un adminEdificio NON può scrivere appdata/cm_delibere direttamente (passa da saveBuildingData)', async () => {
    const db = testEnv.authenticatedContext('u_admin', { role: 'adminEdificio', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_delibere').set({ value: '[]' }));
  });

  it('fase 2: nemmeno il superAdmin scrive più appdata/cm_delibere (sola lettura, dati in buildings/**)', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_delibere').set({ value: '[]' }));
  });

  // Hardening: lista chiusa di chiavi. I residui del vecchio login
  // (cm_passwords, cm_reset_tokens) erano leggibili da chiunque fosse
  // autenticato, perché ogni chiave non elencata ricadeva in isSignedIn().
  it('nessuno legge o scrive chiavi non elencate (cm_passwords, cm_reset_tokens), superAdmin compreso', async () => {
    const member = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    const superA = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    for (const k of ['cm_passwords', 'cm_reset_tokens', 'cm_chiave_inventata']) {
      await assertFails(member.collection('appdata').doc(k).get());
      await assertFails(member.collection('appdata').doc(k).set({ value: '{}' }));
      await assertFails(superA.collection('appdata').doc(k).get());
      await assertFails(superA.collection('appdata').doc(k).set({ value: '{}' }));
    }
  });

  it('un member PUÒ ancora leggere le chiavi necessarie all\'app (cm_edifici, cm_categorie, cm_edificio_attivo)', async () => {
    const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    for (const k of ['cm_edifici', 'cm_categorie', 'cm_edificio_attivo']) {
      await assertSucceeds(db.collection('appdata').doc(k).get());
    }
  });

  it('QA PRIV-01/03: member e adminEdificio NON leggono cm_login_stats né cm_config, il superAdmin sì', async () => {
    const member = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    const admin = testEnv.authenticatedContext('u_admin', { role: 'adminEdificio', buildingId: 'b1' }).firestore();
    const superA = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    for (const k of ['cm_login_stats', 'cm_config']) {
      await assertFails(member.collection('appdata').doc(k).get());
      await assertFails(admin.collection('appdata').doc(k).get());
      await assertSucceeds(superA.collection('appdata').doc(k).get());
    }
  });

  // Audit 2026-09: cm_condomini non è più leggibile direttamente dai non-
  // superAdmin (esponeva nomi/email di tutti gli edifici). Il login usa la
  // Cloud Function whoami; i condomini del proprio edificio arrivano da
  // getBuildingData. Entrambe con Admin SDK, bypassano queste rules.
  it('un member/adminEdificio/editor NON può leggere direttamente cm_condomini (passa da whoami/getBuildingData)', async () => {
    for (const [uid, role] of [['u_member', 'member'], ['u_admin', 'adminEdificio'], ['u_editor', 'editor']]) {
      const db = testEnv.authenticatedContext(uid, { role, buildingId: 'b1' }).firestore();
      await assertFails(db.collection('appdata').doc('cm_condomini').get());
    }
  });

  it('il superAdmin PUÒ leggere direttamente cm_condomini', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertSucceeds(db.collection('appdata').doc('cm_condomini').get());
  });

  it('adminEdificio/editor/member NON possono scrivere cm_edifici, cm_categorie, cm_edificio_attivo', async () => {
    for (const [uid, role] of [['u_admin', 'adminEdificio'], ['u_editor', 'editor'], ['u_member', 'member']]) {
      const db = testEnv.authenticatedContext(uid, { role, buildingId: 'b1' }).firestore();
      for (const k of ['cm_edifici', 'cm_categorie', 'cm_edificio_attivo']) {
        await assertFails(db.collection('appdata').doc(k).set({ value: '[]' }));
      }
    }
  });

  it('un superAdmin PUÒ scrivere cm_categorie e cm_edificio_attivo, non più cm_edifici (ora buildings/**)', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertFails(db.collection('appdata').doc('cm_edifici').set({ value: '[]' }));
    for (const k of ['cm_categorie', 'cm_edificio_attivo']) {
      await assertSucceeds(db.collection('appdata').doc(k).set({ value: '[]' }));
    }
  });

  it('QA INT-02: cm_login_stats lo scrive solo il superAdmin (ripristino backup); member, adminEdificio e anonimi no', async () => {
    const member = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    await assertFails(member.collection('appdata').doc('cm_login_stats').set({ value: '{}' }));
    const admin = testEnv.authenticatedContext('u_admin', { role: 'adminEdificio', buildingId: 'b1' }).firestore();
    await assertFails(admin.collection('appdata').doc('cm_login_stats').set({ value: '{}' }));
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.collection('appdata').doc('cm_login_stats').set({ value: '{}' }));
    const superA = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertSucceeds(superA.collection('appdata').doc('cm_login_stats').set({ value: '{}' }));
  });
});

describe('roles/{uid} — mai scrivibile dal client', () => {
  it('nemmeno un superAdmin può scrivere roles/* direttamente dal client', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertFails(db.collection('roles').doc('altro-uid').set({ role: 'superAdmin' }));
  });
});

describe('buildings/** — modello per edificio (fase 2)', () => {
  const firebase = require('firebase/compat/app').default;
  require('firebase/compat/firestore');
  const now = () => firebase.firestore.FieldValue.serverTimestamp();
  const ctx = (uid, claims) => testEnv.authenticatedContext(uid, claims).firestore();
  const member = () => ctx('u_member', { role: 'member', buildingId: '1' });
  const editor = () => ctx('u_editor', { role: 'editor', buildingId: '1' });
  const admin = () => ctx('u_admin', { role: 'adminEdificio', buildingId: '1' });
  const superA = () => ctx('u_super', { role: 'superAdmin' });
  // Record valido scritto da `uid` nell'edificio 1 (o `b`).
  const rec = (uid, id, extra = {}, b = 1) => ({
    id, edificioId: b, titolo: 'Test', _createdBy: uid, _createdAt: now(), _updatedBy: uid, _updatedAt: now(), ...extra,
  });
  const T0 = firebase.firestore.Timestamp.fromMillis(1700000000000);
  const seedDoc = async (path, data) => testEnv.withSecurityRulesDisabled((c) => c.firestore().doc(path).set(data));

  it('un member legge il proprio edificio ma non un altro', async () => {
    await assertSucceeds(member().doc('buildings/1/expenses/10').get());
    await assertFails(member().doc('buildings/2/expenses/10').get());
    await assertSucceeds(member().doc('buildings/1').get());
  });
  it('solo il superAdmin elenca tutti gli edifici', async () => {
    await assertFails(member().collection('buildings').get());
    await assertSucceeds(superA().collection('buildings').get());
  });
  it('solo il superAdmin crea o modifica un edificio', async () => {
    await assertFails(admin().doc('buildings/1').set({ id: 1, nome: 'X' }));
    await assertSucceeds(superA().doc('buildings/3').set({ id: 3, nome: 'Nuovo' }));
  });

  describe('matrice ruoli per collezione', () => {
    const finance = ['expenses', 'payments', 'suppliers'];
    const adminOnly = ['notices', 'minutes', 'works', 'resolutions'];
    for (const c of finance) {
      it(`${c}: editor e admin scrivono, member no`, async () => {
        await assertSucceeds(editor().doc(`buildings/1/${c}/11`).set(rec('u_editor', 11)));
        await assertSucceeds(admin().doc(`buildings/1/${c}/12`).set(rec('u_admin', 12)));
        await assertFails(member().doc(`buildings/1/${c}/13`).set(rec('u_member', 13)));
      });
    }
    for (const c of adminOnly) {
      it(`${c}: solo admin, editor e member no`, async () => {
        await assertSucceeds(admin().doc(`buildings/1/${c}/21`).set(rec('u_admin', 21)));
        await assertFails(editor().doc(`buildings/1/${c}/22`).set(rec('u_editor', 22)));
        await assertFails(member().doc(`buildings/1/${c}/23`).set(rec('u_member', 23)));
      });
    }
    it('members: solo admin; editor no', async () => {
      await assertSucceeds(admin().doc('buildings/1/members/31').set(rec('u_admin', 31, { nome: 'Rossi' })));
      await assertFails(editor().doc('buildings/1/members/32').set(rec('u_editor', 32, { nome: 'Rossi' })));
    });
    it('collezioni non previste: negate a tutti', async () => {
      await assertFails(superA().doc('buildings/1/varie/1').set(rec('u_super', 1)));
      await assertFails(superA().doc('buildings/1/varie/1').get());
    });
  });

  describe('isolamento e integrità dei record', () => {
    it('non si scrive in un altro edificio, né con edificioId incoerente col percorso', async () => {
      await assertFails(admin().doc('buildings/2/expenses/40').set(rec('u_admin', 40, {}, 2)));
      await assertFails(superA().doc('buildings/1/expenses/41').set(rec('u_super', 41, {}, 2)));
    });
    it('id del documento e id del record devono coincidere', async () => {
      await assertFails(admin().doc('buildings/1/expenses/42').set(rec('u_admin', 99)));
    });
    it('la firma deve essere dell\'autore reale e con l\'ora del server', async () => {
      await assertFails(admin().doc('buildings/1/expenses/43').set(rec('u_admin', 43, { _updatedBy: 'qualcun-altro' })));
      await assertFails(admin().doc('buildings/1/expenses/44').set(rec('u_admin', 44, { _updatedAt: new Date(2020, 0, 1) })));
    });
    it('l\'autore della creazione non si può riscrivere', async () => {
      await seedDoc('buildings/1/expenses/45', { id: 45, edificioId: 1, _createdBy: 'backfill', _createdAt: T0 });
      await assertFails(admin().doc('buildings/1/expenses/45').set(rec('u_admin', 45)));
      await assertSucceeds(admin().doc('buildings/1/expenses/45').set(rec('u_admin', 45, { _createdBy: 'backfill', _createdAt: T0 })));
      // nemmeno la data di creazione
      await assertFails(admin().doc('buildings/1/expenses/45').set(rec('u_admin', 45, { _createdBy: 'backfill' })));
    });
    it('campi elenco e testo devono avere la forma attesa', async () => {
      await assertFails(admin().doc('buildings/1/minutes/46').set(rec('u_admin', 46, { argomenti: 'bilancio' })));
      await assertFails(admin().doc('buildings/1/expenses/47').set(rec('u_admin', 47, { titolo: { x: 1 } })));
      await assertSucceeds(admin().doc('buildings/1/minutes/48').set(rec('u_admin', 48, { argomenti: ['bilancio'], titolo: 'A < B' })));
    });
    it('cancellazione: logica firmata da chi cancella; fisica solo superAdmin', async () => {
      await seedDoc('buildings/1/expenses/49', { id: 49, edificioId: 1, _createdBy: 'backfill', _createdAt: T0 });
      await assertFails(editor().doc('buildings/1/expenses/49').set(rec('u_editor', 49, { _createdBy: 'backfill', _createdAt: T0, _deleted: true })));
      await assertSucceeds(editor().doc('buildings/1/expenses/49').set(rec('u_editor', 49, { _createdBy: 'backfill', _createdAt: T0, _deleted: true, _deletedBy: 'u_editor' })));
      await assertFails(admin().doc('buildings/1/expenses/49').delete());
      await assertSucceeds(superA().doc('buildings/1/expenses/49').delete());
    });
    it('un adminEdificio non può creare un superAdmin né cambiare l\'account collegato', async () => {
      await assertFails(admin().doc('buildings/1/members/50').set(rec('u_admin', 50, { superAdmin: true })));
      await seedDoc('buildings/1/members/51', { id: 51, edificioId: 1, uid: 'u_vero', _createdBy: 'backfill', _createdAt: T0 });
      await assertFails(admin().doc('buildings/1/members/51').set(rec('u_admin', 51, { _createdBy: 'backfill', _createdAt: T0, uid: 'u_attaccante' })));
      await assertSucceeds(admin().doc('buildings/1/members/51').set(rec('u_admin', 51, { _createdBy: 'backfill', _createdAt: T0, uid: 'u_vero', nome: 'Nuovo nome' })));
      await assertSucceeds(superA().doc('buildings/1/members/52').set(rec('u_super', 52, { superAdmin: false, uid: 'u_x' })));
    });
  });
});

describe('users/{uid} — profilo whoami/bootstrap', () => {
  it('un utente PUÒ leggere e scrivere il proprio profilo', async () => {
    const db = testEnv.authenticatedContext('u1', { role: 'member', buildingId: 'b1' }).firestore();
    await assertSucceeds(db.doc('users/u1').set({ email: 'a@b.com' }));
    await assertSucceeds(db.doc('users/u1').get());
  });

  it('un utente NON può scrivere il profilo di un altro', async () => {
    const db = testEnv.authenticatedContext('u1', { role: 'member', buildingId: 'b1' }).firestore();
    await assertFails(db.doc('users/u2').set({ email: 'a@b.com' }));
  });

  it('un utente NON può leggere il profilo di un altro', async () => {
    const db = testEnv.authenticatedContext('u1', { role: 'member', buildingId: 'b1' }).firestore();
    await assertFails(db.doc('users/u2').get());
  });

  it('il superAdmin PUÒ leggere il profilo di chiunque (ma non scriverlo)', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertSucceeds(db.doc('users/u2').get());
    await assertFails(db.doc('users/u2').set({ email: 'a@b.com' }));
  });
});

describe('appSettings/{docId} — categorie condivise, feature flag, config', () => {
  it('utente NON autenticato non può leggere', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.doc('appSettings/categories').get());
  });

  it('un member (o qualunque signed-in) PUÒ leggere', async () => {
    const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    await assertSucceeds(db.doc('appSettings/categories').get());
  });

  it('un adminEdificio NON può scrivere appSettings', async () => {
    const db = testEnv.authenticatedContext('u_admin', { role: 'adminEdificio', buildingId: 'b1' }).firestore();
    await assertFails(db.doc('appSettings/flags').set({ dualWrite: true }));
  });

  it('il superAdmin PUÒ scrivere appSettings', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertSucceeds(db.doc('appSettings/flags').set({ dualWrite: true }));
  });
});

describe('migrationJobs/{jobId} — mai accessibile dal client', () => {
  it('nemmeno il superAdmin può leggere o scrivere migrationJobs dal client', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertFails(db.doc('migrationJobs/job1').get());
    await assertFails(db.doc('migrationJobs/job1').set({ status: 'running' }));
  });

  it('nemmeno il superAdmin può leggere la sottocollection sourceSnapshot', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertFails(db.doc('migrationJobs/job1/sourceSnapshot/cm_spese').get());
  });
});

describe('clientErrors — segnalazioni di errore dai browser (fase 3)', () => {
  const firebase = require('firebase/compat/app').default;
  require('firebase/compat/firestore');
  const now = () => firebase.firestore.FieldValue.serverTimestamp();
  const ok = (uid, extra = {}) => ({ message: 'TypeError: x', stack: 'at f', page: 'spese', uid, role: 'member', buildingId: '1', ua: 'test', at: now(), ...extra });
  const member = () => testEnv.authenticatedContext('u_member', { role: 'member', buildingId: '1' }).firestore();
  const superA = () => testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();

  it('un utente autenticato aggiunge una segnalazione a proprio nome', async () => {
    await assertSucceeds(member().collection('clientErrors').add(ok('u_member')));
  });
  it('non a nome di altri, non da anonimo, non con campi extra o troppo lunghi', async () => {
    await assertFails(member().collection('clientErrors').add(ok('u_altro')));
    await assertFails(testEnv.unauthenticatedContext().firestore().collection('clientErrors').add(ok('u_member')));
    await assertFails(member().collection('clientErrors').add(ok('u_member', { extra: 1 })));
    await assertFails(member().collection('clientErrors').add(ok('u_member', { message: 'x'.repeat(501) })));
    await assertFails(member().collection('clientErrors').add(ok('u_member', { at: new Date(2020, 0, 1) })));
  });
  it('solo il superAdmin legge e cancella; nessuno modifica', async () => {
    await testEnv.withSecurityRulesDisabled((c) => c.firestore().doc('clientErrors/e1').set({ message: 'x', uid: 'u_member' }));
    const ref = { id: 'e1' };
    await assertFails(member().collection('clientErrors').get());
    await assertSucceeds(superA().collection('clientErrors').get());
    await assertFails(superA().doc(`clientErrors/${ref.id}`).update({ message: 'y' }));
    await assertFails(member().doc(`clientErrors/${ref.id}`).delete());
    await assertSucceeds(superA().doc(`clientErrors/${ref.id}`).delete());
  });
});
