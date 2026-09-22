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
