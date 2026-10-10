// Schede di modifica: pulsanti comuni (bindModal) e smistamento del salvataggio (saveModal); le parti specifiche sono nelle funzioni bindScheda…/salvaScheda… dei file di sezione.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

function bindModal() {
  // Collega i pulsanti della scheda aperta: comuni qui, specifici nella funzione della sezione.
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
  bindSchedaPassword();
  bindSchedaEntrate();
  bindSchedaImpostazioni();
  bindSchedaSpese();
  bindSchedaFornitori();
  bindSchedaVita();
  bindSchedaCondomini();
}

function saveModal() {
  // Smista il salvataggio alla sezione della scheda aperta.
  const m = state.modal;
  if (m.type === 'spesa') salvaSchedaSpesa(m);
  else if (m.type === 'entrata') salvaSchedaEntrata(m);
  else if (m.type === 'cond') salvaSchedaCondomino(m);
}
