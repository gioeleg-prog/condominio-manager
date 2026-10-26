// Appartamenti in affitto. Di base tutti sono abitati dal proprietario.
// Per quelli segnati "in affitto" l'estratto conto del proprietario indica
// quanto può recuperare dall'inquilino, con la regola semplice scelta:
// spese ORDINARIE a carico dell'inquilino, STRAORDINARIE del proprietario.
// Verso il condominio paga sempre il proprietario: quote, versamenti e saldo
// non cambiano. Vale per tutto l'anno (nessuna data di contratto).
//
// Configurazione per condominio in buildings/{b}/impostazioni/affitti:
//   { appartamenti: { nomeAppartamento: true } }   (chiave come per i millesimi)
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

const _affitti = {};          // edificioId → { appartamenti } (null = nessuno)
const _affittiInCarico = {};

const _affittiVer = {};   // edificioId → versione letta dal server (QA-CONS-010)

async function caricaAffitti(edId = state.edificioAttivo) {
  if (!window._fb?.getDoc || !edId) return;
  try {
    const r = await leggiImpostazione(edId, 'affitti');
    _affitti[edId] = r.dati;
    _affittiVer[edId] = r.firma;
  } catch (e) {
    if (!(edId in _affitti)) { _affitti[edId] = null; delete _affittiVer[edId]; }
    console.warn('Affitti non caricati', e.code || e.message);
  }
}
function assicuraAffitti() {
  const ed = state.edificioAttivo;
  if (!state.user || !window._fb?.getDoc || ed in _affitti || _affittiInCarico[ed]) return;
  _affittiInCarico[ed] = true;
  caricaAffitti(ed).finally(() => { _affittiInCarico[ed] = false; if (typeof renderPresto === 'function') renderPresto(); });
}

function appartamentoInAffitto(appartamento, edId = state.edificioAttivo) {
  return !!_affitti[edId]?.appartamenti?.[chiaveApt(appartamento)];
}

// ─── Impostazioni ─────────────────────────────────────────────────
function renderSezioneAffitti() {
  return `<div class="section-divider"><h3>🔑 Appartamenti in affitto</h3></div>
    <div class="card" style="padding:1rem 1.25rem;margin-bottom:1.5rem"><div id="affitti-box"><p class="hint">Caricamento…</p></div></div>`;
}

function disegnaAffitti() {
  const box = document.getElementById('affitti-box');
  if (!box) return;
  const apt = appartamentiEdificio();
  box.innerHTML = `
    <p class="hint" style="margin:0 0 .75rem;font-size:13px">Di base tutti gli appartamenti sono abitati dal proprietario. Spunta quelli in affitto: nell'estratto conto del proprietario comparirà quanto recuperare dall'inquilino, cioè le quote delle <strong>spese ordinarie</strong> (le straordinarie restano del proprietario). Verso il condominio paga sempre il proprietario: quote e saldo non cambiano.</p>
    ${apt.length ? `<ul class="affitti-lista">${apt.map(a => `<li><label>
      <input type="checkbox" class="affitto-chk" data-apt="${esc(a.chiave)}" ${appartamentoInAffitto(a.etichetta) ? 'checked' : ''}>
      <span><strong>${esc(a.etichetta)}</strong> <span class="hint">proprietario: ${esc(a.chi)}</span></span></label></li>`).join('')}</ul>`
      : '<p class="hint">Nessun appartamento con condomini attivi.</p>'}
    <div id="affitti-err" class="alert alert-warning" style="display:none;font-size:13px;margin-top:.75rem"></div>
    <button type="button" class="btn btn-primary" id="affitti-salva" style="width:auto;margin-top:.75rem">Salva</button>`;
  document.getElementById('affitti-salva').onclick = async () => {
    const appartamenti = {};
    box.querySelectorAll('.affitto-chk:checked').forEach(i => { appartamenti[i.dataset.apt] = true; });
    const { db, doc, setDoc, serverTimestamp, auth } = window._fb;
    try {
      // QA-CONS-010: se un altro ha salvato dopo che hai aperto la scheda, non si sovrascrive in silenzio.
      if (await impostazioneCambiataAltrove(state.edificioAttivo, 'affitti', _affittiVer[state.edificioAttivo], 'Appartamenti in affitto',
        (dati, firma) => { _affitti[state.edificioAttivo] = dati; _affittiVer[state.edificioAttivo] = firma; render(); })) return;
      await setDoc(doc(db, 'buildings', String(state.edificioAttivo), 'impostazioni', 'affitti'),
        { appartamenti, aggiornatoDa: auth.currentUser?.uid, aggiornatoIl: serverTimestamp() });
      _affitti[state.edificioAttivo] = { appartamenti };
      const n = Object.keys(appartamenti).length;
      avvisa(n ? `✅ Salvato: ${n} ${n === 1 ? 'appartamento' : 'appartamenti'} in affitto.` : '✅ Salvato: nessun appartamento in affitto.');
      render();
    } catch (e) {
      const err = document.getElementById('affitti-err');
      err.textContent = 'Non salvato: ' + (e.message || e); err.style.display = 'block';
    }
  };
}

async function bindSezioneAffitti() {
  if (!document.getElementById('affitti-box')) return;
  await caricaAffitti(); // sempre dal server all'apertura (QA-CONS-010)
  disegnaAffitti();
}
