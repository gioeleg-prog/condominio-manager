// Stato del servizio (superAdmin): segnalazione errori, esito backup, registro modifiche.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// ═══════════════════════════════════════════════════════════════
// STATO DEL SERVIZIO (fase 3 QA)
// ═══════════════════════════════════════════════════════════════
// Segnalazione errori: gli errori JavaScript non gestiti e i salvataggi
// rifiutati vengono registrati in clientErrors (le rules permettono solo di
// aggiungere segnalazioni a proprio nome, con campi limitati; le legge il
// superAdmin in Impostazioni). Al massimo 5 per caricamento della pagina e
// mai due volte lo stesso messaggio. Non deve MAI generare a sua volta errori.
const _errReport = { n: 0, seen: new Set() };

function reportClientError(message, stack) {
  try {
    const fb = window._fb;
    const uid = fb?.auth?.currentUser?.uid;
    if (!fb || !uid || !state.user) return;
    const msg = String(message || 'Errore sconosciuto').slice(0, 500);
    if (_errReport.n >= 5 || _errReport.seen.has(msg)) return;
    _errReport.n++; _errReport.seen.add(msg);
    const ruolo = getRuolo(state.user);
    const payload = {
      message: msg, stack: String(stack || '').slice(0, 2000), page: String(state.page || '').slice(0, 40),
      uid, role: ruolo, buildingId: isSuperAdmin(state.user) ? null : String(state.user.edificioId ?? ''),
      ua: String(navigator.userAgent || '').slice(0, 200), at: fb.serverTimestamp(),
    };
    fb.setDoc(fb.doc(fb.collection(fb.db, 'clientErrors')), payload).catch(() => {});
  } catch (e) { /* la segnalazione non deve mai rompere l'app */ }
}

window.addEventListener('error', (e) => reportClientError(e.message, e.error?.stack));

window.addEventListener('unhandledrejection', (e) => reportClientError('Promise: ' + (e.reason?.message || e.reason), e.reason?.stack));

// Dati del pannello, caricati solo su richiesta del superAdmin.
const ops = { backup: undefined, audit: null, errors: null, loading: '', auditFilter: 'all' };

