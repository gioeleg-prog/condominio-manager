// Ripartizione delle spese tra i condomini (scheda spesa).
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// ===========================
// SPLIT LOGIC
// ===========================
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

  function getLocked() {
    const locked = {};
    document.querySelectorAll('.split-lock-btn').forEach(b => {
      if (b.dataset.locked === '1') locked[b.dataset.lockCid] = true;
    });
    return locked;
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
      const condBar = state.condomini.filter(c=>c.edificioId===state.edificioAttivo&&!c.disabled&&!c.superAdmin);
      barEl.innerHTML = condBar.map(c=>{
        const w = Math.max(0, Math.min(100, percs[String(c.id)]||0));
        return `<div class="split-bar-seg" style="width:${w}%;background:${esc(c.color)};opacity:.8"></div>`;
      }).join('');
    }
  }

  // ── ricalcolo quando cambia una % ─────────────────────────────────────
  function onPercChange(changedCid) {
    const locked   = getLocked();
    const percs    = getPercInputs();
    const ref      = getRef();
    const allCids  = state.condomini.filter(c=>c.edificioId===state.edificioAttivo&&!c.disabled&&!c.superAdmin).map(c=>String(c.id));
    const freeCids = allCids.filter(cid => cid !== changedCid && !locked[cid]);
    const lockedSum = allCids.filter(cid => cid !== changedCid && locked[cid])
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
    const allCids = state.condomini.filter(c=>c.edificioId===state.edificioAttivo&&!c.disabled&&!c.superAdmin).map(c=>String(c.id));
    const changedEuro = euros[changedCid] || 0;
    const changedPerc = (changedEuro / ref) * 100;

    // Aggiorna la % del campo cambiato
    const percMap = {};
    percMap[changedCid] = changedPerc;
    setPercInputs(percMap);

    // Ricalcola gli altri come se avessimo cambiato la %
    const lockedEuroSum = allCids.filter(c => c !== changedCid && locked[c])
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
    // USA SOLO i condomini dell'edificio attivo (strict, no superAdmin)
    const condAttivi = state.condomini.filter(c =>
      c.edificioId === state.edificioAttivo && !c.disabled && !c.superAdmin
    );
    const n    = condAttivi.length || 1;
    // QA: si ripartisce in centesimi e il resto va ai primi condomini, così
    // percentuali ed euro sommano esattamente a 100% e al totale (prima
    // 6 × 16,67% = 100,02%, cioè 6 € in più su 30.000 €).
    const parti = (totCent) => condAttivi.map((_, i) =>
      (Math.floor(totCent / n) + (i < totCent % n ? 1 : 0)) / 100);
    const percs = parti(10000);
    const euros = ref > 0 ? parti(Math.round(ref * 100)) : condAttivi.map(() => 0);
    const pMap = {}, eMap = {};
    condAttivi.forEach((c, i) => {
      pMap[String(c.id)] = percs[i];
      eMap[String(c.id)] = euros[i];
    });
    // sblocca tutti e aggiorna
    document.querySelectorAll('.split-lock-btn').forEach(b => {
      b.dataset.locked = '0'; b.textContent = '🔓'; b.classList.remove('locked');
    });
    setPercInputs(pMap);
    setEuroInputs(eMap);
    updateTotals();
  }

  // ── event listeners ───────────────────────────────────────────────────
  document.querySelectorAll('.split-perc-inp').forEach(inp => {
    inp.addEventListener('focus', () => {
      // Al focus: blocca automaticamente questo campo così non viene sovrascritto dal ricalcolo
      const btn = document.querySelector(`.split-lock-btn[data-lock-cid="${inp.dataset.cid}"]`);
      if (btn && btn.dataset.locked !== '1') {
        btn.dataset.locked = '1';
        btn.textContent = '🔒';
        btn.classList.add('locked');
      }
    });
    inp.addEventListener('input', () => onPercChange(inp.dataset.cid));
  });
  document.querySelectorAll('.split-euro-inp').forEach(inp => {
    inp.addEventListener('focus', () => {
      // Al focus: blocca automaticamente questo campo
      const btn = document.querySelector(`.split-lock-btn[data-lock-cid="${inp.dataset.cid}"]`);
      if (btn && btn.dataset.locked !== '1') {
        btn.dataset.locked = '1';
        btn.textContent = '🔒';
        btn.classList.add('locked');
      }
    });
    inp.addEventListener('input', () => onEuroChange(inp.dataset.cid));
  });
  document.querySelectorAll('.split-lock-btn').forEach(btn => {
    btn.onclick = () => {
      const locked = btn.dataset.locked === '1';
      btn.dataset.locked = locked ? '0' : '1';
      btn.textContent = locked ? '🔓' : '🔒';
      btn.classList.toggle('locked', !locked);
    };
  });

  const btnEqual = document.getElementById('split-equal');
  if (btnEqual) btnEqual.onclick = equalSplit;

  const btnResetLock = document.getElementById('split-reset-lock');
  if (btnResetLock) btnResetLock.onclick = () => {
    document.querySelectorAll('.split-lock-btn').forEach(b => {
      b.dataset.locked = '0'; b.textContent = '🔓'; b.classList.remove('locked');
    });
  };

  // ── ricalcola euro quando cambiano gli importi ────────────────────────
  ['m-cons','m-prev'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      const ref = getRef();
      const percs = getPercInputs();
    const allCids = state.condomini.filter(c=>c.edificioId===state.edificioAttivo&&!c.disabled&&!c.superAdmin).map(c=>String(c.id));
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
