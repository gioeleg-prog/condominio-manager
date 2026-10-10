// Bilancio.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// ===========================
// BILANCIO
// ===========================
function renderBilancio() {
  const oggi    = new Date();
  // "Tutti gli anni" (0, scelto in Spese/Entrate) non ha senso per un bilancio
  // mensile con riporto: si mostra l'anno corrente (prima: tutto a zero, "· 0").
  const anno    = state.filterAnno || oggi.getFullYear();
  const meseCurr = oggi.getMonth();
  const anni    = getAnni();
  const tab     = state.bilancioTab || 'overview';
  // STRICT: solo condomini dell'edificio attivo
  const nAttivi = state.condomini
    .filter(c => c.edificioId === state.edificioAttivo && !c.disabled && !c.superAdmin).length || 1;


  const _bilSpese   = state.spese.filter(s=>s.edificioId===state.edificioAttivo);
  const _bilEntrate = state.entrate.filter(e=>e.edificioId===state.edificioAttivo);
  const spese   = _bilSpese.filter(s=>annoDi(s.data)===anno);
  const entrate = _bilEntrate.filter(e=>annoDi(e.data)===anno);
  const nomiMesi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

  // ── Separazione ACTUALS vs FORECAST ──────────────────────────────────────
  const speseActual   = spese.filter(s=>parseFloat(s.consuntivo||0)>0);
  const speseOnlyPrev = spese.filter(s=>parseFloat(s.consuntivo||0)===0 && parseFloat(s.preventivo||0)>0);
  const entrateActual   = entrate.filter(e=>!e.previsionale);
  const entratePrevis   = entrate.filter(e=>e.previsionale);

  // Totali ACTUAL (solo dati reali anno selezionato)
  const totCons         = speseActual.reduce((a,s)=>a+parseFloat(s.consuntivo||0),0);
  const totEntrateActual= entrateActual.reduce((a,e)=>a+parseFloat(e.importo||0),0);
  const saldoRiporto    = getSaldoRiporto(anno);   // riporto anni precedenti
  const saldoAnno       = totEntrateActual - totCons; // solo anno selezionato
  const saldo           = saldoRiporto + saldoAnno;  // cassa totale reale

  // Totali FORECAST aggiuntivi
  const totPrevForecast = speseOnlyPrev.reduce((a,s)=>a+parseFloat(s.preventivo||0),0);
  const totPrev         = spese.reduce((a,s)=>a+parseFloat(s.preventivo||0),0);
  const totEntratePrevis= entratePrevis.reduce((a,e)=>a+parseFloat(e.importo||0),0);
  const totEntrate      = totEntrateActual; // per compatibilità
  const scartoPrevCons  = totCons - totPrev;

  // Totali "full" = actual + forecast
  const totUsciteFull   = totCons + totPrevForecast;
  const totEntrateFull  = totEntrateActual + totEntratePrevis;
  const saldoFull       = totEntrateFull - totUsciteFull;

  // Cashflow mensile: reale mese per mese, forecast per mesi futuri O spese solo-preventivo
  const isCurrYear = anno === oggi.getFullYear();
  const isAnnoPassatoBil = anno < oggi.getFullYear();
  const isAnnoFuturoBil  = anno > oggi.getFullYear();
  // Mesi già trascorsi nell'anno scelto: tutti per un anno passato, nessuno per un anno futuro.
  const mesiPassati = isCurrYear ? meseCurr + 1 : isAnnoPassatoBil ? 12 : 0;
  const mediaUsciteActual = mesiPassati > 0 ? totCons / mesiPassati : 0;

  const cfMensile = Array.from({length:12}, (_,m) => {
    // Prima mancava la condizione sull'anno corrente: in un anno futuro i mesi
    // fino a quello di oggi risultavano "passati".
    const isPast    = isAnnoPassatoBil || (isCurrYear && m <= meseCurr);
    const isCurrent = isCurrYear && m === meseCurr;
    const speseM      = spese.filter(s=>new Date(s.data).getMonth()===m);
    const entrateM    = entrate.filter(e=>new Date(e.data).getMonth()===m);
    const consActual  = speseM.filter(s=>parseFloat(s.consuntivo||0)>0).reduce((a,s)=>a+parseFloat(s.consuntivo||0),0);
    const prevForecast= speseM.filter(s=>parseFloat(s.consuntivo||0)===0 && parseFloat(s.preventivo||0)>0).reduce((a,s)=>a+parseFloat(s.preventivo||0),0);
    const incActual   = entrateM.filter(e=>!e.previsionale).reduce((a,e)=>a+parseFloat(e.importo||0),0);
    const incPrevis   = entrateM.filter(e=>e.previsionale).reduce((a,e)=>a+parseFloat(e.importo||0),0);
    return {
      mese: nomiMesi[m], m, isPast, isCurrent,
      cons:       consActual,
      prevForecast,
      incassi:    incActual,
      incPrevis,
      totUscite:  consActual + prevForecast,
      totIncassi: incActual + incPrevis,
      isForecast: !isPast && !isAnnoPassatoBil,
    };
  });

  const mediaUscite  = mediaUsciteActual;
  const mediaIncassi = mesiPassati > 0 ? totEntrateActual / mesiPassati : 0;

  // Saldo cumulativo — parte dal riporto anni precedenti
  let cumulActual = saldoRiporto;
  // La curva con le previsioni di un anno futuro parte dal saldo stimato a inizio anno.
  let cumulFull   = isAnnoFuturoBil ? getSaldoStimatoInizioAnno(anno).stimato : saldoRiporto;
  const cfCumul = cfMensile.map(cf => {
    cumulActual += cf.incassi - cf.cons;
    cumulFull   += cf.totIncassi - cf.totUscite;
    return {...cf, cumul: cumulActual, cumulFull};
  });

  // Mese in cui la cassa va a zero — simulazione a partire dal saldo REALE attuale (non da
  // saldoFull, che netta già l'intero forecast dell'anno: sottrarlo di nuovo mese per mese
  // qui sotto lo conterebbe due volte, anticipando falsamente la rottura di cassa).
  // Le spese previsionali ANCORA APERTE datate nel mese corrente o prima (scadute o comunque
  // imminenti, ma non ancora consuntivate) vengono scalate súbito, non ignorate: altrimenti
  // resterebbero fuori sia dal saldo (che include solo il consuntivato) sia dalla simulazione
  // mese per mese (che parte dal mese prossimo per non ricontare due volte quelle già chiuse).
  // Solo nell'anno corrente: in un anno futuro i mesi fino a quello di oggi non
  // sono "arretrati" e la simulazione qui sotto li conta già (prima venivano
  // sottratti due volte, con un falso allarme "cassa a zero già questo mese").
  const speseArretrateAperteBil = !isCurrYear ? 0 :
    cfMensile.slice(0, meseCurr + 1).reduce((a, cf) => a + cf.prevForecast, 0);
  // Anno futuro: si parte dal saldo stimato a inizio anno (cassa di oggi più ciò
  // che resta da pagare e incassare prima), non dalla sola cassa di oggi.
  const stimaInizioBil = getSaldoStimatoInizioAnno(anno);
  const saldoInizioSim = isAnnoFuturoBil ? stimaInizioBil.stimato : saldo;
  // Prima riga della tabella mese per mese: riporto reale, o saldo stimato per un anno futuro.
  const saldoInizioRiga = isAnnoFuturoBil ? saldoInizioSim : saldoRiporto;
  let meseZero = speseArretrateAperteBil > 0 && (saldo - speseArretrateAperteBil) <= 0 ? meseCurr : null;
  let saldoSim = saldoInizioSim - speseArretrateAperteBil;
  let minBalAnno = saldoSim;
  let usciteForecastAnno = speseArretrateAperteBil;
  const meseInizioSimBil = isAnnoPassatoBil ? 12 : (anno === oggi.getFullYear() ? meseCurr + 1 : 0);
  for (let m = meseInizioSimBil; m < 12; m++) {
    usciteForecastAnno += cfMensile[m].prevForecast;
    saldoSim += cfMensile[m].incPrevis - cfMensile[m].prevForecast;
    if (saldoSim < minBalAnno) minBalAnno = saldoSim;
    if (saldoSim <= 0 && meseZero === null) meseZero = m;
  }

  // Runway coerente con la stessa simulazione: se il saldo non scende mai sotto zero da qui a
  // fine anno è "coperto" (99 = mostrato come >12 mesi); altrimenti sono i mesi da oggi al
  // momento in cui si prevede la rottura — non più una media storica proiettata alla cieca.
  // Mesi da oggi: per un anno futuro si contano anche i mesi che mancano alla fine dell'anno corrente.
  const mesiDaOggiA = (m) => (anno - oggi.getFullYear()) * 12 + m - meseCurr;
  const runwayMesi = saldoInizioSim <= 0 ? 0 : meseZero !== null ? Math.max(1, mesiDaOggiA(meseZero)) : 99;
  const maxCF = Math.max(...cfMensile.map(cf=>Math.max(cf.totUscite, cf.totIncassi, 1)), 1);

  // Categorie breakdown
  const catBreak = getCategorie().filter(c=>c.tipo!=='entrata').map(c=>{
    const spesecat  = spese.filter(s=>s.categoria===c.id);
    const totCons   = spesecat.reduce((a,s)=>a+parseFloat(s.consuntivo||0),0);
    const totFcst   = spesecat.filter(s=>!parseFloat(s.consuntivo||0)).reduce((a,s)=>a+parseFloat(s.preventivo||0),0);
    const totPrev   = spesecat.reduce((a,s)=>a+parseFloat(s.preventivo||0),0);
    const nCons     = spesecat.filter(s=>parseFloat(s.consuntivo||0)>0).length;
    const nFcst     = spesecat.filter(s=>!parseFloat(s.consuntivo||0) && parseFloat(s.preventivo||0)>0).length;
    return {...c, totCons, totFcst, totPrev, tot:totCons+totFcst, nCons, nFcst};
  }).filter(c=>c.tot>0).sort((a,b)=>b.tot-a.tot);

  // KPI per condomino — distingue actual da previsionale
  // STRICT: solo condomini con edificioId esatto dell'edificio attivo
  const condominiKPI = state.condomini
    .filter(c => c.edificioId === state.edificioAttivo && !c.disabled && !c.superAdmin)
    .map(c=>{
    const versato       = entrate.filter(e=>e.condominoId===c.id && !e.previsionale).reduce((a,e)=>a+parseFloat(e.importo||0),0);
    const versatoPrevis = entrate.filter(e=>e.condominoId===c.id &&  e.previsionale).reduce((a,e)=>a+parseFloat(e.importo||0),0);
    // Quota ACTUAL: solo consuntivo — coerente con totSpeseCons e quotaPersonale dashboard
    const quota = spese.reduce((acc,s)=>{
      const ref = parseFloat(s.consuntivo||0);
      if (!ref) return acc;
      if (s.split?.length) {
        const entry = s.split.find(x=>x.id===c.id);
        return acc + (entry?(entry.perc||0)/100*ref : ref/nAttivi);
      }
      return acc + ref/nAttivi;
    }, 0);
    // Quota FULL: consuntivo + preventivi aperti (per il forecast)
    const quotaFull = spese.reduce((acc,s)=>{
      const ref = parseFloat(s.consuntivo||s.preventivo||0);
      if (!ref) return acc;
      if (s.split?.length) {
        const entry = s.split.find(x=>x.id===c.id);
        return acc + (entry?(entry.perc||0)/100*ref : ref/nAttivi);
      }
      return acc + ref/nAttivi;
    }, 0);
    const diff = versato - quota;
    const perc = quota > 0 ? Math.min(100, Math.round(versato/quota*100)) : 0;
    const nSpese = spese.filter(s=>s.split?.some(x=>x.id===c.id)||(!s.split?.length)).length;
    const versatoFull = versato + versatoPrevis;
    const diffFull = versatoFull - quota;
    const percFull = quota > 0 ? Math.min(100, Math.round(versatoFull/quota*100)) : 0;
    const diffFull2 = versatoFull - quotaFull;
    const percFull2 = quotaFull > 0 ? Math.min(100, Math.round(versatoFull/quotaFull*100)) : 0;
    return {...c, versato, versatoPrevis, versatoFull, quota, quotaFull, diff, perc, diffFull:diffFull2, percFull:percFull2, nSpese};
  });

  const TABS = [
    {id:'overview',  label:'📊 Panoramica'},
    {id:'forecast',  label:'🔮 Forecast'},
    {id:'prevcons',  label:'⚖️ Prev. vs Cons.'},
    {id:'condomini', label:'👥 Per condomino'},
    {id:'categorie', label:'🏷️ Per categoria'},
  ];

  // ── RENDER TABS ──────────────────────────────────────────────────────────
  const tabHtml = `
  <div class="bil-tabs">
    ${TABS.map(t=>`<button class="bil-tab ${tab===t.id?'active':''}" data-tab="${t.id}">${t.label}</button>`).join('')}
  </div>`;

  // ── TAB: PANORAMICA ───────────────────────────────────────────────────────
  function tabOverview() {
    const alertStatus = saldo < 0 ? 'critical' : meseZero !== null ? 'warn' : 'ok';
    const meseZeroLabelBil = isCurrYear && meseZero === meseCurr ? 'già questo mese' : 'a ' + nomiMesi[meseZero] + (isCurrYear ? '' : ' ' + anno);
    // Per un anno futuro il riferimento è il saldo stimato a inizio anno, non la cassa di oggi.
    const saldoRif = isAnnoFuturoBil ? `il saldo stimato a inizio ${anno} (${fmt(saldoInizioSim)})` : `il saldo attuale (${fmt(saldo)})`;
    const alertMsg = saldoInizioSim < 0
      ? `⚠️ ${isAnnoFuturoBil ? 'Saldo stimato a inizio ' + anno + ' negativo' : 'Saldo negativo'} di ${fmt(Math.abs(saldoInizioSim))}`
      : meseZero !== null
      ? `⚠️ ${saldoRif.charAt(0).toUpperCase() + saldoRif.slice(1)} non basta a coprire le spese previsionali dell'anno: rischio di andare sotto zero ${meseZeroLabelBil}, minimo previsto ${fmt(minBalAnno)}`
      : usciteForecastAnno > 0
      ? `✅ Anno ${anno} coperto — ${saldoRif} copre le spese previsionali dell'anno (${fmt(usciteForecastAnno)}), restando sempre sopra zero (minimo previsto ${fmt(minBalAnno)})`
      : `✅ Situazione stabile — nessuna spesa previsionale ancora da coprire`;

    return `
    <!-- ACTUALS -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:.5rem">
      <span class="bil-actual-label">▌ ACTUALS — Solo dati reali confermati</span>
    </div>
    <div class="kpi-strip" style="margin-bottom:.875rem">
      <div class="kpi-card kpi-green"><div class="kpi-label">Entrate effettive</div><div class="kpi-value" style="color:var(--green)">${fmt(totEntrateActual)}</div><div class="kpi-sub">${entrateActual.length} versamenti</div></div>
      <div class="kpi-card kpi-red"><div class="kpi-label">Uscite consuntivate</div><div class="kpi-value" style="color:var(--red)">${fmt(totCons)}</div><div class="kpi-sub">${speseActual.length} spese chiuse</div></div>
      <div class="kpi-card ${saldo>=0?'kpi-green':'kpi-red'}">
        <div class="kpi-label">Saldo reale</div>
        <div class="kpi-value" style="color:${saldo>=0?'var(--green)':'var(--red)'}">${fmt(saldo)}</div>
        <div class="kpi-trend ${saldo>=0?'down':'up'}">${saldo>=0?'▲ Positivo':'▼ Deficit'}</div>
        ${saldoRiporto!==0?`<div style="font-size:10px;color:var(--text2);margin-top:2px">Anno: ${fmt(saldoAnno)} · Riporto: <span style="color:${saldoRiporto>=0?'var(--green)':'var(--red)'}">${saldoRiporto>=0?'+':''}${fmt(saldoRiporto)}</span></div>`:''}
      </div>
      <div class="kpi-card kpi-blue"><div class="kpi-label">Quota media / cond.</div><div class="kpi-value" style="color:var(--accent)">${fmt(totCons/nAttivi)}</div><div class="kpi-sub">Media su ${nAttivi} condomini</div></div>
    </div>

    <!-- ACTUALS + FORECAST -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:.5rem">
      <span class="bil-forecast-label">▌ ACTUALS + FORECAST — Include tutti i previsionali</span>
    </div>
    <div class="kpi-strip" style="margin-bottom:1rem">
      <div class="kpi-card" style="border-top:3px solid #7c3aed"><div class="kpi-label">Entrate (incl. prev.)</div><div class="kpi-value" style="color:#7c3aed">${fmt(totEntrateFull)}</div><div class="kpi-sub">+${fmt(totEntratePrevis)} previsionali</div></div>
      <div class="kpi-card" style="border-top:3px solid #7c3aed"><div class="kpi-label">Uscite (incl. prev.)</div><div class="kpi-value" style="color:#7c3aed">${fmt(totUsciteFull)}</div><div class="kpi-sub">+${fmt(totPrevForecast)} da consuntivare</div></div>
      <div class="kpi-card" style="border-top:3px solid #7c3aed"><div class="kpi-label">Saldo proiettato</div><div class="kpi-value" style="color:${saldoFull>=0?'#7c3aed':'var(--red)'}">${fmt(saldoFull)}</div><div class="kpi-sub">Con tutti i previsionali</div></div>
      <div class="kpi-card kpi-amber"><div class="kpi-label">Runway stimato</div><div class="kpi-value" style="color:${runwayMesi===0?'var(--red)':'var(--amber)'};">${runwayMesi>11?'>12':runwayMesi} mesi</div><div class="kpi-sub">${meseZero!==null?'cassa a zero a '+nomiMesi[meseZero]:'coperto fino a fine '+anno+' · min. '+fmt(minBalAnno)}</div></div>
    </div>

    <div class="cf-zero-warn ${alertStatus}" style="margin-bottom:1rem">${alertMsg}</div>

    <!-- RIPORTO ANNI PRECEDENTI -->
    ${saldoRiporto !== 0 ? `
    <div style="display:flex;align-items:center;gap:12px;background:${saldoRiporto>=0?'#f0fdf4':'#fef2f2'};border:1px solid ${saldoRiporto>=0?'#bbf7d0':'#fecaca'};border-radius:var(--radius-sm);padding:.75rem 1rem;margin-bottom:1rem;font-size:13px;flex-wrap:wrap">
      <div style="font-size:20px">${saldoRiporto>=0?'📥':'📤'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600">Riporto anni precedenti (fino al ${anno-1})</div>
        <div style="font-size:12px;color:var(--text2);margin-top:2px">
          ${isAnnoFuturoBil
            ? `Cassa reale di oggi (movimenti già avvenuti). Saldo stimato a inizio ${anno}: <strong>${fmt(stimaInizioBil.stimato)}</strong>, dopo ${fmt(stimaInizioBil.speseAperte)} di spese ancora da consuntivare e ${fmt(stimaInizioBil.entratePreviste)} di versamenti previsti prima del ${anno}`
            : `Saldo cumulativo di tutti gli anni prima del ${anno} · Anno corrente: ${fmt(saldoAnno)} · Totale cassa: ${fmt(saldo)}`}
        </div>
      </div>
      <div style="font-weight:800;font-size:1.2rem;color:${saldoRiporto>=0?'var(--green)':'var(--red)'}">${saldoRiporto>=0?'+':''}${fmt(saldoRiporto)}</div>
    </div>` : `
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:.5rem 1rem;margin-bottom:1rem;font-size:12px;color:var(--text2)">
      📋 Nessun riporto da anni precedenti · Il saldo parte da €0,00
    </div>`}

    <!-- GRAFICO: barre sovrapposte actual + forecast -->
    <div class="cf-chart">
      <div class="cf-chart-title">Andamento mensile ${anno}</div>
      <div class="cf-chart-sub">🟢 Actual · 🟣 Forecast previsionali · 🔴 Uscite consuntivate</div>
      <div class="cf-bars" tabindex="0" role="region" aria-label="Grafico flusso di cassa">
        ${cfCumul.map(cf=>{
          const hIA = Math.round(cf.incassi/maxCF*100);
          const hIP = Math.round(cf.incPrevis/maxCF*100);
          const hCA = Math.round(cf.cons/maxCF*100);
          const hCP = Math.round(cf.prevForecast/maxCF*100);
          const sm  = cf.totIncassi - cf.totUscite;
          return `<div class="cf-col">
            <div class="cf-col-saldo" style="color:${sm>=0?'#7c3aed':'var(--red)'}">${sm>=0?'+':''}${Math.round(sm/1000)}k</div>
            <div class="cf-col-bars">
              <div style="display:flex;flex-direction:column;align-items:center">
                <div class="cf-bar" style="height:${hIP}px;background:#7c3aed;opacity:.7;width:14px" title="Entrate prev. ${fmt(cf.incPrevis)}"></div>
                <div class="cf-bar" style="height:${hIA}px;background:var(--green);opacity:.85;width:14px" title="Entrate reali ${fmt(cf.incassi)}"></div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:center">
                <div class="cf-bar" style="height:${hCP}px;background:#a78bfa;opacity:.7;width:14px" title="Uscite prev. ${fmt(cf.prevForecast)}"></div>
                <div class="cf-bar" style="height:${hCA}px;background:var(--red);opacity:.85;width:14px" title="Uscite reali ${fmt(cf.cons)}"></div>
              </div>
            </div>
            <div class="cf-col-label" style="font-weight:${cf.isCurrent?700:400};color:${cf.isCurrent?'var(--accent)':'var(--text2)'}">${cf.mese}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="cf-legend">
        <div class="cf-legend-item"><div class="cf-legend-dot" style="background:var(--green)"></div>Entrate reali</div>
        <div class="cf-legend-item"><div class="cf-legend-dot" style="background:#7c3aed"></div>Entrate previsionali</div>
        <div class="cf-legend-item"><div class="cf-legend-dot" style="background:var(--red)"></div>Uscite reali</div>
        <div class="cf-legend-item"><div class="cf-legend-dot" style="background:#a78bfa"></div>Uscite da consuntivare</div>
      </div>
    </div>`;
  }

  // ── TAB: FORECAST ─────────────────────────────────────────────────────────
  function tabForecast() {
    // Solo spese con preventivo e SENZA consuntivo = non ancora consuntivate
    const speseToForecast = speseOnlyPrev;
    const totForecastUscite  = speseToForecast.reduce((a,s)=>a+parseFloat(s.preventivo||0),0);
    const totForecastEntrate = totEntratePrevis;
    const saldoConForecast   = saldo + totForecastEntrate - totForecastUscite;
    return `
    <div class="alert" style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:var(--radius-sm);padding:.75rem 1rem;margin-bottom:1rem;font-size:13px;color:#5b21b6">
      🔮 Il forecast include: <strong>${speseToForecast.length} spese</strong> con solo preventivo (non consuntivate) e <strong>${entratePrevis.length} versamenti</strong> previsionali.
      ${saldoRiporto!==0?`<br>📥 Riporto anni precedenti incluso: <strong>${saldoRiporto>=0?'+':''}${fmt(saldoRiporto)}</strong>`:''}
    </div>
    <div class="kpi-strip" style="margin-bottom:1rem">
      <div class="kpi-card ${saldo>=0?'kpi-green':'kpi-red'}">
        <div class="kpi-label">Saldo reale ora</div>
        <div class="kpi-value" style="color:${saldo>=0?'var(--green)':'var(--red)'}">${fmt(saldo)}</div>
        <div class="kpi-sub">
          Anno ${anno}: ${fmt(saldoAnno)}
          ${saldoRiporto!==0?`<br>Riporto: ${saldoRiporto>=0?'+':''}${fmt(saldoRiporto)}`:''}
        </div>
      </div>
      <div class="kpi-card" style="border-top:3px solid #7c3aed"><div class="kpi-label">Uscite da consuntivare</div><div class="kpi-value" style="color:#7c3aed">${fmt(totForecastUscite)}</div><div class="kpi-sub">${speseToForecast.length} spese aperte</div></div>
      <div class="kpi-card" style="border-top:3px solid #7c3aed"><div class="kpi-label">Entrate previsionali</div><div class="kpi-value" style="color:#7c3aed">${fmt(totForecastEntrate)}</div><div class="kpi-sub">${entratePrevis.length} versamenti attesi</div></div>
      <div class="kpi-card ${saldoConForecast>=0?'kpi-green':'kpi-red'}"><div class="kpi-label">Saldo proiettato</div><div class="kpi-value" style="color:${saldoConForecast>=0?'var(--green)':'var(--red)'}">${fmt(saldoConForecast)}</div><div class="kpi-sub">Dopo tutti i previsionali</div></div>
    </div>

    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-header"><h3>📅 Cashflow mese per mese — Actual + Forecast ${anno}</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Mese</th>
            <th style="color:var(--green)">Entrate reali</th>
            <th style="color:#7c3aed">Ent. previsionali</th>
            <th style="color:var(--red)">Uscite reali</th>
            <th style="color:#7c3aed">Uscite da cons.</th>
            <th>Saldo mese</th><th>Cassa cumulativa</th>
          </tr></thead>
          <tbody>
          <tr style="background:#f0fdf4;font-weight:600">
            <td colspan="2" style="color:var(--green)">
              ${isAnnoFuturoBil
                ? `Saldo stimato a inizio ${anno}`
                : saldoRiporto!==0
                ? `Riporto anni precedenti`
                : `Inizio anno (nessun riporto)`}
            </td>
            <td></td><td></td><td></td>
            <td style="color:${saldoInizioRiga>=0?'var(--green)':'var(--red)'}">${saldoInizioRiga>=0?'+':''}${fmt(saldoInizioRiga)}</td>
            <td style="color:${saldoInizioRiga>=0?'var(--green)':'var(--red)'};font-weight:700">${fmt(saldoInizioRiga)}</td>
          </tr>
          ${cfCumul.map((cf,i)=>{
            const hasData = cf.incassi>0||cf.cons>0||cf.incPrevis>0||cf.prevForecast>0;
            const sm = cf.totIncassi - cf.totUscite;
            const hasForecast = cf.incPrevis>0||cf.prevForecast>0;
            const rowClass = hasForecast ? 'forecast-row-future' : cf.isCurrent ? 'forecast-row-current' : '';
            const statoIcon = cf.cumulFull < 0 ? '🔴' : cf.cumulFull < mediaUscite ? '🟡' : '🟢';
            return `<tr class="${rowClass}">
              <td style="font-weight:${cf.isCurrent?700:400};white-space:nowrap">
                ${cf.mese}${cf.isCurrent?'<span class="badge badge-blue" style="font-size:9px;margin-left:4px">oggi</span>':''}
              </td>
              <td class="amount-pos">${cf.incassi>0?fmt(cf.incassi):'—'}</td>
              <td style="color:#7c3aed;font-weight:500">${cf.incPrevis>0?fmt(cf.incPrevis):'—'}</td>
              <td class="amount-neg">${cf.cons>0?fmt(cf.cons):'—'}</td>
              <td style="color:#7c3aed;font-weight:500">${cf.prevForecast>0?fmt(cf.prevForecast):'—'}</td>
              <td style="font-weight:600;color:${sm>=0?'var(--green)':'var(--red)'}">${hasData?(sm>=0?'+':'')+fmt(sm):'—'}</td>
              <td style="font-weight:700;color:${cf.cumulFull>=0?'var(--text)':'var(--red)'}">${fmt(cf.cumulFull)}</td>
            </tr>`;
          }).join('')}
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid var(--border);font-weight:700">
              <td>Totale anno</td>
              <td class="amount-pos">${fmt(totEntrateActual)}</td>
              <td style="color:#7c3aed">${fmt(totEntratePrevis)}</td>
              <td class="amount-neg">${fmt(totCons)}</td>
              <td style="color:#7c3aed">${fmt(totPrevForecast)}</td>
              <td style="color:${saldoFull>=0?'var(--green)':'var(--red)'};font-weight:700">${saldoFull>=0?'+':''}${fmt(saldoFull)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div class="runway-card">
      <div style="font-weight:700;font-size:15px;margin-bottom:.25rem">🗓️ Visualizzazione cassa mese per mese</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:.875rem">Proiezione basata sulla media storica per i mesi futuri</div>
      <div class="runway-months">
        ${cfCumul.map(cf=>{
          let cls = cf.isForecast ? 'future' : cf.cumul>0 ? (cf.cumul<mediaUscite*0.5?'warning':'positive') : 'negative';
          const ico = cf.isForecast ? '?' : cf.cumul>0 ? (cf.cumul<mediaUscite*0.5?'⚠':'✓') : '✗';
          return `<div class="runway-month">
            <div class="runway-dot ${cls}" title="${cf.mese}: ${fmt(cf.cumul)}">${ico}</div>
            <div class="runway-month-label">${cf.mese}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  // ── TAB: PREVENTIVO VS CONSUNTIVO ─────────────────────────────────────────
  function tabPrevCons() {
    const soloConsPuro = spese.filter(s=>parseFloat(s.consuntivo||0)>0);
    const soloPrePuro  = spese.filter(s=>parseFloat(s.preventivo||0)>0 && !parseFloat(s.consuntivo||0));
    const entrambi     = spese.filter(s=>parseFloat(s.preventivo||0)>0 && parseFloat(s.consuntivo||0)>0);

    const maxBar = Math.max(totPrev, totCons, 1);
    const pPrev = Math.round(totPrev/maxBar*100);
    const pCons = Math.round(totCons/maxBar*100);

    return `
    <div class="kpi-strip" style="margin-bottom:1.25rem">
      <div class="kpi-card kpi-amber"><div class="kpi-label">Totale preventivo</div><div class="kpi-value" style="color:var(--amber)">${fmt(totPrev)}</div><div class="kpi-sub">Stima iniziale</div></div>
      <div class="kpi-card kpi-red"><div class="kpi-label">Totale consuntivo</div><div class="kpi-value" style="color:var(--red)">${fmt(totCons)}</div><div class="kpi-sub">Importo definitivo</div></div>
      <div class="kpi-card ${scartoPrevCons<=0?'kpi-green':'kpi-red'}"><div class="kpi-label">Scarto</div><div class="kpi-value" style="color:${scartoPrevCons>0?'var(--red)':'var(--green)'};font-size:1.1rem">${scartoPrevCons>0?'+':''}${fmt(scartoPrevCons)}</div><div class="kpi-sub">${scartoPrevCons>0?'Sforato preventivo':'Risparmiato'}</div></div>
      <div class="kpi-card kpi-blue"><div class="kpi-label">% consuntivate</div><div class="kpi-value" style="color:var(--accent)">${spese.length?Math.round(soloConsPuro.length/spese.length*100):0}%</div><div class="kpi-sub">${soloConsPuro.length} su ${spese.length} spese definitive</div></div>
    </div>

    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-header"><h3>Confronto visivo preventivo vs consuntivo</h3></div>
      <div style="padding:1.25rem">
        <div style="margin-bottom:1rem">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span style="color:var(--amber);font-weight:600">Preventivo</span><span style="font-weight:600">${fmt(totPrev)}</span></div>
          <div class="pvc-bar"><div class="pvc-prev" style="width:${pPrev}%"></div></div>
        </div>
        <div style="margin-bottom:1rem">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span style="color:var(--red);font-weight:600">Consuntivo</span><span style="font-weight:600">${fmt(totCons)}</span></div>
          <div class="pvc-bar"><div class="pvc-cons" style="width:${pCons}%"></div></div>
        </div>
        <div style="display:flex;gap:1.5rem;font-size:13px;flex-wrap:wrap;padding-top:.75rem;border-top:1px solid var(--border)">
          <div>📋 <strong>${entrambi.length}</strong> spese con entrambi</div>
          <div>🔮 <strong>${soloPrePuro.length}</strong> solo preventivo (da chiudere)</div>
          <div>✅ <strong>${soloConsPuro.length}</strong> solo consuntivo</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>Dettaglio spese — preventivo vs consuntivo</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Titolo</th><th>Categoria</th><th>Preventivo</th><th>Consuntivo</th><th>Scarto</th><th>Stato</th></tr></thead>
          <tbody>
          ${[...spese].sort((a,b)=>new Date(b.data)-new Date(a.data)).map(s=>{
            const cat   = getCategorie().find(c=>c.id===s.categoria)||{label:s.categoria||'—',icon:'📦'};
            const prev  = parseFloat(s.preventivo||0);
            const cons  = parseFloat(s.consuntivo||0);
            const scarto = cons - prev;
            const hasPrev = prev > 0;
            const hasCons = cons > 0;
            return `<tr>
              <td style="font-size:12px;white-space:nowrap">${esc(s.data)}</td>
              <td style="font-weight:500;font-size:13px">${esc(s.titolo)}</td>
              <td><span class="badge badge-gray" style="font-size:11px">${esc(cat.icon||'📦')} ${esc(cat.label)}</span></td>
              <td>${hasPrev?`<span style="color:var(--amber);font-weight:500">${fmt(prev)}</span>`:'<span style="color:var(--text2)">—</span>'}</td>
              <td>${hasCons?`<span style="color:var(--red);font-weight:600">${fmt(cons)}</span>`:'<span style="color:var(--text2)">—</span>'}</td>
              <td>${hasPrev&&hasCons?`<span style="color:${scarto>0?'var(--red)':'var(--green)'};font-weight:600">${scarto>0?'+':''}${fmt(scarto)}</span>`:'<span style="color:var(--text2)">—</span>'}</td>
              <td>${hasCons?'<span class="badge badge-green" style="font-size:11px">✓ Definitiva</span>':'<span class="badge badge-amber" style="font-size:11px">~ Previsionale</span>'}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  // ── TAB: PER CONDOMINO ────────────────────────────────────────────────────
  function tabCondomini() {
    const totVersato = condominiKPI.reduce((a,c)=>a+c.versato, 0);
    const inRegola   = condominiKPI.filter(c=>c.diff>=0).length;
    const inRitardo  = condominiKPI.filter(c=>c.diff<0).length;
    const totDovuto  = condominiKPI.reduce((a,c)=>a+c.quota, 0);
    const daIncassare= condominiKPI.filter(c=>c.diff<0).reduce((a,c)=>a+Math.abs(c.diff),0);

    return `
    <div class="kpi-strip" style="margin-bottom:1.25rem">
      <div class="kpi-card kpi-green"><div class="kpi-label">In regola</div><div class="kpi-value" style="color:var(--green)">${inRegola}/${nAttivi}</div><div class="kpi-sub">Hanno versato la quota</div></div>
      <div class="kpi-card ${inRitardo>0?'kpi-red':'kpi-green'}"><div class="kpi-label">In ritardo</div><div class="kpi-value" style="color:${inRitardo>0?'var(--red)':'var(--green)'}">${inRitardo}</div><div class="kpi-sub">Quota non coperta</div></div>
      <div class="kpi-card kpi-red"><div class="kpi-label">Da incassare ancora</div><div class="kpi-value" style="color:var(--red)">${fmt(daIncassare)}</div><div class="kpi-sub">Totale scoperto</div></div>
      <div class="kpi-card kpi-blue"><div class="kpi-label">Copertura media</div><div class="kpi-value" style="color:var(--accent)">${totDovuto>0?Math.round(totVersato/totDovuto*100):0}%</div><div class="kpi-sub">${fmt(totVersato)} su ${fmt(totDovuto)}</div></div>
    </div>

    <div class="bil-condo-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem;margin-bottom:1.25rem">
      ${condominiKPI.map(c=>{
        const coloreActual  = c.diff>=0 ? 'var(--green)' : 'var(--red)';
        const saldoProiett  = c.versato + c.versatoPrevis - c.quotaFull;
        const percActual    = c.quota>0 ? Math.min(100,Math.round(c.versato/c.quota*100)) : 0;
        const percPrev      = c.quotaFull>0 ? Math.min(100,Math.round((c.versato+c.versatoPrevis)/c.quotaFull*100)) : 0;
        const coloreBar     = percActual>=100?'var(--green)':percActual>=60?'var(--amber)':'var(--red)';
        const statoLabel    = c.diff>=0 ? '✓ OK' : '⚠ Scoperto';

        return `<div class="condo-kpi-card">

          <!-- HEADER -->
          <div class="condo-kpi-head" style="margin-bottom:.75rem">
            <div class="avatar" style="${avatarStyle(c.color)};width:38px;height:38px;font-size:14px">${initials(c.nome)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:14px">${esc(c.nome)}</div>
              <div style="font-size:11px;color:var(--text2)">${esc(c.appartamento)}</div>
            </div>
            <span class="badge ${c.diff>=0?'badge-green':'badge-red'}" style="font-size:11px">${statoLabel}</span>
          </div>

          <!-- SEZIONE ACTUAL -->
          <div style="background:#f0fdf4;border-radius:6px;padding:.5rem .75rem;margin-bottom:.5rem">
            <div style="font-size:9px;font-weight:700;color:var(--green);letter-spacing:.06em;margin-bottom:5px">✅ ACTUAL</div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
              <span style="color:var(--text2)">Versato</span>
              <span style="font-weight:700;color:var(--green)">${fmt(c.versato)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
              <span style="color:var(--text2)">Quota spese</span>
              <span style="font-weight:600;color:var(--red)">−${fmt(c.quota)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;border-top:1px solid #bbf7d0;margin-top:4px;padding-top:4px">
              <span>Saldo reale</span>
              <span style="color:${coloreActual}">${c.diff>=0?'+':''}${fmt(c.diff)}</span>
            </div>
            <!-- Barra actual -->
            <div style="margin-top:6px">
              <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text2);margin-bottom:2px">
                <span>Copertura</span><span style="font-weight:600;color:${coloreBar}">${percActual}%</span>
              </div>
              <div class="condo-kpi-bar">
                <div class="condo-kpi-fill" style="width:${percActual}%;background:${coloreBar}"></div>
              </div>
            </div>
          </div>

          <!-- SEZIONE PROIEZIONE (sempre visibile) -->
          <div style="background:#f5f3ff;border-radius:6px;padding:.5rem .75rem">
            <div style="font-size:9px;font-weight:700;color:#7c3aed;letter-spacing:.06em;margin-bottom:5px">🔮 PROIEZIONE A FINE ANNO</div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
              <span style="color:var(--text2)">Entrate previsionali</span>
              <span style="font-weight:600;color:#7c3aed">${c.versatoPrevis>0?'+'+fmt(c.versatoPrevis):'—'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
              <span style="color:var(--text2)">Quota spese full</span>
              <span style="font-weight:600;color:var(--red)">−${fmt(c.quotaFull)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;border-top:1px solid #ddd6fe;margin-top:4px;padding-top:4px">
              <span>Saldo proiettato</span>
              <span style="color:${saldoProiett>=0?'#7c3aed':'var(--red)'}">${saldoProiett>=0?'+':''}${fmt(saldoProiett)}</span>
            </div>
            <!-- Barra proiezione -->
            ${c.quotaFull>0?`<div style="margin-top:6px">
              <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text2);margin-bottom:2px">
                <span>Copertura proiettata</span><span style="font-weight:600;color:#7c3aed">${percPrev}%</span>
              </div>
              <div class="condo-kpi-bar">
                <div class="condo-kpi-fill" style="width:${percActual}%;background:${coloreBar};border-radius:10px 0 0 10px"></div>
                <div style="width:${Math.max(0,percPrev-percActual)}%;background:#7c3aed;opacity:.5;height:100%"></div>
              </div>
              <div style="display:flex;gap:.75rem;font-size:10px;color:var(--text2);margin-top:3px">
                <span style="color:${coloreBar}">■ Actual ${percActual}%</span>
                ${c.versatoPrevis>0?`<span style="color:#7c3aed">■ Prev. ${percPrev-percActual}%</span>`:''}
              </div>
            </div>`:''}
          </div>

        </div>`;
      }).join('')}
    </div>

    <div class="card">
      <div class="card-header"><h3>Storico versamenti per condomino — ${anno}</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Condomino</th><th>Quota dovuta</th><th>Versato</th><th>Copertura</th><th>Differenza</th><th>N° vers.</th></tr></thead>
          <tbody>
          ${condominiKPI.map(c=>{
            const nVers = entrate.filter(e=>e.condominoId===c.id).length;
            return `<tr>
              <td><div style="display:flex;align-items:center;gap:8px">
                <div class="avatar" style="${avatarStyle(c.color)};width:26px;height:26px;font-size:10px">${initials(c.nome)}</div>
                <div><div style="font-weight:500;font-size:13px">${esc(c.nome)}</div><div style="font-size:11px;color:var(--text2)">${esc(c.appartamento)}</div></div>
              </div></td>
              <td style="font-size:13px">
                <div>${fmt(c.quota)}</div>
                ${c.quotaFull > c.quota ? `<div style="font-size:11px;color:#7c3aed">+prev: ${fmt(c.quotaFull)}</div>` : ''}
              </td>
              <td style="color:var(--green);font-weight:500">${fmt(c.versato)}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px">
                  <div style="width:60px;height:5px;background:var(--surface2);border-radius:3px;overflow:hidden"><div style="width:${c.perc}%;height:100%;background:${c.perc>=100?'var(--green)':c.perc>=60?'var(--amber)':'var(--red)'}"></div></div>
                  <span style="font-size:12px;font-weight:600">${c.perc}%</span>
                </div>
              </td>
              <td><span style="font-weight:700;color:${c.diff>=0?'var(--green)':'var(--red)'}">${c.diff>=0?'+':''}${fmt(c.diff)}</span></td>
              <td style="font-size:13px;color:var(--text2)">${nVers}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  // ── TAB: PER CATEGORIA ────────────────────────────────────────────────────
  function tabCategorie() {
    const totActual  = catBreak.reduce((a,c)=>a+c.totCons,0);
    const totForecast= catBreak.reduce((a,c)=>a+c.totFcst,0);
    const totFull    = totActual + totForecast;
    const scartoCons = catBreak.reduce((a,c)=>a+(c.totCons-c.totPrev),0); // solo su chiuse

    return `
    <div class="card">
      <div class="card-header">
        <h3>🏷️ Spese per categoria — ${anno}</h3>
      </div>

      <!-- KPI strip -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;padding:.875rem 1.25rem;border-bottom:1px solid var(--border);background:var(--surface2)">
        <div style="text-align:center">
          <div style="font-size:10px;font-weight:700;color:var(--red);letter-spacing:.06em;margin-bottom:3px">ACTUAL</div>
          <div style="font-size:1.3rem;font-weight:800;color:var(--red)">${fmt(totActual)}</div>
          <div style="font-size:11px;color:var(--text2)">${catBreak.filter(c=>c.nCons>0).length} categorie · ${catBreak.reduce((a,c)=>a+c.nCons,0)} spese</div>
        </div>
        <div style="text-align:center;border-left:1px solid var(--border);border-right:1px solid var(--border)">
          <div style="font-size:10px;font-weight:700;color:#7c3aed;letter-spacing:.06em;margin-bottom:3px">FORECAST</div>
          <div style="font-size:1.3rem;font-weight:800;color:#7c3aed">${totForecast>0?fmt(totForecast):'—'}</div>
          <div style="font-size:11px;color:var(--text2)">${catBreak.filter(c=>c.nFcst>0).length} categorie · ${catBreak.reduce((a,c)=>a+c.nFcst,0)} spese</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:10px;font-weight:700;color:#0E7490;letter-spacing:.06em;margin-bottom:3px">PROIEZIONE</div>
          <div style="font-size:1.3rem;font-weight:800;color:#0E7490">${fmt(totFull)}</div>
          <div style="font-size:11px;color:var(--text2)">Actual + forecast</div>
        </div>
      </div>

      <!-- Righe categorie -->
      <div style="padding:.875rem 1.25rem">
        ${catBreak.length===0?'<div class="empty"><p>Nessuna spesa</p></div>':
        catBreak.map(c=>{
          const percCons = totFull>0 ? c.totCons/totFull*100 : 0;
          const percFcst = totFull>0 ? c.totFcst/totFull*100 : 0;
          const scarto   = c.totCons>0 && c.totPrev>0 ? c.totCons - c.totPrev : null;
          const color    = c.tipo==='straordinaria' ? 'var(--purple)' : 'var(--accent)';
          return `
          <div style="margin-bottom:1.25rem;padding-bottom:1.25rem;border-bottom:1px solid var(--border)">
            <!-- Header categoria -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.625rem">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:20px">${esc(c.icon||'📦')}</span>
                <div>
                  <div style="font-weight:700;font-size:14px">${esc(c.label)}</div>
                  <div style="font-size:11px;color:var(--text2)">${c.tipo==='straordinaria'?'Straordinaria':'Ordinaria'}</div>
                </div>
              </div>
              <!-- Due mini-box actual + forecast -->
              <div style="display:flex;gap:.5rem;align-items:center">
                ${c.totCons>0?`
                <div style="text-align:center;background:#fef2f2;border-radius:6px;padding:4px 10px;min-width:80px">
                  <div style="font-size:9px;font-weight:700;color:var(--red);letter-spacing:.05em">ACTUAL</div>
                  <div style="font-size:14px;font-weight:800;color:var(--red)">${fmt(c.totCons)}</div>
                  <div style="font-size:10px;color:var(--text2)">${c.nCons} spese</div>
                </div>`:''}
                ${c.totFcst>0?`
                <div style="text-align:center;background:#f5f3ff;border-radius:6px;padding:4px 10px;min-width:80px">
                  <div style="font-size:9px;font-weight:700;color:#7c3aed;letter-spacing:.05em">FORECAST</div>
                  <div style="font-size:14px;font-weight:800;color:#7c3aed">${fmt(c.totFcst)}</div>
                  <div style="font-size:10px;color:var(--text2)">${c.nFcst} spese</div>
                </div>`:''}
                <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:4px 10px;min-width:80px;border:1px solid var(--border)">
                  <div style="font-size:9px;font-weight:700;color:#0E7490;letter-spacing:.05em">TOTALE</div>
                  <div style="font-size:14px;font-weight:800;color:#0E7490">${fmt(c.tot)}</div>
                  <div style="font-size:10px;color:var(--text2)">${Math.round((c.tot/totFull)*100)}% del tot.</div>
                </div>
              </div>
            </div>

            <!-- Barra doppia actual + forecast -->
            <div style="height:10px;background:var(--surface2);border-radius:5px;overflow:hidden;display:flex;margin-bottom:5px">
              ${percCons>0?`<div style="width:${percCons}%;background:${color};border-radius:5px 0 0 5px;transition:width .3s"></div>`:''}
              ${percFcst>0?`<div style="width:${percFcst}%;background:#7c3aed;opacity:.5;transition:width .3s"></div>`:''}
            </div>
            <div style="display:flex;gap:1rem;font-size:11px;color:var(--text2)">
              ${percCons>0?`<span style="color:${color}">■ Actual ${percCons.toFixed(1)}%</span>`:''}
              ${percFcst>0?`<span style="color:#7c3aed">■ Forecast ${percFcst.toFixed(1)}%</span>`:''}
              ${scarto!==null?`<span style="margin-left:auto;font-weight:600;color:${scarto>0?'var(--red)':'var(--green)'}">Scarto: ${scarto>0?'+':''}${fmt(scarto)}</span>`:''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  // ── RENDER PAGE ───────────────────────────────────────────────────────────
  const bodyHtml = tab==='overview'  ? tabOverview()  :
                   tab==='forecast'  ? tabForecast()  :
                   tab==='prevcons'  ? tabPrevCons()  :
                   tab==='condomini' ? tabCondomini() :
                   tab==='categorie' ? tabCategorie() : tabOverview();

  return `
  <div>
    <div class="page-header">
      <div><div class="page-title">Bilancio ${btnGuida()}</div><div class="page-sub">${esc((state.edifici.find(e=>e.id===state.edificioAttivo)||{nome:'—'}).nome)} · ${anno}</div></div>
      <select style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;" id="anno-bilancio">
        ${anni.map(a=>`<option value="${a}" ${a===anno?'selected':''}>${a}</option>`).join('')}
      </select>
    </div>
    ${tabHtml}
    ${bodyHtml}
  </div>`;
}

// Anno, schede e dettaglio per condomino della pagina Bilancio. Chiamata da bindPageActions() (azioni.js).
function bindAzioniBilancio() {
  const ab = document.getElementById('anno-bilancio');
  if (ab) ab.onchange = e => setState({filterAnno: parseInt(e.target.value)||new Date().getFullYear()});
  document.querySelectorAll('.bil-tab:not(.vita-tab)').forEach(t => {
    t.onclick = () => setState({bilancioTab: t.dataset.tab});
  });
  // Bilancio individuale condomino
  document.querySelectorAll('[data-bilancio-cond]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.bilancioCond);
      setState({page:'bilancio', bilancioTab:'condomini', bilancioCondId:id});
    };
  });
}
