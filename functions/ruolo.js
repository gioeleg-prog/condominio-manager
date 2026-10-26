// ═══════════════════════════════════════════════════════════════
// Ruolo di chi chiama, riletto dal database (QA-CONS-011, ADV-TECH-008)
// Il token porta il ruolo come era al suo ultimo rinnovo (fino a un'ora): chi
// è stato declassato o è uscito lo conserva per qualche tempo. Le operazioni
// sensibili (assegnare ruoli, inviare email a nome dell'amministratore) non si
// fidano del token: confrontano il ruolo del token con il record del condomino
// (o con cm_config per il Super Admin) e vale il più basso dei due. Le letture
// e le scritture normali restano governate dal token, con la finestra di un'ora
// documentata nella guida e nel profilo del progetto.
// ═══════════════════════════════════════════════════════════════
const { getFirestore } = require('firebase-admin/firestore');
const { membroAttivo } = require('./permessi');

const db = () => getFirestore();
const LIVELLO = { member: 1, editor: 2, adminEdificio: 3 };
const ruoloDa = (m) => (m.isAdmin ? 'adminEdificio' : (m.canEdit ? 'editor' : 'member'));

// Restituisce { role, buildingId } con il ruolo effettivo ora, oppure
// { role: null } se oggi non ne ha più (o se il token non ne porta nessuno).
async function ruoloAttuale(request) {
  const uid = request.auth?.uid;
  const t = request.auth?.token || {};
  if (!uid || !t.role) return { role: null };

  if (t.role === 'superAdmin') {
    const [cfg, r] = await Promise.all([
      db().collection('appdata').doc('cm_config').get(),
      db().collection('roles').doc(uid).get(),
    ]);
    const ancora = (cfg.data() || {}).superAdminUid === uid || (r.data() || {}).role === 'superAdmin';
    return { role: ancora ? 'superAdmin' : null };
  }

  const buildingId = String(t.buildingId || '');
  if (!buildingId || !LIVELLO[t.role]) return { role: null };
  const [profili, r] = await Promise.all([
    db().collection(`buildings/${buildingId}/members`).where('uid', '==', uid).get(),
    db().collection('roles').doc(uid).get(),
  ]);
  const attivi = profili.docs.filter((d) => membroAttivo(d.data()));
  if (!attivi.length) return { role: null };
  const migliore = attivi.reduce((a, d) => (LIVELLO[ruoloDa(d.data())] > LIVELLO[ruoloDa(a.data())] ? d : a));
  let ruolo = ruoloDa(migliore.data());
  // Un ruolo assegnato con setUserRole DOPO l'ultima scrittura del record vale
  // più del record (stesso criterio di permessi.allineaPermessi).
  const ass = r.exists ? r.data() : null;
  const scritto = migliore.data()._updatedAt;
  if (ass && String(ass.buildingId) === buildingId && LIVELLO[ass.role] && ass.updatedAt?.toMillis && scritto?.toMillis
      && ass.updatedAt.toMillis() > scritto.toMillis()) ruolo = ass.role;
  // Il token non può dare più di quanto dice il database, e viceversa.
  const basso = LIVELLO[ruolo] < LIVELLO[t.role] ? ruolo : t.role;
  return { role: basso, buildingId };
}

module.exports = { ruoloAttuale };
