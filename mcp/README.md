# Connettore MCP (prototipo fase A)

Server MCP **in sola lettura** sulle spese (preventivo e consuntivo), solo su emulatori `demo-qa`. Non è collegato alla produzione e non scrive nulla.

- Guardia: non parte se il progetto non è `demo-*` o se gli host degli emulatori non sono locali (`lib/guardia.js`).
- Legge con l'identità di un utente di prova (stesse regole Firestore dell'app); l'edificio viene dal token (Super Admin: `MCP_EDIFICIO`), mai da un argomento dei tool.
- I calcoli sono quelli dell'app (`qa/load-app.js`): totali del rendiconto, ricorrenze (`generaOccorrenze`).
- I testi liberi escono troncati, senza link, nei campi `*_non_fidato`. Niente contatti, allegati, audit né quote per condomino.

Uso locale: `npm ci --prefix mcp`, avvio degli emulatori (`npm run qa:emulators`), `node qa/seed.js`, poi `MCP_EMAIL=member1@qa.test MCP_PASSWORD=... FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node mcp/server.js` (password di prova in `qa/seed.js`).

Test: `npm run test:mcp` dalla radice.
