// Il mio profilo: ogni condomino corregge da solo nickname, cellulare, email di accesso e se riceve email e WhatsApp.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).
//
// I dati passano dalla Cloud Function mioProfilo (functions/profilo.js): le
// regole lasciano scrivere i condomini solo all'amministratore, e un condomino
// non legge i contatti (nemmeno i propri). Appartamento, date, ruolo e
// millesimi li mostra in sola lettura: li cambia l'amministratore (anche nome e
// cognome, ADV-FUNC-037: identificano la persona nei documenti contabili).
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

// Restituisce { profilo, versioni, versioniPrima } come la funzione.
async function chiamaMioProfiloCompleto(modifiche) {
  const { functionsInstance, httpsCallable } = window._fb;
  return (await httpsCallable(functionsInstance, 'mioProfilo')({ modifiche })).data;
}
async function chiamaMioProfilo(modifiche) {
  return (await chiamaMioProfiloCompleto(modifiche)).profilo;
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
  // Indirizzo a cui arrivano davvero le comunicazioni (email dei contatti): se non è quello di accesso si dice (ADV-FUNC-044).
  const comunicazioniAltrove = !!p?.email && !!p?.emailAccesso && String(p.email).toLowerCase() !== String(p.emailAccesso).toLowerCase();
  // Nessuna email nei contatti: le comunicazioni non partono (ADV-FUNC-046).
  const senzaEmailComunicazioni = !!p && !p.email;
  const sola = (label, val) => `<div class="field"><label>${label}</label>
    <div style="padding:9px 12px;background:var(--surface2);border-radius:var(--radius-sm);font-size:14px">${esc(val || '—')}</div></div>`;
  const corpo = !d ? `<p style="color:var(--text2)">Caricamento del profilo…</p>`
    : d.errore ? `<div class="alert alert-warning">⚠️ ${esc(d.errore)}</div>`
    : `
        <div class="field">
          <label for="pr-username">Nickname (facoltativo)</label>
          <input type="text" id="pr-username" value="${esc(p.username)}" maxlength="40" placeholder="Es. Lucia del 2° piano">
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
          ${senzaEmailComunicazioni
            ? `<div class="alert alert-warning" style="font-size:13px;margin-top:6px">⚠️ Nella tua scheda non c'è un indirizzo per le comunicazioni del condominio: le email non ti arrivano. Chiedi all'amministratore di inserirlo.</div>`
            : comunicazioniAltrove
            ? `<div class="alert alert-warning" style="font-size:13px;margin-top:6px">⚠️ Le comunicazioni del condominio (avvisi, estratti conto, promemoria) arrivano a <strong>${esc(p.email)}</strong>, che è diverso dall'email con cui accedi. Per cambiarlo chiedi all'amministratore.</div>`
            : `<p class="hint">Con questa email entri nell'app${p.emailNotifiche ? ' e ricevi le comunicazioni del condominio' : ' (hai tolto "Ricevo le email": le comunicazioni del condominio non ti arrivano)'}.</p>`}
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
          ${sola('Nome e cognome', p.nome)}
          ${sola('Appartamento', p.appartamento)}
        </div>
        <div class="form-row">
          ${sola('Condominio', ed?.nome)}
        </div>
        <div class="form-row">
          ${sola('Ruolo', getRuoloLabel(u))}
          ${sola('Nel condominio dal', p.dataIngresso ? fmtDataProfilo(p.dataIngresso) : '')}
        </div>
        <p class="hint">Nome, appartamento, date, ruolo e millesimi decidono quanto paghi e cosa puoi fare nell'app: se sono sbagliati, chiedi all'amministratore di correggerli.</p>`;
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

// Dopo un salvataggio: il nickname nell'intestazione e la propria riga tra i
// condomini. La versione dei documenti la si adotta solo se l'ultima modifica è
// dell'utente stesso e il documento non era già cambiato (ADV-FUNC-040): altrimenti
// resta quella vecchia e il salvataggio successivo segnala il conflitto con un altro amministratore.
function applicaMioProfilo(p, versioni, versioniPrima) {
  const u = state.user;
  const campi = { username: p.username, emailNotifiche: p.emailNotifiche, whatsappNotifiche: p.whatsappNotifiche };
  if (canUserEdit(u)) campi.telefono = p.telefono;
  const aggiorna = (r) => {
    if (!r || String(r.id) !== String(p.id) || String(r.edificioId) !== String(u.edificioId)) return r;
    const o = { ...r, ...campi };
    ['username', 'telefono'].forEach(k => { if (!o[k]) delete o[k]; });
    return o;
  };
  Object.assign(u, { username: p.username || undefined });
  state.condomini = state.condomini.map(aggiorna);
  if (Array.isArray(_cache.cm_condomini)) _cache.cm_condomini = _cache.cm_condomini.map(aggiorna);
  if (Array.isArray(_serverSnap.cm_condomini)) setServerSnap('cm_condomini', _serverSnap.cm_condomini.map(aggiorna));
  if (window._fb && _versioni.cm_condomini) {
    const { db, doc } = window._fb;
    const b = String(u.edificioId), id = String(p.id);
    const miaUid = window._fb.auth?.currentUser?.uid;
    const adotta = (ref, nuova, prima) => {
      if (!nuova) return;
      const nota = _versioni.cm_condomini.get(ref.path);
      // Documento cambiato da altri dopo che la pagina lo aveva letto: si lascia la versione vecchia.
      const invariato = nota == null || !prima || prima.ms == null || nota === prima.ms;
      if (nuova.by !== miaUid || !invariato) return;
      if (nuova.cancellato) { _versioni.cm_condomini.delete(ref.path); return; }
      _versioni.cm_condomini.set(ref.path, nuova.ms);
      ricordaAutore(ref.path, { _updatedBy: nuova.by, _updatedAt: { toMillis: () => nuova.ms } });
    };
    adotta(doc(db, 'buildings', b, 'members', id), versioni?.members, versioniPrima?.members);
    if (versioni?.contatti) {
      _contattiNoti.add(`buildings/${b}/contatti/${id}`);
      adotta(doc(db, 'buildings', b, 'contatti', id), versioni.contatti, versioniPrima?.contatti);
    }
  }
}

function bindSchedaProfilo() {
  const save = document.getElementById('btn-pr-save');
  if (save) save.onclick = () => unClicAllaVolta(save, async () => {
    const errEl = document.getElementById('pr-err');
    errEl.style.display = 'none';
    const val = (id) => document.getElementById(id).value.trim();
    const modifiche = {
      username: val('pr-username'), telefono: val('pr-tel'),
      emailNotifiche: document.getElementById('pr-email-notifiche').checked,
      whatsappNotifiche: document.getElementById('pr-wa-notifiche').checked,
    };
    try {
      const r = await chiamaMioProfiloCompleto(modifiche);
      const p = r.profilo;
      applicaMioProfilo(p, r.versioni, r.versioniPrima);
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
