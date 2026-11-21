// Guardia dell'ambiente: il prototipo (fase A) parla SOLO con gli emulatori locali.
// Su un computer con credenziali Google predefinite l'SDK potrebbe altrimenti
// raggiungere la produzione. Se una condizione non è vera, il server non parte.
const LOCALI = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/;

function controllaAmbiente(env = process.env) {
  const errori = [];
  const progetto = env.MCP_PROJECT_ID || 'demo-qa';
  if (!/^demo-[a-z0-9-]+$/.test(progetto)) errori.push('il progetto deve iniziare con "demo-" (trovato: ' + progetto + ')');
  for (const nome of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
    if (!env[nome]) errori.push(nome + ' non è impostata');
    else if (!LOCALI.test(env[nome])) errori.push(nome + ' non punta a localhost (' + env[nome] + ')');
  }
  if (errori.length) {
    throw new Error('Avvio rifiutato dalla guardia ambiente (il prototipo funziona solo sugli emulatori): ' + errori.join('; '));
  }
  return { progetto, firestore: env.FIRESTORE_EMULATOR_HOST, auth: env.FIREBASE_AUTH_EMULATOR_HOST };
}

module.exports = { controllaAmbiente };
