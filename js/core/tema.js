// Tema chiaro o scuro. Scelta salvata sul dispositivo (localStorage
// "cm_tema"): "auto" segue l'impostazione del telefono o del computer,
// "chiaro" e "scuro" la forzano. Applicato su <html data-theme="…"> prima che
// la pagina compaia (questo file è caricato nella testata), così non c'è un
// lampo chiaro all'apertura in modalità scura. I colori sono in css/base.css.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

const TEMI = { auto: 'automatico', chiaro: 'chiaro', scuro: 'scuro' }; // valori ammessi per cm_tema

function temaScelto() {
  try { const t = localStorage.getItem('cm_tema'); return TEMI[t] ? t : 'auto'; } catch (e) { return 'auto'; }
}

function applicaTema() {
  const t = temaScelto();
  const scuro = t === 'scuro' || (t === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', scuro ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', scuro ? '#0F1623' : '#2563EB');
}

function temaScuroAttivo() {
  return document.documentElement.getAttribute?.('data-theme') === 'dark';
}

// Interruttore sole/luna accanto alla "Guida" di ogni pagina: passa al tema
// opposto a quello in uso e da quel momento la scelta vale su questo dispositivo
// (prima del primo tocco il tema segue il telefono o il computer).
function interruttoreTema() {
  try { localStorage.setItem('cm_tema', temaScuroAttivo() ? 'chiaro' : 'scuro'); } catch (e) { /* navigazione privata: vale fino alla chiusura */ }
  applicaTema();
  if (typeof render === 'function') render(); // aggiorna la posizione dell'interruttore
}

function renderInterruttoreTema() {
  const scuro = temaScuroAttivo();
  const sole = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const luna = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  return `<button type="button" class="tema-switch${scuro ? ' scuro' : ''}" role="switch" aria-checked="${scuro}" aria-label="Modalità scura" title="${scuro ? 'Passa al tema chiaro' : 'Passa al tema scuro'}" data-tema-switch data-focus-key="tema-switch">`
    + `<span class="ts-icona ts-sole" aria-hidden="true">${sole}</span><span class="ts-icona ts-luna" aria-hidden="true">${luna}</span><span class="ts-pomello" aria-hidden="true"></span></button>`;
}

applicaTema();
if (window.matchMedia) {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const segui = () => { if (temaScelto() === 'auto') applicaTema(); };
  if (mq.addEventListener) mq.addEventListener('change', segui); else if (mq.addListener) mq.addListener(segui);
}
