// Schede di modifica: collegamento dei pulsanti (bindModal) e salvataggio (saveModal). Da dividere per sezione nel punto 1b.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

function bindModal() {
  const close = () => setState({modal:null});
  const ov = document.getElementById('modal-overlay');
  if (ov) ov.onclick = e => { if(e.target===ov) close(); };
  const mc = document.getElementById('modal-close');
  if (mc) mc.onclick = close;
  const mca = document.getElementById('modal-cancel');
  if (mca) mca.onclick = close;
  const ms = document.getElementById('modal-save');
  if (ms) ms.onclick = () => saveModal();

  // Dropzone
  bindDropzone();

  // Reset password admin
  const bResetAdmin = document.getElementById('btn-save-reset-admin');
  if (bResetAdmin) bResetAdmin.onclick = async () => {
    const id    = parseInt(bResetAdmin.dataset.id);
    const okEl  = document.getElementById('reset-admin-ok');
    const errEl = document.getElementById('reset-admin-err');
    if (errEl) errEl.style.display = 'none';
    const cond = state.condomini.find(c => c.id === id);
    if (!cond?.email) { if(errEl){errEl.textContent='Nessuna email configurata per questo condomino.';errEl.style.display='block';} return; }
    if (!window._fb) { if(errEl){errEl.textContent='Connessione a Firebase richiesta.';errEl.style.display='block';} return; }
    try {
      const { auth, sendPasswordResetEmail } = window._fb;
      await sendPasswordResetEmail(auth, cond.email);
      okEl.textContent = '✅ Email di reset inviata a ' + cond.email;
      okEl.style.display = 'block';
      setTimeout(()=>setState({modal:null}), 2500);
    } catch(e) {
      if (errEl) {
        errEl.textContent = e.code === 'auth/user-not-found'
          ? 'Nessun account Firebase con questa email. Crealo prima in Firebase Console → Authentication.'
          : 'Errore: ' + e.message;
        errEl.style.display = 'block';
      }
    }
  };

  // Toggle effettivo/previsionale entrata
  const tabEff  = document.getElementById('tab-effettivo');
  const tabPrev = document.getElementById('tab-previsionale');
  if (tabEff && tabPrev) {
    const setPrev = (val) => {
      document.getElementById('m-previsionale').value = val ? '1' : '0';
      document.getElementById('prev-info').style.display      = val ? 'block' : 'none';
      document.getElementById('rate-section').style.display   = val ? 'block' : 'none';
      document.getElementById('singolo-section').style.display= val ? 'none'  : 'block';
      tabEff.className  = `btn ${!val?'btn-primary':'btn-secondary'} btn-sm`;
      tabPrev.className = `btn ${val?'btn-primary':'btn-secondary'} btn-sm`;
      tabEff.style.flex = tabPrev.style.flex = '1';
      const saveBtn = document.getElementById('modal-save');
      if (saveBtn) saveBtn.textContent = val ? '💾 Pianifica rate' : '💾 Registra';
    };
    tabEff.onclick  = () => setPrev(false);
    tabPrev.onclick = () => setPrev(true);
  }

  // Toggle rate aggiuntive (R3, R4)
  [2,3,4].forEach(i => {
    const btn = document.getElementById(`rata-toggle-${i}`);
    if (!btn) return;
    btn.onclick = () => {
      const row = document.getElementById(`rata-row-${i}`);
      if (!row) return;
      const visible = row.style.display !== 'none';
      row.style.display = visible ? 'none' : 'flex';
      btn.textContent = visible ? '➕' : '➖';
      if (visible) {
        const di = document.getElementById(`rata-importo-${i}`);
        if (di) di.value = '';
      }
      aggiornaRateTotale();
    };
  });

  // Calcola totale rate in tempo reale
  function aggiornaRateTotale() {
    let tot = 0;
    [1,2,3,4].forEach(i => {
      const row = document.getElementById(`rata-row-${i}`);
      if (row && row.style.display !== 'none') {
        tot += parseFloat(document.getElementById(`rata-importo-${i}`)?.value||0);
      }
    });
    const el = document.getElementById('rate-totale-val');
    if (el) el.textContent = fmt(tot);
  }
  [1,2,3,4].forEach(i => {
    const inp = document.getElementById(`rata-importo-${i}`);
    if (inp) inp.addEventListener('input', aggiornaRateTotale);
  });

  // ── Migrazione edificioId (pagina Impostazioni) ──────────────────────────
  const bMigra = document.getElementById('btn-migra-edificio-id');
  if (bMigra) bMigra.onclick = async () => {
    const stats = getMigrationStats();
    const firstEd = state.edifici.find(e=>e.id===stats.firstEdId) || state.edifici[0];
    if (!firstEd) { alert('Nessun edificio trovato.'); return; }
    if (stats.totale === 0) { alert('Nessun record da migrare — tutto e gia associato a un condominio.'); return; }
    const msg1 = 'Stai per associare ' + stats.totale + ' record a "' + firstEd.nome + '".' +
      (stats.condSenza  > 0 ? '\n- ' + stats.condSenza  + ' condomini'  : '') +
      (stats.speseSenza > 0 ? '\n- ' + stats.speseSenza + ' spese'      : '') +
      (stats.entSenza   > 0 ? '\n- ' + stats.entSenza   + ' versamenti' : '') +
      (stats.fornSenza  > 0 ? '\n- ' + stats.fornSenza  + ' fornitori'  : '') +
      '\n\nQuesta operazione salva su Firebase. Procedi?';
    if (!confirm(msg1)) return;
    bMigra.disabled = true;
    bMigra.textContent = 'Migrazione in corso...';
    bMigra.style.opacity = '0.7';
    try {
      const res = await eseguiMigrazioneEdificioId(firstEd.id);
      const okEl = document.getElementById('migra-ok');
      if (okEl) { okEl.textContent = 'Migrati ' + res.migrati + ' record a "' + firstEd.nome + '"'; okEl.style.display='block'; }
      bMigra.textContent = 'Migrazione completata';
      setTimeout(() => setState({page:'impostazioni'}), 2000);
    } catch(err) {
      alert('Errore: ' + err.message);
      bMigra.disabled = false;
      bMigra.textContent = 'Riprova migrazione';
      bMigra.style.opacity = '1';
    }
  };

  // Toggle ricorrenza + aggiorna anteprima
  const mRic = document.getElementById('m-ricorrente');
  const mFreq = document.getElementById('m-freq');
  const mFreqFine = document.getElementById('m-freq-fine');
  const mData = document.getElementById('m-data');

  if (mRic) mRic.onchange = () => {
    const box = document.getElementById('ricorrenza-box');
    if (!box) return;
    const checked = mRic.checked;
    box.style.display = checked ? 'block' : 'none';
    if (checked) {
      // Default data fine = 31 dicembre anno corrente
      const mFreqFineEl = document.getElementById('m-freq-fine');
      if (mFreqFineEl && !mFreqFineEl.value) {
        mFreqFineEl.value = new Date().getFullYear() + '-12-31';
      }
      aggiornaAnteprimaRicorrenza();
    }
  };
  if (mFreq)     mFreq.onchange     = aggiornaAnteprimaRicorrenza;
  if (mFreqFine) mFreqFine.onchange = aggiornaAnteprimaRicorrenza;
  if (mData)     mData.onchange     = aggiornaAnteprimaRicorrenza;

  const bSaveEd = document.getElementById('btn-save-edificio');
  if (bSaveEd) {
    // emoji picker
    document.querySelectorAll('.ed-emoji-opt').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.ed-emoji-opt').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('ed-emoji').value = btn.dataset.edEmoji;
      };
    });
    // color picker
    document.querySelectorAll('.ed-color-opt').forEach(btn => {
      btn.onclick = () => {
        const c = btn.dataset.edColor;
        document.getElementById('ed-colore').value = c;
        document.querySelectorAll('.ed-color-opt').forEach(b => {
          b.style.border = `3px solid ${b.dataset.edColor===c?'white':'transparent'}`;
          b.style.boxShadow = b.dataset.edColor===c ? `0 0 0 2px ${c}` : 'none';
        });
      };
    });

    bSaveEd.onclick = () => {
      const nome     = document.getElementById('ed-nome')?.value?.trim();
      const indirizzo= document.getElementById('ed-indirizzo')?.value?.trim();
      const emoji    = document.getElementById('ed-emoji')?.value || '🏢';
      const colore   = document.getElementById('ed-colore')?.value || '#2563EB';
      const note     = document.getElementById('ed-note')?.value?.trim();
      const origId   = bSaveEd.dataset.id;
      const errEl    = document.getElementById('ed-err');
      errEl.style.display = 'none';
      if (!nome) { errEl.textContent='Il nome è obbligatorio'; errEl.style.display='block'; return; }

      let edifici;
      if (origId) {
        edifici = state.edifici.map(e => e.id===parseInt(origId) ? {...e,nome,indirizzo,emoji,colore,note} : e);
      } else {
        const newEd = {id: newId(), nome, indirizzo, emoji, colore, note};
        edifici = [...state.edifici, newEd];
      }
      save('cm_edifici', edifici);
      setState({edifici, modal:null});
    };
  }

  // Salva fornitore
  const bSaveF = document.getElementById('btn-save-fornitore');
  if (bSaveF) bSaveF.onclick = () => {
    const nome     = document.getElementById('fn-nome')?.value?.trim();
    const cat      = document.getElementById('fn-cat')?.value;
    const piva     = document.getElementById('fn-piva')?.value?.trim();
    const tel      = document.getElementById('fn-tel')?.value?.trim();
    const email    = document.getElementById('fn-email')?.value?.trim();
    const web      = document.getElementById('fn-web')?.value?.trim();
    const indirizzo= document.getElementById('fn-indirizzo')?.value?.trim();
    const iban     = document.getElementById('fn-iban')?.value?.trim().replace(/\s/g,'');
    const ref      = document.getElementById('fn-ref')?.value?.trim();
    const reftel   = document.getElementById('fn-reftel')?.value?.trim();
    const note     = document.getElementById('fn-note')?.value?.trim();
    const origId   = bSaveF.dataset.id;
    const errEl    = document.getElementById('fn-err');
    errEl.style.display = 'none';

    if (!nome) { errEl.textContent='Il nome è obbligatorio'; errEl.style.display='block'; return; }
    if (!cat)  { errEl.textContent='Seleziona una categoria'; errEl.style.display='block'; return; }

    if (iban && (iban.length < 15 || iban.length > 34)) {
      errEl.textContent='IBAN non valido (lunghezza errata)'; errEl.style.display='block'; return;
    }

    // Edificio: mantieni quello esistente se modifica, assegna quello attivo se nuovo
    const edificioIdFornitore = origId
      ? (state.fornitori.find(f=>f.id===parseInt(origId))?.edificioId || getUserEdificio(state.user))
      : getUserEdificio(state.user);

    const fornitore = {
      id: origId ? parseInt(origId) : newId(),
      nome, categoria:cat, piva, telefono:tel, email, web,
      indirizzo, iban, riferimento:ref, riferimentoTel:reftel, note,
      disabled: false,
      edificioId: edificioIdFornitore,
    };

    let fornitori;
    if (origId) {
      fornitori = state.fornitori.map(f=>f.id===fornitore.id?fornitore:f);
    } else {
      fornitori = [...state.fornitori, fornitore];
    }
    save('cm_fornitori', fornitori);
    setState({fornitori, modal:null});
  };

  // Salva avviso bacheca (crea/modifica)
  const bSaveAv = document.getElementById('btn-save-avviso');
  if (bSaveAv) bSaveAv.onclick = () => {
    const titolo   = document.getElementById('av-titolo')?.value?.trim();
    const testo    = document.getElementById('av-testo')?.value?.trim();
    const scadenza = document.getElementById('av-scadenza')?.value || '';
    const prioritaria = document.getElementById('av-prioritaria')?.checked || false;
    const origId   = bSaveAv.dataset.id;
    const errEl    = document.getElementById('av-err');
    errEl.style.display = 'none';

    if (!titolo) { errEl.textContent='Il titolo è obbligatorio'; errEl.style.display='block'; return; }
    if (!testo)  { errEl.textContent='Il testo è obbligatorio'; errEl.style.display='block'; return; }

    const edificioIdAvviso = origId
      ? (state.bacheca.find(a=>a.id===parseInt(origId))?.edificioId || getUserEdificio(state.user))
      : getUserEdificio(state.user);

    let bacheca;
    if (origId) {
      bacheca = state.bacheca.map(a => a.id===parseInt(origId)
        ? {...a, titolo, testo, scadenza, prioritaria, edificioId: edificioIdAvviso}
        : a);
    } else {
      const avviso = {
        id: newId(), titolo, testo, scadenza, prioritaria,
        edificioId: edificioIdAvviso,
        createdAt: new Date().toISOString(),
        createdBy: state.user?.nome || '',
      };
      bacheca = [...state.bacheca, avviso];
    }
    save('cm_bacheca', bacheca);
    setState({bacheca, modal:null});
  };

  // Salva verbale (crea/modifica)
  const bSaveVb = document.getElementById('btn-save-verbale');
  if (bSaveVb) bSaveVb.onclick = () => {
    const titolo = document.getElementById('vb-titolo')?.value?.trim();
    const data = document.getElementById('vb-data')?.value;
    const tipo = document.getElementById('vb-tipo')?.value || 'ordinaria';
    const argomenti = (document.getElementById('vb-argomenti')?.value||'').split(',').map(s=>s.trim()).filter(Boolean);
    const decisioni = (document.getElementById('vb-decisioni')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean);
    const origId = bSaveVb.dataset.id;
    const errEl = document.getElementById('vb-err');
    errEl.style.display = 'none';

    if (!titolo) { errEl.textContent='Il titolo è obbligatorio'; errEl.style.display='block'; return; }
    if (!data)   { errEl.textContent='La data è obbligatoria'; errEl.style.display='block'; return; }

    const existing = origId ? state.verbali.find(v=>v.id===parseInt(origId)) : null;
    const allegati = [...(existing?.allegati||[]), ...state.pendingFiles];
    const edificioIdVerbale = existing?.edificioId || getUserEdificio(state.user);

    let verbali;
    if (origId) {
      verbali = state.verbali.map(v => v.id===parseInt(origId)
        ? {...v, titolo, data, tipo, argomenti, decisioni, allegati, edificioId: edificioIdVerbale}
        : v);
    } else {
      const verbale = {
        id: newId(), titolo, data, tipo, argomenti, decisioni, allegati,
        edificioId: edificioIdVerbale,
        createdAt: new Date().toISOString(),
        createdBy: state.user?.nome || '',
      };
      verbali = [...state.verbali, verbale];
    }
    save('cm_verbali', verbali);
    setState({verbali, modal:null, pendingFiles:[]});
  };

  // Salva lavoro (crea/modifica) — lo storico è append-only: la nota nuova
  // si aggiunge, non sostituisce mai quelle già salvate (vedi criticità
  // "race condition su storico lavori" nel blueprint).
  const bSaveLv = document.getElementById('btn-save-lavoro');
  if (bSaveLv) bSaveLv.onclick = () => {
    const titolo = document.getElementById('lv-titolo')?.value?.trim();
    const stato = document.getElementById('lv-stato')?.value || 'da_avviare';
    const percentuale = Math.max(0, Math.min(100, parseInt(document.getElementById('lv-percentuale')?.value) || 0));
    const dataPrevistaCompletamento = document.getElementById('lv-data-prevista')?.value || '';
    const delibereRifIdRaw = document.getElementById('lv-delibera-rif')?.value;
    const delibereRifId = delibereRifIdRaw ? parseInt(delibereRifIdRaw) : null;
    const nota = document.getElementById('lv-nota')?.value?.trim();
    const origId = bSaveLv.dataset.id;
    const errEl = document.getElementById('lv-err');
    errEl.style.display = 'none';

    if (!titolo) { errEl.textContent='Il titolo è obbligatorio'; errEl.style.display='block'; return; }

    const existing = origId ? state.lavori.find(l=>l.id===parseInt(origId)) : null;
    const storicoAggiornamenti = [...(existing?.storicoAggiornamenti||[])];
    if (nota) {
      storicoAggiornamenti.push({ data: ymdLocale(new Date()), autore: state.user?.nome||'', nota });
    }
    const edificioIdLavoro = existing?.edificioId || getUserEdificio(state.user);

    let lavori;
    if (origId) {
      lavori = state.lavori.map(l => l.id===parseInt(origId)
        ? {...l, titolo, stato, percentuale, dataPrevistaCompletamento, delibereRifId, storicoAggiornamenti, edificioId: edificioIdLavoro}
        : l);
    } else {
      const lavoro = {
        id: newId(), titolo, stato, percentuale, dataPrevistaCompletamento, delibereRifId, storicoAggiornamenti,
        edificioId: edificioIdLavoro,
        createdAt: new Date().toISOString(),
        createdBy: state.user?.nome || '',
      };
      lavori = [...state.lavori, lavoro];
    }
    save('cm_lavori', lavori);
    setState({lavori, modal:null});
  };

  // Salva delibera (crea/modifica)
  const bSaveDl = document.getElementById('btn-save-delibera');
  if (bSaveDl) bSaveDl.onclick = () => {
    const descrizioneSintetica = document.getElementById('dl-descrizione')?.value?.trim();
    const dataApprovazione = document.getElementById('dl-data')?.value;
    const stato = document.getElementById('dl-stato')?.value || 'approvata';
    const responsabile = document.getElementById('dl-responsabile')?.value?.trim();
    const budgetPrevisto = document.getElementById('dl-budget')?.value;
    const verbaleRifIdRaw = document.getElementById('dl-verbale-rif')?.value;
    const verbaleRifId = verbaleRifIdRaw ? parseInt(verbaleRifIdRaw) : null;
    const note = document.getElementById('dl-note')?.value?.trim();
    const origId = bSaveDl.dataset.id;
    const errEl = document.getElementById('dl-err');
    errEl.style.display = 'none';

    if (!descrizioneSintetica) { errEl.textContent='La descrizione è obbligatoria'; errEl.style.display='block'; return; }
    if (!dataApprovazione)     { errEl.textContent='La data di approvazione è obbligatoria'; errEl.style.display='block'; return; }

    const existing = origId ? state.delibere.find(d=>d.id===parseInt(origId)) : null;
    const edificioIdDelibera = existing?.edificioId || getUserEdificio(state.user);

    let delibere;
    if (origId) {
      delibere = state.delibere.map(d => d.id===parseInt(origId)
        ? {...d, descrizioneSintetica, dataApprovazione, stato, responsabile, budgetPrevisto, verbaleRifId, note, edificioId: edificioIdDelibera}
        : d);
    } else {
      const delibera = {
        id: newId(), descrizioneSintetica, dataApprovazione, stato, responsabile, budgetPrevisto, verbaleRifId, note,
        edificioId: edificioIdDelibera,
        createdAt: new Date().toISOString(),
        createdBy: state.user?.nome || '',
      };
      delibere = [...state.delibere, delibera];
    }
    save('cm_delibere', delibere);
    setState({delibere, modal:null});
  };

  // Salva categoria (crea/modifica)
  const bSaveCat = document.getElementById('btn-save-cat');
  if (bSaveCat) {
    // Icon picker
    document.querySelectorAll('.icon-opt').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.icon-opt').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        const ic = btn.dataset.icon;
        document.getElementById('cat-icon').value = ic;
        const prev = document.getElementById('cat-icon-preview');
        if (prev) prev.textContent = ic;
      };
    });

    bSaveCat.onclick = () => {
      const label = document.getElementById('cat-label')?.value?.trim();
      const tipo  = document.getElementById('cat-tipo')?.value;
      const icon  = document.getElementById('cat-icon')?.value || '📦';
      const origId= bSaveCat.dataset.id;
      const isBuiltin = bSaveCat.dataset.builtin === 'true';
      const errEl = document.getElementById('cat-err');
      errEl.style.display = 'none';

      if (!label) { errEl.textContent='Il nome è obbligatorio'; errEl.style.display='block'; return; }

      let cats = getCategorie();

      if (origId) {
        // Modifica
        cats = cats.map(c => c.id === origId
          ? {...c, label, icon, ...(isBuiltin ? {} : {tipo}) }  // builtin: non cambiare tipo
          : c);
      } else {
        // Crea — genera id slug dal label
        const baseId = label.toLowerCase().replace(/[^a-z0-9]/g,'_').slice(0,30) + '_' + Date.now().toString(36);
        if (cats.find(c=>c.label.toLowerCase()===label.toLowerCase())) {
          errEl.textContent='Esiste già una categoria con questo nome'; errEl.style.display='block'; return;
        }
        cats = [...cats, {id: baseId, label, tipo, icon, builtin:false}];
      }

      saveCategorie(cats);
      setState({modal:null});
    };
  }

  // Conferma disabilita utente
  const bConfDis = document.getElementById('btn-confirm-disable');
  if (bConfDis) bConfDis.onclick = () => {
    const id = parseInt(bConfDis.dataset.uid);
    const note = document.getElementById('disable-note')?.value?.trim() || null;
    const condomini = state.condomini.map(c => c.id===id
      ? {...c, disabled:true, disabledOn: new Date().toISOString(), disabledNote: note}
      : c);
    save('cm_condomini', condomini);
    setState({condomini, modal:null});
  };

  // Change password (own)
  const cp1 = document.getElementById('cp-new1');
  if (cp1) {
    cp1.oninput = () => {
      const errs = validatePassword(cp1.value);
      const el = document.getElementById('cp-rules');
      if (!cp1.value) { el.innerHTML=''; return; }
      el.innerHTML = errs.length===0
        ? '<span style="color:var(--green)">✅ Password valida</span>'
        : errs.map(e=>`<span style="color:var(--red)">✗ ${e}</span>`).join(' &nbsp;');
    };
  }
  const bcps = document.getElementById('btn-cp-save');
  if (bcps) bcps.onclick = async () => {
    const cur = document.getElementById('cp-current').value;
    const n1  = document.getElementById('cp-new1').value;
    const n2  = document.getElementById('cp-new2').value;
    const errEl = document.getElementById('cp-err');
    const okEl  = document.getElementById('cp-ok');
    errEl.style.display='none'; okEl.style.display='none';
    if (!cur) { errEl.textContent='Inserisci la password attuale'; errEl.style.display='block'; return; }
    const errs = validatePassword(n1);
    if (errs.length>0) { errEl.textContent='Password non valida: '+errs.join(', '); errEl.style.display='block'; return; }
    if (n1 !== n2) { errEl.textContent='Le password non coincidono'; errEl.style.display='block'; return; }
    try {
      if (!window._fb) throw new Error('Connessione a Firebase richiesta per cambiare la password.');
      await fbChangePassword(cur, n1);
      okEl.textContent='✅ Password aggiornata con successo!';
      okEl.style.display='block';
      setTimeout(()=>setState({modal:null}), 1500);
    } catch(e) {
      errEl.textContent = e.code==='auth/wrong-password'||e.code==='auth/invalid-credential'
        ? 'Password attuale non corretta'
        : (e.message||'Errore aggiornamento password');
      errEl.style.display='block';
    }
  };

  // Split spesa
  bindSplit();

  // Wizard nuovo utente
  bindWizard();

  // Auto-fill tipo from categoria
  const mcat = document.getElementById('m-cat');
  if (mcat && state.modal?.type==='spesa') {
    mcat.onchange = e => {
      const selId = mcat.value;
      const catObj = getCategorie().find(c=>c.id===selId);
      const tipo = catObj?.tipo;
      const mTipo = document.getElementById('m-tipo');
      if (tipo && mTipo && tipo !== 'entrata') mTipo.value = tipo;
    };
  }
}

