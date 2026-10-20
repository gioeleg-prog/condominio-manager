// Il mio profilo: ogni condomino corregge da solo nome, nickname, cellulare, email di accesso e se riceve email e WhatsApp.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).
//
// I dati passano dalla Cloud Function mioProfilo (functions/profilo.js): le
// regole lasciano scrivere i condomini solo all'amministratore, e un condomino
// non legge i contatti (nemmeno i propri). Appartamento, date, ruolo e
// millesimi li mostra in sola lettura: li cambia l'amministratore.
// L'email è anche quella di accesso: la cambia Firebase dopo il clic sul link
// di conferma mandato al nuovo indirizzo; al rientro con la nuova email whoami
// la copia nei contatti.

// Chi ha una scheda da condomino (il Super Admin no).
function haMioProfilo(u) { return !!u && !isSuperAdmin(u); }

// Accede anche con email e password? Solo allora può cambiare l'email da qui:
// con il solo "Accedi con Google" l'email è quella dell'account Google.
function accedeConPassword() {
  const u = window._fb?.auth?.currentUser;
  return !!u && (u.providerData || []).some(p => p.providerId === 'password');
}

async function chiamaMioProfilo(modifiche) {
  const { functionsInstance, httpsCallable } = window._fb;
  return (await httpsCallable(functionsInstance, 'mioProfilo')({ modifiche })).data.profilo;
}

function apriMioProfilo() {
  setState({ modal: { type: 'profilo', data: null } });
  chiamaMioProfilo({}).then(
    p => { if (state.modal?.type === 'profilo') setState({ modal: { type: 'profilo', data: { profilo: p } } }); },
    e => { if (state.modal?.type === 'profilo') setState({ modal: { type: 'profilo', data: { errore: e.message || String(e) } } }); });
}

