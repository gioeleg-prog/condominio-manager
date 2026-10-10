// Tema chiaro o scuro. Scelta salvata sul dispositivo (localStorage
// "cm_tema"): "auto" segue l'impostazione del telefono o del computer,
// "chiaro" e "scuro" la forzano. Applicato su <html data-theme="…"> prima che
// la pagina compaia (questo file è caricato nella testata), così non c'è un
// lampo chiaro all'apertura in modalità scura. I colori sono in css/base.css.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

const TEMI = { auto: '🌓 Tema: automatico', chiaro: '☀️ Tema: chiaro', scuro: '🌙 Tema: scuro' };

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

// Automatico → chiaro → scuro → automatico.
function cambiaTema() {
  const ordine = ['auto', 'chiaro', 'scuro'];
  const nuovo = ordine[(ordine.indexOf(temaScelto()) + 1) % ordine.length];
  try { localStorage.setItem('cm_tema', nuovo); } catch (e) { /* navigazione privata: vale fino alla chiusura */ }
  applicaTema();
  if (typeof render === 'function') render(); // aggiorna l'etichetta del pulsante
}

applicaTema();
if (window.matchMedia) {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const segui = () => { if (temaScelto() === 'auto') applicaTema(); };
  if (mq.addEventListener) mq.addEventListener('change', segui); else if (mq.addListener) mq.addListener(segui);
}
