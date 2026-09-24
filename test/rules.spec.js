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

  it('un superAdmin PUÒ scrivere direttamente cm_condomini/cm_spese/cm_entrate/cm_fornitori', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertSucceeds(db.collection('appdata').doc('cm_condomini').set({ value: '[]' }));
    await assertSucceeds(db.collection('appdata').doc('cm_spese').set({ value: '[]' }));
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

  it('un superAdmin PUÒ scrivere direttamente appdata/cm_bacheca', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertSucceeds(db.collection('appdata').doc('cm_bacheca').set({ value: '[]' }));
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

  it('un superAdmin PUÒ scrivere direttamente appdata/cm_verbali', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertSucceeds(db.collection('appdata').doc('cm_verbali').set({ value: '[]' }));
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

  it('un superAdmin PUÒ scrivere direttamente appdata/cm_lavori', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertSucceeds(db.collection('appdata').doc('cm_lavori').set({ value: '[]' }));
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

  it('un superAdmin PUÒ scrivere direttamente appdata/cm_delibere', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertSucceeds(db.collection('appdata').doc('cm_delibere').set({ value: '[]' }));
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

  it('un member PUÒ ancora leggere le chiavi necessarie al login (cm_edifici, cm_categorie, cm_edificio_attivo, cm_config)', async () => {
    const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    for (const k of ['cm_edifici', 'cm_categorie', 'cm_edificio_attivo', 'cm_login_stats', 'cm_config']) {
      await assertSucceeds(db.collection('appdata').doc(k).get());
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

  it('un superAdmin PUÒ scrivere cm_edifici, cm_categorie, cm_edificio_attivo', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    for (const k of ['cm_edifici', 'cm_categorie', 'cm_edificio_attivo']) {
      await assertSucceeds(db.collection('appdata').doc(k).set({ value: '[]' }));
    }
  });

  it('chiunque sia autenticato PUÒ scrivere cm_login_stats (contatore di login), un anonimo no', async () => {
    const member = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    await assertSucceeds(member.collection('appdata').doc('cm_login_stats').set({ value: '{}' }));
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.collection('appdata').doc('cm_login_stats').set({ value: '{}' }));
  });
});

describe('roles/{uid} — mai scrivibile dal client', () => {
  it('nemmeno un superAdmin può scrivere roles/* direttamente dal client', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertFails(db.collection('roles').doc('altro-uid').set({ role: 'superAdmin' }));
  });
});

describe('buildings/** — schema normalizzato target (REB-01)', () => {
  it('un member dell\'edificio B1 NON legge dati dell\'edificio B2', async () => {
    const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    await assertFails(db.doc('buildings/b2/expenses/e1').get());
  });

  it('un member dell\'edificio B1 legge i dati del proprio edificio', async () => {
    const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    await assertSucceeds(db.doc('buildings/b1/expenses/e1').get());
  });

  it('il superAdmin legge qualsiasi edificio', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertSucceeds(db.doc('buildings/b2/expenses/e1').get());
  });

  it('un member NON può fare list su tutta la collection buildings (fallirebbe in blocco)', async () => {
    const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    await assertFails(db.collection('buildings').get());
  });

  it('il superAdmin PUÒ fare list su tutta la collection buildings', async () => {
    const db = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertSucceeds(db.collection('buildings').get());
  });

  describe('members — solo adminEdificio/superAdmin, mai editor/member', () => {
    it('un adminEdificio PUÒ scrivere members del proprio edificio', async () => {
      const db = testEnv.authenticatedContext('u_admin', { role: 'adminEdificio', buildingId: 'b1' }).firestore();
      await assertSucceeds(db.doc('buildings/b1/members/m1').set({ nome: 'Test' }));
    });

    it('un adminEdificio NON può scrivere members di un altro edificio', async () => {
      const db = testEnv.authenticatedContext('u_admin', { role: 'adminEdificio', buildingId: 'b1' }).firestore();
      await assertFails(db.doc('buildings/b2/members/m1').set({ nome: 'Test' }));
    });

    it('un editor NON può scrivere members (solo dati finanziari)', async () => {
      const db = testEnv.authenticatedContext('u_editor', { role: 'editor', buildingId: 'b1' }).firestore();
      await assertFails(db.doc('buildings/b1/members/m1').set({ nome: 'Test' }));
    });

    it('un member NON può scrivere members', async () => {
      const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
      await assertFails(db.doc('buildings/b1/members/m1').set({ nome: 'Test' }));
    });
  });

  describe('expenses/payments/suppliers — anche editor può scrivere nel proprio edificio', () => {
    for (const sub of ['expenses', 'payments', 'suppliers']) {
      it(`un editor PUÒ scrivere ${sub} del proprio edificio`, async () => {
        const db = testEnv.authenticatedContext('u_editor', { role: 'editor', buildingId: 'b1' }).firestore();
        await assertSucceeds(db.doc(`buildings/b1/${sub}/x1`).set({ titolo: 'Test' }));
      });

      it(`un editor NON può scrivere ${sub} di un altro edificio`, async () => {
        const db = testEnv.authenticatedContext('u_editor', { role: 'editor', buildingId: 'b1' }).firestore();
        await assertFails(db.doc(`buildings/b2/${sub}/x1`).set({ titolo: 'Test' }));
      });

      it(`un member (sola lettura) NON può scrivere ${sub}`, async () => {
        const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
        await assertFails(db.doc(`buildings/b1/${sub}/x1`).set({ titolo: 'Test' }));
      });

      it(`un adminEdificio PUÒ scrivere ${sub} del proprio edificio`, async () => {
        const db = testEnv.authenticatedContext('u_admin', { role: 'adminEdificio', buildingId: 'b1' }).firestore();
        await assertSucceeds(db.doc(`buildings/b1/${sub}/x1`).set({ titolo: 'Test' }));
      });
    }
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
