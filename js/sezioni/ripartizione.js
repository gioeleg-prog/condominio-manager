// Ripartizione delle spese tra i condomini (scheda spesa).
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// ===========================
// SPLIT LOGIC
// ===========================
// Nuove righe della ripartizione quando cambia la data della spesa (spesa nuova o senza ripartizione salvata).
// attuali: [{id, base, perc, locked}]. idsNuovi: chi abitava alla data. Chi esce dal gruppo ma ha una quota
// scritta a mano (bloccata) resta come riga a mano; gli altri escono. Chi entra parte da zero e le quote
// libere si ridividono sul residuo, quindi il totale resta 100% e le quote già inserite non si perdono.
function righeSplitPerData(attuali, idsNuovi) {
  const nuovi = new Set(idsNuovi);
  const out = [];
  attuali.forEach(r => {
    if (!r.base) out.push({ ...r });
    else if (nuovi.has(r.id)) out.push({ ...r });
    else if (r.locked) out.push({ ...r, base: false });
  });
  const presenti = new Set(out.map(r => r.id));
  idsNuovi.forEach(id => { if (!presenti.has(id)) out.push({ id, base: true, perc: 0, locked: false }); });
  const liberi = out.filter(r => r.base && !r.locked);
  if (liberi.length) {
    const fissi = out.filter(r => !(r.base && !r.locked)).reduce((a, r) => a + (r.perc || 0), 0);
    const cent = Math.max(0, Math.round((100 - fissi) * 100));
    liberi.forEach((r, i) => { r.perc = (Math.floor(cent / liberi.length) + (i < cent % liberi.length ? 1 : 0)) / 100; });
  }
  return out;
}

