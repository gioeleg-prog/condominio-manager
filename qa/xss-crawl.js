// Crawler per il test di XSS memorizzata (da eseguire nella pagina harness
// dopo `node qa/seed-xss.js`): visita pagine, tab e modali di modifica e
// conta i payload eseguiti o diventati elementi. Uso dalla console:
//   await qaXss.login('member1@qa.test'); await qaXss.crawl(['dashboard','spese'])
(function () {
  window.alert = () => {}; window.confirm = () => false; window.prompt = () => null;
  const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
  const hits = []; let visited = 0;
  const errors = []; window.addEventListener('error', (e) => errors.push(String(e.message)));
  const check = (where) => {
    visited++;
    const n = document.querySelectorAll('[data-xss]').length;
    if (n || window.__xss) hits.push(`${where}: elementi=${n} eseguiti=${window.__xss || 0}`);
    window.__xss = 0;
    document.querySelectorAll('[data-xss]').forEach((e) => e.remove());
  };
  const isOpener = (b) => /✏|Modifica|Storico|Dettaglio|📋|👁|📄|📎/.test(b.textContent || '') || b.dataset.edit || b.dataset.viewAllegato;
  const openers = () => [...document.querySelectorAll('button,[data-view-allegato]')].filter(isOpener);
  async function openAll(where, reset) {
    const n = Math.min(openers().length, 12);
    for (let i = 0; i < n; i++) {
      reset(); await wait(60);
      try { openers()[i]?.click(); } catch (e) { hits.push(`${where} modale#${i}: ERRORE ${e.message}`); }
      await wait(); check(`${where} modale#${i}(${state.modal?.type || '-'})`);
    }
  }
  async function crawlPage(role, p) {
    try { setState({ page: p, filterAnno: 0, filterAnni: [], modal: null }); } catch (e) { hits.push(`${role}/${p}: ERRORE ${e.message}`); return; }
    await wait(); check(`${role}/${p}`);
    const tabs = [...document.querySelectorAll('[data-vita-tab],[data-tab]')]
      .map((b) => (b.dataset.vitaTab ? ['vitaTab', b.dataset.vitaTab] : ['bilancioTab', b.dataset.tab]));
    for (const [k, v] of tabs) {
      try { setState({ [k]: v }); } catch (e) { hits.push(`${role}/${p}/${v}: ERRORE ${e.message}`); continue; }
      await wait(); check(`${role}/${p}/${v}`);
      await openAll(`${role}/${p}/${v}`, () => setState({ page: p, [k]: v, modal: null }));
    }
    if (!tabs.length) await openAll(`${role}/${p}`, () => setState({ page: p, modal: null }));
    setState({ modal: null });
  }
  window.qaXss = {
    hits, errors,
    get visited() { return visited; },
    async login(email) {
      if (state.user) { await window._fb.signOut(window._fb.auth); await wait(1500); }
      document.getElementById('inp-login').value = email;
      document.getElementById('inp-pw').value = 'QaTest-2026!';
      document.getElementById('btn-login').click();
      await wait(6000);
      return state.user?.nome;
    },
    async crawl(pages) {
      const role = state.user?.nome || '?';
      for (const p of pages) await crawlPage(role, p);
      return { visited, hits: hits.slice(), errors: errors.slice(0, 5) };
    },
  };
})();
