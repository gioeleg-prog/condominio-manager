// Carica la logica dell'app (script classici di js/) in una sandbox Node, la stessa dei test
// unitari (qa/load-app.js), e vi mette lo stato di un edificio. Così i calcoli (totali,
// ricorrenze, ripartizioni) sono quelli dell'app e non una copia da tenere allineata.
const { loadApp } = require('../../qa/load-app');

function appPerEdificio(dati) {
  const app = loadApp();
  const edificioAttivo = Number(dati.edificioId);
  app.__set('state', {
    ...app.__get('state'),
    edificioAttivo,
    condomini: dati.condomini,
    spese: dati.spese,
    entrate: dati.entrate,
    fornitori: dati.fornitori,
  });
  return app;
}

module.exports = { appPerEdificio };
