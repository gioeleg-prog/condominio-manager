// Voci del registro modifiche (auditEvents) scritte dal trigger auditTrail.
// Un trigger può essere consegnato più di una volta per lo stesso evento
// (riconsegna "at least once"): con un id ricavato dall'id dell'evento la
// seconda scrittura non crea un doppione (audit 2026-10-24, ADV-TECH-011).
async function scriviEvento(db, idEvento, suffisso, dati) {
  const base = String(idEvento || '').replace(/[^\w-]/g, '').slice(0, 100);
  const col = db.collection('auditEvents');
  if (!base) { await col.add(dati); return; } // senza id dell'evento: come prima
  try {
    await col.doc(suffisso ? `${base}-${suffisso}` : base).create(dati);
  } catch (e) {
    // 6 = ALREADY_EXISTS: l'evento è già stato registrato da una consegna precedente.
    if (e.code !== 6 && !/already exists/i.test(e.message || '')) throw e;
  }
}

module.exports = { scriviEvento };