function bindSplit() {
  const tbody = document.getElementById('split-tbody');
  if (!tbody) return;

  const n = state.condomini.length;

  // ── helpers ──────────────────────────────────────────────────────────
  function getRef() {
    const cons = parseFloat(document.getElementById('m-cons')?.value||0);
    const prev = parseFloat(document.getElementById('m-prev')?.value||0);
    return cons > 0 ? cons : prev > 0 ? prev : 0;
  }

  // Lucchetto di una quota: simbolo, classe e stato per i lettori di schermo (aria-pressed, UXA-002) vanno sempre insieme.
  function impostaLucchetto(btn, bloccato) {
    btn.dataset.locked = bloccato ? '1' : '0';
    btn.textContent = bloccato ? '🔒' : '🔓';
    btn.classList.toggle('locked', bloccato);
    btn.setAttribute('aria-pressed', bloccato ? 'true' : 'false');
    btn.title = bloccato ? 'Quota bloccata: premi per sbloccarla' : 'Blocca questa quota';
  }
  // Messaggio per i lettori di schermo (regione role="status" accanto alla tabella).
  function annuncia(testo) {
    const el = document.getElementById('split-annuncio');
    if (el) el.textContent = testo;
  }
  const nomeDi = (cid) => state.condomini.find(c => String(c.id) === String(cid))?.nome || '';

  function getLocked() {
    const locked = {};
    document.querySelectorAll('.split-lock-btn').forEach(b => {
      if (b.dataset.locked === '1') locked[b.dataset.lockCid] = true;
    });
    return locked;
  }

  // Righe "di base" (chi abitava alla data): partecipano al ricalcolo automatico. Le altre (aggiunte a mano,
  // o di chi è uscito con una quota salvata) tengono la quota scritta.
  const isBase = (inp) => { const tr = inp.closest ? inp.closest('tr') : null; return !tr || tr.dataset.base !== '0'; };
  function cidsBase() {
    return [...document.querySelectorAll('.split-perc-inp')].filter(isBase).map(inp => inp.dataset.cid);
  }
  function cidsTutti() {
    return [...document.querySelectorAll('.split-perc-inp')].map(inp => inp.dataset.cid);
  }

  function getPercInputs() {
    const res = {};
    document.querySelectorAll('.split-perc-inp').forEach(inp => { res[inp.dataset.cid] = parseFloat(inp.value)||0; });
    return res;
  }

  function getEuroInputs() {
    const res = {};
    document.querySelectorAll('.split-euro-inp').forEach(inp => { res[inp.dataset.cid] = parseFloat(inp.value)||0; });
    return res;
  }

  function setPercInputs(map) {
    document.querySelectorAll('.split-perc-inp').forEach(inp => {
      if (map[inp.dataset.cid] !== undefined) inp.value = map[inp.dataset.cid].toFixed(2);
    });
  }

  function setEuroInputs(map) {
    document.querySelectorAll('.split-euro-inp').forEach(inp => {
      if (map[inp.dataset.cid] !== undefined) inp.value = map[inp.dataset.cid].toFixed(2);
    });
  }

  function updateTotals() {
    const percs = getPercInputs();
    const ref   = getRef();
    const total = Object.values(percs).reduce((a,v)=>a+(v||0), 0);
    const diff  = Math.abs(total - 100);

    const ptEl = document.getElementById('split-total-perc');
    if (ptEl) {
      ptEl.textContent = total.toFixed(2) + ' %';
      ptEl.style.color = diff > 0.05 ? 'var(--red)' : 'var(--green)';
    }
    const warn = document.getElementById('split-warn');
    if (warn) {
      if (diff > 0.05) {
        warn.style.display='block';
        warn.textContent = `⚠️ Le percentuali sommano ${total.toFixed(2)}% invece di 100%. Differenza: ${(total-100).toFixed(2)}%`;
      } else {
        warn.style.display='none';
      }
    }

    // Euro totale
    const euroRow = document.getElementById('split-total-euro-row');
    const euroEl  = document.getElementById('split-total-euro');
    if (ref > 0) {
      if (euroRow) euroRow.style.display='flex';
      if (euroEl)  euroEl.textContent = fmt(ref);
    } else {
      if (euroRow) euroRow.style.display='none';
    }

    // Barra colorata — solo condomini dell'edificio attivo (strict)
    const barEl = document.getElementById('split-bar');
    if (barEl) {
      const condBar = cidsTutti().map(cid => state.condomini.find(c => String(c.id) === cid)).filter(Boolean);
      barEl.innerHTML = condBar.map(c=>{
        const w = Math.max(0, Math.min(100, percs[String(c.id)]||0));
        return `<div class="split-bar-seg" style="width:${w}%;background:${coloreSicuro(c.color)};opacity:.8"></div>`;
      }).join('');
    }
  }

  // ── ricalcolo quando cambia una % ─────────────────────────────────────
  function onPercChange(changedCid) {
    const locked   = getLocked();
    const percs    = getPercInputs();
    const ref      = getRef();
    const allCids  = cidsBase();
    const freeCids = allCids.filter(cid => cid !== changedCid && !locked[cid]);
    // Quote che non si ricalcolano: righe bloccate e righe fuori dal gruppo di base.
    const lockedSum = cidsTutti().filter(cid => cid !== changedCid && (locked[cid] || !allCids.includes(cid)))
                             .reduce((a,cid)=>a+(percs[cid]||0), 0);
    const newVal   = percs[changedCid] || 0;
    const remaining = 100 - newVal - lockedSum;

    if (freeCids.length > 0) {
      const each = remaining / freeCids.length;
      const newPercs = {};
      freeCids.forEach(cid => newPercs[cid] = Math.max(0, each));
      setPercInputs(newPercs);
    }

    // Aggiorna euro
    if (ref > 0) {
      const allP = getPercInputs();
      const euroMap = {};
      allCids.forEach(cid => euroMap[cid] = (allP[cid]||0) / 100 * ref);
      setEuroInputs(euroMap);
    }
    updateTotals();
  }

  // ── ricalcolo quando cambia un € ─────────────────────────────────────
  function onEuroChange(changedCid) {
    const ref = getRef();
    if (ref <= 0) return; // senza importo non possiamo calcolare %
    const locked  = getLocked();
    const euros   = getEuroInputs();
    const allCids = cidsBase();
    const changedEuro = euros[changedCid] || 0;
    const changedPerc = (changedEuro / ref) * 100;

    // Aggiorna la % del campo cambiato
    const percMap = {};
    percMap[changedCid] = changedPerc;
    setPercInputs(percMap);

    // Ricalcola gli altri come se avessimo cambiato la %
    const lockedEuroSum = cidsTutti().filter(c => c !== changedCid && (locked[c] || !allCids.includes(c)))
                                 .reduce((a,cid)=>a+(euros[cid]||0), 0);
    const freeCids = allCids.filter(c => c !== changedCid && !locked[c]);
    const remaining = ref - changedEuro - lockedEuroSum;

    if (freeCids.length > 0) {
      const each = Math.max(0, remaining / freeCids.length);
      const eMap = {}, pMap = {};
      freeCids.forEach(cid => {
        eMap[cid] = each;
        pMap[cid] = (each / ref) * 100;
      });
      setEuroInputs(eMap);
      setPercInputs(pMap);
    }
    updateTotals();
  }

  // ── parti uguali ──────────────────────────────────────────────────────
  function equalSplit() {
    const ref  = getRef();
    // Solo le righe di base (chi abitava alla data); le righe a mano tengono la loro quota e si divide il residuo.
    const condAttivi = cidsBase().map(cid => ({ id: cid }));
    const percs0 = getPercInputs();
    const euros0 = getEuroInputs();
    const manuali = cidsTutti().filter(cid => !cidsBase().includes(cid));
    const centManuali = Math.round(manuali.reduce((a, cid) => a + (percs0[cid] || 0), 0) * 100);
    const eurManuali = Math.round(manuali.reduce((a, cid) => a + (euros0[cid] || 0), 0) * 100);
    const n    = condAttivi.length || 1;
    // QA: si ripartisce in centesimi e il resto va ai primi condomini, così
    // percentuali ed euro sommano esattamente a 100% e al totale (prima
    // 6 × 16,67% = 100,02%, cioè 6 € in più su 30.000 €).
    const parti = (totCent) => condAttivi.map((_, i) =>
      (Math.floor(totCent / n) + (i < totCent % n ? 1 : 0)) / 100);
    const percs = parti(Math.max(0, 10000 - centManuali));
    const euros = ref > 0 ? parti(Math.max(0, Math.round(ref * 100) - eurManuali)) : condAttivi.map(() => 0);
    const pMap = {}, eMap = {};
    condAttivi.forEach((c, i) => {
      pMap[String(c.id)] = percs[i];
      eMap[String(c.id)] = euros[i];
    });
    // sblocca tutti e aggiorna
    document.querySelectorAll('.split-lock-btn').forEach(b => impostaLucchetto(b, false));
    setPercInputs(pMap);
    setEuroInputs(eMap);
    updateTotals();
  }

  // ── event listeners ───────────────────────────────────────────────────
  // Si può richiamare dopo aver ridisegnato le righe: ogni controllo viene collegato una volta sola.
  function collegaRighe() {
    const blocca = (inp) => {
      // Quando l'utente scrive nel campo (non al semplice focus: attraversare la tabella con Tab non deve
      // bloccare nulla, UXA-003) la quota si blocca, così non viene sovrascritta dal ricalcolo, e lo si annuncia.
      const btn = document.querySelector(`.split-lock-btn[data-lock-cid="${inp.dataset.cid}"]`);
      if (btn && btn.dataset.locked !== '1') {
        impostaLucchetto(btn, true);
        annuncia('Quota di ' + nomeDi(inp.dataset.cid) + ' bloccata');
      }
    };
    document.querySelectorAll('.split-perc-inp').forEach(inp => {
      if (inp.dataset.legato) return; inp.dataset.legato = '1';
      inp.addEventListener('input', () => { blocca(inp); onPercChange(inp.dataset.cid); });
    });
    document.querySelectorAll('.split-euro-inp').forEach(inp => {
      if (inp.dataset.legato) return; inp.dataset.legato = '1';
      inp.addEventListener('input', () => { blocca(inp); onEuroChange(inp.dataset.cid); });
    });
    document.querySelectorAll('.split-lock-btn').forEach(btn => {
      btn.onclick = () => {
        const locked = btn.dataset.locked === '1';
        impostaLucchetto(btn, !locked);
        annuncia('Quota di ' + nomeDi(btn.dataset.lockCid) + (locked ? ' sbloccata' : ' bloccata'));
      };
    });
  }
  collegaRighe();

  // ── aggiunta a mano di un condomino (es. chi è uscito) ────────────────
  function aggiornaAggiungibili() {
    const sel = document.getElementById('split-aggiungi');
    const box = document.getElementById('split-aggiungi-box');
    if (!sel || !box) return;
    const presenti = new Set(cidsTutti());
    const altri = state.condomini.filter(c => c.edificioId === state.edificioAttivo && !c.superAdmin && !presenti.has(String(c.id)));
    sel.innerHTML = altri.map(c => `<option value="${c.id}">${esc(c.nome)}${c.appartamento ? ' · ' + esc(c.appartamento) : ''}${c.disabled ? ' (non più attivo)' : ''}</option>`).join('');
    box.style.display = altri.length ? 'flex' : 'none';
  }
  const btnAgg = document.getElementById('split-aggiungi-btn');
  if (btnAgg) btnAgg.onclick = () => {
    const id = document.getElementById('split-aggiungi')?.value;
    const c = state.condomini.find(x => String(x.id) === String(id) && x.edificioId === state.edificioAttivo);
    if (!c || cidsTutti().includes(String(c.id))) return;
    tbody.insertAdjacentHTML('beforeend', htmlRigaSplit(c, { id: c.id, perc: 0, locked: false }, false, getRef()));
    collegaRighe();
    aggiornaAggiungibili();
    updateTotals();
    // Il focus passa al campo della nuova riga (il pulsante può sparire con l'ultimo condomino aggiunto) e la
    // riga si annuncia (UXA-004). Sul telefono la colonna % è nascosta: si ripiega sul campo in euro.
    const nuovo = tbody.querySelector(`.split-perc-inp[data-cid="${c.id}"]`);
    const nuovoEuro = tbody.querySelector(`.split-euro-inp[data-cid="${c.id}"]`);
    if (nuovo) nuovo.focus();
    if (nuovoEuro && document.activeElement !== nuovo) nuovoEuro.focus();
    annuncia('Aggiunto ' + c.nome);
  };

  // ── cambio data: le righe seguono chi abitava alla data ───────────────
  if (tbody.dataset.segueData === '1') {
    document.getElementById('m-data')?.addEventListener('change', () => {
      const data = document.getElementById('m-data').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return;
      const idsNuovi = condominiAllaData(data).filter(c => c.edificioId === state.edificioAttivo).map(c => c.id);
      if (!idsNuovi.length) return;
      const percs = getPercInputs(), locked = getLocked();
      const attuali = [...document.querySelectorAll('.split-perc-inp')].map(inp => ({
        id: parseInt(inp.dataset.cid), base: isBase(inp), perc: percs[inp.dataset.cid] || 0, locked: !!locked[inp.dataset.cid] }));
      const righe = righeSplitPerData(attuali, idsNuovi);
      const ref = getRef();
      tbody.innerHTML = righe.map(r => {
        const c = state.condomini.find(x => x.id === r.id);
        return c ? htmlRigaSplit(c, r, r.base, ref) : '';
      }).join('');
      collegaRighe();
      aggiornaAggiungibili();
      updateTotals();
    });
  }

  // Spesa già salvata: cambiando la data le righe NON cambiano da sole (i conti salvati restano com'erano);
  // si avvisa l'amministratore che le quote non sono state ricalcolate.
  if (tbody.dataset.segueData === '0' && tbody.dataset.dataOriginale) {
    document.getElementById('m-data')?.addEventListener('change', () => {
      const av = document.getElementById('split-data-avviso');
      if (!av) return;
      const nuova = document.getElementById('m-data').value;
      av.style.display = nuova && nuova !== tbody.dataset.dataOriginale ? 'block' : 'none';
    });
  }

  const btnEqual = document.getElementById('split-equal');
  if (btnEqual) btnEqual.onclick = equalSplit;

  // ── millesimi (solo condomini che li hanno accesi: js/sezioni/millesimi.js) ──
  function applicaMillesimi(silenzioso) {
    const sel = document.getElementById('split-tabella');
    if (!sel) return;
    const data = document.getElementById('m-data')?.value || ymdLocale(new Date());
    const p = propostaMillesimi(sel.value, data);
    const nota = document.getElementById('split-mill-nota');
    if (!p) { if (!silenzioso) avvisa('⚠️ La tabella "' + (sel.selectedOptions[0]?.textContent || '') + '" non ha millesimi per chi abita nel condominio a quella data.'); return; }
    const ref = getRef();
    const pMap = {}, eMap = {};
    document.querySelectorAll('.split-perc-inp').forEach(inp => {
      const s = p.split.find(x => String(x.id) === inp.dataset.cid);
      pMap[inp.dataset.cid] = s ? s.perc : 0;
      eMap[inp.dataset.cid] = ref > 0 ? (s ? s.perc : 0) / 100 * ref : 0;
    });
    document.querySelectorAll('.split-lock-btn').forEach(b => impostaLucchetto(b, false));
    setPercInputs(pMap);
    if (ref > 0) setEuroInputs(eMap);
    updateTotals();
    sel.dataset.applicata = '1';
    if (nota) nota.textContent = 'Proposta dai millesimi, tabella "' + p.tabella.nome + '"' + (p.senza.length ? ' · senza millesimi: ' + p.senza.join(', ') : '') + (p.senzaRappresentante.length ? ' · manca il rappresentante di: ' + p.senzaRappresentante.join(', ') + ' (peso diviso tra i suoi condomini)' : '') + '. Puoi modificarla.';
  }
  const btnMill = document.getElementById('split-millesimi');
  if (btnMill) btnMill.onclick = () => applicaMillesimi(false);
  const selTab = document.getElementById('split-tabella');
  // Spesa nuova: se nessuna quota è stata toccata, la proposta segue categoria e data.
  // "Toccata" = una quota bloccata (scritta a mano) o una riga fuori dal gruppo di base con una quota (aggiunta a mano).
  const nonToccata = () => !([...document.querySelectorAll('.split-lock-btn')].some(b => b.dataset.locked === '1')
    || [...document.querySelectorAll('.split-perc-inp')].some(inp => !isBase(inp) && (parseFloat(inp.value) || 0) > 0));
  if (selTab && selTab.dataset.nuova === '1') {
    document.getElementById('m-cat')?.addEventListener('change', (e) => {
      if (!nonToccata()) return;
      selTab.value = tabellaPerCategoria(e.target.value);
      applicaMillesimi(true);
    });
    document.getElementById('m-data')?.addEventListener('change', () => {
      if (!nonToccata()) return;
      if (millesimiAttiviAlla(document.getElementById('m-data').value)) applicaMillesimi(true);
      else if (selTab.dataset.applicata === '1') {
        // Data prima dell'attivazione: come per i condomini senza millesimi, parti uguali.
        equalSplit();
        selTab.dataset.applicata = '0';
        const nota = document.getElementById('split-mill-nota');
        if (nota) nota.textContent = 'Data precedente all\'attivazione dei millesimi: parti uguali. Modifica % o € per ogni condomino.';
      }
    });
  }

  const btnResetLock = document.getElementById('split-reset-lock');
  if (btnResetLock) btnResetLock.onclick = () => {
    document.querySelectorAll('.split-lock-btn').forEach(b => impostaLucchetto(b, false));
    annuncia('Tutte le quote sbloccate');
  };

  // ── ricalcola euro quando cambiano gli importi ────────────────────────
  ['m-cons','m-prev'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      const ref = getRef();
      const percs = getPercInputs();
    const allCids = cidsTutti();
      if (ref > 0) {
        const eMap = {};
        allCids.forEach(cid => eMap[cid] = (percs[cid]||0)/100*ref);
        setEuroInputs(eMap);
      }
      updateTotals();
    });
  });

  // inizializza
  updateTotals();
}

// helper per leggere lo split dal DOM al salvataggio
function readSplitFromDOM() {
  const split = [];
  document.querySelectorAll('.split-perc-inp').forEach(inp => {
    const lockBtn = document.querySelector(`.split-lock-btn[data-lock-cid="${inp.dataset.cid}"]`);
    split.push({
      id: parseInt(inp.dataset.cid),
      perc: parseFloat(inp.value)||0,
      locked: lockBtn?.dataset?.locked === '1',
    });
  });
  // Le caselle hanno due decimali: se per arrotondamento il totale è tra 99,95%
  // e 100,05% (es. 6 × 16,67% = 100,02%) si riporta a 100,00% esatto togliendo
  // o aggiungendo un centesimo di punto alle quote più grandi.
  const cent = Math.round(split.reduce((a, s) => a + s.perc, 0) * 100) - 10000;
  if (cent !== 0 && Math.abs(cent) <= 5) {
    const ordine = split.filter(s => s.perc > 0).sort((a, b) => b.perc - a.perc);
    for (let i = 0; i < Math.abs(cent) && ordine.length; i++) {
      const s = ordine[i % ordine.length];
      s.perc = Math.round((s.perc - Math.sign(cent) * 0.01) * 100) / 100;
    }
  }
  return split;
}
