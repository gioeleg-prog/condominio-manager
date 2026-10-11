// Finestre di conferma e avvisi dentro l'app, al posto delle finestrelle del
// browser (alert, confirm, prompt): stesso stile dell'app in chiaro e scuro,
// leggibili su iPhone, accessibili da tastiera (Esc annulla, il fuoco resta
// nella finestra e torna al pulsante di partenza).
//   avvisa(testo)            messaggio in basso che sparisce da solo (non blocca)
//   await chiedi(testo, opz) true se si conferma, false se si annulla
//   await chiediTesto(testo, opz) il testo scritto, oppure null
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

const _DLG_PERICOLO = /elimin|cancell|svuot|rimuov|sovrascriv|reset/i;

// Prima emoji del messaggio → tipo di avviso (l'emoji è sostituita dall'icona).
function _tipoMessaggio(testo) {
  const t = String(testo || '').trim();
  if (/^(✅|✓|☑)/u.test(t)) return 'ok';
  if (/^(⛔|❌|🚫)/u.test(t) || /non riuscit|impossibile|errore/i.test(t.slice(0, 60))) return 'errore';
  if (/^⚠/u.test(t)) return 'attenzione';
  return 'info';
}
const _togliEmoji = (t) => String(t ?? '').replace(/^\s*(✅|✓|☑|⛔|❌|🚫|⚠️?|ℹ️?)️?\s*/u, '');

function _apriDialogo({ titolo, testo, conferma = 'Conferma', annulla = 'Annulla', pericolo = false, campo = null, soloOk = false }) {
  return new Promise((resolve) => {
    const prima = document.activeElement;
    const d = document.createElement('dialog');
    d.className = 'dialogo' + (pericolo ? ' dialogo-pericolo' : '');
    d.setAttribute('aria-labelledby', 'dlg-titolo');
    d.setAttribute('aria-describedby', 'dlg-testo');
    const tipo = soloOk ? _tipoMessaggio(testo) : (pericolo ? 'attenzione' : 'info');
    d.innerHTML = `<form method="dialog" class="dialogo-form">
        <div class="dialogo-testa"><span class="dialogo-icona dialogo-${tipo}">${ico(tipo === 'ok' ? 'ok' : tipo === 'errore' ? 'errore' : tipo === 'attenzione' ? 'attenzione' : 'info')}</span>
          <h2 id="dlg-titolo">${esc(titolo)}</h2></div>
        <p id="dlg-testo" class="dialogo-testo">${esc(_togliEmoji(testo))}</p>
        ${campo ? `<input id="dlg-campo" class="dialogo-campo" type="text" autocomplete="off" spellcheck="false" aria-label="${esc(campo.etichetta || 'Testo')}" placeholder="${esc(campo.segnaposto || '')}">` : ''}
        <div class="dialogo-piede">
          ${soloOk ? '' : `<button type="button" class="btn btn-secondary" data-dlg="no">${esc(annulla)}</button>`}
          <button type="submit" class="btn ${pericolo ? 'btn-pericolo' : 'btn-primary'}" data-dlg="si">${esc(soloOk ? 'Ho capito' : conferma)}</button>
        </div></form>`;
    let fatto = false;
    const chiudi = (valore) => {
      if (fatto) return; fatto = true;
      try { d.close(); } catch (e) { /* già chiusa */ }
      d.remove();
      if (prima && document.contains(prima)) prima.focus?.();
      resolve(valore);
    };
    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      chiudi(campo ? d.querySelector('#dlg-campo').value : true);
    });
    d.querySelector('[data-dlg="no"]')?.addEventListener('click', () => chiudi(campo ? null : false));
    d.addEventListener('cancel', (e) => { e.preventDefault(); chiudi(campo ? null : soloOk ? true : false); });
    // Tocco sullo sfondo = annulla (non per i soli avvisi, che vanno letti).
    d.addEventListener('click', (e) => { if (e.target === d && !soloOk) chiudi(campo ? null : false); });
    document.body.appendChild(d);
    d.showModal();
    // Per le azioni pericolose il fuoco parte da "Annulla": un Invio distratto non elimina nulla.
    (campo ? d.querySelector('#dlg-campo') : d.querySelector(pericolo ? '[data-dlg="no"]' : '[data-dlg="si"]'))?.focus();
  });
}

function chiedi(testo, opz = {}) {
  const pericolo = opz.pericolo ?? _DLG_PERICOLO.test(testo);
  const elimina = /^\s*(eliminare|cancellare)\b/i.test(_togliEmoji(testo));
  return _apriDialogo({
    titolo: opz.titolo || (elimina ? 'Eliminare?' : 'Confermi?'),
    testo, pericolo,
    conferma: opz.conferma || (elimina ? 'Elimina' : 'Conferma'),
    annulla: opz.annulla || 'Annulla',
  });
}

function chiediTesto(testo, opz = {}) {
  return _apriDialogo({ titolo: opz.titolo || 'Conferma', testo, pericolo: opz.pericolo ?? true,
    conferma: opz.conferma || 'Conferma', campo: { etichetta: opz.etichetta, segnaposto: opz.segnaposto } });
}

// Messaggi brevi: riquadro in basso che sparisce da solo. Messaggi lunghi o su
// più paragrafi (spiegazioni, elenchi): finestra con "Ho capito".
function avvisa(testo, tipo) {
  const t = String(testo ?? '');
  if (t.length > 160 || /\n\s*\n/.test(t)) {
    const k = tipo || _tipoMessaggio(t);
    _apriDialogo({ titolo: k === 'ok' ? 'Fatto' : k === 'errore' ? 'Non è stato possibile' : k === 'attenzione' ? 'Attenzione' : 'Informazione', testo: t, soloOk: true });
    return;
  }
  const k = tipo || _tipoMessaggio(t);
  let box = document.getElementById('avvisi');
  if (!box) {
    box = document.createElement('div');
    box.id = 'avvisi';
    box.className = 'avvisi';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'avviso avviso-' + k;
  el.setAttribute('role', k === 'errore' ? 'alert' : 'status');
  el.innerHTML = `<span class="avviso-icona">${ico(k === 'ok' ? 'ok' : k === 'errore' ? 'errore' : k === 'attenzione' ? 'attenzione' : 'info')}</span>
    <span class="avviso-testo">${esc(_togliEmoji(t))}</span>
    <button type="button" class="avviso-chiudi" aria-label="Chiudi avviso">${ico('x')}</button>`;
  const via = () => { el.classList.add('uscita'); setTimeout(() => el.remove(), 180); };
  el.querySelector('.avviso-chiudi').onclick = via;
  box.appendChild(el);
  setTimeout(via, k === 'errore' || k === 'attenzione' ? 9000 : 5000);
}
