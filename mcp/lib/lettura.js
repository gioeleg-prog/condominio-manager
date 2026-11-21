// Lettura dei dati di UN edificio con l'identità di un utente di prova (SDK web, non Admin SDK):
// valgono le stesse regole Firestore dell'app, quindi un ruolo senza permessi non legge nulla.
// L'edificio viene dal token dell'utente (o, per il Super Admin, dalla configurazione all'avvio),
// MAI da un argomento dei tool. Non si legge `contatti`, né allegati, né audit, né appdata/cm_*.
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, collection, getDocs } = require('firebase/firestore');

const TTL_MS = 30 * 1000;
const COLLEZIONI = { spese: 'expenses', entrate: 'payments', condomini: 'members', fornitori: 'suppliers' };
const ID_SICURO = /^[A-Za-z0-9_-]{1,64}$/;

// Come fromDocs() dell'app: scarta id non validi e record cancellati, toglie i metadati `_`.
function pulisci(docs) {
  return docs
    .filter((d) => ID_SICURO.test(d.id))
    .map((d) => d.data())
    .filter((d) => !d._deleted)
    .map((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('_') && k !== 'emailLower')));
}

async function apriSessione({ progetto, firestore, auth, email, password, edificio }) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: progetto, authDomain: progetto + '.firebaseapp.com' }, 'mcp-' + Date.now());
  const authSdk = getAuth(app);
  connectAuthEmulator(authSdk, 'http://' + auth, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, porta] = firestore.split(':');
  connectFirestoreEmulator(db, host, Number(porta));
  const cred = await signInWithEmailAndPassword(authSdk, email, password);
  const { claims } = await cred.user.getIdTokenResult();
  const edificioId = String(claims.buildingId || edificio || '');
  if (!ID_SICURO.test(edificioId)) throw new Error('Edificio non determinabile dal token: per il Super Admin impostare MCP_EDIFICIO.');
  const ruolo = claims.role || 'member';
  let cache = null;

  async function dati() {
    if (cache && Date.now() - cache.quando < TTL_MS) return cache.valore;
    const valore = { edificioId, ruolo };
    for (const [chiave, coll] of Object.entries(COLLEZIONI)) {
      const snap = await getDocs(collection(db, 'buildings', edificioId, coll));
      valore[chiave] = pulisci(snap.docs);
    }
    cache = { quando: Date.now(), valore };
    return valore;
  }
  return { dati, edificioId, ruolo, email };
}

module.exports = { apriSessione, pulisci };
