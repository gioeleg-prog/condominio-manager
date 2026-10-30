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

  it('un member PUÒ ancora leggere le chiavi necessarie all\'app (cm_categorie, cm_edificio_attivo, cm_branding)', async () => {
    const db = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    for (const k of ['cm_categorie', 'cm_edificio_attivo', 'cm_branding']) {
      await assertSucceeds(db.collection('appdata').doc(k).get());
    }
  });

  // Audit 2026-10-15: copia della migrazione con i dati di tutti i condomìni;
  // l'app legge l'elenco edifici da buildings/**.
  it('cm_edifici lo legge solo il superAdmin', async () => {
    for (const [uid, role] of [['u_member', 'member'], ['u_admin', 'adminEdificio'], ['u_editor', 'editor']]) {
      const db = testEnv.authenticatedContext(uid, { role, buildingId: 'b1' }).firestore();
      await assertFails(db.collection('appdata').doc('cm_edifici').get());
    }
    await assertFails(testEnv.unauthenticatedContext().firestore().collection('appdata').doc('cm_edifici').get());
    const superA = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertSucceeds(superA.collection('appdata').doc('cm_edifici').get());
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

  // Privacy (decisione del 2026-10-15): email e telefono dei condomini in contatti/.
  describe('privacy: contatti dei condomini', () => {
    const c = (uid, id, extra = {}) => ({ id, edificioId: 1, email: 'Rossi@Esempio.it', emailLower: 'rossi@esempio.it',
      _createdBy: uid, _createdAt: now(), _updatedBy: uid, _updatedAt: now(), _deleted: false, ...extra });
    it('li leggono solo amministratori ed editor del condominio, non i condomini semplici né un altro condominio', async () => {
      await seedDoc('buildings/1/contatti/31', { id: 31, edificioId: 1, email: 'a@b.it', emailLower: 'a@b.it' });
      await assertSucceeds(admin().doc('buildings/1/contatti/31').get());
      await assertSucceeds(editor().collection('buildings/1/contatti').get());
      await assertSucceeds(superA().doc('buildings/1/contatti/31').get());
      await assertFails(member().doc('buildings/1/contatti/31').get());
      await assertFails(member().collection('buildings/1/contatti').get());
      await assertFails(ctx('u_admin2', { role: 'adminEdificio', buildingId: '2' }).doc('buildings/1/contatti/31').get());
    });
    it('li scrive solo l\'amministratore, con emailLower uguale all\'email e solo i campi previsti', async () => {
      await assertSucceeds(admin().doc('buildings/1/contatti/32').set(c('u_admin', 32, { telefono: '333 1234567' })));
      await assertSucceeds(admin().doc('buildings/1/contatti/33').set(c('u_admin', 33, { email: null, emailLower: null })));
      await assertFails(admin().doc('buildings/1/contatti/34').set(c('u_admin', 34, { emailLower: 'altra@esempio.it' })));
      await assertFails(admin().doc('buildings/1/contatti/35').set(c('u_admin', 35, { nome: 'Rossi' })));
      await assertFails(admin().doc('buildings/1/contatti/36').set(c('u_admin', 36, { telefono: 'x'.repeat(41) })));
      await assertFails(editor().doc('buildings/1/contatti/37').set(c('u_editor', 37)));
      await assertFails(member().doc('buildings/1/contatti/38').set(c('u_member', 38)));
      await assertFails(admin().doc('buildings/1/contatti/32').delete());
    });
    it('il record del condomino non può più contenere email o telefono', async () => {
      await assertFails(admin().doc('buildings/1/members/40').set(rec('u_admin', 40, { nome: 'Rossi', email: 'r@e.it' })));
      await assertFails(admin().doc('buildings/1/members/41').set(rec('u_admin', 41, { nome: 'Rossi', emailLower: 'r@e.it' })));
      await assertFails(admin().doc('buildings/1/members/42').set(rec('u_admin', 42, { nome: 'Rossi', telefono: '333' })));
      await assertSucceeds(admin().doc('buildings/1/members/43').set(rec('u_admin', 43, { nome: 'Rossi' })));
    });
  });

  describe('email: storico invii e impostazioni', () => {
    it('storico invii: lo leggono solo gli amministratori del condominio, nessuno lo scrive', async () => {
      await seedDoc('buildings/1/invii/x', { tipo: 'avviso', buildingId: '1' });
      await assertSucceeds(admin().doc('buildings/1/invii/x').get());
      await assertSucceeds(superA().collection('buildings/1/invii').get());
      await assertFails(editor().doc('buildings/1/invii/x').get());
      await assertFails(member().collection('buildings/1/invii').get());
      await assertFails(ctx('u_admin2', { role: 'adminEdificio', buildingId: '2' }).doc('buildings/1/invii/x').get());
      await assertFails(admin().doc('buildings/1/invii/y').set({ tipo: 'falso' }));
    });
    it('impostazioni email: l\'amministratore accende i promemoria con 1–15 giorni; nessun altro campo, nessun altro ruolo', async () => {
      const ok = (uid, extra = {}) => ({ promemoriaAuto: true, giorniPreavviso: 3, aggiornatoDa: uid, aggiornatoIl: now(), ...extra });
      await assertSucceeds(admin().doc('buildings/1/impostazioni/email').set(ok('u_admin')));
      await assertSucceeds(admin().doc('buildings/1/impostazioni/email').get());
      await assertFails(admin().doc('buildings/1/impostazioni/email').set(ok('u_admin', { giorniPreavviso: 40 })));
      await assertFails(admin().doc('buildings/1/impostazioni/email').set(ok('u_admin', { altro: 1 })));
      await assertFails(admin().doc('buildings/1/impostazioni/altro').set(ok('u_admin')));
      await assertFails(editor().doc('buildings/1/impostazioni/email').set(ok('u_editor')));
      await assertFails(member().doc('buildings/1/impostazioni/email').get());
    });
  });

  describe('WhatsApp: impostazioni e messaggi aperti', () => {
    const cfg = (uid, extra = {}) => ({ modelli: { avviso: 'Ciao {nome}' }, firma: 'L\'amministratore', eventiSpenti: ['promemoria'], aggiornatoDa: uid, aggiornatoIl: now(), ...extra });
    it('impostazioni: solo l\'amministratore le legge e le scrive, con forma controllata', async () => {
      await assertSucceeds(admin().doc('buildings/1/impostazioni/whatsapp').set(cfg('u_admin')));
      await assertSucceeds(admin().doc('buildings/1/impostazioni/whatsapp').get());
      await assertFails(editor().doc('buildings/1/impostazioni/whatsapp').get());
      await assertFails(member().doc('buildings/1/impostazioni/whatsapp').get());
      await assertFails(editor().doc('buildings/1/impostazioni/whatsapp').set(cfg('u_editor')));
      await assertFails(ctx('u_admin2', { role: 'adminEdificio', buildingId: '2' }).doc('buildings/1/impostazioni/whatsapp').set(cfg('u_admin2')));
      await assertFails(admin().doc('buildings/1/impostazioni/whatsapp').set(cfg('u_admin', { altro: 1 })));
      await assertFails(admin().doc('buildings/1/impostazioni/whatsapp').set(cfg('u_admin', { modelli: { sconosciuto: 'x' } })));
      await assertFails(admin().doc('buildings/1/impostazioni/whatsapp').set(cfg('u_admin', { modelli: { avviso: 'x'.repeat(1001) } })));
      await assertFails(admin().doc('buildings/1/impostazioni/whatsapp').set(cfg('u_admin', { eventiSpenti: ['tutto'] })));
      await assertFails(admin().doc('buildings/1/impostazioni/whatsapp').set(cfg('u_editor')));
    });
    it('messaggi aperti: l\'amministratore crea la voce e la allunga; nessuno la cancella o la riscrive', async () => {
      const voce = (extra = {}) => ({ evento: 'avviso', titolo: 'Acqua', aperti: [{ id: 1, nome: 'Mario', ora: '2026-10-19T10:00:00Z' }], autoreUid: 'u_admin', creatoIl: now(), aggiornatoIl: now(), ...extra });
      await assertSucceeds(admin().doc('buildings/1/inviiWhatsapp/a').set(voce()));
      await assertSucceeds(admin().doc('buildings/1/inviiWhatsapp/a').update({ aperti: [{ id: 1 }, { id: 2 }], aggiornatoIl: now() }));
      await assertFails(admin().doc('buildings/1/inviiWhatsapp/a').update({ titolo: 'Altro', aggiornatoIl: now() }));
      await assertFails(admin().doc('buildings/1/inviiWhatsapp/a').delete());
      await assertSucceeds(admin().doc('buildings/1/inviiWhatsapp/a').get());
      await assertFails(editor().doc('buildings/1/inviiWhatsapp/a').get());
      await assertFails(member().collection('buildings/1/inviiWhatsapp').get());
      await assertFails(editor().doc('buildings/1/inviiWhatsapp/b').set(voce({ autoreUid: 'u_editor' })));
      await assertFails(admin().doc('buildings/1/inviiWhatsapp/c').set(voce({ autoreUid: 'u_altro' })));
      await assertFails(admin().doc('buildings/1/inviiWhatsapp/d').set(voce({ evento: 'spam' })));
      await assertFails(admin().doc('buildings/1/inviiWhatsapp/e').set(voce({ extra: 1 })));
    });
  });

  describe('millesimi: configurazione del condominio', () => {
    const cfg = (uid, extra = {}) => ({ attivo: true, dal: '2026-01-01', tabelle: [{ id: 'generale', nome: 'Generale', valori: { 'int. 1': 500, 'int. 2': 500 } }], categorie: {}, aggiornatoDa: uid, aggiornatoIl: now(), ...extra });
    it('solo l\'amministratore li modifica; tutto il condominio li legge, un altro condominio no', async () => {
      await assertSucceeds(admin().doc('buildings/1/impostazioni/millesimi').set(cfg('u_admin')));
      await assertSucceeds(member().doc('buildings/1/impostazioni/millesimi').get());
      await assertSucceeds(editor().doc('buildings/1/impostazioni/millesimi').get());
      await assertFails(ctx('u_m2', { role: 'member', buildingId: '2' }).doc('buildings/1/impostazioni/millesimi').get());
      await assertFails(editor().doc('buildings/1/impostazioni/millesimi').set(cfg('u_editor')));
      await assertFails(member().doc('buildings/1/impostazioni/millesimi').set(cfg('u_member')));
    });
    it('forma controllata: niente campi estranei, tipi giusti, firma dell\'autore', async () => {
      await assertFails(admin().doc('buildings/1/impostazioni/millesimi').set(cfg('u_admin', { altro: 1 })));
      await assertFails(admin().doc('buildings/1/impostazioni/millesimi').set(cfg('u_admin', { attivo: 'si' })));
      await assertFails(admin().doc('buildings/1/impostazioni/millesimi').set(cfg('u_editor')));
      await assertFails(admin().doc('buildings/1/impostazioni/millesimi').delete());
    });
  });

  describe('appartamenti in affitto', () => {
    const cfg = (uid, extra = {}) => ({ appartamenti: { 'int. 1': true }, aggiornatoDa: uid, aggiornatoIl: now(), ...extra });
    it('li modifica solo l\'amministratore; li legge tutto il condominio', async () => {
      await assertSucceeds(admin().doc('buildings/1/impostazioni/affitti').set(cfg('u_admin')));
      await assertSucceeds(member().doc('buildings/1/impostazioni/affitti').get());
      await assertFails(ctx('u_m2', { role: 'member', buildingId: '2' }).doc('buildings/1/impostazioni/affitti').get());
      await assertFails(editor().doc('buildings/1/impostazioni/affitti').set(cfg('u_editor')));
      await assertFails(admin().doc('buildings/1/impostazioni/affitti').set(cfg('u_admin', { inquilini: [] })));
    });
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
    it('un adminEdificio non cambia sul proprio record disattivazione, cancellazione, uscita e ruolo (audit 2026-10-30)', async () => {
      const mio = { id: 60, edificioId: 1, uid: 'u_admin', isAdmin: true, canEdit: true, disabled: true, _createdBy: 'backfill', _createdAt: T0 };
      await seedDoc('buildings/1/members/60', mio);
      const ok = (extra) => rec('u_admin', 60, { _createdBy: 'backfill', _createdAt: T0, uid: 'u_admin', isAdmin: true, canEdit: true, disabled: true, ...extra });
      await assertFails(admin().doc('buildings/1/members/60').set(ok({ disabled: false })));
      await assertFails(admin().doc('buildings/1/members/60').set(ok({ _deleted: true, _deletedBy: 'u_admin' })));
      await assertFails(admin().doc('buildings/1/members/60').set(ok({ dataUscita: '2030-01-01' })));
      await assertFails(admin().doc('buildings/1/members/60').set(ok({ isAdmin: false })));
      await assertSucceeds(admin().doc('buildings/1/members/60').set(ok({ nome: 'Nuovo nome' })));
      // sul record di un altro condomino resta libero, e il Super Admin può tutto
      await seedDoc('buildings/1/members/61', { id: 61, edificioId: 1, uid: 'u_altro', disabled: true, _createdBy: 'backfill', _createdAt: T0 });
      await assertSucceeds(admin().doc('buildings/1/members/61').set(rec('u_admin', 61, { _createdBy: 'backfill', _createdAt: T0, uid: 'u_altro', disabled: false })));
      await assertSucceeds(superA().doc('buildings/1/members/60').set(rec('u_super', 60, { _createdBy: 'backfill', _createdAt: T0, uid: 'u_admin', isAdmin: true, canEdit: true, disabled: false })));
    });
    it('un adminEdificio non può creare un superAdmin né cambiare l\'account collegato', async () => {
      await assertFails(admin().doc('buildings/1/members/50').set(rec('u_admin', 50, { superAdmin: true })));
      await seedDoc('buildings/1/members/51', { id: 51, edificioId: 1, uid: 'u_vero', _createdBy: 'backfill', _createdAt: T0 });
      await assertFails(admin().doc('buildings/1/members/51').set(rec('u_admin', 51, { _createdBy: 'backfill', _createdAt: T0, uid: 'u_attaccante' })));
      await assertSucceeds(admin().doc('buildings/1/members/51').set(rec('u_admin', 51, { _createdBy: 'backfill', _createdAt: T0, uid: 'u_vero', nome: 'Nuovo nome' })));
      await assertSucceeds(superA().doc('buildings/1/members/52').set(rec('u_super', 52, { superAdmin: false, uid: 'u_x' })));
    });
  });

  // Audit 2026-10-21
  describe('colore dei condomini: solo esadecimale', () => {
    it('un esadecimale è accettato, un valore con ";" o altro CSS no', async () => {
      await assertSucceeds(admin().doc('buildings/1/members/80').set(rec('u_admin', 80, { color: '#3B82F6' })));
      await assertSucceeds(admin().doc('buildings/1/members/81').set(rec('u_admin', 81, {})));
      for (const [i, c] of ['red;position:fixed;inset:0', '#fff;background:url(https://x.test/p)', 'red', 5].entries()) {
        await assertFails(admin().doc(`buildings/1/members/${82 + i}`).set(rec('u_admin', 82 + i, { color: c })));
      }
    });
    it('un colore vecchio già salvato non blocca altri salvataggi dello stesso record', async () => {
      await seedDoc('buildings/1/members/90', { id: 90, edificioId: 1, _createdBy: 'backfill', _createdAt: T0, color: 'rgb(1,2,3)' });
      await assertSucceeds(admin().doc('buildings/1/members/90').set(rec('u_admin', 90, { _createdBy: 'backfill', _createdAt: T0, color: 'rgb(1,2,3)', nome: 'Nuovo' })));
    });
  });

  // Consolidato 2026-10-24, QA-CONS-020 (decisione RA-2: solo importi positivi)
  describe('importi: importo, preventivo e consuntivo solo maggiori di zero', () => {
    it('importi positivi (testo con al massimo due decimali o numero) e vuoti: accettati', async () => {
      let i = 0;
      for (const v of ['1200', '1200.5', '0.05', '0.5', '12.34', '007.50', 25, 0.5, '']) {
        await assertSucceeds(editor().doc(`buildings/1/payments/${300 + i}`).set(rec('u_editor', 300 + i, { importo: v })));
        await assertSucceeds(editor().doc(`buildings/1/expenses/${400 + i}`).set(rec('u_editor', 400 + i, { preventivo: v, consuntivo: v })));
        i++;
      }
      await assertSucceeds(editor().doc('buildings/1/expenses/499').set(rec('u_editor', 499, { titolo: 'senza importi' })));
    });
    it('zero, negativi, troppi decimali, virgola, testo e tipi sbagliati: rifiutati', async () => {
      let i = 0;
      for (const v of ['0', '0.00', '-50', '-0.01', '10.123', '10,50', 'abc', '1e3', ' 5', 'NaN', 0, -5, true, [5], { a: 1 }]) {
        await assertFails(editor().doc(`buildings/1/payments/${600 + i}`).set(rec('u_editor', 600 + i, { importo: v })));
        await assertFails(editor().doc(`buildings/1/expenses/${700 + i}`).set(rec('u_editor', 700 + i, { preventivo: v })));
        await assertFails(editor().doc(`buildings/1/expenses/${800 + i}`).set(rec('u_editor', 800 + i, { consuntivo: v })));
        i++;
      }
    });
    it('un importo vecchio (zero o negativo) già salvato non blocca altri salvataggi, ma non si può cambiare in un altro non valido', async () => {
      const base = { id: 900, edificioId: 1, _createdBy: 'backfill', _createdAt: T0, importo: '-100' };
      await seedDoc('buildings/1/payments/900', base);
      await assertSucceeds(editor().doc('buildings/1/payments/900').set(rec('u_editor', 900, { _createdBy: 'backfill', _createdAt: T0, importo: '-100', descrizione: 'Nuova nota' })));
      await assertFails(editor().doc('buildings/1/payments/900').set(rec('u_editor', 900, { _createdBy: 'backfill', _createdAt: T0, importo: '-200' })));
      await assertSucceeds(editor().doc('buildings/1/payments/900').set(rec('u_editor', 900, { _createdBy: 'backfill', _createdAt: T0, importo: '100' })));
    });
    it('caso peggiore per il limite di 1000 espressioni: 10 allegati vecchi incorporati, riferimenti e tutti gli importi da controllare', async () => {
      const pesanti = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, nome: 'f.jpg', mime: 'image/jpeg', size: 1, data64: 'data:image/jpeg;base64,/9j/AA==' }));
      await assertSucceeds(editor().doc('buildings/1/expenses/901').set(rec('u_editor', 901, { allegati: pesanti, fornitoreId: 1, ricGruppoId: 2, tabellaMillesimi: 'generale',
        preventivo: '1200.50', consuntivo: '999.99', importo: '5.5',
        split: [], descrizione: 'd', note: 'n', data: '2026-01-01', testo: 't', nome: 'x', descrizioneSintetica: 's', argomenti: [], decisioni: [], storicoAggiornamenti: [] })));
    });
  });

  // Audit 2026-10-15
  describe('allegati: forma di ogni elemento', () => {
    const all = (extra = {}) => ({ id: 1700000000001, nome: 'fattura.pdf', mime: 'application/pdf', size: 10, storagePath: 'buildings/1/allegati/x', ...extra });
    it('id numero o stringa semplice, nome e mime testuali: accettati', async () => {
      await assertSucceeds(editor().doc('buildings/1/expenses/60').set(rec('u_editor', 60, { allegati: [all(), all({ id: 'a-12_3' })] })));
      await assertSucceeds(editor().doc('buildings/1/expenses/61').set(rec('u_editor', 61, { allegati: [] })));
    });
    it('id con apici o caratteri HTML, campi mancanti o di tipo sbagliato: rifiutati', async () => {
      const no = async (a) => assertFails(editor().doc('buildings/1/expenses/62').set(rec('u_editor', 62, { allegati: [all(), a] })));
      await no(all({ id: "1' onmouseover='alert(1)" }));
      await no(all({ id: '1"><img src=x>' }));
      await no(all({ id: '' }));
      await no(all({ nome: 5 }));
      await no(all({ mime: ['x'] }));
      await no({ id: 2, nome: 'senza-mime' });
      await no('non-un-oggetto');
    });
    it('controllo anche in fondo alla lista; più di 10 allegati rifiutati', async () => {
      const tanti = Array.from({ length: 10 }, (_, i) => all({ id: i + 1 }));
      await assertSucceeds(editor().doc('buildings/1/expenses/63').set(rec('u_editor', 63, { allegati: tanti })));
      // Caso peggiore per il limite di 1000 espressioni: 10 vecchi allegati incorporati e tutti i riferimenti.
      const pesanti = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, nome: 'f.jpg', mime: 'image/jpeg', size: 1, data64: 'data:image/jpeg;base64,/9j/AA==' }));
      await assertSucceeds(editor().doc('buildings/1/expenses/73').set(rec('u_editor', 73, { allegati: pesanti, fornitoreId: 1, ricGruppoId: 2, tabellaMillesimi: 'generale',
        split: [], descrizione: 'd', note: 'n', data: '2026-01-01', testo: 't', nome: 'x', descrizioneSintetica: 's', argomenti: [], decisioni: [], storicoAggiornamenti: [] })));
      await assertFails(editor().doc('buildings/1/expenses/64').set(rec('u_editor', 64, { allegati: [...tanti.slice(0, 9), all({ id: "x'" })] })));
      await assertFails(editor().doc('buildings/1/expenses/65').set(rec('u_editor', 65, { allegati: [...tanti, all({ id: 11 })] })));
    });
    it('allegati invariati non ricontrollati: si modifica un record vecchio con più di 10 allegati', async () => {
      const vecchi = Array.from({ length: 25 }, (_, i) => all({ id: i + 1 }));
      await seedDoc('buildings/1/expenses/67', { id: 67, edificioId: 1, _createdBy: 'backfill', _createdAt: T0, allegati: vecchi });
      await assertSucceeds(editor().doc('buildings/1/expenses/67').set(rec('u_editor', 67, { _createdBy: 'backfill', _createdAt: T0, allegati: vecchi, titolo: 'Nuovo' })));
    });
    it('vale per tutte le collezioni con allegati, condomini compresi', async () => {
      for (const c of ['minutes', 'resolutions', 'notices', 'works', 'members']) {
        await assertFails(admin().doc(`buildings/1/${c}/66`).set(rec('u_admin', 66, { allegati: [all({ id: "'" })] })));
      }
    });
    // Audit 2026-10-19
    // (che lo spazio sia quello del proprio condominio lo controllano le storage.rules alla lettura)
    it('file solo nello spazio allegati; data64 solo come data: in base64', async () => {
      const no = async (a) => assertFails(editor().doc('buildings/1/expenses/68').set(rec('u_editor', 68, { allegati: [a] })));
      await no(all({ storagePath: 'buildings/1/altro/x' }));
      await no(all({ storagePath: 'javascript:alert(1)' }));
      await no(all({ storagePath: 'buildings/1/allegati/../../2/allegati/x' }));
      await no(all({ storagePath: 5 }));
      const leg = (data64) => ({ id: 7, nome: 'vecchio.pdf', mime: 'application/pdf', size: 10, data64 });
      await no(leg('javascript:alert(1)'));
      await no(leg(' data:application/pdf;base64,JVBERi0='));
      await no(leg('data:text/html,<script>alert(1)</script>'));
      await assertSucceeds(editor().doc('buildings/1/expenses/69').set(rec('u_editor', 69, {
        allegati: [leg('data:application/pdf;base64,JVBERi0='), leg('data:image/jpeg;base64,/9j/' + 'A'.repeat(700000)), all()] })));
    });
  });

  // Audit 2026-10-19: id e riferimenti finiscono in attributi HTML.
  describe('id dei record e riferimenti: solo caratteri sicuri', () => {
    const bad = '1"><img src=x onerror=alert(1)>';
    it('id numerici o testo semplice accettati', async () => {
      await assertSucceeds(editor().doc('buildings/1/expenses/1789228019954').set(rec('u_editor', 1789228019954)));
      await assertSucceeds(editor().doc('buildings/1/expenses/a-1_b.2').set(rec('u_editor', 'a-1_b.2')));
    });
    it('id con virgolette o tag rifiutato, anche al superAdmin', async () => {
      await assertFails(editor().doc(`buildings/1/expenses/${bad}`).set(rec('u_editor', bad)));
      await assertFails(admin().doc(`buildings/1/notices/${bad}`).set(rec('u_admin', bad)));
      await assertFails(superA().doc(`buildings/1/members/${bad}`).set(rec('u_super', bad)));
      await assertFails(editor().doc('buildings/1/expenses/a b').set(rec('u_editor', 'a b')));
    });
    it('riferimenti ad altri record: vuoti, numeri o testo semplice', async () => {
      await assertSucceeds(editor().doc('buildings/1/expenses/70').set(rec('u_editor', 70, { fornitoreId: 12, ricGruppoId: null, tabellaMillesimi: 'generale' })));
      await assertSucceeds(admin().doc('buildings/1/works/71').set(rec('u_admin', 71, { delibereRifId: '' })));
      for (const [coll, campo] of [['expenses', 'fornitoreId'], ['expenses', 'ricGruppoId'], ['expenses', 'tabellaMillesimi'],
        ['payments', 'condominoId'], ['works', 'delibereRifId'], ['resolutions', 'verbaleRifId']]) {
        await assertFails(admin().doc(`buildings/1/${coll}/72`).set(rec('u_admin', 72, { [campo]: bad })));
        await assertFails(admin().doc(`buildings/1/${coll}/72`).set(rec('u_admin', 72, { [campo]: { x: 1 } })));
      }
    });
  });

  describe('_restoredAt: lo imposta solo il ripristino da backup', () => {
    const T1 = firebase.firestore.Timestamp.fromMillis(1710000000000);
    it('il client non lo imposta su un nuovo record né su uno esistente', async () => {
      await assertFails(editor().doc('buildings/1/expenses/70').set(rec('u_editor', 70, { _restoredAt: T1 })));
      await seedDoc('buildings/1/expenses/71', { id: 71, edificioId: 1, _createdBy: 'backfill', _createdAt: T0 });
      await assertFails(editor().doc('buildings/1/expenses/71').set(rec('u_editor', 71, { _createdBy: 'backfill', _createdAt: T0, _restoredAt: T1 })));
      await assertFails(admin().doc('buildings/1/members/71').set(rec('u_admin', 71, { _restoredAt: now() })));
    });
    it('su un record ripristinato il client lo conserva o lo toglie, ma non lo cambia', async () => {
      const base = { _createdBy: 'backfill', _createdAt: T0 };
      await seedDoc('buildings/1/expenses/72', { id: 72, edificioId: 1, ...base, _restoredAt: T1 });
      await assertSucceeds(editor().doc('buildings/1/expenses/72').set(rec('u_editor', 72, { ...base, _restoredAt: T1, titolo: 'Modificata' })));
      await assertFails(editor().doc('buildings/1/expenses/72').set(rec('u_editor', 72, { ...base, _restoredAt: now() })));
      // modifica con fusione, come fa l'app: il campo resta quello del server
      await assertSucceeds(editor().doc('buildings/1/expenses/72').set({ titolo: 'Fusione', _updatedBy: 'u_editor', _updatedAt: now() }, { merge: true }));
      await assertSucceeds(editor().doc('buildings/1/expenses/72').set(rec('u_editor', 72, base)));
    });
    it('il superAdmin può ancora scriverlo', async () => {
      await assertSucceeds(superA().doc('buildings/1/expenses/73').set(rec('u_super', 73, { _restoredAt: T1 })));
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

  // Audit 2026-10-19: stato dei backup e dei controlli, solo per il superAdmin.
  it('member e adminEdificio NON possono leggere; il superAdmin sì', async () => {
    const m = testEnv.authenticatedContext('u_member', { role: 'member', buildingId: 'b1' }).firestore();
    const a = testEnv.authenticatedContext('u_admin', { role: 'adminEdificio', buildingId: 'b1' }).firestore();
    const s = testEnv.authenticatedContext('u_super', { role: 'superAdmin' }).firestore();
    await assertFails(m.doc('appSettings/backupStatus').get());
    await assertFails(a.doc('appSettings/controlloServizio').get());
    await assertSucceeds(s.doc('appSettings/backupStatus').get());
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

// ─── Audit 2026-10-24 (lotto L3) ───────────────────────────────────────────
describe('allegati: tipo (mime) da elenco chiuso (QA-CONS-001)', () => {
  const firebase = require('firebase/compat/app').default;
  require('firebase/compat/firestore');
  const now = () => firebase.firestore.FieldValue.serverTimestamp();
  const editor = () => testEnv.authenticatedContext('u_editor', { role: 'editor', buildingId: '1' }).firestore();
  const rec = (id, allegati) => ({ id, edificioId: 1, titolo: 'T', _createdBy: 'u_editor', _createdAt: now(), _updatedBy: 'u_editor', _updatedAt: now(), allegati });
  const all = (mime) => ({ id: 5, nome: 'f', mime, size: 1, storagePath: 'buildings/1/allegati/x' });

  it('i tipi dell\'elenco sono accettati', async () => {
    const ok = ['application/pdf', 'image/png', 'image/jpeg', 'text/csv', 'application/octet-stream',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.oasis.opendocument.text', 'application/vnd.ms-excel'];
    for (const [i, m] of ok.entries()) await assertSucceeds(editor().doc(`buildings/1/expenses/${300 + i}`).set(rec(300 + i, [all(m)])));
  });
  it('SVG, HTML, script e tipi con coda sono rifiutati', async () => {
    const no = ['image/svg+xml', 'text/html', 'application/xhtml+xml', 'application/javascript', 'image/png<x', 'application/pdf;x=1',
      'application/vnd.openxmlformats-officedocument.evil', 'APPLICATION/PDF', '', 'pdf'];
    for (const [i, m] of no.entries()) await assertFails(editor().doc(`buildings/1/expenses/${320 + i}`).set(rec(320 + i, [all(m)])));
  });
});

describe('cancellazione logica: _deletedBy non falsificabile (QA-CONS-016)', () => {
  const firebase = require('firebase/compat/app').default;
  require('firebase/compat/firestore');
  const now = () => firebase.firestore.FieldValue.serverTimestamp();
  const T0 = firebase.firestore.Timestamp.fromMillis(1700000000000);
  const as = (uid) => testEnv.authenticatedContext(uid, { role: 'editor', buildingId: '1' }).firestore();
  const rec = (uid, id, extra = {}) => ({ id, edificioId: 1, titolo: 'T', _createdBy: 'backfill', _createdAt: T0, _updatedBy: uid, _updatedAt: now(), ...extra });
  const seed = (id, extra = {}) => testEnv.withSecurityRulesDisabled((c) => c.firestore().doc(`buildings/1/expenses/${id}`).set({ id, edificioId: 1, _createdBy: 'backfill', _createdAt: T0, ...extra }));

  it('chi cancella firma sé stesso, non un altro', async () => {
    await seed(400);
    await assertFails(as('u_editor').doc('buildings/1/expenses/400').set(rec('u_editor', 400, { _deleted: true, _deletedBy: 'u_altro' })));
    await assertSucceeds(as('u_editor').doc('buildings/1/expenses/400').set(rec('u_editor', 400, { _deleted: true, _deletedBy: 'u_editor' })));
  });
  it('su un record già cancellato _deletedBy non si cambia né si toglie', async () => {
    await seed(401, { _deleted: true, _deletedBy: 'u_primo' });
    await assertFails(as('u_editor').doc('buildings/1/expenses/401').set(rec('u_editor', 401, { _deleted: true, _deletedBy: 'u_altro' })));
    await assertFails(as('u_editor').doc('buildings/1/expenses/401').set(rec('u_editor', 401, { _deleted: true })));
    await assertSucceeds(as('u_editor').doc('buildings/1/expenses/401').set(rec('u_editor', 401, { _deleted: true, _deletedBy: 'u_primo', titolo: 'Altro' })));
  });
  it('un record non cancellato non porta un _deletedBy nuovo; il ripristino conserva o toglie il vecchio', async () => {
    await assertFails(as('u_editor').doc('buildings/1/expenses/402').set(rec('u_editor', 402, { _deleted: false, _deletedBy: 'u_altro' })));
    await seed(403, { _deleted: true, _deletedBy: 'u_primo' });
    await assertFails(as('u_editor').doc('buildings/1/expenses/403').set(rec('u_editor', 403, { _deleted: false, _deletedBy: 'u_altro' })));
    await assertSucceeds(as('u_editor').doc('buildings/1/expenses/403').set(rec('u_editor', 403, { _deleted: false, _deletedBy: 'u_primo' })));
  });
});

describe('users/{uid}: solo campi e lunghezze previsti (QA-CONS-031)', () => {
  const db = () => testEnv.authenticatedContext('u1', { role: 'member', buildingId: 'b1' }).firestore();
  it('campi sconosciuti, valori lunghi o di altro tipo e cancellazione sono rifiutati', async () => {
    await assertFails(db().doc('users/u1').set({ email: 'a@b.com', role: 'superAdmin' }));
    await assertFails(db().doc('users/u1').set({ blob: 'x'.repeat(5000) }));
    await assertFails(db().doc('users/u1').set({ email: 'x'.repeat(201) }));
    await assertFails(db().doc('users/u1').set({ email: { a: 1 } }));
    await assertSucceeds(db().doc('users/u1').set({ email: 'a@b.com', displayName: 'Mario' }));
    await assertFails(db().doc('users/u1').delete());
  });
});

describe('clientErrors: limiti su tutti i campi (QA-CONS-032)', () => {
  const firebase = require('firebase/compat/app').default;
  require('firebase/compat/firestore');
  const now = () => firebase.firestore.FieldValue.serverTimestamp();
  const member = () => testEnv.authenticatedContext('u_member', { role: 'member', buildingId: '1' }).firestore();
  const ok = (extra = {}) => ({ message: 'x', stack: 's', page: 'spese', uid: 'u_member', role: 'member', buildingId: '1', ua: 'u', at: now(), ...extra });
  it('role, buildingId e gli altri campi hanno una lunghezza massima e il tipo giusto', async () => {
    await assertSucceeds(member().collection('clientErrors').add(ok()));
    await assertFails(member().collection('clientErrors').add(ok({ role: 'x'.repeat(41) })));
    await assertFails(member().collection('clientErrors').add(ok({ buildingId: 'x'.repeat(65) })));
    await assertFails(member().collection('clientErrors').add(ok({ role: 5 })));
    await assertFails(member().collection('clientErrors').add(ok({ stack: 'x'.repeat(2001) })));
    await assertFails(member().collection('clientErrors').add(ok({ page: 'x'.repeat(41) })));
    await assertFails(member().collection('clientErrors').add(ok({ ua: 'x'.repeat(201) })));
  });
});

describe('Storage: solo allegati, tipi ristretti (QA-CONS-033)', () => {
  require('firebase/compat/storage');
  let st;
  before(async () => {
    st = await initializeTestEnvironment({
      projectId: 'neridarimini-storage',
      storage: { rules: fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8'), host: 'localhost', port: 9199 },
    });
  });
  after(async () => { await st.cleanup(); });
  const editor = () => st.authenticatedContext('u_editor', { role: 'editor', buildingId: '1' }).storage();
  const member = () => st.authenticatedContext('u_member', { role: 'member', buildingId: '1' }).storage();
  const put = (s, p, type) => s.ref(p).put(new Uint8Array([1, 2, 3]), { contentType: type });

  it('si carica solo sotto buildings/{id}/allegati/, un file per percorso', async () => {
    await assertSucceeds(put(editor(), 'buildings/1/allegati/a.pdf', 'application/pdf'));
    await assertFails(put(editor(), 'buildings/1/altro/a.pdf', 'application/pdf'));
    await assertFails(put(editor(), 'buildings/1/allegati/sotto/a.pdf', 'application/pdf'));
    await assertFails(put(editor(), 'buildings/1/a.pdf', 'application/pdf'));
    await assertFails(put(editor(), 'buildings/2/allegati/a.pdf', 'application/pdf'));
    await assertFails(put(editor(), 'buildings/1/allegati/' + 'x'.repeat(301), 'application/pdf'));
  });
  it('tipi: documenti noti sì; SVG, HTML e tipi Office fuori elenco no', async () => {
    await assertSucceeds(put(editor(), 'buildings/1/allegati/b.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
    await assertSucceeds(put(editor(), 'buildings/1/allegati/c.png', 'image/png'));
    await assertFails(put(editor(), 'buildings/1/allegati/d.svg', 'image/svg+xml'));
    await assertFails(put(editor(), 'buildings/1/allegati/e.html', 'text/html'));
    await assertFails(put(editor(), 'buildings/1/allegati/f.x', 'application/vnd.openxmlformats-officedocument.evil'));
    await assertFails(put(editor(), 'buildings/1/allegati/g.x', 'application/vnd.oasis.opendocument.formula-template'));
  });
  it('lettura per il condominio, scrittura non per i member', async () => {
    await assertSucceeds(put(editor(), 'buildings/1/allegati/r.pdf', 'application/pdf'));
    await assertSucceeds(member().ref('buildings/1/allegati/r.pdf').getMetadata());
    await assertFails(put(member(), 'buildings/1/allegati/h.pdf', 'application/pdf'));
  });
});

// ─── Lotto B (2026-10-25): margine delle 1000 espressioni, ripristino, tipo degli allegati vecchi, tipi dei condomini ───
describe('lotto B: allegati vecchi, margine delle espressioni, ripristino e tipi (SEC-019, SEC-020, CR-001/REL-002, DAT-008)', () => {
  const firebase = require('firebase/compat/app').default;
  require('firebase/compat/firestore');
  const now = () => firebase.firestore.FieldValue.serverTimestamp();
  const T0 = firebase.firestore.Timestamp.fromMillis(1700000000000);
  const ctx = (uid, claims) => testEnv.authenticatedContext(uid, claims).firestore();
  const editor = () => ctx('u_editor', { role: 'editor', buildingId: '1' });
  const admin = () => ctx('u_admin', { role: 'adminEdificio', buildingId: '1' });
  const BASE = { _createdBy: 'backfill', _createdAt: T0 };
  const seed = (coll, id, extra = {}) => testEnv.withSecurityRulesDisabled((c) => c.firestore().doc(`buildings/1/${coll}/${id}`).set({ id, edificioId: 1, ...BASE, ...extra }));
  // Record valido scritto da `uid` su uno già esistente (autore della creazione: quello del seme)...
  const rec = (uid, id, extra = {}) => ({ id, edificioId: 1, titolo: 'T', ...BASE, _updatedBy: uid, _updatedAt: now(), ...extra });
  // ...e record nuovo.
  const recNuovo = (uid, id, extra = {}) => ({ id, edificioId: 1, titolo: 'T', _createdBy: uid, _createdAt: now(), _updatedBy: uid, _updatedAt: now(), ...extra });
  // Vecchi allegati incorporati (data64), come quelli dei dati più vecchi
  const incorporati = (n, nome = 'f.jpg') => Array.from({ length: n }, (_, i) => ({ id: i + 1, nome, mime: 'image/jpeg', size: 1, data64: 'data:image/jpeg;base64,/9j/AA==' }));
  const nuovoSp = { id: 99, nome: 'nuova.pdf', mime: 'application/pdf', size: 1, storagePath: 'buildings/1/allegati/nuova' };
  const riferimenti = { fornitoreId: 1, ricGruppoId: 2, tabellaMillesimi: 'generale', condominoId: 3, delibereRifId: 4, verbaleRifId: 5 };
  const testi = { descrizione: 'd', note: 'n', data: '2026-01-01', testo: 't', nome: 'x', descrizioneSintetica: 's', argomenti: [], decisioni: [], storicoAggiornamenti: [], split: [] };
  const vecchiImporti = { importo: '0', preventivo: '-5', consuntivo: '0.00' };

  // SEC-019: il caso peggiore in AGGIORNAMENTO. Un allegato identico a uno già salvato non si ricontrolla (CR-001), quindi
  // pesano solo gli allegati nuovi o cambiati; questi casi hanno comunque tutti gli altri controlli al massimo (sei
  // riferimenti, tre importi vecchi non validi da confrontare, colore, cancellazione). Margine misurato: vedi il log di riparazione.
  describe('SEC-019: caso peggiore in aggiornamento (limite di 1000 espressioni)', () => {
    it('spesa: 9 allegati incorporati vecchi invariati e 1 nuovo, sei riferimenti, tre importi vecchi non validi invariati, colore cambiato e cancellazione', async () => {
      await seed('expenses', 1001, { allegati: incorporati(9), ...vecchiImporti, color: 'rgb(1,2,3)' });
      await assertSucceeds(editor().doc('buildings/1/expenses/1001').set(rec('u_editor', 1001, {
        allegati: [...incorporati(9), nuovoSp], ...vecchiImporti, color: '#aabbcc', ...riferimenti, ...testi, _deleted: true, _deletedBy: 'u_editor' })));
    });
    it('spesa: 10 allegati incorporati vecchi, se ne toglie uno e se ne aggiunge uno nuovo (la lista cambia, gli altri restano uguali)', async () => {
      await seed('expenses', 1002, { allegati: incorporati(10), ...vecchiImporti });
      await assertSucceeds(editor().doc('buildings/1/expenses/1002').set(rec('u_editor', 1002, {
        allegati: [...incorporati(10).slice(1), nuovoSp], ...vecchiImporti, preventivo: '10.5', ...riferimenti, ...testi })));
    });
    it('condomino: 9 allegati incorporati vecchi invariati e 1 nuovo, colore, account collegato, rappresentante, date e cancellazione', async () => {
      await seed('members', 1003, { allegati: incorporati(9), uid: 'u_x', superAdmin: false, color: 'rgb(1,2,3)' });
      await assertSucceeds(admin().doc('buildings/1/members/1003').set(rec('u_admin', 1003, {
        allegati: [...incorporati(9), nuovoSp], uid: 'u_x', superAdmin: false, color: '#aabbcc', ...riferimenti, ...testi, rappresentante: true,
        dataIngresso: '2026-01-01', dataUscita: '2027-01-01', _deleted: true, _deletedBy: 'u_admin' })));
    });
    it('verbale: 9 allegati incorporati vecchi invariati e 1 nuovo, ripristino di un record cancellato', async () => {
      await seed('minutes', 1004, { allegati: incorporati(9), _deleted: true, _deletedBy: 'u_primo' });
      await assertSucceeds(admin().doc('buildings/1/minutes/1004').set(rec('u_admin', 1004, { allegati: [...incorporati(9), nuovoSp], ...riferimenti, ...testi, _deleted: false })));
    });
    // SEC-021: il caso che la pagina può produrre davvero (js/sezioni/allegati.js): i file caricati si accumulano e si salvano
    // insieme, fino a dieci allegati NUOVI nello stesso salvataggio, tutti già in Storage (storagePath), con importi validi.
    const nuoviStorage = (n, da = 1) => Array.from({ length: n }, (_, i) => ({ id: da + i, nome: `f${da + i}.pdf`, mime: 'application/pdf', size: 1, storagePath: `buildings/1/allegati/f${da + i}` }));
    const importiValidi = { importo: '100.50', preventivo: '200', consuntivo: '150.25' };
    // Residuo noto e accettato (SEC-019/SEC-021): in AGGIORNAMENTO, otto o più allegati NUOVI nello stesso salvataggio, insieme a tutti e sei i
    // riferimenti e a tutti i campi di testo, superano il limite di 1000 espressioni (scrittura rifiutata, mai accettata). Non è un caso d'uso
    // realistico: la pagina collega di norma due o tre riferimenti. Per questo qui si provano i casi che possono succedere.
    it('SEC-021 spesa esistente senza allegati: dieci allegati nuovi in Storage in un solo salvataggio, con importi validi', async () => {
      await seed('expenses', 1030, { ...importiValidi });
      await assertSucceeds(editor().doc('buildings/1/expenses/1030').set(rec('u_editor', 1030, { allegati: nuoviStorage(10), ...importiValidi })));
    });
    it('SEC-021 spesa esistente senza allegati: sette allegati nuovi insieme a tutti i riferimenti e ai campi di testo', async () => {
      await seed('expenses', 1033, { ...importiValidi });
      await assertSucceeds(editor().doc('buildings/1/expenses/1033').set(rec('u_editor', 1033, { allegati: nuoviStorage(7), ...importiValidi, ...riferimenti, ...testi })));
    });
    it('SEC-021 spesa esistente con cinque allegati in Storage: se ne aggiungono altri cinque nuovi insieme', async () => {
      await seed('expenses', 1031, { allegati: nuoviStorage(5), ...importiValidi });
      await assertSucceeds(editor().doc('buildings/1/expenses/1031').set(rec('u_editor', 1031, { allegati: [...nuoviStorage(5), ...nuoviStorage(5, 6)], ...importiValidi, ...riferimenti, ...testi })));
    });
    it('SEC-021 creazione di una spesa con dieci allegati nuovi in Storage, con i riferimenti', async () => {
      await assertSucceeds(editor().doc('buildings/1/expenses/1032').set(recNuovo('u_editor', 1032, { allegati: nuoviStorage(10), ...importiValidi, ...riferimenti, ...testi })));
    });
    it('un allegato vecchio non è un lasciapassare: uno cambiato, accanto a quelli invariati, passa dal controllo completo', async () => {
      await seed('expenses', 1005, { allegati: incorporati(3) });
      const cambiato = { ...incorporati(3)[1], data64: 'javascript:alert(1)' };
      await assertFails(editor().doc('buildings/1/expenses/1005').set(rec('u_editor', 1005, { allegati: [incorporati(3)[0], cambiato, incorporati(3)[2]] })));
      await assertSucceeds(editor().doc('buildings/1/expenses/1005').set(rec('u_editor', 1005, { allegati: [incorporati(3)[0], { ...incorporati(3)[1], nome: 'rinominato.jpg' }, incorporati(3)[2]] })));
    });
  });

  // SEC-020: la firma di chi cancella non si riusa dopo un ripristino. Resta valido il comportamento già provato (QA-CONS-016):
  // il ripristino può conservare o togliere il vecchio _deletedBy; la cancellazione successiva però lo firma chi cancella.
  describe('SEC-020: una cancellazione nuova porta la firma di chi cancella, non quella di una cancellazione precedente', () => {
    it('dopo un ripristino che conserva la vecchia firma, un altro utente non può cancellare riusandola', async () => {
      await seed('expenses', 1010, { _deleted: true, _deletedBy: 'u_primo' });
      // ripristino con fusione, come fa l'app: la vecchia firma resta nel record
      await assertSucceeds(editor().doc('buildings/1/expenses/1010').set({ _deleted: false, _updatedBy: 'u_editor', _updatedAt: now() }, { merge: true }));
      // l'editor cancella senza cambiare la firma rimasta (u_primo): rifiutato
      await assertFails(editor().doc('buildings/1/expenses/1010').set({ _deleted: true, _updatedBy: 'u_editor', _updatedAt: now() }, { merge: true }));
      await assertFails(editor().doc('buildings/1/expenses/1010').set(rec('u_editor', 1010, { _deleted: true, _deletedBy: 'u_primo' })));
      // con la propria firma sì
      await assertSucceeds(editor().doc('buildings/1/expenses/1010').set(rec('u_editor', 1010, { _deleted: true, _deletedBy: 'u_editor' })));
    });
    it('chi aveva cancellato può cancellare di nuovo con la propria firma anche se è rimasta quella vecchia', async () => {
      await seed('expenses', 1011, { _deleted: true, _deletedBy: 'u_editor' });
      await assertSucceeds(editor().doc('buildings/1/expenses/1011').set({ _deleted: false, _updatedBy: 'u_editor', _updatedAt: now() }, { merge: true }));
      await assertSucceeds(editor().doc('buildings/1/expenses/1011').set({ _deleted: true, _updatedBy: 'u_editor', _updatedAt: now() }, { merge: true }));
    });
    it('il ripristino che toglie la firma e la nuova cancellazione firmata', async () => {
      await seed('expenses', 1012, { _deleted: true, _deletedBy: 'u_primo' });
      await assertSucceeds(editor().doc('buildings/1/expenses/1012').set(rec('u_editor', 1012, { _deleted: false })));
      await assertFails(editor().doc('buildings/1/expenses/1012').set(rec('u_editor', 1012, { _deleted: true })));
      await assertFails(editor().doc('buildings/1/expenses/1012').set(rec('u_editor', 1012, { _deleted: true, _deletedBy: 'u_altro' })));
      await assertSucceeds(editor().doc('buildings/1/expenses/1012').set(rec('u_editor', 1012, { _deleted: true, _deletedBy: 'u_editor' })));
    });
    it('un record già cancellato conserva la firma di chi ha cancellato, anche se lo modifica un altro', async () => {
      await seed('expenses', 1013, { _deleted: true, _deletedBy: 'u_primo' });
      await assertSucceeds(editor().doc('buildings/1/expenses/1013').set(rec('u_editor', 1013, { _deleted: true, _deletedBy: 'u_primo', titolo: 'Altro' })));
      await assertFails(editor().doc('buildings/1/expenses/1013').set(rec('u_editor', 1013, { _deleted: true, _deletedBy: 'u_editor' })));
    });
  });

  describe('CR-001 / REL-002: il tipo dell\'allegato si controlla solo se l\'allegato è nuovo o cambiato', () => {
    const fuori = (extra = {}) => ({ id: 1, nome: 'modello.ppsx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow', size: 1, storagePath: 'buildings/1/allegati/x', ...extra });
    const ok = (extra = {}) => ({ id: 2, nome: 'fattura.pdf', mime: 'application/pdf', size: 1, storagePath: 'buildings/1/allegati/y', ...extra });
    const legacy = (mime, extra = {}) => ({ id: 3, nome: 'vecchio.bin', mime, size: 1, data64: 'data:application/x-qualcosa;base64,AAAA', ...extra });
    it('un record con allegati vecchi fuori elenco (anche data64) resta modificabile, aggiornabile, cancellabile e ripristinabile', async () => {
      const vecchi = [fuori(), legacy('application/x-qualcosa'), legacy('image/svg+xml', { id: 4 })];
      await seed('expenses', 1020, { allegati: vecchi });
      await assertSucceeds(editor().doc('buildings/1/expenses/1020').set(rec('u_editor', 1020, { allegati: vecchi, titolo: 'Nuovo titolo' })));
      // la lista cambia (si aggiunge un allegato valido), gli elementi vecchi restano uguali
      await assertSucceeds(editor().doc('buildings/1/expenses/1020').set(rec('u_editor', 1020, { allegati: [...vecchi, ok()] })));
      // si toglie il primo: gli altri cambiano posizione ma non contenuto
      await assertSucceeds(editor().doc('buildings/1/expenses/1020').set(rec('u_editor', 1020, { allegati: [vecchi[1], vecchi[2], ok()] })));
      await assertSucceeds(editor().doc('buildings/1/expenses/1020').set(rec('u_editor', 1020, { allegati: [vecchi[1], ok()], _deleted: true, _deletedBy: 'u_editor' })));
      await assertSucceeds(editor().doc('buildings/1/expenses/1020').set(rec('u_editor', 1020, { allegati: [vecchi[1], ok()], _deleted: false })));
    });
    it('un allegato nuovo o cambiato fuori elenco è rifiutato, anche accanto a uno vecchio fuori elenco', async () => {
      const vecchi = [fuori()];
      await seed('expenses', 1021, { allegati: vecchi });
      await assertFails(editor().doc('buildings/1/expenses/1021').set(rec('u_editor', 1021, { allegati: [...vecchi, fuori({ id: 9 })] })));
      await assertFails(editor().doc('buildings/1/expenses/1021').set(rec('u_editor', 1021, { allegati: [...vecchi, ok({ mime: 'image/svg+xml' })] })));
      // lo stesso allegato con un tipo diverso (pure fuori elenco) è un allegato cambiato
      await assertFails(editor().doc('buildings/1/expenses/1021').set(rec('u_editor', 1021, { allegati: [fuori({ mime: 'text/html' })] })));
      await assertFails(editor().doc('buildings/1/expenses/1021').set(rec('u_editor', 1021, { allegati: [fuori({ mime: 'application/vnd.oasis.opendocument.formula-template' })] })));
      // un allegato vecchio rinominato è cambiato: il tipo fuori elenco non passa più
      await assertFails(editor().doc('buildings/1/expenses/1021').set(rec('u_editor', 1021, { allegati: [fuori({ nome: 'altro.ppsx' })] })));
    });
    it('in creazione l\'elenco resta chiuso', async () => {
      await assertFails(editor().doc('buildings/1/expenses/1022').set(recNuovo('u_editor', 1022, { allegati: [fuori()] })));
      await assertFails(editor().doc('buildings/1/expenses/1022').set(recNuovo('u_editor', 1022, { allegati: [ok(), legacy('image/svg+xml')] })));
      await assertSucceeds(editor().doc('buildings/1/expenses/1022').set(recNuovo('u_editor', 1022, { allegati: [ok()] })));
    });
    it('un allegato nuovo accanto a uno vecchio non salta le altre regole (id, percorso e data64)', async () => {
      const vecchi = [fuori()];
      await seed('expenses', 1023, { allegati: vecchi });
      await assertFails(editor().doc('buildings/1/expenses/1023').set(rec('u_editor', 1023, { allegati: [...vecchi, ok({ id: "x'" })] })));
      await assertFails(editor().doc('buildings/1/expenses/1023').set(rec('u_editor', 1023, { allegati: [...vecchi, ok({ storagePath: 'buildings/1/altro/x' })] })));
      await assertFails(editor().doc('buildings/1/expenses/1023').set(rec('u_editor', 1023, { allegati: [...vecchi, legacy('application/pdf', { data64: 'javascript:alert(1)' })] })));
      await assertFails(editor().doc('buildings/1/expenses/1023').set(rec('u_editor', 1023, { allegati: [...vecchi, ...Array.from({ length: 10 }, (_, i) => ok({ id: 10 + i }))] })));
    });
    it('una lista precedente che non è una lista non fa passare nulla di nuovo', async () => {
      await seed('expenses', 1024, { allegati: 'non-una-lista' });
      await assertFails(editor().doc('buildings/1/expenses/1024').set(rec('u_editor', 1024, { allegati: [fuori()] })));
      await assertSucceeds(editor().doc('buildings/1/expenses/1024').set(rec('u_editor', 1024, { allegati: [ok()] })));
    });
    it('10 allegati vecchi fuori elenco: si toglie il primo, con riferimenti e tre importi vecchi', async () => {
      const fuoriElenco = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, nome: 'a', mime: 'application/x-vecchio', size: 1, data64: 'data:application/x-vecchio;base64,AAAA' }));
      await seed('expenses', 1025, { allegati: fuoriElenco, ...vecchiImporti });
      await assertSucceeds(editor().doc('buildings/1/expenses/1025').set(rec('u_editor', 1025, { allegati: fuoriElenco.slice(1), ...vecchiImporti, fornitoreId: 1, ricGruppoId: 2, tabellaMillesimi: 'generale', ...testi })));
    });
  });

  describe('DAT-008: rappresentante e date dei condomini', () => {
    it('rappresentante: solo booleano (assente, true o false)', async () => {
      await assertSucceeds(admin().doc('buildings/1/members/1030').set(recNuovo('u_admin', 1030, {})));
      await assertSucceeds(admin().doc('buildings/1/members/1031').set(recNuovo('u_admin', 1031, { rappresentante: true })));
      await assertSucceeds(admin().doc('buildings/1/members/1032').set(recNuovo('u_admin', 1032, { rappresentante: false })));
      for (const [i, v] of ['false', 'x', 1, 0, [true], { a: 1 }].entries()) {
        await assertFails(admin().doc(`buildings/1/members/${1033 + i}`).set(recNuovo('u_admin', 1033 + i, { rappresentante: v })));
      }
    });
    it('un rappresentante non booleano già salvato non blocca altri salvataggi se non cambia', async () => {
      await seed('members', 1040, { rappresentante: 'si' });
      await assertSucceeds(admin().doc('buildings/1/members/1040').set(rec('u_admin', 1040, { rappresentante: 'si', nome: 'Nuovo' })));
      await assertFails(admin().doc('buildings/1/members/1040').set(rec('u_admin', 1040, { rappresentante: 'no' })));
      await assertSucceeds(admin().doc('buildings/1/members/1040').set(rec('u_admin', 1040, { rappresentante: true })));
    });
    it('data di una spesa o di un lavoro: vuota o AAAA-MM-GG; HTML e altri formati sono rifiutati (audit 2026-10-30)', async () => {
      await assertSucceeds(editor().doc('buildings/1/expenses/1100').set(recNuovo('u_editor', 1100, { data: '2026-03-01' })));
      await assertSucceeds(editor().doc('buildings/1/expenses/1101').set(recNuovo('u_editor', 1101, { data: '' })));
      await assertSucceeds(editor().doc('buildings/1/expenses/1102').set(recNuovo('u_editor', 1102)));
      for (const [i, v] of ['9<img src=x onerror=alert(1)>', '2026-03-01<b>', '1/3/26', '2026-3-1', 20260301, true, { a: 1 }].entries()) {
        await assertFails(editor().doc(`buildings/1/expenses/${1110 + i}`).set(recNuovo('u_editor', 1110 + i, { data: v })));
        await assertFails(admin().doc(`buildings/1/works/${1120 + i}`).set(recNuovo('u_admin', 1120 + i, { data: v })));
      }
    });
    it('una data di spesa vecchia in un altro formato, già salvata, non blocca altri salvataggi finché non cambia', async () => {
      await seed('expenses', 1130, { data: '1/3/26' });
      await assertSucceeds(editor().doc('buildings/1/expenses/1130').set(rec('u_editor', 1130, { data: '1/3/26', titolo: 'Nuovo' })));
      await assertFails(editor().doc('buildings/1/expenses/1130').set(rec('u_editor', 1130, { data: '<b>x</b>' })));
    });
    it('date di ingresso e uscita: vuote o AAAA-MM-GG; un altro formato è rifiutato', async () => {
      await assertSucceeds(admin().doc('buildings/1/members/1050').set(recNuovo('u_admin', 1050, { dataIngresso: '2026-03-01', dataUscita: '2027-01-31' })));
      await assertSucceeds(admin().doc('buildings/1/members/1051').set(recNuovo('u_admin', 1051, { dataIngresso: '', dataUscita: null })));
      for (const [i, v] of ['1/3/26', '2026-3-1', '01-03-2026', '2026', '2026-03-01T10:00', 'ieri', 20260301, true, { a: 1 }].entries()) {
        await assertFails(admin().doc(`buildings/1/members/${1052 + i}`).set(recNuovo('u_admin', 1052 + i, { dataIngresso: v })));
        await assertFails(admin().doc(`buildings/1/members/${1070 + i}`).set(recNuovo('u_admin', 1070 + i, { dataUscita: v })));
      }
    });
    it('una data vecchia in un altro formato, già salvata, non blocca altri salvataggi finché non cambia', async () => {
      await seed('members', 1090, { dataIngresso: '1/3/26', dataUscita: '2026-03-01T10:00' });
      await assertSucceeds(admin().doc('buildings/1/members/1090').set(rec('u_admin', 1090, { dataIngresso: '1/3/26', dataUscita: '2026-03-01T10:00', nome: 'Nuovo' })));
      await assertFails(admin().doc('buildings/1/members/1090').set(rec('u_admin', 1090, { dataIngresso: '2/3/26', dataUscita: '2026-03-01T10:00' })));
      await assertSucceeds(admin().doc('buildings/1/members/1090').set(rec('u_admin', 1090, { dataIngresso: '2026-03-02', dataUscita: '' })));
    });
  });
});

// DAT-009: un file fuori da buildings/{id}/allegati/ non è leggibile da nessuno (i commenti e il log L3 dicevano il contrario)
describe('Storage: i file fuori dallo spazio allegati non sono leggibili (DAT-009)', () => {
  require('firebase/compat/storage');
  let st;
  before(async () => {
    st = await initializeTestEnvironment({
      projectId: 'neridarimini-storage-dat009',
      storage: { rules: fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8'), host: 'localhost', port: 9199 },
    });
    await st.withSecurityRulesDisabled(async (c) => {
      const s = c.storage();
      await s.ref('buildings/1/altro/x.pdf').put(new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' });
      await s.ref('buildings/1/allegati/x.pdf').put(new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' });
    });
  });
  after(async () => { await st.cleanup(); });
  const as = (uid, claims) => st.authenticatedContext(uid, claims).storage();
  it('fuori da allegati/ nemmeno chi appartiene al condominio, né il superAdmin, può leggere o scrivere', async () => {
    for (const s of [as('u_member', { role: 'member', buildingId: '1' }), as('u_admin', { role: 'adminEdificio', buildingId: '1' }), as('u_super', { role: 'superAdmin' })]) {
      await assertFails(s.ref('buildings/1/altro/x.pdf').getMetadata());
      await assertFails(s.ref('buildings/1/altro/x.pdf').delete());
    }
  });
  it('dentro allegati/ il condominio legge, un altro condominio no', async () => {
    await assertSucceeds(as('u_member', { role: 'member', buildingId: '1' }).ref('buildings/1/allegati/x.pdf').getMetadata());
    await assertFails(as('u_altro', { role: 'member', buildingId: '2' }).ref('buildings/1/allegati/x.pdf').getMetadata());
  });
});