function renderModalProfilo(d) {
  const u = state.user;
  const p = d?.profilo;
  const ed = state.edifici.find(e => e.id === u.edificioId);
  const sola = (label, val) => `<div class="field"><label>${label}</label>
    <div style="padding:9px 12px;background:var(--surface2);border-radius:var(--radius-sm);font-size:14px">${esc(val || '—')}</div></div>`;
  const corpo = !d ? `<p style="color:var(--text2)">Caricamento del profilo…</p>`
    : d.errore ? `<div class="alert alert-warning">⚠️ ${esc(d.errore)}</div>`
    : `
        <div class="form-row">
          <div class="field">
            <label for="pr-nome">Nome e cognome *</label>
            <input type="text" id="pr-nome" value="${esc(p.nome)}" maxlength="100" autocomplete="name">
          </div>
          <div class="field">
            <label for="pr-username">Nickname (facoltativo)</label>
            <input type="text" id="pr-username" value="${esc(p.username)}" maxlength="40" placeholder="Es. Lucia del 2° piano">
          </div>
        </div>
        <div class="field">
          <label for="pr-tel">Cellulare (WhatsApp)</label>
          <input type="tel" id="pr-tel" value="${esc(p.telefono)}" maxlength="40" placeholder="333 123 4567" autocomplete="tel">
          <p class="hint">Facoltativo. Senza prefisso vale +39. Lo vedono solo gli amministratori e chi gestisce i conti del condominio.</p>
        </div>
        <label class="casella-email" for="pr-email-notifiche">
          <input type="checkbox" id="pr-email-notifiche" ${p.emailNotifiche ? 'checked' : ''}>
          <span><strong>Ricevo le email</strong><span class="hint" style="display:block;margin-top:2px">Avvisi, verbali, rendiconti e promemoria delle rate.</span></span>
        </label>
        <label class="casella-email" for="pr-wa-notifiche">
          <input type="checkbox" id="pr-wa-notifiche" ${p.whatsappNotifiche ? 'checked' : ''}>
          <span><strong>Ricevo WhatsApp</strong><span class="hint" style="display:block;margin-top:2px">L'amministratore può mandarmi gli avvisi anche su WhatsApp.</span></span>
        </label>
        <div id="pr-err" class="alert alert-warning" style="display:none"></div>

        <div style="border-top:1px solid var(--border);margin:1.25rem 0 1rem"></div>
        <div class="field">
          <label>Email di accesso</label>
          <div style="padding:9px 12px;background:var(--surface2);border-radius:var(--radius-sm);font-size:14px">${esc(p.emailAccesso)}</div>
          <p class="hint">Con questa email entri nell'app e ricevi le comunicazioni del condominio.</p>
        </div>
        ${p.emailInAttesa ? `<div class="alert alert-info" style="font-size:13px">✉️ Hai chiesto di passare a <strong>${esc(p.emailInAttesa)}</strong>: apri il link di conferma che ti è arrivato a quell'indirizzo, poi esci e rientra con la nuova email.</div>` : ''}
        ${accedeConPassword() ? `
        <details id="pr-cambia-email">
          <summary style="cursor:pointer;font-size:14px;font-weight:600;margin-bottom:.75rem">Cambia email di accesso</summary>
          <div class="field">
            <label for="pr-email-nuova">Nuova email</label>
            <input type="email" id="pr-email-nuova" placeholder="nome@esempio.it" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="email">
          </div>
          <div class="field">
            <label for="pr-email-pw">Password attuale</label>
            <input type="password" id="pr-email-pw" placeholder="Per sicurezza" autocomplete="current-password">
            <p class="hint">Ti mandiamo un link di conferma al nuovo indirizzo. Finché non lo apri continui ad accedere con l'email di adesso.</p>
          </div>
          <div id="pr-email-err" class="alert alert-warning" style="display:none"></div>
          <div id="pr-email-ok" class="alert alert-success" style="display:none"></div>
          <button class="btn btn-secondary" id="btn-pr-email">✉️ Invia link di conferma</button>
        </details>` : `<p class="hint">Accedi con Google: l'email è quella del tuo account Google. Per usarne un'altra chiedi all'amministratore del condominio.</p>`}

        <div style="border-top:1px solid var(--border);margin:1.25rem 0 1rem"></div>
        <div style="font-size:13px;font-weight:600;margin-bottom:.5rem">Gestiti dall'amministratore</div>
        <div class="form-row">
          ${sola('Appartamento', p.appartamento)}
          ${sola('Condominio', ed?.nome)}
        </div>
        <div class="form-row">
          ${sola('Ruolo', getRuoloLabel(u))}
          ${sola('Nel condominio dal', p.dataIngresso ? fmtDataProfilo(p.dataIngresso) : '')}
        </div>
        <p class="hint">Appartamento, date, ruolo e millesimi decidono quanto paghi e cosa puoi fare nell'app: se sono sbagliati, chiedi all'amministratore di correggerli.</p>`;
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal">
      <div class="modal-header">
        <h2>👤 Il mio profilo</h2>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">${corpo}</div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">${p ? 'Annulla' : 'Chiudi'}</button>
        ${p ? '<button class="btn btn-primary" id="btn-pr-save">💾 Salva</button>' : ''}
      </div>
    </div>
  </div>`;
}

function fmtDataProfilo(ymd) {
  const [a, m, g] = String(ymd).split('-');
  return g && m && a ? `${g}/${m}/${a}` : ymd;
}

// Dopo un salvataggio: il nome nell'intestazione e la propria riga tra i
// condomini (per un amministratore anche la base dei suoi salvataggi, così la
// prossima modifica della scheda non risulta fatta "da un'altra persona").
function applicaMioProfilo(p) {
  const u = state.user;
  const campi = { nome: p.nome, username: p.username, emailNotifiche: p.emailNotifiche, whatsappNotifiche: p.whatsappNotifiche };
  if (canUserEdit(u)) campi.telefono = p.telefono;
  const aggiorna = (r) => {
    if (!r || String(r.id) !== String(p.id) || String(r.edificioId) !== String(u.edificioId)) return r;
    const o = { ...r, ...campi };
    ['username', 'telefono'].forEach(k => { if (!o[k]) delete o[k]; });
    return o;
  };
  Object.assign(u, { nome: p.nome, username: p.username || undefined });
  state.condomini = state.condomini.map(aggiorna);
  if (Array.isArray(_cache.cm_condomini)) _cache.cm_condomini = _cache.cm_condomini.map(aggiorna);
  if (Array.isArray(_serverSnap.cm_condomini)) setServerSnap('cm_condomini', _serverSnap.cm_condomini.map(aggiorna));
  if (window._fb && _versioni.cm_condomini) {
    const { db, doc } = window._fb;
    const b = String(u.edificioId), id = String(p.id);
    const refs = [doc(db, 'buildings', b, 'members', id)];
    if (p.telefono || _contattiNoti.has(`buildings/${b}/contatti/${id}`)) {
      _contattiNoti.add(`buildings/${b}/contatti/${id}`);
      refs.push(doc(db, 'buildings', b, 'contatti', id));
    }
    aggiornaVersioni('cm_condomini', refs.map(r => [r])).catch(() => {});
  }
}

