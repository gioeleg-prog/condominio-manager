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
});