function saveModal() {
  const m = state.modal;
  if (m.type === 'spesa') {
    const titolo = document.getElementById('m-titolo')?.value?.trim();
    const desc = document.getElementById('m-desc')?.value?.trim();
    const cat = document.getElementById('m-cat')?.value;
    const tipo = document.getElementById('m-tipo')?.value;
    const prev = document.getElementById('m-prev')?.value;
    const cons = document.getElementById('m-cons')?.value;
    const data = document.getElementById('m-data')?.value;
    if (!titolo || !cat || !data) { alert('Compila i campi obbligatori (Titolo, Categoria, Data)'); return; }
    if (!prev && !cons) { alert('Inserisci almeno un importo (preventivo o consuntivo)'); return; }
    const existingAllegati = m.data?.allegati||[];
    const allegati = [...existingAllegati, ...state.pendingFiles];
    const split = readSplitFromDOM();
    const fornitoreId = parseInt(document.getElementById('m-fornitore')?.value)||null;
    const ricorrente = document.getElementById('m-ricorrente')?.checked || false;
    const frequenza  = document.getElementById('m-freq')?.value || 'mensile';
    const ricorrenzaFine = document.getElementById('m-freq-fine')?.value || '';
    // Validazione: data fine obbligatoria per spese ricorrenti
    if (ricorrente && !ricorrenzaFine) {
      const errEl = document.getElementById('m-err');
      if (errEl) { errEl.textContent = 'Inserisci la data di fine per la spesa ricorrente'; errEl.style.display='block'; }
      else alert('Inserisci la data di fine per la spesa ricorrente');
      return;
    }
    const ricGruppoId = m.data?.ricGruppoId || (ricorrente ? newId() : null);
    const item = { id: m.data?.id||newId(), titolo, descrizione:desc, categoria:cat, tipoSpesa:tipo, preventivo:prev||'', consuntivo:cons||'', data, allegati, split, fornitoreId, edificioId: state.edificioAttivo, ricorrente, frequenza: ricorrente?frequenza:null, ricorrenzaFine: ricorrente?ricorrenzaFine:'', ricGruppoId };
    let spese;
    if (m.data?.id) {
      // Modifica spesa esistente
      spese = state.spese.map(s=>s.id===item.id ? item : s);
      // Se la ricorrenza è stata AGGIUNTA o MODIFICATA rispetto all'originale:
      // genera le nuove occorrenze future partendo dal giorno dopo la data della spesa
      const eraRicorrente = !!m.data?.ricorrente;
      const cambiataFreq  = m.data?.frequenza !== frequenza;
      const cambiatiFine  = m.data?.ricorrenzaFine !== ricorrenzaFine;
      if (ricorrente && (!eraRicorrente || cambiataFreq || cambiatiFine)) {
        // Rimuovi occorrenze precedenti dello stesso gruppo (se erano già state create)
        if (item.ricGruppoId) {
          spese = spese.filter(s => !(s.ricGruppoId === item.ricGruppoId && s.id !== item.id));
        }
        // Genera nuove occorrenze future (dalla data della spesa in poi)
        const occorrenze = generaOccorrenze(item, ricorrenzaFine);
        spese = [...spese, ...occorrenze];
        if (occorrenze.length > 0) {
          alert('✅ Ricorrenza aggiornata: create ' + occorrenze.length + ' occorrenze future.');
        }
      }
    } else {
      spese = [...state.spese, item];
      // Genera occorrenze future se ricorrente (nuova spesa)
      if (ricorrente) {
        const occorrenze = generaOccorrenze(item, ricorrenzaFine);
        spese = [...spese, ...occorrenze];
      }
    }
    save('cm_spese', spese);
    setState({spese, modal:null, pendingFiles:[]});
  } else if (m.type === 'entrata') {
    const previsionale = document.getElementById('m-previsionale')?.value === '1';
    const errEl = document.getElementById('entrata-err');
    const showErr = (msg) => { if(errEl){errEl.textContent=msg;errEl.style.display='block';} else alert(msg); };

    if (m.data?.id) {
      // ── MODIFICA / VALIDAZIONE singola ──────────────────────────────────
      const condoId  = parseInt(document.getElementById('m-condo-s')?.value);
      const importo  = document.getElementById('m-importo-s')?.value;
      const data     = document.getElementById('m-data-s')?.value;
      const desc     = document.getElementById('m-desc-s')?.value?.trim();
      const cat      = document.getElementById('m-cat-s')?.value||'quote';
      if (!condoId || !importo || !data) { showErr('Compila tutti i campi obbligatori'); return; }
      // Validazione: rimane previsionale SOLO se il toggle è ancora su prev
      const entrate = state.entrate.map(e => e.id===m.data.id
        ? {...e, condominoId:condoId, importo, data, descrizione:desc, categoria:cat, previsionale: m.data.previsionale ? previsionale : false}
        : e);
      save('cm_entrate', entrate);
      setState({entrate, modal:null});

    } else if (previsionale) {
      // ── INSERIMENTO RATE PREVISIONALI ────────────────────────────────────
      const condoId = parseInt(document.getElementById('m-condo')?.value);
      const desc    = document.getElementById('m-desc')?.value?.trim();
      const cat     = document.getElementById('m-cat')?.value||'quote';
      if (!condoId) { showErr('Seleziona il condomino'); return; }

      const rate = [];
      [1,2,3,4].forEach(i => {
        const row     = document.getElementById(`rata-row-${i}`);
        if (!row || row.style.display === 'none') return;
        const dataR   = document.getElementById(`rata-data-${i}`)?.value;
        const importoR= document.getElementById(`rata-importo-${i}`)?.value;
        if (dataR && importoR && parseFloat(importoR)>0) {
          rate.push({ id:newId(), condominoId:condoId, importo:importoR, data:dataR,
            descrizione: desc ? `${desc} — Rata ${i}` : `Rata ${i}`,
            categoria:cat, edificioId:state.edificioAttivo, previsionale:true });
        }
      });
      if (rate.length === 0) { showErr('Inserisci almeno una rata con data e importo'); return; }
      const entrate = [...state.entrate, ...rate];
      save('cm_entrate', entrate);
      setState({entrate, modal:null});

    } else {
      // ── INSERIMENTO EFFETTIVO SINGOLO ────────────────────────────────────
      const condoId = parseInt(document.getElementById('m-condo-s')?.value);
      const importo = document.getElementById('m-importo-s')?.value;
      const data    = document.getElementById('m-data-s')?.value;
      const desc    = document.getElementById('m-desc-s')?.value?.trim();
      const cat     = document.getElementById('m-cat-s')?.value||'quote';
      if (!condoId || !importo || !data) { showErr('Compila tutti i campi obbligatori'); return; }
      const item = { id:newId(), condominoId:condoId, importo, data, descrizione:desc, categoria:cat, edificioId:state.edificioAttivo, previsionale:false };
      const entrate = [...state.entrate, item];
      save('cm_entrate', entrate);
      setState({entrate, modal:null});
    }
  } else if (m.type === 'cond') {
    const nome = document.getElementById('m-nome')?.value?.trim();
    const apt = document.getElementById('m-apt')?.value?.trim();
    const email = document.getElementById('m-email')?.value?.trim();
    const ruolo = document.getElementById('m-ruolo')?.value || 'lettura';
    const edificioId = parseInt(document.getElementById('m-edificio')?.value) || getUserEdificio(state.user);
    const isAdminNew = ruolo === 'adminedificio';
    const canEditNew = ruolo === 'modifica' || isAdminNew;
    const superAdminNew = false; // promozione a superAdmin solo via select dedicata
    if (!nome || !apt) { alert('Nome e appartamento sono obbligatori'); return; }
    let condomini;
    if (m.data?.id) {
      const username = document.getElementById('m-username')?.value?.trim().toLowerCase().replace(/[^a-z0-9._-]/g,'') || '';
      // ── Blocco spostamento: RIGIDO se ha transazioni ─────────────────
      const condOld      = state.condomini.find(c=>c.id===m.data.id);
      const oldEdId      = condOld?.edificioId || state.edificioAttivo;
      const cambiaEd     = edificioId !== oldEdId;
      const hasEntrate   = state.entrate.some(e=>e.condominoId===m.data.id);
      const hasSpeseSplit= state.spese.some(s=>s.split?.some(x=>x.id===m.data.id));
      const hasDati      = hasEntrate || hasSpeseSplit;
      const edificioIdFinale = (() => {
        if (!cambiaEd) return edificioId;  // stesso edificio — sempre OK
        if (hasDati) {
          const nEnt = state.entrate.filter(e=>e.condominoId===m.data.id).length;
          const nSp  = state.spese.filter(s=>s.split?.some(x=>x.id===m.data.id)).length;
          alert(
            `⛔ Impossibile spostare "${condOld?.nome}" in un altro condominio.\n\n` +
            `Ha transazioni associate:\n• ${nEnt} versamenti\n• ${nSp} spese\n\n` +
            `Crea un profilo separato per questo utente nel nuovo condominio.`
          );
          return oldEdId;  // mantieni edificio originale — BLOCCO TOTALE
        }
        return edificioId;  // nessuna transazione → spostamento libero
      })();
      condomini = state.condomini.map(c=>c.id===m.data.id
        ? {...c, nome, appartamento:apt, email, username, canEdit:canEditNew, isAdmin:isAdminNew, superAdmin:c.superAdmin||false, edificioId:edificioIdFinale}
        : c);
      // Se il ruolo dell'utente loggato è cambiato, aggiornare anche state.user
      if (state.user && state.user.id === m.data.id) {
        setState({user:{...state.user, canEdit:canEditNew, isAdmin:isAdminNew, edificioId}});
      }
    } else {
      const nextIdx = state.condomini.length % COLORS.length;
      const usernameNew = document.getElementById('m-username')?.value?.trim().toLowerCase().replace(/[^a-z0-9._-]/g,'') || '';
      // Verifica unicità username
      if (usernameNew && state.condomini.some(c=>c.username===usernameNew)) {
        alert('Username già in uso. Scegli un nome diverso.'); return;
      }
      condomini = [...state.condomini, {id:newId(),nome,appartamento:apt,email,username:usernameNew,canEdit:canEditNew,isAdmin:isAdminNew,superAdmin:false,edificioId,color:COLORS[nextIdx]}];
    }
    save('cm_condomini', condomini);
    setState({condomini, modal:null});
  }
}
