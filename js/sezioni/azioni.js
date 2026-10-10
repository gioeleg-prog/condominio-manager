// Regia del collegamento dei pulsanti della pagina corrente (bindPageActions): ogni sezione ha la sua funzione bindAzioni… nel proprio file.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

function bindPageActions() {
  // Collega i pulsanti della pagina corrente: ogni sezione ha la sua funzione nel proprio file.
  bindAzioniDashboard();
  bindAzioniSpese();
  bindAzioniBilancio();
  bindAzioniConfronto();
  bindAzioniVita();
  bindAzioniEntrate();
  bindAzioniCondomini();
  // Allegati in tabella
  bindAllegatiInTable([
    { records: state.spese, stateKey: 'spese', appdataKey: 'cm_spese' },
    { records: state.verbali, stateKey: 'verbali', appdataKey: 'cm_verbali' },
  ]);
  bindAzioniImpostazioni();
  bindAzioniFornitori();
  // Data-page quick links
  document.querySelectorAll('[data-page]').forEach(el => {
    if (!el.onclick) el.onclick = () => setState({page:el.dataset.page, sidebarOpen:false});
  });
}