async function opsLoad(what) {
  const fb = window._fb;
  if (!fb || !isSuperAdmin(state.user)) return;
  ops.loading = what; setState({});
  try {
    if (what === 'backup') {
      const s = await fb.getDoc(fb.doc(fb.db, 'appSettings', 'backupStatus'));
      ops.backup = s.exists() ? s.data() : null;
    } else if (what === 'audit') {
      const q = fb.query(fb.collection(fb.db, 'auditEvents'), fb.orderBy('at', 'desc'), fb.limit(200));
      ops.audit = (await fb.getDocs(q)).docs.map(d => d.data());
    } else if (what === 'errors') {
      const q = fb.query(fb.collection(fb.db, 'clientErrors'), fb.orderBy('at', 'desc'), fb.limit(100));
      ops.errors = (await fb.getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (e) {
    alert('Caricamento non riuscito: ' + (e.message || e));
  }
  ops.loading = ''; setState({});
}

async function opsClearErrors() {
  const fb = window._fb;
  if (!ops.errors?.length || !confirm('Cancellare le ' + ops.errors.length + ' segnalazioni mostrate?')) return;
  try {
    for (let i = 0; i < ops.errors.length; i += 400) {
      const batch = fb.writeBatch(fb.db);
      ops.errors.slice(i, i + 400).forEach(e => batch.delete(fb.doc(fb.db, 'clientErrors', e.id)));
      await batch.commit();
    }
    ops.errors = [];
  } catch (e) { alert('Cancellazione non riuscita: ' + (e.message || e)); }
  setState({});
}

function opsWhen(ts) {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  if (!d || isNaN(d)) return '—';
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function opsWho(uid) {
  if (!uid) return '—';
  if (uid === state.user?.uid && isSuperAdmin(state.user)) return 'Super Admin';
  const c = state.condomini.find(x => x.uid === uid);
  return c ? c.nome : (uid === 'whoami-auto' ? 'Sistema (primo accesso)' : 'Utente ' + String(uid).slice(0, 6) + '…');
}

const OPS_COLL = { expenses: 'Spesa', payments: 'Versamento', suppliers: 'Fornitore', members: 'Condomino',
  notices: 'Avviso', minutes: 'Verbale', works: 'Lavoro', resolutions: 'Delibera' };

const OPS_TYPE = { 'record.created': 'Creato', 'record.updated': 'Modificato', 'record.deleted': 'Cancellato',
  'record.restored': 'Ripristinato', 'record.purged': 'Eliminato definitivamente', 'role.assigned': 'Ruolo assegnato',
  'backup.restored': 'Ripristino da backup' };

function opsVal(v) {
  const s = v == null ? '—' : (typeof v === 'string' ? v : JSON.stringify(v));
  return s.length > 60 ? s.slice(0, 57) + '…' : (s === '' ? '(vuoto)' : s);
}

function renderOpsSection() {
  if (!isSuperAdmin(state.user)) return '';
  const btn = (what, label) => `<button class="btn btn-secondary btn-sm" data-ops-load="${what}" ${ops.loading ? 'disabled' : ''}>${ops.loading === what ? 'Caricamento…' : label}</button>`;
  const edNome = (id) => esc((state.edifici.find(e => String(e.id) === String(id)) || {}).nome || (id ? 'Edificio ' + id : '—'));

  // Backup
  const b = ops.backup;
  const backupHtml = b === undefined ? `<p class="hint">Mostra l'esito dell'ultimo backup automatico notturno.</p>`
    : b === null ? `<div class="alert alert-warning" style="font-size:13px">Nessun backup automatico eseguito finora (il primo parte alle 3 di notte).</div>`
    : b.ok ? `<div class="alert alert-success" style="font-size:13px">✅ Ultimo backup: <strong>${esc(opsWhen(b.at))}</strong> — ${esc(b.docs)} documenti, ${esc(b.sizeKB)} KB (<code>${esc(b.file)}</code>). Si conservano 30 giorni di copie.</div>`
    : `<div class="alert alert-danger" style="font-size:13px">⚠️ Ultimo backup NON riuscito (${esc(opsWhen(b.at))}): ${esc(b.error)}</div>`;

  // Registro modifiche
  let auditHtml = `<p class="hint">Chi ha creato, modificato o cancellato cosa, con i valori prima e dopo. Ultime 200 operazioni.</p>`;
  if (ops.audit) {
    const rows = ops.audit.filter(e => ops.auditFilter === 'all' || String(e.buildingId) === ops.auditFilter);
    auditHtml = `
      <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem;flex-wrap:wrap">
        <select id="ops-audit-filter" aria-label="Filtra per condominio">
          <option value="all">Tutti i condomini</option>
          ${state.edifici.map(e => `<option value="${esc(e.id)}" ${String(e.id) === ops.auditFilter ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}
        </select>
        <span class="hint">${rows.length} operazioni</span>
      </div>
      <div class="ops-table-wrap" tabindex="0" role="region" aria-label="Registro modifiche"><table>
        <thead><tr><th>Quando</th><th>Condominio</th><th>Azione</th><th>Cosa</th><th>Chi</th><th>Dettagli</th></tr></thead>
        <tbody>${rows.length ? rows.map(e => {
          const changes = Object.entries(e.changes || {}).slice(0, 6)
            .map(([k, v]) => `<div><strong>${esc(k)}</strong>: ${esc(opsVal(v.from))} → ${esc(opsVal(v.to))}</div>`).join('');
          const cosa = e.type === 'role.assigned' ? `${esc(e.role)} a ${esc(opsWho(e.targetUid))}`
            : e.type === 'backup.restored' ? `${esc(e.docs)} documenti da ${esc(e.file)}`
            : `${esc(OPS_COLL[e.collection] || e.collection || '')} ${e.titolo ? '«' + esc(opsVal(e.titolo)) + '»' : ''}`;
          return `<tr><td style="white-space:nowrap">${esc(opsWhen(e.at))}</td><td>${edNome(e.buildingId)}</td>
            <td>${esc(OPS_TYPE[e.type] || e.type)}</td><td>${cosa}</td><td>${esc(opsWho(e.actorUid))}</td>
            <td style="font-size:12px">${changes || '—'}</td></tr>`;
        }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text2)">Nessuna operazione.</td></tr>'}</tbody>
      </table></div>`;
  }

  // Errori segnalati
  let errHtml = `<p class="hint">Errori incontrati dagli utenti nell'app (ultimi 30 giorni). Utili per scoprire problemi prima che vengano segnalati.</p>`;
  if (ops.errors) {
    errHtml = ops.errors.length === 0 ? `<div class="alert alert-success" style="font-size:13px">✅ Nessun errore segnalato.</div>` : `
      <div class="ops-table-wrap" tabindex="0" role="region" aria-label="Errori segnalati"><table>
        <thead><tr><th>Quando</th><th>Chi</th><th>Pagina</th><th>Errore</th></tr></thead>
        <tbody>${ops.errors.map(e => `<tr><td style="white-space:nowrap">${esc(opsWhen(e.at))}</td><td>${esc(opsWho(e.uid))}</td>
          <td>${esc(e.page)}</td><td style="font-size:12px"><div>${esc(e.message)}</div>${e.stack ? `<details><summary style="cursor:pointer;color:var(--accent)">Dettagli tecnici</summary><pre style="white-space:pre-wrap;font-size:11px">${esc(e.stack)}</pre><div style="color:var(--text2)">${esc(e.ua)}</div></details>` : ''}</td></tr>`).join('')}</tbody>
      </table></div>
      <button class="btn btn-secondary btn-sm" id="ops-clear-errors" style="margin-top:.5rem">🧹 Cancella le segnalazioni mostrate</button>`;
  }

  return `
    <div class="section-divider"><h3>🩺 Stato del servizio</h3></div>
    <div class="card" style="margin-bottom:1rem"><div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem"><h4 style="margin:0">💾 Backup automatico</h4>${btn('backup', ops.backup === undefined ? 'Mostra esito' : 'Aggiorna')}</div>${backupHtml}</div>
    <div class="card" style="margin-bottom:1rem"><div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem"><h4 style="margin:0">📜 Registro modifiche</h4>${btn('audit', ops.audit ? 'Aggiorna' : 'Mostra registro')}</div>${auditHtml}</div>
    <div class="card" style="margin-bottom:1.5rem"><div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem"><h4 style="margin:0">🐞 Errori segnalati</h4>${btn('errors', ops.errors ? 'Aggiorna' : 'Mostra errori')}</div>${errHtml}</div>`;
}

function bindOpsSection() {
  document.querySelectorAll('[data-ops-load]').forEach(b => { b.onclick = () => opsLoad(b.dataset.opsLoad); });
  const f = document.getElementById('ops-audit-filter');
  if (f) f.onchange = () => { ops.auditFilter = f.value; setState({}); };
  const c = document.getElementById('ops-clear-errors');
  if (c) c.onclick = opsClearErrors;
}
