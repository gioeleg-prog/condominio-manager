// Test di integrazione delle Cloud Functions + regole, sugli emulatori locali
// (auth, firestore, functions) del progetto demo-qa. Ogni test riparte da un
// seed pulito. Eseguire con:  npm run test:functions
const assert = require('assert');
const { seed, PASSWORD, PROJECT } = require('./seed');

const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;

async function token(email) {
  const r = await fetch(`${AUTH}/accounts:signInWithPassword?key=demo-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error('login fallito ' + email + ' ' + JSON.stringify(j));
  return j.idToken;
}
// Chiama una callable; ritorna { ok, data } oppure { ok:false, status, code, message }.
async function call(fn, email, data = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (email) headers.Authorization = 'Bearer ' + (await token(email));
  const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers, body: JSON.stringify({ data }) });
  const j = await r.json();
  if (j.error) return { ok: false, status: j.error.status, message: j.error.message };
  return { ok: true, data: j.result };
}
async function readBlob(key) {
  const r = await fetch(`${FS}/appdata/${key}`, { headers: { Authorization: 'Bearer owner' } });
  const j = await r.json();
  return JSON.parse(j.fields.value.stringValue);
}
async function fsGet(key, email) {
  const r = await fetch(`${FS}/appdata/${key}`, { headers: { Authorization: 'Bearer ' + (await token(email)) } });
  return { status: r.status, body: await r.json() };
}
async function fsPatch(key, email, value) {
  const r = await fetch(`${FS}/appdata/${key}`, {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + (await token(email)), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { value: { stringValue: JSON.stringify(value) } } }),
  });
  return r.status;
}

describe('INTEGRAZIONE — Cloud Functions su emulatore', function () {
  this.timeout(30000);
  beforeEach(async () => { await seed(); });

  describe('whoami — identificazione al login', () => {
    it('FT-AUTH-01 superAdmin (da cm_config) riceve il profilo sintetico', async () => {
      const r = await call('whoami', 'superadmin@qa.test');
      assert.ok(r.ok, r.message);
      assert.strictEqual(r.data.isSuperAdmin, true);
    });
    it('FT-AUTH-02 adminEdificio riceve SOLO il proprio record, senza flag superAdmin', async () => {
      const r = await call('whoami', 'admin1@qa.test');
      assert.ok(r.ok, r.message);
      assert.strictEqual(r.data.profile.id, 101);
      assert.ok(!('superAdmin' in r.data.profile));
    });
    it('FT-AUTH-03 primo accesso: collega uid e provisiona il ruolo dai flag legacy', async () => {
      const r = await call('whoami', 'newbie@qa.test');
      assert.ok(r.ok, r.message);
      const rec = (await readBlob('cm_condomini')).find((c) => c.id === 104);
      assert.strictEqual(rec.uid, 'u-newbie');
      const after = await call('getBuildingData', 'newbie@qa.test'); // nuovo token con claim
      assert.ok(after.ok, 'il claim editor non è stato assegnato: ' + after.message);
    });
    it('FT-AUTH-04 account senza profilo → NOT_FOUND', async () => {
      const r = await call('whoami', 'stranger@qa.test');
      assert.strictEqual(r.status, 'NOT_FOUND');
    });
    it('FT-AUTH-05 email presente su 2 profili → rifiuto esplicito', async () => {
      const r = await call('whoami', 'dup@qa.test');
      assert.strictEqual(r.status, 'FAILED_PRECONDITION');
    });
    it('FT-AUTH-06 profilo già collegato a un altro uid → ALREADY_EXISTS', async () => {
      const r = await call('whoami', 'hijack@qa.test');
      assert.strictEqual(r.status, 'ALREADY_EXISTS');
    });
    it('FT-AUTH-07 chiamata non autenticata → UNAUTHENTICATED', async () => {
      const r = await call('whoami', null);
      assert.strictEqual(r.status, 'UNAUTHENTICATED');
    });
    it('FT-AUTH-08 profilo disabilitato viene restituito con disabled:true (il client lo blocca)', async () => {
      const r = await call('whoami', 'disabled@qa.test');
      assert.ok(r.ok && r.data.profile.disabled === true);
    });
  });

  describe('getBuildingData — isolamento tra edifici (multi-tenant)', () => {
    it('SEC-ISO-01 member edificio 1 non vede alcun record dell\'edificio 2', async () => {
      const r = await call('getBuildingData', 'member1@qa.test');
      assert.ok(r.ok, r.message);
      const json = JSON.stringify({ ...r.data, cm_edifici: [] });
      assert.ok(!json.includes('SEGRETO') && !json.includes('Edificio 2') && !json.includes('admin2@'), 'dati di un altro edificio esposti');
      assert.ok(r.data.cm_spese.length === 3);
    });
    it('SEC-ISO-02 member edificio 2 vede solo il proprio', async () => {
      const r = await call('getBuildingData', 'member2@qa.test');
      assert.deepStrictEqual(r.data.cm_spese.map((s) => s.id), [2001]);
    });
    it('SEC-ISO-03 superAdmin vede tutti gli edifici', async () => {
      const r = await call('getBuildingData', 'superadmin@qa.test');
      assert.strictEqual(r.data.cm_spese.length, 4);
    });
    it('SEC-ISO-04 utente senza ruolo → PERMISSION_DENIED', async () => {
      const r = await call('getBuildingData', 'stranger@qa.test');
      assert.strictEqual(r.status, 'PERMISSION_DENIED');
    });
  });

  describe('saveBuildingData — matrice permessi e integrità', () => {
    const own = async (email, key) => (await call('getBuildingData', email)).data[key];

    it('FT-SAVE-01 editor salva una spesa: la fetta dell\'edificio 2 resta intatta', async () => {
      const mine = await own('editor1@qa.test', 'cm_spese');
      mine.push({ id: 1099, titolo: 'Nuova', categoria: 'altro', preventivo: '10', data: '2027-01-01', edificioId: 1 });
      const r = await call('saveBuildingData', 'editor1@qa.test', { key: 'cm_spese', records: mine });
      assert.ok(r.ok, r.message);
      const all = await readBlob('cm_spese');
      assert.ok(all.some((s) => s.id === 2001) && all.some((s) => s.id === 1099));
    });
    it('FT-SAVE-02 member non può salvare spese', async () => {
      const r = await call('saveBuildingData', 'member1@qa.test', { key: 'cm_spese', records: [] });
      assert.strictEqual(r.status, 'PERMISSION_DENIED');
    });
    it('FT-SAVE-03 editor non può salvare la bacheca (adminOnly)', async () => {
      const r = await call('saveBuildingData', 'editor1@qa.test', { key: 'cm_bacheca', records: [] });
      assert.strictEqual(r.status, 'PERMISSION_DENIED');
    });
    it('FT-SAVE-04 adminEdificio salva la bacheca', async () => {
      const r = await call('saveBuildingData', 'admin1@qa.test', { key: 'cm_bacheca', records: [{ id: 7003, titolo: 'Ok', edificioId: 1 }] });
      assert.ok(r.ok, r.message);
      const all = await readBlob('cm_bacheca');
      assert.deepStrictEqual(all.map((b) => b.id).sort(), [7002, 7003]);
    });
    it('SEC-SAVE-05 un record con edificioId di un altro edificio è rifiutato', async () => {
      const r = await call('saveBuildingData', 'admin1@qa.test', { key: 'cm_spese', records: [{ id: 1, titolo: 'x', edificioId: 2 }] });
      assert.strictEqual(r.status, 'PERMISSION_DENIED');
    });
    it('SEC-SAVE-06 testo con < > è rifiutato (XSS memorizzata)', async () => {
      const r = await call('saveBuildingData', 'admin1@qa.test', { key: 'cm_bacheca', records: [{ id: 1, titolo: '<img src=x onerror=alert(1)>', edificioId: 1 }] });
      assert.strictEqual(r.status, 'INVALID_ARGUMENT');
    });
    it('SEC-SAVE-07 adminEdificio non può promuovere un condomino a superAdmin né cambiarne uid', async () => {
      const mine = await own('admin1@qa.test', 'cm_condomini');
      const m = mine.find((c) => c.id === 103);
      m.superAdmin = true; m.uid = 'u-attacker';
      const r = await call('saveBuildingData', 'admin1@qa.test', { key: 'cm_condomini', records: mine });
      assert.ok(r.ok, r.message);
      const rec = (await readBlob('cm_condomini')).find((c) => c.id === 103);
      assert.ok(!rec.superAdmin && rec.uid === 'u-member1');
    });
    it('SEC-SAVE-08 id già usato in un altro edificio → rifiutato', async () => {
      const r = await call('saveBuildingData', 'admin1@qa.test', { key: 'cm_spese', records: [{ id: 2001, titolo: 'x', edificioId: 1 }] });
      assert.strictEqual(r.status, 'PERMISSION_DENIED');
    });
    it('FT-SAVE-09 record senza edificioId viene assegnato all\'edificio del chiamante', async () => {
      const r = await call('saveBuildingData', 'admin1@qa.test', { key: 'cm_bacheca', records: [{ id: 7010, titolo: 'Senza edificio' }] });
      assert.ok(r.ok, r.message);
      assert.strictEqual((await readBlob('cm_bacheca')).find((b) => b.id === 7010).edificioId, 1);
    });
    it('FT-SAVE-10 chiave non prevista → INVALID_ARGUMENT', async () => {
      const r = await call('saveBuildingData', 'admin1@qa.test', { key: 'cm_config', records: [] });
      assert.strictEqual(r.status, 'INVALID_ARGUMENT');
    });
    it('REL-SAVE-11 salvataggi concorrenti di due edifici non si annullano', async () => {
      const [a, b] = await Promise.all([own('admin1@qa.test', 'cm_spese'), own('admin2@qa.test', 'cm_spese')]);
      a.push({ id: 1500, titolo: 'A', edificioId: 1 }); b.push({ id: 2500, titolo: 'B', edificioId: 2 });
      const res = await Promise.all([
        call('saveBuildingData', 'admin1@qa.test', { key: 'cm_spese', records: a }),
        call('saveBuildingData', 'admin2@qa.test', { key: 'cm_spese', records: b }),
      ]);
      assert.ok(res.every((x) => x.ok), JSON.stringify(res));
      const ids = (await readBlob('cm_spese')).map((s) => s.id);
      assert.ok(ids.includes(1500) && ids.includes(2500), 'un salvataggio concorrente è andato perso');
    });
    it('REL-SAVE-12 superAdmin con dati caricati in precedenza non cancella le modifiche recenti di un admin', async () => {
      // Il superAdmin salva l'intero blob dallo stato caricato al login.
      const snapshot = (await call('getBuildingData', 'superadmin@qa.test')).data.cm_spese;
      const a = await own('admin1@qa.test', 'cm_spese');
      a.push({ id: 1600, titolo: 'Inserita da admin dopo il login del superAdmin', edificioId: 1 });
      await call('saveBuildingData', 'admin1@qa.test', { key: 'cm_spese', records: a });
      snapshot.push({ id: 1700, titolo: 'Inserita dal superAdmin', edificioId: 2 });
      await call('saveBuildingData', 'superadmin@qa.test', { key: 'cm_spese', records: snapshot });
      const ids = (await readBlob('cm_spese')).map((s) => s.id);
      assert.ok(ids.includes(1600), 'la spesa inserita dall\'admin è stata cancellata dal salvataggio del superAdmin');
    });
  });

  describe('Concorrenza nello stesso edificio', () => {
    it('REL-SAVE-13 admin ed editor dello stesso edificio che lavorano insieme non si cancellano i dati', async () => {
      // Entrambi hanno aperto l'app (stato caricato) prima di salvare.
      const [a, e] = await Promise.all([
        call('getBuildingData', 'admin1@qa.test').then((r) => r.data.cm_spese),
        call('getBuildingData', 'editor1@qa.test').then((r) => r.data.cm_spese),
      ]);
      a.push({ id: 1801, titolo: 'Spesa inserita dall\'admin', edificioId: 1 });
      await call('saveBuildingData', 'admin1@qa.test', { key: 'cm_spese', records: a });
      e.push({ id: 1802, titolo: 'Spesa inserita dall\'editor un minuto dopo', edificioId: 1 });
      await call('saveBuildingData', 'editor1@qa.test', { key: 'cm_spese', records: e });
      const ids = (await readBlob('cm_spese')).map((s) => s.id);
      assert.ok(ids.includes(1801), 'la spesa dell\'admin è stata cancellata dal salvataggio dell\'editor');
    });
  });

  describe('setUserRole — assegnazione ruoli', () => {
    it('SEC-ROLE-01 un adminEdificio non può assegnare ruoli', async () => {
      const r = await call('setUserRole', 'admin1@qa.test', { targetUid: 'u-member1', role: 'adminEdificio', buildingId: '1' });
      assert.strictEqual(r.status, 'PERMISSION_DENIED');
    });
    it('FT-ROLE-02 il superAdmin assegna un ruolo e lascia traccia in auditEvents', async () => {
      const r = await call('setUserRole', 'superadmin@qa.test', { targetUid: 'u-member1', role: 'editor', buildingId: '1' });
      assert.ok(r.ok, r.message);
      const ev = await fetch(`${FS}/auditEvents`, { headers: { Authorization: 'Bearer owner' } }).then((x) => x.json());
      assert.strictEqual(ev.documents.length, 1);
    });
    it('FT-ROLE-03 edificio inesistente → INVALID_ARGUMENT', async () => {
      const r = await call('setUserRole', 'superadmin@qa.test', { targetUid: 'u-member1', role: 'member', buildingId: '99' });
      assert.strictEqual(r.status, 'INVALID_ARGUMENT');
    });
  });

  describe('Accesso diretto a Firestore (regole) — dati trasversali', () => {
    it('PRIV-01 un member NON vede nomi e accessi degli utenti di altri edifici (cm_login_stats)', async () => {
      // Simula due login registrati, uno per edificio.
      await fsPatch('cm_login_stats', 'member2@qa.test', { 202: { nome: 'Bice Member2', ultimoLogin: '2026-10-01 10:00', totale: 3 } });
      const r = await fsGet('cm_login_stats', 'member1@qa.test');
      const leak = r.status === 200 && r.body.fields.value.stringValue.includes('Bice Member2');
      assert.ok(!leak, 'member edificio 1 legge nome e orari di accesso di un utente dell\'edificio 2');
    });
    it('INT-02 un member NON può azzerare il registro accessi di tutti', async () => {
      const status = await fsPatch('cm_login_stats', 'member1@qa.test', {});
      assert.notStrictEqual(status, 200, 'un member ha sovrascritto il registro accessi globale');
    });
    it('PRIV-03 cm_config (email del superAdmin) non è leggibile da un member', async () => {
      const r = await fsGet('cm_config', 'member1@qa.test');
      assert.notStrictEqual(r.status, 200, 'cm_config leggibile da qualunque utente autenticato');
    });
  });
});
