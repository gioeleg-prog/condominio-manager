// Collegamento dei pulsanti di tutte le pagine (bindPageActions). Da dividere per pagina nel punto 1b.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

function bindPageActions() {
  // Anno filter dashboard
  const ad = document.getElementById('anno-filter');
  if (ad) ad.onchange = e => setState({filterAnno: parseInt(e.target.value)||new Date().getFullYear()});

  // Checkbox singola spesa
  document.querySelectorAll('.chk-spesa').forEach(chk => {
    chk.onchange = () => {
      const id = parseInt(chk.dataset.spesaId);
      const sel = new Set(state.speseSelezionate || []);
      if (chk.checked) sel.add(id); else sel.delete(id);
      state.speseSelezionate = sel;
      // Aggiorna stile riga
      const row = chk.closest('tr');
      if (row) row.className = chk.checked ? 'spesa-row-sel' : '';
      // Aggiorna la barra selezione senza un render completo quando possibile (più leggero),
      // ma un render completo è necessario quando la barra deve COMPARIRE (non esiste ancora
      // nel DOM) o SPARIRE (il conteggio è tornato a zero) — un aggiornamento del solo testo,
      // in quei due casi, lasciava la barra a mostrare "0 spese selezionate" invece di sparire.
      const bar = document.querySelector('.sel-count-bar span');
      if (sel.size === 0 || !bar) render();
      else bar.textContent = sel.size + ' spese selezionate';
    };
  });

  // Esporta Excel: le spese SELEZIONATE se ce n'è almeno una, altrimenti tutte quelle attualmente
  // visibili a schermo (rispettando i filtri correnti — ricerca, anno, tipo, stato, categoria, fornitore).
  // Gli id vengono letti dal DOM (checkbox .chk-spesa realmente renderizzate), non ricalcolando i
  // filtri qui: così l'export è sempre coerente al 100% con quello che si vede sullo schermo.
  const bExportSpese = document.getElementById('btn-export-spese');
  if (bExportSpese) bExportSpese.onclick = () => {
    const idsVisibili = [...document.querySelectorAll('.chk-spesa')].map(chk => parseInt(chk.dataset.spesaId));
    const sel = state.speseSelezionate;
    const idsDaEsportare = (sel && sel.size > 0) ? idsVisibili.filter(id => sel.has(id)) : idsVisibili;
    const speseDaEsportare = state.spese.filter(s => idsDaEsportare.includes(s.id));
    const nomeFile = 'spese-condominio-' + (sel && sel.size > 0 ? 'selezionate-' : '') + ymdLocale(new Date()) + '.csv';
    esportaSpeseCSV(speseDaEsportare, nomeFile);
  };

  // Seleziona tutte — legge gli id direttamente dalle checkbox visibili a schermo (non da una
  // variabile 'items' che qui non esiste: era un bug pre-esistente, il bottone non selezionava nulla)
  const bSelAll = document.getElementById('btn-sel-all');
  if (bSelAll) bSelAll.onclick = () => {
    const ids = [...document.querySelectorAll('.chk-spesa')].map(chk => parseInt(chk.dataset.spesaId));
    state.speseSelezionate = new Set(ids);
    render();
  };

  // Deseleziona tutte
  const bSelNone = document.getElementById('btn-sel-none');
  if (bSelNone) bSelNone.onclick = () => {
    state.speseSelezionate = new Set();
    render();
  };

  // Checkbox "seleziona tutte" nell'header — stesso fix di bSelAll qui sopra
  const chkAll = document.getElementById('chk-all-spese');
  if (chkAll) chkAll.onchange = () => {
    if (chkAll.checked) {
      const ids = [...document.querySelectorAll('.chk-spesa')].map(chk => parseInt(chk.dataset.spesaId));
      state.speseSelezionate = new Set(ids);
    } else {
      state.speseSelezionate = new Set();
    }
    render();
  };

  // Elimina selezionate
  const bDelSel = document.getElementById('btn-del-sel');
  if (bDelSel) bDelSel.onclick = () => {
    const sel = state.speseSelezionate;
    if (!sel || sel.size === 0) return;
    // Mostra dettaglio di cosa si sta eliminando
    const toDelete = state.spese.filter(s=>sel.has(s.id));
    const msg = 'Eliminare ' + sel.size + ' spese?\n\n' +
      toDelete.slice(0,5).map(s=>'- ' + s.titolo + ' (' + s.data + ')').join('\n') +
      (toDelete.length > 5 ? '\n- ... e altre ' + (toDelete.length-5) : '');
    if (!confirm(msg)) return;
    const spese = state.spese.filter(s=>!sel.has(s.id));
    save('cm_spese', spese);
    state.speseSelezionate = new Set();
    setState({spese});
  };

  // Ordinamento colonne spese
  document.querySelectorAll('[data-sort-col]').forEach(th => {
    th.onclick = () => {
      const colId = th.dataset.sortCol;
      const newDir = state.sortCol===colId && state.sortDir==='desc' ? 'asc' : 'desc';
      setState({sortCol: colId, sortDir: newDir});
    };
  });

  const ab = document.getElementById('anno-bilancio');
  if (ab) ab.onchange = e => setState({filterAnno: parseInt(e.target.value)||new Date().getFullYear()});
  document.querySelectorAll('.bil-tab:not(.vita-tab)').forEach(t => {
    t.onclick = () => setState({bilancioTab: t.dataset.tab});
  });

  // Tab della pagina "Vita condominiale" (Bacheca/Verbali/Lavori/Delibere)
  document.querySelectorAll('[data-vita-tab]').forEach(t => {
    t.onclick = () => setState({vitaTab: t.dataset.vitaTab});
  });

  // Spese filters
  const ss = document.getElementById('search-spese');
  if (ss) ss.oninput = e => setState({searchQ: e.target.value});
  const fas = document.getElementById('filter-anno-spese');
  if (fas) fas.onchange = e => setState({filterAnno: parseInt(e.target.value)||0});
  const fts = document.getElementById('filter-tipo-spese');
  if (fts) fts.onchange = e => setState({filterTipo: e.target.value});
  const fcs = document.getElementById('filter-cat-spese');
  if (fcs) fcs.onchange = e => setState({filterCat: e.target.value});
  if (fcs) fcs.onchange = e => setState({filterCat: e.target.value});
  const fss = document.getElementById('filter-stato-spese');
  if (fss) fss.onchange = e => setState({filterStato: e.target.value});
  const ffs = document.getElementById('filter-fornitore-spese');
  if (ffs) ffs.onchange = e => setState({filterFornitore: e.target.value});
  const bRF = document.getElementById('btn-reset-filtri');
  if (bRF) bRF.onclick = () => setState({filterTipo:'all',filterCat:'all',filterStato:'all',filterFornitore:'all',searchQ:''});

  // Entrate filters
  const se = document.getElementById('search-entrate');
  if (se) se.oninput = e => setState({searchQ: e.target.value});
  const fae = document.getElementById('filter-anno-entrate');
  if (fae) fae.onchange = e => setState({filterAnno: parseInt(e.target.value)||0});

  // Add buttons
  const bAddSpesa = document.getElementById('btn-add-spesa');
  if (bAddSpesa) bAddSpesa.onclick = () => setState({modal:{type:'spesa',data:null}, pendingFiles:[]});
  const bAddEntrata = document.getElementById('btn-add-entrata');
  if (bAddEntrata) bAddEntrata.onclick = () => setState({modal:{type:'entrata',data:null}});
  const bAddCond = document.getElementById('btn-add-cond');
  if (bAddCond) bAddCond.onclick = () => setState({modal:{type:'cond',data:null}});

  // Bilancio individuale condomino
  document.querySelectorAll('[data-bilancio-cond]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.bilancioCond);
      setState({page:'bilancio', bilancioTab:'condomini', bilancioCondId:id});
    };
  });

  // Reset password da superAdmin
  document.querySelectorAll('[data-reset-pw-cond]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.resetPwCond);
      const c  = state.condomini.find(x=>x.id===id);
      if (!c) return;
      setState({modal:{type:'admin-reset-pw', data:c}});
    };
  });

  // Edit/delete spese
  document.querySelectorAll('[data-edit-spesa]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editSpesa);
      const item = state.spese.find(s=>s.id===id);
      if (item) setState({modal:{type:'spesa',data:{...item}}, pendingFiles:[]});
    };
  });
  document.querySelectorAll('[data-del-spesa]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('Eliminare questa spesa?')) return;
      const spese = state.spese.filter(s=>s.id!==parseInt(btn.dataset.delSpesa));
      save('cm_spese', spese);
      setState({spese});
    };
  });

  // Allegati in tabella
  bindAllegatiInTable([
    { records: state.spese, stateKey: 'spese', appdataKey: 'cm_spese' },
    { records: state.verbali, stateKey: 'verbali', appdataKey: 'cm_verbali' },
  ]);

  // Delete entrate
  // Piano rate: 1) "Avvia" mostra il pannello di conferma con le rate già calcolate sopra
  //             2) "Conferma" crea davvero i versamenti (sostituendo eventuali proposte precedenti)
  //             3) "Annulla" chiude il pannello senza scrivere nulla
  const bAvviaPiano = document.getElementById('btn-crea-rate-piano');
  if (bAvviaPiano) bAvviaPiano.onclick = () => {
    const annoSel = state.filterAnno || new Date().getFullYear();
    setState({ pianoRateConferma: annoSel });
  };

  const bAnnullaPiano = document.getElementById('btn-annulla-rate-piano');
  if (bAnnullaPiano) bAnnullaPiano.onclick = () => {
    setState({ pianoRateConferma: null });
  };

  const bConfermaPiano = document.getElementById('btn-conferma-rate-piano');
  if (bConfermaPiano) bConfermaPiano.onclick = () => {
    const annoSel = state.filterAnno || new Date().getFullYear();
    const piano   = calcolaPianoRate(annoSel);
    const edId = getUserEdificio(state.user);

    // Proposte pendenti (non validate) di QUESTO piano per l'anno selezionato: quando la
    // combinazione rata+condomino esiste ancora nel nuovo piano, il record viene AGGIORNATO
    // sul posto (stesso id) invece di essere cancellato e ricreato — così eventuali riferimenti
    // o note aggiunte a mano restano intatti. Viene rimosso solo ciò che non esiste più nel nuovo
    // piano (es. perché il numero di rate necessarie è cambiato).
    const vecchieProposte = state.entrate.filter(e =>
      (!e.edificioId || e.edificioId === edId) && e.previsionale && e.pianoRataAuto && e.pianoAnno === annoSel
    );
    const vecchieByKey = new Map(vecchieProposte.map(e => [e.pianoRataN + ':' + e.condominoId, e]));

    // Combinazioni rata+condomino GIÀ VALIDATE (pagamento reale arrivato): per queste non si crea
    // né si aggiorna nulla — restano un dato storico stabile anche se il piano ricalcolato cambia,
    // altrimenti rischieremmo di proporre di nuovo una rata già pagata.
    const validatiByKey = new Set(
      state.entrate
        .filter(e => (!e.edificioId || e.edificioId === edId) && !e.previsionale && e.pianoRataAuto && e.pianoAnno === annoSel)
        .map(e => e.pianoRataN + ':' + e.condominoId)
    );
    const usedKeys = new Set();

    let entrate = [...state.entrate];
    let creati = 0, aggiornati = 0, saltati = 0;

    for (const r of piano.rate) {
      for (const c of r.perCondomino) {
        const key = r.n + ':' + c.id;
        usedKeys.add(key);
        if (validatiByKey.has(key)) { saltati++; continue; } // già pagata: non toccare, non duplicare
        const esistente = vecchieByKey.get(key);
        const descrizione = 'Piano rate ' + annoSel + ' - Rata ' + r.n + ' (' + r.mese + ')';
        if (esistente) {
          // stesso id: aggiorno solo i valori che il ricalcolo può aver cambiato.
          // importoPrevisto tiene traccia dell'ultima proposta calcolata — utile da confrontare
          // con importo se in futuro viene validato con un importo diverso da quello proposto.
          entrate = entrate.map(e => e.id === esistente.id
            ? { ...e, importo: String(c.importo), importoPrevisto: String(c.importo), data: r.data, descrizione }
            : e);
          aggiornati++;
        } else {
          entrate.push({
            id: newId() + creati + aggiornati, // offset per evitare collisioni quando si creano più record nello stesso istante
            condominoId: c.id,
            importo: String(c.importo),
            importoPrevisto: String(c.importo),
            data: r.data,
            descrizione,
            categoria: 'quote',
            edificioId: edId,
            previsionale: true,
            pianoRataAuto: true,
            pianoAnno: annoSel,
            pianoRataN: r.n,
          });
          creati++;
        }
      }
    }

    // Proposte pendenti che non fanno più parte del piano ricalcolato (rate/condomini cambiati):
    // queste sì vanno rimosse, non ha senso lasciarle in sospeso.
    const daRimuovere = vecchieProposte.filter(e => !usedKeys.has(e.pianoRataN + ':' + e.condominoId));
    if (daRimuovere.length) {
      const idsRimuovi = new Set(daRimuovere.map(e=>e.id));
      entrate = entrate.filter(e => !idsRimuovi.has(e.id));
    }

    save('cm_entrate', entrate);
    setState({ entrate, pianoRateConferma: null });

    const parti = [];
    if (creati) parti.push(creati + ' creati');
    if (aggiornati) parti.push(aggiornati + ' aggiornati');
    if (daRimuovere.length) parti.push(daRimuovere.length + ' rimossi perché non più necessari');
    if (saltati) parti.push(saltati + ' già pagati, lasciati invariati');
    alert(parti.length
      ? 'Piano rate ' + annoSel + ': ' + parti.join(', ') + '. Valida i versamenti quando arrivano i pagamenti.'
      : 'Nessuna modifica: il piano era già aggiornato.');
  };

  // Valida entrata previsionale → effettiva
  document.querySelectorAll('[data-valida-entrata]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.validaEntrata);
      if (!confirm('Confermi il versamento come effettivo? Verrà spostato dagli importi previsionali a quelli reali.')) return;
      const entrate = state.entrate.map(e => e.id===id ? {...e, previsionale:false} : e);
      save('cm_entrate', entrate);
      setState({entrate});
    };
  });

  // Modifica versamento
  document.querySelectorAll('[data-edit-entrata]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editEntrata);
      const e  = state.entrate.find(x=>x.id===id);
      if (!e) return;
      setState({modal:{type:'entrata', data:e}});
    };
  });

  document.querySelectorAll('[data-del-entrata]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('Eliminare questo versamento?')) return;
      const entrate = state.entrate.filter(e=>e.id!==parseInt(btn.dataset.delEntrata));
      save('cm_entrate', entrate);
      setState({entrate});
    };
  });

  // Edit cond
  document.querySelectorAll('[data-edit-cond]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editCond);
      const item = state.condomini.find(c=>c.id===id);
      if (item) setState({modal:{type:'cond',data:{...item}}});
    };
  });

  // Aggiungi nuovo utente (wizard)
  const bNuovoUtente = document.getElementById('btn-nuovo-utente');
  if (bNuovoUtente) bNuovoUtente.onclick = () => setState({modal:{type:'nuovo-utente'}, wizardStep:1, wizardData:{}});

  // Ruolo select inline nelle card impostazioni
  document.querySelectorAll('.ruolo-select').forEach(sel => {
    sel.onchange = async () => {
      const id = parseInt(sel.dataset.ruoloId);
      const ruolo = sel.value;
      const isAdminNew    = ruolo === 'adminedificio' || ruolo === 'superadmin';
      const canEditNew    = ruolo === 'modifica' || isAdminNew;
      const superAdminNew = ruolo === 'superadmin';
      if (superAdminNew && !confirm('Stai promuovendo questo utente a Super Admin globale. Potrà vedere e gestire TUTTI i condomini. Confermi?')) {
        sel.value = sel.dataset.prevValue || 'lettura';
        return;
      }
      const target = state.condomini.find(c => c.id === id);
      if (!target?.uid) {
        alert('Questo utente non ha ancora effettuato il primo login: il ruolo server-side verrà assegnato automaticamente al suo primo accesso.');
        sel.value = sel.dataset.prevValue || 'lettura';
        return;
      }
      // SEC-02/05 — assegna il ruolo lato server (custom claims), unico punto autorizzato
      try {
        const { functionsInstance, httpsCallable } = window._fb;
        const setUserRole = httpsCallable(functionsInstance, 'setUserRole');
        // 'editor' (REB-01 P1): canEdit:true ma non admin. Prima di questo fix
        // veniva sempre inviato 'member' anche per "Modifica", disallineando il
        // claim server-side dal ruolo mostrato in UI.
        const serverRole = superAdminNew ? 'superAdmin' : (isAdminNew ? 'adminEdificio' : (canEditNew ? 'editor' : 'member'));
        const resp = await setUserRole({
          targetUid: target.uid,
          role: serverRole,
          buildingId: String(target.edificioId || state.edificioAttivo),
        });
        console.log('setUserRole OK:', resp.data);
      } catch (err) {
        alert('Impossibile assegnare il ruolo: ' + (err.message || err));
        sel.value = sel.dataset.prevValue || 'lettura';
        return; // NIENTE scrittura locale se la function fallisce
      }
      sel.dataset.prevValue = ruolo;
      const condomini = state.condomini.map(c => c.id===id
        ? {...c, canEdit:canEditNew, isAdmin:isAdminNew, superAdmin:superAdminNew}
        : c);
      save('cm_condomini', condomini);
      setState({condomini});
    };
    sel.dataset.prevValue = sel.value;
  });

  // Gestione edifici
  const bNuovoEd = document.getElementById('btn-nuovo-edificio');
  if (bNuovoEd) bNuovoEd.onclick = () => setState({modal:{type:'edificio', data:null}});

  document.querySelectorAll('[data-edit-edificio]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editEdificio);
      const ed = state.edifici.find(e=>e.id===id);
      if (ed) setState({modal:{type:'edificio', data:{...ed}}});
    };
  });

  document.querySelectorAll('[data-attiva-edificio]').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.attivaEdificio);
      btn.disabled = true;
      btn.textContent = '⏳ Attivazione…';
      await cambiaEdificio(id, false);
      // Dopo cambiaEdificio setState porta a dashboard — ok
    };
  });

  document.querySelectorAll('[data-sel-edificio]').forEach(btn => {
    btn.onclick = () => cambiaEdificio(parseInt(btn.dataset.selEdificio), true);
  });

  document.querySelectorAll('[data-del-edificio]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.delEdificio);
      const ed = state.edifici.find(e=>e.id===id);
      if (!ed) return;
      // Blocca se ha dati associati
      const condAssoc   = state.condomini.filter(c=>c.edificioId===id && !c.superAdmin).length;
      const speseAssoc  = state.spese.filter(s=>s.edificioId===id).length;
      const entAssoc    = state.entrate.filter(e=>e.edificioId===id).length;
      if (condAssoc>0 || speseAssoc>0 || entAssoc>0) {
        alert(`⚠️ Impossibile eliminare "${ed.nome}".

Ha ancora:
• ${condAssoc} condomini
• ${speseAssoc} spese
• ${entAssoc} versamenti

Sposta o elimina prima tutti i dati associati.`);
        return;
      }
      if (!confirm(`Eliminare "${ed.nome}"? Non ha dati associati, è sicuro.`)) return;
      const edifici = state.edifici.filter(e=>e.id!==id);
      save('cm_edifici', edifici);
      const nuovoAttivo = edifici[0]?.id || 1;
      save('cm_edificio_attivo', nuovoAttivo);
      setState({edifici, edificioAttivo:nuovoAttivo});
    };
  });

  // Btn gestisci edifici dal modal switcher
  const bGestEdifici = document.getElementById('btn-gestisci-edifici');
  if (bGestEdifici) bGestEdifici.onclick = () => setState({modal:null, page:'impostazioni'});

  // Nuovo fornitore
  const bNuovoFornitore = document.getElementById('btn-nuovo-fornitore');
  if (bNuovoFornitore) bNuovoFornitore.onclick = () => setState({modal:{type:'fornitore', data:null}});

  // Nuovo avviso bacheca
  const bNuovoAvviso = document.getElementById('btn-nuovo-avviso');
  if (bNuovoAvviso) bNuovoAvviso.onclick = () => setState({modal:{type:'avviso', data:null}});

  // Modifica avviso bacheca
  document.querySelectorAll('[data-edit-avviso]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editAvviso);
      const a = state.bacheca.find(x=>x.id===id);
      if (a) setState({modal:{type:'avviso', data:{...a}}});
    };
  });

  // Elimina avviso bacheca
  document.querySelectorAll('[data-del-avviso]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.delAvviso);
      const a = state.bacheca.find(x=>x.id===id);
      if (!a) return;
      if (!confirm(`Eliminare l'avviso "${a.titolo}"?`)) return;
      const bacheca = state.bacheca.filter(x=>x.id!==id);
      save('cm_bacheca', bacheca);
      setState({bacheca});
    };
  });

  // Ricerca verbali (riusa lo stesso state.searchQ di Spese/Entrate)
  const svb = document.getElementById('search-verbali');
  if (svb) svb.oninput = e => setState({searchQ: e.target.value});

  // Nuovo verbale
  const bNuovoVerbale = document.getElementById('btn-nuovo-verbale');
  if (bNuovoVerbale) bNuovoVerbale.onclick = () => setState({modal:{type:'verbale', data:null}, pendingFiles:[]});

  // Modifica verbale
  document.querySelectorAll('[data-edit-verbale]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editVerbale);
      const v = state.verbali.find(x=>x.id===id);
      if (v) setState({modal:{type:'verbale', data:{...v}}, pendingFiles:[]});
    };
  });

  // Elimina verbale (e i suoi allegati su Storage)
  document.querySelectorAll('[data-del-verbale]').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.delVerbale);
      const v = state.verbali.find(x=>x.id===id);
      if (!v) return;
      if (!confirm(`Eliminare il verbale "${v.titolo}"? Verranno eliminati anche gli eventuali allegati.`)) return;
      for (const a of (v.allegati||[])) {
        if (a.storagePath) {
          try {
            const { storage, ref, deleteObject } = window._fb;
            await deleteObject(ref(storage, a.storagePath));
          } catch (err) { console.warn('deleteObject (verbale):', err.message); }
        }
      }
      const verbali = state.verbali.filter(x=>x.id!==id);
      save('cm_verbali', verbali);
      setState({verbali});
    };
  });

  // Nuovo lavoro
  const bNuovoLavoro = document.getElementById('btn-nuovo-lavoro');
  if (bNuovoLavoro) bNuovoLavoro.onclick = () => setState({modal:{type:'lavoro', data:null}});

  // Modifica lavoro
  document.querySelectorAll('[data-edit-lavoro]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editLavoro);
      const l = state.lavori.find(x=>x.id===id);
      if (l) setState({modal:{type:'lavoro', data:{...l}}});
    };
  });

  // Elimina lavoro
  document.querySelectorAll('[data-del-lavoro]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.delLavoro);
      const l = state.lavori.find(x=>x.id===id);
      if (!l) return;
      if (!confirm(`Eliminare il lavoro "${l.titolo}"?`)) return;
      const lavori = state.lavori.filter(x=>x.id!==id);
      save('cm_lavori', lavori);
      setState({lavori});
    };
  });

  // Nuova delibera
  const bNuovaDelibera = document.getElementById('btn-nuova-delibera');
  if (bNuovaDelibera) bNuovaDelibera.onclick = () => setState({modal:{type:'delibera', data:null}});

  // Modifica delibera
  document.querySelectorAll('[data-edit-delibera]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editDelibera);
      const d = state.delibere.find(x=>x.id===id);
      if (d) setState({modal:{type:'delibera', data:{...d}}});
    };
  });

  // Elimina delibera
  document.querySelectorAll('[data-del-delibera]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.delDelibera);
      const d = state.delibere.find(x=>x.id===id);
      if (!d) return;
      if (!confirm(`Eliminare la delibera "${d.descrizioneSintetica}"?`)) return;
      const delibere = state.delibere.filter(x=>x.id!==id);
      save('cm_delibere', delibere);
      setState({delibere});
    };
  });

  // Edit fornitore
  document.querySelectorAll('[data-edit-fornitore]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.editFornitore);
      const f = state.fornitori.find(x=>x.id===id);
      if (f) setState({modal:{type:'fornitore', data:{...f}}});
    };
  });

  // Storico fornitore
  document.querySelectorAll('[data-storico-fornitore]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.storicoFornitore);
      const f = state.fornitori.find(x=>x.id===id);
      if (f) setState({modal:{type:'storico-fornitore', data:{...f}}});
    };
  });

  // Disabilita fornitore
  document.querySelectorAll('[data-disable-fornitore]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.disableFornitore);
      if (!confirm('Disabilitare questo fornitore? Rimarrà nello storico.')) return;
      const fornitori = state.fornitori.map(f=>f.id===id?{...f,disabled:true}:f);
      save('cm_fornitori', fornitori);
      setState({fornitori});
    };
  });

  // Riabilita fornitore
  document.querySelectorAll('[data-enable-fornitore]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.enableFornitore);
      const fornitori = state.fornitori.map(f=>f.id===id?{...f,disabled:false}:f);
      save('cm_fornitori', fornitori);
      setState({fornitori});
    };
  });

  // Elimina fornitore
  document.querySelectorAll('[data-del-fornitore]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.delFornitore);
      const f = state.fornitori.find(x=>x.id===id);
      if (!f) return;
      const myEdIdForn = getUserEdificio(state.user);
      const usato = state.spese.filter(s=>s.fornitoreId===id && (!s.edificioId||s.edificioId===myEdIdForn)).length;
      const msg = usato > 0
        ? `"${f.nome}" è associato a ${usato} spese. Eliminandolo le spese perderanno il riferimento. Procedere?`
        : `Eliminare definitivamente "${f.nome}"?`;
      if (!confirm(msg)) return;
      const fornitori = state.fornitori.filter(x=>x.id!==id);
      save('cm_fornitori', fornitori);
      setState({fornitori});
    };
  });

  // Copia IBAN
  document.querySelectorAll('[data-copy-iban]').forEach(btn => {
    btn.onclick = () => {
      navigator.clipboard.writeText(btn.dataset.copyIban).then(()=>{
        btn.textContent='✅';
        setTimeout(()=>btn.textContent='📋', 2000);
      });
    };
  });

  // Nuova categoria
  const bNuovaCat = document.getElementById('btn-nuova-cat');
  if (bNuovaCat) bNuovaCat.onclick = () => setState({modal:{type:'categoria', data:null}});

  // Edit categoria
  document.querySelectorAll('[data-edit-cat]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.editCat;
      const cat = getCategorie().find(c=>c.id===id);
      if (cat) setState({modal:{type:'categoria', data:{...cat}}});
    };
  });

  // Delete categoria
  document.querySelectorAll('[data-del-cat]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.delCat;
      const cat = getCategorie().find(c=>c.id===id);
      if (!cat) return;
      const usata = state.spese.filter(s=>s.categoria===id).length;
      const msg = usata > 0
        ? `La categoria "${cat.label}" è usata in ${usata} spese.\nEliminandola le spese manterranno l'ID ma non mostreranno il nome.\nProcedere?`
        : `Eliminare la categoria "${cat.label}"? L'operazione è irreversibile.`;
      if (!confirm(msg)) return;
      const cats = getCategorie().filter(c=>c.id!==id);
      saveCategorie(cats);
      setState({}); // re-render
    };
  });

  // Disabilita utente
  document.querySelectorAll('[data-disable-cond]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.disableCond);
      const cond = state.condomini.find(c=>c.id===id);
      if (cond) setState({modal:{type:'disable-cond', data:{...cond}}});
    };
  });

  // Riabilita utente
  document.querySelectorAll('[data-enable-cond]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.enableCond);
      if (!confirm('Riabilitare questo utente? Potrà tornare ad accedere al sistema.')) return;
      const condomini = state.condomini.map(c => c.id===id
        ? {...c, disabled:false, disabledOn:null, disabledNote:null}
        : c);
      save('cm_condomini', condomini);
      setState({condomini});
    };
  });

  // Elimina utente definitivamente
  document.querySelectorAll('[data-delete-cond]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.deleteCond);
      const cond = state.condomini.find(c=>c.id===id);
      if (!cond) return;
      const hasData = state.entrate.some(e=>e.condominoId===id) ||
                      state.spese.some(s=>s.split?.some(x=>x.id===id));
      const msg = hasData
        ? `⚠️ Attenzione: "${cond.nome}" ha versamenti o spese collegate.\n\nEliminando l'utente questi dati perderanno il riferimento (rimarranno nello storico senza nome).\n\nProcedere comunque con l'eliminazione definitiva?`
        : `Eliminare definitivamente "${cond.nome}"? Questa operazione è irreversibile.`;
      if (!confirm(msg)) return;
      const condomini = state.condomini.filter(c=>c.id!==id);
      save('cm_condomini', condomini);
      setState({condomini});
    };
  });

  // Admin reset password per condomino
  document.querySelectorAll('[data-admin-reset-pw]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.adminResetPw);
      const cond = state.condomini.find(c=>c.id===id);
      if (cond) setState({modal:{type:'admin-reset-pw', data:{...cond}}});
    };
  });

  // Admin change own password
  const bAdminOwnPw = document.getElementById('btn-admin-change-own-pw');
  if (bAdminOwnPw) bAdminOwnPw.onclick = () => setState({modal:{type:'change-pw'}});

  // Collega l'account Google a quello attuale (stesso uid, niente doppioni).
  // Dopo il collegamento l'accesso con Google eredita la 2FA di Google.
  const bLinkG = document.getElementById('btn-link-google');
  const gState = document.getElementById('google-link-state');
  const googleLinked = (window._fb?.auth?.currentUser?.providerData || []).some(p => p.providerId === 'google.com');
  if (googleLinked && gState) {
    gState.innerHTML = '✅ Account Google collegato. Puoi accedere con il pulsante “Accedi con Google”.';
    if (bLinkG) bLinkG.style.display = 'none';
  }
  if (bLinkG) bLinkG.onclick = async () => {
    if (!window._fb) return;
    bLinkG.disabled = true;
    try {
      const { auth, GoogleAuthProvider, linkWithPopup } = window._fb;
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const res = await linkWithPopup(auth.currentUser, provider);
      // L'email Google deve combaciare con quella dell'account: altrimenti il
      // login con Google porterebbe a un profilo diverso da quello atteso.
      const gEmail = res.user.providerData.find(p => p.providerId === 'google.com')?.email || '';
      if (gEmail.toLowerCase() !== (auth.currentUser.email || '').toLowerCase()) {
        alert('⚠️ Attenzione: hai collegato ' + gEmail + ', diverso dalla tua email ' + auth.currentUser.email + '. L\'accesso con Google potrebbe non riconoscerti. Scollega da Firebase Console se non voluto.');
      }
      alert('✅ Account Google collegato. Da ora puoi accedere con “Accedi con Google”.');
      setState({});
    } catch (e) {
      bLinkG.disabled = false;
      const code = e.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      alert(code === 'auth/credential-already-in-use'
        ? 'Questo account Google è già collegato a un altro profilo.'
        : (code === 'auth/provider-already-linked' ? 'Hai già collegato un account Google.' : ('Collegamento non riuscito: ' + (e.message || e))));
    }
  };

  // Toggle edit permission
  document.querySelectorAll('[data-toggle-edit]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.toggleEdit);
      const condomini = state.condomini.map(c=>c.id===id?{...c,canEdit:!c.canEdit}:c);
      save('cm_condomini', condomini);
      setState({condomini});
    };
  });

  // Reset
  bindOpsSection();

  const bBrand = document.getElementById('btn-save-branding');
  if (bBrand) bBrand.onclick = () => {
    if (!isSuperAdmin(state.user)) return;
    const nomeProdotto = (document.getElementById('br-nome')?.value || '').trim() || BRANDING_DEFAULT.nomeProdotto;
    const fornitore = (document.getElementById('br-fornitore')?.value || '').trim() || BRANDING_DEFAULT.fornitore;
    save('cm_branding', { nomeProdotto, fornitore });
    setState({});
  };

  const bResetCats = document.getElementById('btn-reset-cats');
  if (bResetCats) bResetCats.onclick = () => {
    if (!confirm('Ripristinare le categorie predefinite? Le categorie personalizzate verranno eliminate.')) return;
    saveCategorie(CATEGORIE_DEFAULT);
    setState({});
  };

  const bReset = document.getElementById('btn-reset');
  if (bReset) bReset.onclick = () => {
    if (!isSuperAdmin(state.user)) return;
    // QA: prima il reset azzerava i dati di TUTTI i condomini e sostituiva i
    // condomini registrati con 6 profili di esempio. Ora svuota solo i dati
    // operativi dell'edificio attivo; condomini e account restano.
    const edId = state.edificioAttivo;
    const edNome = (state.edifici.find(e => e.id === edId) || {nome: 'questo condominio'}).nome;
    if (!confirm(
      '⚠️ Svuotare i dati di "' + edNome + '"?\n\n' +
      'Verranno CANCELLATI per questo condominio:\n' +
      '• spese, versamenti e fornitori\n' +
      '• bacheca, verbali, lavori e delibere\n\n' +
      'Restano invariati: gli altri condomini, i condomini registrati e i loro account, le categorie.\n\n' +
      'Operazione NON reversibile (scarica prima il backup).\n\nProcedi?'
    )) return;

    // Seconda conferma — digita RESET
    const conferma = prompt('SECONDA CONFERMA\n\nDigita la parola RESET per svuotare i dati di "' + edNome + '".');
    if ((conferma||'').trim().toUpperCase() !== 'RESET') {
      alert('Operazione annullata: parola di conferma errata.');
      return;
    }

    const patch = {};
    [['cm_spese','spese'], ['cm_entrate','entrate'], ['cm_fornitori','fornitori'], ['cm_bacheca','bacheca'],
     ['cm_verbali','verbali'], ['cm_lavori','lavori'], ['cm_delibere','delibere']].forEach(([key, prop]) => {
      patch[prop] = state[prop].filter(r => r.edificioId !== edId);
      save(key, patch[prop]);
    });
    setState(patch);
    alert('✅ Dati di "' + edNome + '" svuotati.');
  };

  // Data-page quick links
  document.querySelectorAll('[data-page]').forEach(el => {
    if (!el.onclick) el.onclick = () => setState({page:el.dataset.page, sidebarOpen:false});
  });
}