function bindSchedaProfilo() {
  const save = document.getElementById('btn-pr-save');
  if (save) save.onclick = () => unClicAllaVolta(save, async () => {
    const errEl = document.getElementById('pr-err');
    errEl.style.display = 'none';
    const val = (id) => document.getElementById(id).value.trim();
    const modifiche = {
      nome: val('pr-nome'), username: val('pr-username'), telefono: val('pr-tel'),
      emailNotifiche: document.getElementById('pr-email-notifiche').checked,
      whatsappNotifiche: document.getElementById('pr-wa-notifiche').checked,
    };
    if (modifiche.nome.length < 2) { errEl.textContent = 'Scrivi nome e cognome.'; errEl.style.display = 'block'; return; }
    try {
      const p = await chiamaMioProfilo(modifiche);
      applicaMioProfilo(p);
      setState({ modal: null });
      const telNoWa = p.telefono && typeof numeroWa === 'function' && !numeroWa(p.telefono);
      avvisa(telNoWa ? '✅ Profilo salvato. Attenzione: con questo numero WhatsApp non funziona (serve un cellulare).' : '✅ Profilo salvato.');
    } catch (e) {
      errEl.textContent = e.message || 'Salvataggio non riuscito. Riprova.';
      errEl.style.display = 'block';
    }
  });

  const bEmail = document.getElementById('btn-pr-email');
  if (bEmail) bEmail.onclick = () => unClicAllaVolta(bEmail, async () => {
    const errEl = document.getElementById('pr-email-err');
    const okEl = document.getElementById('pr-email-ok');
    errEl.style.display = 'none'; okEl.style.display = 'none';
    const nuova = document.getElementById('pr-email-nuova').value.trim().toLowerCase();
    const pw = document.getElementById('pr-email-pw').value;
    const mostra = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(nuova)) return mostra('L\'email non sembra valida.');
    const { auth, reauthenticateWithCredential, EmailAuthProvider, verifyBeforeUpdateEmail } = window._fb;
    const user = auth.currentUser;
    if (nuova === String(user.email || '').toLowerCase()) return mostra('È già la tua email di accesso.');
    if (!pw) return mostra('Inserisci la password attuale.');
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pw));
      // Prima la richiesta (il server controlla l'indirizzo), poi il link:
      // whoami copierà nei contatti solo un indirizzo chiesto da qui e confermato.
      await chiamaMioProfilo({ nuovaEmail: nuova });
      try { await verifyBeforeUpdateEmail(user, nuova); }
      catch (e) {
        // Link non partito: si annulla la richiesta (la stessa email di adesso
        // la cancella), così la scheda non dice "apri il link" per un link mai mandato.
        await chiamaMioProfilo({ nuovaEmail: String(user.email || '').toLowerCase() }).catch(() => {});
        throw e;
      }
      okEl.innerHTML = `✅ Link di conferma inviato a <strong>${esc(nuova)}</strong>. Aprilo, poi esci e rientra con la nuova email. Se non lo trovi, guarda nello spam.`;
      okEl.style.display = 'block';
      document.getElementById('pr-email-pw').value = '';
    } catch (e) {
      const c = e.code || '';
      mostra(c === 'auth/wrong-password' || c === 'auth/invalid-credential' ? 'Password attuale non corretta.'
        : c === 'auth/email-already-in-use' ? 'Questa email è già usata da un altro account.'
        : c === 'auth/too-many-requests' ? 'Troppi tentativi: riprova tra qualche minuto.'
        : c === 'auth/invalid-email' ? 'L\'email non sembra valida.'
        : (e.message || 'Invio non riuscito. Riprova.'));
    }
  });
}
