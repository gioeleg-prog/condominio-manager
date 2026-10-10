// Dashboard.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// ===========================
// DASHBOARD
// ===========================
function renderDashboard() {
  const oggi     = new Date();
  // "Tutti gli anni" (0, scelto in Spese/Entrate) non ha senso per riporto e
  // cassa mese per mese: si mostra l'anno corrente. Prima solo una parte dei
  // calcoli ripiegava sull'anno corrente (riporto a zero, etichette "· 0").
  const anno     = state.filterAnno || oggi.getFullYear();
  const meseCurr = oggi.getMonth(); // 0-11
  // STRICT: solo condomini dell'edificio attivo
  const nAttivi = state.condomini
    .filter(c => c.edificioId === state.edificioAttivo && !c.disabled && !c.superAdmin).length || 1;
  const anni     = getAnni();

  // Spese e entrate anno selezionato
  const _allSpese   = state.spese.filter(s => !s.edificioId || s.edificioId === state.edificioAttivo);
  const _allEntrate = state.entrate.filter(e => !e.edificioId || e.edificioId === state.edificioAttivo);
  const annoEff = anno;
  const spese   = _allSpese.filter(s => annoDi(s.data) === annoEff);
  const entrate = _allEntrate.filter(e => annoDi(e.data) === annoEff);

  const totSpeseCons = spese.reduce((a,s) => a + parseFloat(s.consuntivo||0), 0);
  const totSpesePrev = spese.reduce((a,s) => a + parseFloat(s.preventivo||0), 0);
  const totEntrate   = entrate.filter(e=>!e.previsionale).reduce((a,e) => a + parseFloat(e.importo||0), 0);
  const saldoRiporto = getSaldoRiporto(anno);  // saldo dagli anni precedenti
  const saldoAnno    = totEntrate - totSpeseCons;  // saldo solo dell'anno
  const saldo        = saldoRiporto + saldoAnno;   // saldo totale cassa
  // Actual (solo consuntivo) — coerente con totSpeseCons
  const speseOrd     = spese.filter(s=>s.tipoSpesa==='ordinaria').reduce((a,s)=>a+parseFloat(s.consuntivo||0),0);
  const speseStr     = spese.filter(s=>s.tipoSpesa==='straordinaria').reduce((a,s)=>a+parseFloat(s.consuntivo||0),0);
  // Full (cons||prev) — include anche preventivi senza consuntivo
  const speseOrdFull = spese.filter(s=>s.tipoSpesa==='ordinaria').reduce((a,s)=>a+parseFloat(s.consuntivo||s.preventivo||0),0);
  const speseStrFull = spese.filter(s=>s.tipoSpesa==='straordinaria').reduce((a,s)=>a+parseFloat(s.consuntivo||s.preventivo||0),0);
  // Quota personale: usa gli split reali come nel bilancio per condomino
  // Per l'admin (superAdmin) usa la media semplice; per gli altri usa lo split
  const quotaPersonale = (() => {
    if (isSuperAdmin(state.user)) return totSpeseCons / nAttivi;
    const uid = state.user.id;
    return spese.reduce((acc, s) => acc + quotaSuSpesa(s, uid, parseFloat(s.consuntivo||0), nAttivi), 0);
  })();
  // Debito o credito degli anni precedenti del condomino collegato.
  const riportoUtente = isSuperAdmin(state.user) ? 0 : riportoCondomino(state.user.id, d => annoDi(d) < anno, nAttivi);
  // Solo versamenti reali: le rate previsionali (es. piano rate dell'anno prossimo) non sono "versate".
  const pagatoUtente   = entrate.filter(e=>e.condominoId===state.user.id && !e.previsionale).reduce((a,e)=>a+parseFloat(e.importo||0),0);

  // ── Calcolo cashflow mensile (storico + previsionale) ──────────────────
  // Stesse componenti usate nel grafico "Andamento mensile" di Bilancio, per coerenza:
  // reale e previsionale sempre separati (non solo per il mese corrente, ma per ogni mese —
  // un mese passato può avere spese ancora aperte, un mese futuro può avere versamenti già reali).
  const nomiMesi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const cashflow = Array.from({length:12}, (_,m) => {
    const speseM   = spese.filter(s=>meseDi(s.data)===m);
    const entrateM = entrate.filter(e=>meseDi(e.data)===m);
    const cons         = speseM.filter(s=>parseFloat(s.consuntivo||0)>0).reduce((a,s)=>a+parseFloat(s.consuntivo||0),0);
    const prevForecast = speseM.filter(s=>parseFloat(s.consuntivo||0)===0 && parseFloat(s.preventivo||0)>0).reduce((a,s)=>a+parseFloat(s.preventivo||0),0);
    const incassi       = entrateM.filter(e=>!e.previsionale).reduce((a,e)=>a+parseFloat(e.importo||0),0);
    const incPrevis      = entrateM.filter(e=>e.previsionale).reduce((a,e)=>a+parseFloat(e.importo||0),0);
    const isAnnoPassato = anno < oggi.getFullYear();
    const isPast   = isAnnoPassato || (anno === oggi.getFullYear() && m <= meseCurr);
    const isCurrentMonth = anno === oggi.getFullYear() && m === meseCurr;
    return {
      mese: nomiMesi[m], m,
      cons, prevForecast,       // uscite: reali (consuntivate) e ancora aperte (forecast)
      incassi, incPrevis,       // entrate: reali e previsionali
      totUscite:  cons + prevForecast,
      totIncassi: incassi + incPrevis,
      isFuture: !isPast,
      isCurrent: isCurrentMonth,
    };
  });

  // Anno futuro: si parte dal saldo stimato a inizio anno (cassa di oggi più ciò
  // che resta da pagare e incassare prima), non dalla sola cassa di oggi.
  const isAnnoFuturoDash = anno > oggi.getFullYear();
  const stimaInizioDash  = getSaldoStimatoInizioAnno(anno);
  const saldoInizio      = isAnnoFuturoDash ? stimaInizioDash.stimato : saldo;

  // Saldo cumulativo mese per mese — parte dal riporto anni precedenti (o dal saldo stimato per un anno futuro)
  let cumulativo = isAnnoFuturoDash ? saldoInizio : saldoRiporto;
  const cfCumul = cashflow.map(cf => {
    cumulativo += cf.totIncassi - cf.totUscite;
    return {...cf, cumul: cumulativo};
  });

  // ── Copertura di cassa — Dashboard: colpo d'occhio sui prossimi FINESTRA_MESI mesi.
  // Basta questa visibilità ravvicinata per accorgersi in tempo di un problema e intervenire;
  // l'analisi completa fino a fine anno è nel Bilancio (stessa logica, orizzonte più ampio).
  // Simulazione con i dati REALI di forecast (non con le medie storiche usate per il grafico
  // "Cashflow mensile", che sono solo una stima visiva), a partire dal saldo REALE attuale
  // (incluso il riporto dagli anni precedenti).
  const FINESTRA_MESI = 4;
  const annoCorrente = new Date().getFullYear();
  const isAnnoPassatoDash = annoEff < annoCorrente;
  const isAnnoCorrenteDash = annoEff === annoCorrente;
  const meseInizioSim = isAnnoPassatoDash ? 12 : (isAnnoCorrenteDash ? meseCurr + 1 : 0);
  const meseFineSim   = isAnnoPassatoDash ? 11 : Math.min(11, meseInizioSim + FINESTRA_MESI - 1);

  // Spese previsionali ANCORA APERTE (nessun consuntivo) datate nel mese corrente o prima: sono
  // già scadute o comunque imminenti, quindi vanno considerate súbito come rischio immediato —
  // non ignorate solo perché la simulazione "in avanti" mese per mese parte dal mese prossimo
  // (per non ricontare due volte le spese GIÀ consuntivate del mese corrente, quelle sì incluse in saldo).
  // Solo nell'anno corrente: in un anno futuro quei mesi sono nella finestra qui
  // sotto e venivano contati due volte (falso allarme "già questo mese").
  const speseArretrateAperte = !isAnnoCorrenteDash ? 0 : spese
    .filter(s => meseDi(s.data) <= meseCurr)
    .filter(s => parseFloat(s.consuntivo||0)===0 && parseFloat(s.preventivo||0)>0)
    .reduce((a, s) => a + parseFloat(s.preventivo), 0);

  let meseZero = speseArretrateAperte > 0 && (saldo - speseArretrateAperte) <= 0 ? meseCurr : null;
  let saldoSim = saldoInizio - speseArretrateAperte;
  let minBalFinestra = saldoSim;
  let usciteFinestra = speseArretrateAperte;
  for (let m = meseInizioSim; m <= meseFineSim; m++) {
    const speseM = spese.filter(s => meseDi(s.data) === m);
    const entrateM = entrate.filter(e => meseDi(e.data) === m);
    const forecastMese = speseM.filter(s => parseFloat(s.consuntivo||0)===0 && parseFloat(s.preventivo||0)>0).reduce((a,s)=>a+parseFloat(s.preventivo),0);
    const incPrevistiMese = entrateM.filter(e => e.previsionale).reduce((a,e)=>a+parseFloat(e.importo||0),0);
    usciteFinestra += forecastMese;
    saldoSim += incPrevistiMese - forecastMese;
    if (saldoSim < minBalFinestra) minBalFinestra = saldoSim;
    if (saldoSim <= 0 && meseZero === null) meseZero = m;
  }
  const mesiFinestraEffettivi = Math.max(0, meseFineSim - meseInizioSim + 1);

  // Copertura mesi futuri (runway) — usata solo per lo storico/i pallini del runway-card qui sotto
  const totSpeseFull      = spese.reduce((a,s) => a + parseFloat(s.consuntivo||s.preventivo||0), 0);
  const totEntratePrevis  = entrate.filter(e=>e.previsionale).reduce((a,e) => a + parseFloat(e.importo||0), 0);
  const cassaProiettata   = saldo + totEntratePrevis; // saldo reale + previsionali in entrata
  // Media mensile basata sui mesi con spese inserite (usata per lo storico/i pallini del runway-card, non per il messaggio principale)
  const mesiConSpese      = new Set(spese.filter(s=>parseFloat(s.consuntivo||s.preventivo||0)>0).map(s=>meseDi(s.data)));
  const nMesiPianificati  = Math.max(mesiConSpese.size, 1);
  const spesaMensileMedia = totSpeseFull / nMesiPianificati;

  // Max per scala grafico
  const maxCF = Math.max(...cashflow.map(cf=>Math.max(cf.totUscite, cf.totIncassi)), 1);

  // Alert status e messaggio — stessa impostazione chiara/esplicita del box "Piano rate" in Entrate/Quote
  const alertStatus = saldoInizio < 0 ? 'critical' : meseZero !== null ? 'warn' : 'ok';
  const meseZeroLabel = isAnnoCorrenteDash && meseZero === meseCurr ? 'già questo mese' : 'entro ' + nomiMesi[meseZero] + (isAnnoFuturoDash ? ' ' + anno : '');
  const alertMsg = isAnnoFuturoDash
    // Anno futuro: si valutano i primi mesi dell'anno a partire dal saldo stimato.
    ? (saldoInizio < 0
      ? `⚠️ Saldo stimato a inizio ${anno} negativo (${fmt(saldoInizio)}): cassa di oggi ${fmt(saldo)}, meno ${fmt(stimaInizioDash.speseAperte)} di spese ancora da consuntivare, più ${fmt(stimaInizioDash.entratePreviste)} di versamenti previsti`
      : meseZero !== null
      ? `⚠️ Il saldo stimato a inizio ${anno} (${fmt(saldoInizio)}) non basta per i primi ${mesiFinestraEffettivi} mesi: rischio di andare sotto zero ${meseZeroLabel}, minimo previsto ${fmt(minBalFinestra)}`
      : `✅ Primi ${mesiFinestraEffettivi} mesi del ${anno} coperti — saldo stimato a inizio anno ${fmt(saldoInizio)}, spese previste fino a ${nomiMesi[meseFineSim]} ${fmt(usciteFinestra)}, minimo previsto ${fmt(minBalFinestra)}`)
    : saldo < 0
    ? `⚠️ Saldo di cassa negativo (${fmt(saldo)}) — il condominio è già in deficit`
    : meseZero !== null
    ? `⚠️ Il saldo attuale (${fmt(saldo)}) non basta a coprire le spese previsionali ancora aperte: rischio di andare sotto zero ${meseZeroLabel}, minimo previsto ${fmt(minBalFinestra)}`
    : mesiFinestraEffettivi > 0
    ? `✅ Coperto per i prossimi ${mesiFinestraEffettivi} mesi — il saldo attuale (${fmt(saldo)}) copre le spese previsionali ancora aperte, comprese quelle di questo mese, fino a ${nomiMesi[meseFineSim]} (${fmt(usciteFinestra)}), restando sempre sopra zero (minimo previsto ${fmt(minBalFinestra)})`
    : `✅ Nessuna spesa previsionale nei mesi rimanenti dell'anno`;

  const speseConfermate = spese.filter(s=>parseFloat(s.consuntivo||0)>0);
  const spesePrevisional= spese.filter(s=>parseFloat(s.consuntivo||0)===0 && parseFloat(s.preventivo||0)>0);
  const ultimeSpese      = [...speseConfermate].sort((a,b)=>new Date(b.data)-new Date(a.data)).slice(0,6);
  const ultimeForecast   = [...spesePrevisional].sort((a,b)=>new Date(b.data)-new Date(a.data)).slice(0,6);
  const ultimeEntrate = [...entrate].sort((a,b)=>new Date(b.data)-new Date(a.data)).slice(0,6);

  // Riepilogo Vita condominiale in dashboard: solo lavori in corso e
  // decisioni in attesa (bacheca e verbali restano nella loro pagina),
  // massimo DASH_VITA_MAX elementi — se ce ne sono di più, un invito
  // esplicito rimanda al dettaglio.
  const DASH_VITA_MAX = 2;
  const lavoriInCorso = getLavoriVisibili()
    .filter(l => l.stato !== 'completato')
    .sort((a,b) => (LAVORI_STATO_ORDER[a.stato]??9) - (LAVORI_STATO_ORDER[b.stato]??9));
  const decisioniInAttesa = getDelibereVisibili()
    .filter(d => d.stato !== 'completata')
    .sort((a,b) => new Date(b.dataApprovazione)-new Date(a.dataApprovazione));
  const dashVitaAltri = (tot, tab) => tot > DASH_VITA_MAX ? `
          <a onclick="setState({page:'vita',vitaTab:'${tab}',sidebarOpen:false})" style="display:block;margin-top:.6rem;padding:.45rem .75rem;border-radius:var(--radius-sm);background:var(--accent-light);color:var(--accent);font-size:12.5px;font-weight:600;text-align:center;cursor:pointer;text-decoration:none">
            +${tot - DASH_VITA_MAX} ${tot - DASH_VITA_MAX === 1 ? 'altro' : 'altri'} — apri il dettaglio per vedere tutto →
          </a>` : '';
  const dashVitaCount = (tot) => tot ? ` <span class="badge badge-blue" style="padding:1px 7px;font-size:11px;vertical-align:middle">${tot}</span>` : '';

  return `
  <div>
    <div class="page-header">
      <div>
        <div class="page-title">Dashboard ${btnGuida()}</div>
        <div class="page-sub">${esc((state.edifici.find(e=>e.id===state.edificioAttivo)||{nome:'—'}).nome)} · ${anno}</div>
      </div>
      <select style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;" id="anno-filter">
        ${anni.map(a=>`<option value="${a}" ${a===anno?'selected':''}>${a}</option>`).join('')}
      </select>
    </div>

    <!-- LAVORI & DELIBERE -->
    <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem">
      <div class="card" style="flex:1;min-width:260px;margin-bottom:0">
        <div class="card-header">
          <h3>🛠️ Lavori in corso${dashVitaCount(lavoriInCorso.length)}</h3>
          <a onclick="setState({page:'vita',vitaTab:'lavori',sidebarOpen:false})" style="font-size:12px;color:var(--accent);cursor:pointer;text-decoration:none">Vedi tutti →</a>
        </div>
        <div style="padding:.25rem 1.25rem .75rem">
          ${lavoriInCorso.length === 0 ? `<div style="font-size:13px;color:var(--text2);padding:.5rem 0">Nessun lavoro in corso</div>` :
          lavoriInCorso.slice(0, DASH_VITA_MAX).map(l => { const pct = Math.max(0, Math.min(100, parseInt(l.percentuale)||0)); return `
          <div style="padding:.5rem 0;border-bottom:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
              <span style="font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.titolo)}</span>
              <span style="font-size:11px;color:var(--text2);flex-shrink:0">${pct}%</span>
            </div>
            <div class="progress-wrap" style="margin-top:4px"><div class="progress-fill" style="width:${pct}%;background:var(--accent)"></div></div>
          </div>`; }).join('')}
          ${dashVitaAltri(lavoriInCorso.length, 'lavori')}
        </div>
      </div>
      <div class="card" style="flex:1;min-width:260px;margin-bottom:0">
        <div class="card-header">
          <h3>📜 Decisioni in attesa${dashVitaCount(decisioniInAttesa.length)}</h3>
          <a onclick="setState({page:'vita',vitaTab:'delibere',sidebarOpen:false})" style="font-size:12px;color:var(--accent);cursor:pointer;text-decoration:none">Vedi tutti →</a>
        </div>
        <div style="padding:.25rem 1.25rem .75rem">
          ${decisioniInAttesa.length === 0 ? `<div style="font-size:13px;color:var(--text2);padding:.5rem 0">Nessuna decisione in attesa</div>` :
          decisioniInAttesa.slice(0, DASH_VITA_MAX).map(d => `
          <div style="padding:.5rem 0;border-bottom:1px solid var(--border)">
            <div style="font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.descrizioneSintetica)}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:2px">${DELIBERE_STATO_LABEL[d.stato]||esc(d.stato)}${d.responsabile ? ' · '+esc(d.responsabile) : ''}</div>
          </div>`).join('')}
          ${dashVitaAltri(decisioniInAttesa.length, 'delibere')}
        </div>
      </div>
    </div>

    <!-- KPI STRIP -->
    <div class="kpi-strip">
      <div class="kpi-card kpi-green">
        <div class="kpi-label">Entrate totali</div>
        <div class="kpi-value" style="color:var(--green)">${fmt(totEntrate)}</div>
        <div class="kpi-sub">${entrate.length} versamenti</div>
      </div>
      <div class="kpi-card kpi-red">
        <div class="kpi-label">Uscite consuntivo</div>
        <div class="kpi-value" style="color:var(--red)">${fmt(totSpeseCons)}</div>
        <div class="kpi-sub">Prev. ${fmt(totSpesePrev)}</div>
      </div>
      <div class="kpi-card ${saldo>=0?'kpi-green':'kpi-red'}">
        <div class="kpi-label">Saldo cassa</div>
        <div class="kpi-value" style="color:${saldo>=0?'var(--green)':'var(--red)'}">${fmt(saldo)}</div>
        <div class="kpi-trend ${saldo>=0?'down':'up'}">${saldo>=0?'▲ Positivo':'▼ Negativo'}</div>
        ${saldoRiporto!==0?`<div style="font-size:10px;color:var(--text2);margin-top:2px">
          Anno: ${fmt(saldoAnno)} · Riporto: <span style="color:${saldoRiporto>=0?'var(--green)':'var(--red)'}">${saldoRiporto>=0?'+':''}${fmt(saldoRiporto)}</span>
        </div>`:''}
      </div>
      <div class="kpi-card kpi-blue">
        <div class="kpi-label">Quota pro-capite</div>
        <div class="kpi-value" style="color:var(--accent)">${fmt(quotaPersonale)}</div>
        <div class="kpi-sub">${nAttivi} condomini attivi</div>
      </div>
      <div class="kpi-card kpi-purple">
        <div class="kpi-label">Spese ord. vs str. <span style="font-size:9px;color:var(--text2)">(actual)</span></div>
        <div class="kpi-value" style="font-size:1rem;font-weight:700;display:flex;gap:4px;align-items:baseline">
          <span style="color:var(--accent)">${fmt(speseOrd)}</span>
          <span style="font-size:12px;color:var(--text2)">+</span>
          <span style="color:var(--purple)">${fmt(speseStr)}</span>
        </div>
        <div class="kpi-sub">
          Ord.+Str. = ${fmt(speseOrd+speseStr)}
          ${speseOrdFull+speseStrFull > speseOrd+speseStr
            ? `<span style="color:#7c3aed;font-size:10px"> · con prev.: ${fmt(speseOrdFull+speseStrFull)}</span>`
            : ''}
        </div>
      </div>
      <div class="kpi-card ${saldoInizio<0||meseZero!==null?'kpi-red':'kpi-green'}">
        <div class="kpi-label">${isAnnoFuturoDash ? 'Copertura primi '+(mesiFinestraEffettivi || FINESTRA_MESI)+' mesi '+anno : 'Copertura prossimi '+(mesiFinestraEffettivi || FINESTRA_MESI)+' mesi'}</div>
        <div class="kpi-value" style="color:${saldoInizio<0?'var(--red)':meseZero!==null?'var(--red)':'var(--green)'}">
          ${saldoInizio<0?'⚠️ Deficit':meseZero!==null?'⚠️ '+nomiMesi[meseZero]:'✅ Coperto'}
        </div>
        <div class="kpi-sub">
          ${saldoInizio<0?fmt(saldoInizio)+(isAnnoFuturoDash?' stimato a inizio anno':''):meseZero!==null?'mancherebbero circa '+fmt(Math.abs(minBalFinestra)):'minimo previsto '+fmt(minBalFinestra)}
        </div>
      </div>
    </div>

    <!-- ALERT CASHFLOW -->
    ${saldoRiporto !== 0 ? `
    <div style="display:flex;align-items:center;gap:10px;background:${saldoRiporto>=0?'#f0fdf4':'#fef2f2'};border:1px solid ${saldoRiporto>=0?'#bbf7d0':'#fecaca'};border-radius:var(--radius-sm);padding:.625rem .875rem;margin-bottom:.75rem;font-size:13px;flex-wrap:wrap">
      <span style="font-size:18px">${saldoRiporto>=0?'📥':'📤'}</span>
      <div style="flex:1">
        <span style="font-weight:600">Riporto da anni precedenti:</span>
        <span style="font-weight:800;color:${saldoRiporto>=0?'var(--green)':'var(--red)'}"> ${saldoRiporto>=0?'+':''}${fmt(saldoRiporto)}</span>
        <span style="color:var(--text2);font-size:11px"> · Saldo solo ${anno}: ${fmt(saldoAnno)}</span>
      </div>
    </div>` : ''}

    <div class="cf-zero-warn ${alertStatus}" style="margin-bottom:1.25rem">
      ${alertMsg}
    </div>

    <!-- CASHFLOW CHART -->
    <div class="cf-chart">
      <div class="cf-chart-title">📊 Cashflow mensile ${anno}</div>
      <div class="cf-chart-sub">🟢 Entrate reali · 🟣 Entrate previsionali · 🔴 Uscite reali · 🟪 Uscite ancora da consuntivare</div>
      <div class="cf-bars" tabindex="0" role="region" aria-label="Grafico flusso di cassa">
        ${cfCumul.map((cf,i) => {
          const hIA = Math.round(cf.incassi/maxCF*100);
          const hIP = Math.round(cf.incPrevis/maxCF*100);
          const hCA = Math.round(cf.cons/maxCF*100);
          const hCP = Math.round(cf.prevForecast/maxCF*100);
          const saldoM = cf.totIncassi - cf.totUscite;
          const saldoColor = saldoM >= 0 ? 'var(--green)' : 'var(--red)';
          return `<div class="cf-col">
            <div class="cf-col-saldo" style="color:${saldoColor}">${saldoM>=0?'+':''}${fmtN(saldoM/1000).replace(',','.')}k</div>
            <div class="cf-col-bars">
              <div style="display:flex;flex-direction:column;align-items:center">
                <div class="cf-bar" style="height:${hIP}px;background:#7c3aed;opacity:.7;width:14px" title="Entrate previsionali ${fmt(cf.incPrevis)}"></div>
                <div class="cf-bar" style="height:${hIA}px;background:var(--green);opacity:.85;width:14px" title="Entrate reali ${fmt(cf.incassi)}"></div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:center">
                <div class="cf-bar" style="height:${hCP}px;background:#a78bfa;opacity:.7;width:14px" title="Uscite ancora da consuntivare ${fmt(cf.prevForecast)}"></div>
                <div class="cf-bar" style="height:${hCA}px;background:var(--red);opacity:.85;width:14px" title="Uscite reali ${fmt(cf.cons)}"></div>
              </div>
            </div>
            <div class="cf-col-label" style="font-weight:${cf.isCurrent?'700':'400'};color:${cf.isCurrent?'var(--accent)':'var(--text2)'}">${cf.mese}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="cf-legend">
        <div class="cf-legend-item"><div class="cf-legend-dot" style="background:var(--green)"></div>Entrate reali</div>
        <div class="cf-legend-item"><div class="cf-legend-dot" style="background:#7c3aed"></div>Entrate previsionali</div>
        <div class="cf-legend-item"><div class="cf-legend-dot" style="background:var(--red)"></div>Uscite reali</div>
        <div class="cf-legend-item"><div class="cf-legend-dot" style="background:#a78bfa"></div>Uscite da consuntivare</div>
      </div>
    </div>

    <!-- RUNWAY MENSILE -->
    <div class="runway-card" style="margin-bottom:1.25rem">
      <div style="font-weight:700;font-size:15px;margin-bottom:.25rem">🗓️ Stato cassa mese per mese</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:.875rem">Verde = cassa positiva · Rosso = cassa negativa · Tratteggiato = proiezione</div>
      <div class="runway-months">
        ${cfCumul.map((cf,i) => {
          const sM = cf.cumul;
          // Mesi futuri con dati reali (es. spese ricorrenti) mostrano stato reale
          const hasRealData = cf.incassi>0 || cf.cons>0 || cf.incPrevis>0 || cf.prevForecast>0;
          const isTrulyFuture = cf.isFuture && !hasRealData;
          let cls = isTrulyFuture ? 'future' : sM > 0 ? (sM < spesaMensileMedia*0.5 ? 'warning' : 'positive') : sM < 0 ? 'negative' : 'warning';
          const emoji = isTrulyFuture ? '?' : sM > 0 ? (sM < spesaMensileMedia*0.5 ? '⚠' : '✓') : '✗';
          return `<div class="runway-month">
            <div class="runway-dot ${cls}" title="${cf.mese}: ${fmt(sM)}">${emoji}</div>
            <div class="runway-month-label">${cf.mese}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="font-size:12px;color:var(--text2);display:flex;gap:1rem;flex-wrap:wrap;margin-top:.5rem">
        <span>✓ <span style="color:var(--green)">Positivo</span></span>
        <span>⚠ <span style="color:var(--amber)">Riserva bassa</span></span>
        <span>✗ <span style="color:var(--red)">Deficit</span></span>
        <span>? Proiezione futura</span>
      </div>
    </div>

    <!-- SITUAZIONE PERSONALE (non admin) -->
    ${!state.user.isAdmin ? `
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-header"><h3>La tua situazione</h3></div>
      <div style="padding:1rem 1.25rem;display:flex;gap:1.5rem;flex-wrap:wrap">
        ${Math.abs(riportoUtente) > 0.005 ? `<div><div style="font-size:12px;color:var(--text2)">Dagli anni precedenti</div><div style="font-size:1.3rem;font-weight:700;color:${riportoUtente>=0?'var(--green)':'var(--red)'}">${riportoUtente>=0?'+':''}${fmt(riportoUtente)}</div></div>` : ''}
        <div><div style="font-size:12px;color:var(--text2)">Quota dovuta ${anno}</div><div style="font-size:1.3rem;font-weight:700;color:var(--red)">${fmt(quotaPersonale)}</div></div>
        <div><div style="font-size:12px;color:var(--text2)">Versato ${anno}</div><div style="font-size:1.3rem;font-weight:700;color:var(--green)">${fmt(pagatoUtente)}</div></div>
        <div><div style="font-size:12px;color:var(--text2)">${Math.abs(riportoUtente) > 0.005 ? 'Saldo (con riporto)' : 'Differenza'}</div><div style="font-size:1.3rem;font-weight:700;color:${riportoUtente+pagatoUtente>=quotaPersonale?'var(--green)':'var(--red)'}">${fmt(riportoUtente+pagatoUtente-quotaPersonale)}</div></div>
      </div>
    </div>` : ''}

    <!-- ULTIME OPERAZIONI -->

    <!-- Riga 1: Spese confermate + Forecast affiancati — compatte, no scroll -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">

      <!-- Spese confermate -->
      <div class="card" style="overflow:hidden">
        <div class="card-header" style="padding:.625rem 1rem">
          <h3 style="font-size:13px">✅ Spese confermate</h3>
          <a style="font-size:12px;color:var(--accent);cursor:pointer" data-page="spese">Vedi tutte →</a>
        </div>
        ${ultimeSpese.length===0?'<div class="empty" style="padding:1rem"><p>Nessuna spesa</p></div>':
        `<table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:5px 8px;font-size:10px;font-weight:600;color:var(--text2);width:82px">DATA</th>
            <th style="padding:5px 8px;font-size:10px;font-weight:600;color:var(--text2)">TITOLO</th>
            <th style="padding:5px 6px;font-size:10px;font-weight:600;color:var(--text2);width:40px;text-align:center">TIPO</th>
            <th style="padding:5px 8px;font-size:10px;font-weight:600;color:var(--text2);width:82px;text-align:right">€</th>
          </tr></thead>
          <tbody>
          ${ultimeSpese.map(s=>`<tr style="border-top:1px solid var(--border)">
            <td style="padding:6px 8px;font-size:11px;color:var(--text2);white-space:nowrap">${esc(s.data)}</td>
            <td style="padding:6px 8px;font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:0;width:100%">${esc(s.titolo)}</td>
            <td style="padding:6px 4px;text-align:center"><span style="font-size:9px;padding:2px 5px;border-radius:3px;background:${s.tipoSpesa==='straordinaria'?'#ede9fe':'#dbeafe'};color:${s.tipoSpesa==='straordinaria'?'#7c3aed':'var(--accent)'};font-weight:600">${s.tipoSpesa==='straordinaria'?'Str.':'Ord.'}</span></td>
            <td style="padding:6px 8px;font-size:12px;font-weight:700;color:var(--red);text-align:right;white-space:nowrap">${fmt(s.consuntivo)}</td>
          </tr>`).join('')}
          </tbody>
        </table>`}
      </div>

      <!-- Spese forecast -->
      <div class="card" style="overflow:hidden;border-top:3px solid #7c3aed">
        <div class="card-header" style="padding:.625rem 1rem">
          <h3 style="font-size:13px">🔮 Spese forecast</h3>
          <a style="font-size:12px;color:#7c3aed;cursor:pointer" data-page="spese">Vedi tutte →</a>
        </div>
        ${ultimeForecast.length===0?'<div class="empty" style="padding:1rem"><p>Nessuna spesa aperta</p></div>':
        `<table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#f5f3ff">
            <th style="padding:5px 8px;font-size:10px;font-weight:600;color:#7c3aed;width:82px">DATA</th>
            <th style="padding:5px 8px;font-size:10px;font-weight:600;color:#7c3aed">TITOLO</th>
            <th style="padding:5px 6px;font-size:10px;font-weight:600;color:#7c3aed;width:40px;text-align:center">TIPO</th>
            <th style="padding:5px 8px;font-size:10px;font-weight:600;color:#7c3aed;width:82px;text-align:right">€</th>
          </tr></thead>
          <tbody>
          ${ultimeForecast.map(s=>`<tr style="border-top:1px solid #e9d5ff;background:#faf5ff">
            <td style="padding:6px 8px;font-size:11px;color:var(--text2);white-space:nowrap;width:82px">${esc(s.data)}</td>
            <td style="padding:6px 8px;font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:0;width:100%">${esc(s.titolo)}</td>
            <td style="padding:6px 6px;text-align:center;width:40px"><span style="font-size:9px;padding:2px 4px;border-radius:3px;background:${s.tipoSpesa==='straordinaria'?'#ede9fe':'#dbeafe'};color:${s.tipoSpesa==='straordinaria'?'#7c3aed':'var(--accent)'};font-weight:600">${s.tipoSpesa==='straordinaria'?'S':'O'}</span></td>
            <td style="padding:6px 8px;font-size:12px;font-weight:700;color:#7c3aed;text-align:right;white-space:nowrap;width:82px">${fmt(s.preventivo)}</td>
          </tr>`).join('')}
          </tbody>
        </table>`}
      </div>
    </div>

    <!-- Riga 2: Ultime entrate full width — compatta -->
    <div class="card" style="overflow:hidden">
      <div class="card-header" style="padding:.625rem 1rem">
        <h3 style="font-size:13px">💰 Ultimi versamenti</h3>
        <a style="font-size:12px;color:var(--accent);cursor:pointer" data-page="entrate">Vedi tutte →</a>
      </div>
      ${ultimeEntrate.length===0?'<div class="empty" style="padding:1rem"><p>Nessun versamento</p></div>':
      `<table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:5px 8px;font-size:10px;font-weight:600;color:var(--text2);text-align:left;white-space:nowrap">DATA</th>
          <th style="padding:5px 8px;font-size:10px;font-weight:600;color:var(--text2);text-align:left">CONDOMINO</th>
          <th style="padding:5px 8px;font-size:10px;font-weight:600;color:var(--text2);text-align:right;white-space:nowrap">IMPORTO</th>
          <th style="padding:5px 8px;font-size:10px;font-weight:600;color:var(--text2);text-align:center;white-space:nowrap">STATO</th>
        </tr></thead>
        <tbody>
        ${ultimeEntrate.map(e=>{
          const cond = state.condomini.find(c=>c.id===e.condominoId)||{nome:'?',color:'#888'};
          return `<tr style="border-top:1px solid var(--border)${e.previsionale?';background:#fffbeb':''}">
            <td style="padding:6px 8px;font-size:11px;color:var(--text2);white-space:nowrap">${esc(e.data)}</td>
            <td style="padding:6px 8px">
              <div style="display:flex;align-items:center;gap:6px">
                <div class="avatar" style="${avatarStyle(cond.color)};width:20px;height:20px;font-size:9px;flex-shrink:0">${initials(cond.nome)}</div>
                <span style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px">${esc(cond.nome)}</span>
              </div>
            </td>
            <td style="padding:6px 8px;font-size:12px;font-weight:700;color:${e.previsionale?'#92400e':'var(--green)'};text-align:right;white-space:nowrap">${fmt(e.importo)}</td>
            <td style="padding:6px 8px;text-align:center">
              ${e.previsionale
                ? '<span style="font-size:9px;padding:2px 5px;border-radius:3px;background:#fef3c7;color:#92400e;font-weight:600">🔮 Prev.</span>'
                : '<span style="font-size:9px;padding:2px 5px;border-radius:3px;background:#d1fae5;color:var(--green);font-weight:600">✓ OK</span>'}
            </td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>`}
    </div>
  </div>`;
}

// Pulsanti e filtri della Dashboard. Chiamata da bindPageActions() (azioni.js).
function bindAzioniDashboard() {
  // Anno filter dashboard
  const ad = document.getElementById('anno-filter');
  if (ad) ad.onchange = e => { const a = parseInt(e.target.value)||new Date().getFullYear(); setState({filterAnno: a, filterAnni: [a]}); }; // anno singolo, allineato al filtro delle pagine elenco
}
