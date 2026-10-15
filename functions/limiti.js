// ═══════════════════════════════════════════════════════════════
// Limiti alle email ai condomini (decisione del 2026-10-15, audit punto 5)
// Per ogni condominio:
//  • al massimo 5 invii all'ora (avvisi, verbali, rendiconti, estratti conto,
//    promemoria mandati dall'app); i promemoria automatici delle 8 non
//    contano qui, perché partono uno per rata tutti insieme;
//  • al massimo 50 destinatari in 24 ore, promemoria automatici compresi.
// Per la casella notifichecondominio@ (tutti i condomini insieme): al massimo
// 400 destinatari in 24 ore. Gmail ne accetta circa 500 al giorno da un
// account normale: il margine resta agli avvisi al Super Admin (controllo.js),
// che non passano da qui e non vengono mai bloccati.
// Le finestre sono mobili (ultima ora, ultime 24 ore), non a ore o giorni fissi.
//
// I conteggi stanno in limitiEmail/{buildingId} e limitiEmail/_casella (mai
// leggibili né scrivibili dall'app: le regole negano tutto ciò che non è
// elencato) e si aggiornano in una transazione: due invii nello stesso istante
// non superano il limite. Un invio prenotato conta anche se poi Gmail lo
// rifiuta: meglio un limite prudente che uno aggirabile.
// ═══════════════════════════════════════════════════════════════
const { getFirestore } = require('firebase-admin/firestore');

const LIMITI = { inviiOra: 5, destinatariGiorno: 50, casellaGiorno: 400 };
const ORA = 3600e3;
const GIORNO = 24 * ORA;
const CASELLA = '_casella';

const db = () => getFirestore();

// "tra 12 minuti", "tra circa 3 ore".
function traQuanto(ms) {
  const minuti = Math.max(1, Math.ceil(ms / 60000));
  if (minuti < 90) return `tra ${minuti} ${minuti === 1 ? 'minuto' : 'minuti'}`;
  const ore = Math.round(minuti / 60);
  return `tra circa ${ore} ${ore === 1 ? 'ora' : 'ore'}`;
}

// Fra quanto si libera abbastanza posto per `n` destinatari, sapendo che le
// voci escono dalla finestra di 24 ore una alla volta, dalla più vecchia.
function attesaPerDestinatari(voci, n, massimo, ora) {
  let usati = voci.reduce((s, v) => s + v.n, 0);
  for (const v of [...voci].sort((a, b) => a.t - b.t)) {
    usati -= v.n;
    if (usati + n <= massimo) return v.t + GIORNO - ora;
  }
  return GIORNO;
}

// Controlla i limiti per un invio a `n` destinatari e, se c'è posto, lo
// registra. Restituisce { ok: true } oppure { ok: false, messaggio }.
// orario: false per i promemoria automatici (contano solo sui destinatari).
// Funzione pura sui conteggi, separata per i test.
function valuta(vociEdificio, vociCasella, n, { orario = true } = {}, ora = Date.now()) {
  const edificio = vociEdificio.filter((v) => v.t > ora - GIORNO);
  const casella = vociCasella.filter((v) => v.t > ora - GIORNO);
  if (n > LIMITI.destinatariGiorno) {
    return { ok: false, messaggio: `Troppi destinatari in un solo invio: il massimo è ${LIMITI.destinatariGiorno} al giorno per condominio. Dividi l'invio in più giorni.` };
  }
  if (orario) {
    const nellOra = edificio.filter((v) => v.orario && v.t > ora - ORA).sort((a, b) => a.t - b.t);
    if (nellOra.length >= LIMITI.inviiOra) {
      return { ok: false, messaggio: `Limite di invii raggiunto per questo condominio (${LIMITI.inviiOra} all'ora): riprova ${traQuanto(nellOra[nellOra.length - LIMITI.inviiOra].t + ORA - ora)}.` };
    }
  }
  const usati = edificio.reduce((s, v) => s + v.n, 0);
  if (usati + n > LIMITI.destinatariGiorno) {
    return { ok: false, messaggio: `Limite di invii raggiunto per questo condominio (${LIMITI.destinatariGiorno} destinatari in 24 ore, già usati ${usati}): riprova ${traQuanto(attesaPerDestinatari(edificio, n, LIMITI.destinatariGiorno, ora))}.` };
  }
  const usatiCasella = casella.reduce((s, v) => s + v.n, 0);
  if (usatiCasella + n > LIMITI.casellaGiorno) {
    return { ok: false, messaggio: `Limite giornaliero della casella delle notifiche raggiunto (${LIMITI.casellaGiorno} destinatari in 24 ore per tutti i condomini): riprova ${traQuanto(attesaPerDestinatari(casella, n, LIMITI.casellaGiorno, ora))}.` };
  }
  const voce = { t: ora, n, orario: !!orario };
  return { ok: true, edificio: [...edificio, voce], casella: [...casella, voce] };
}

// Prenota l'invio (transazione su limitiEmail/{b} e limitiEmail/_casella).
async function prenota(buildingId, n, opzioni = {}) {
  const refEd = db().doc(`limitiEmail/${buildingId}`);
  const refCas = db().doc(`limitiEmail/${CASELLA}`);
  return db().runTransaction(async (tx) => {
    const [ed, cas] = await Promise.all([tx.get(refEd), tx.get(refCas)]);
    const r = valuta(ed.data()?.voci || [], cas.data()?.voci || [], n, opzioni, Date.now());
    if (!r.ok) return r;
    tx.set(refEd, { voci: r.edificio });
    tx.set(refCas, { voci: r.casella });
    return { ok: true };
  });
}

// Solo lettura, per l'app prima di pubblicare un avviso con l'email: dice se un
// invio a n destinatari passerebbe adesso, senza prenotarlo.
async function verifica(buildingId, n) {
  const [ed, cas] = await Promise.all([db().doc(`limitiEmail/${buildingId}`).get(), db().doc(`limitiEmail/${CASELLA}`).get()]);
  const r = valuta(ed.data()?.voci || [], cas.data()?.voci || [], n);
  return r.ok ? { ok: true } : r;
}

module.exports = { LIMITI, prenota, verifica, _test: { valuta, traQuanto } };
