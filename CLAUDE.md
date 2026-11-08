# Condominio Manager

App web per la gestione dei condomini (neridarimini20.it). JavaScript semplice con script classici e variabili globali (niente `import`, niente build), Firebase (Firestore, Storage, Auth, Cloud Functions Node 22), pubblicata con GitHub Pages. Repository **pubblico**: non scrivere mai segreti, dati reali o dettagli di falle ancora aperte in file tracciati.

## Come lavorare con me
- Rispondi sempre **in italiano**, anche nei resoconti finali. Codice e commenti sono in italiano. L'utente non è uno sviluppatore: spiega in modo semplice.
- Una modifica visibile all'utente aggiorna **nella stessa PR** `js/sezioni/guida.js` (voce della pagina toccata, nomi dei pulsanti esatti, livello di ruolo giusto). Una pagina nuova va anche nel test "ogni pagina del menu ha la sua guida" in `qa/unit.spec.js`.
- Prima di unire e pubblicare rileggi il diff cercando ciò che può rompere la produzione (funzioni, regole, permessi, perdita di dati, utenti chiusi fuori), correggi, rilancia i test e scrivilo nella PR.
- Lavora su un ramo e apri una PR; non fare commit o push su `main` senza che sia chiesto.

## Struttura
- `index.html` carica `css/` e `js/`. `js/core/` ha il codice trasversale (`avvio.js` si carica per ultimo); ogni area funzionale ha il suo file in `js/sezioni/`; `azioni.js` e `schede.js` fanno solo da regia.
- `functions/` ha un file per area (notifiche, permessi, profilo, limiti, controllo, backup, drive). Tutte le funzioni stanno in `europe-west1` (da `REGIONI_CALLABLE`).
- `firestore.rules` e `storage.rules`: `appdata/{key}` è una **lista chiusa**. Ogni nuova chiave `cm_*` va aggiunta a mano agli elenchi di lettura e scrittura e coperta da un test in `test/rules.spec.js`. Il margine delle 1000 espressioni è stretto: prova il caso peggiore.
- `index.staging.html` è identico a `index.html` tranne la configurazione: non modificarlo a mano.
- `qa/` test e banco di misura, `scripts/` strumenti e migrazioni, `quality/` profilo e report della squadra qualità (report ignorati da git).

## Comandi
| Comando | Cosa fa |
|---|---|
| `npm test` | regole Firestore e Storage sugli emulatori |
| `npm run test:unit` | test unitari e controllo delle impronte degli asset |
| `npm run test:functions` | integrazione delle Cloud Functions |
| `npm run test:e2e` | app nel browser con Playwright |
| `npm run qa:emulators` | avvia gli emulatori (progetto `demo-qa`) |
| `node scripts/stamp-assets.js` | **dopo ogni modifica a `css/` o `js/`**: aggiorna le impronte `?v=` |
| `node scripts/sync-staging.js` | dopo ogni modifica a `index.html`: rigenera `index.staging.html` |

La CI (`.github/workflows/test.yml`) esegue le quattro suite a ogni PR. I test girano solo sugli emulatori; se `npm test` fallisce in modo strano controlla che non sia rimasto un processo Java orfano sulla porta 8080.

## Pubblicazione
- Progetti Firebase: produzione `condominio-manager-9e99a`, staging `neridarimini-staging`. L'app va online da sola al merge su `main` (GitHub Pages).
- Il deploy lo lancio io, con `--non-interactive` e **mai con `--force`**: prima staging (solo regole e storage), poi produzione. Se il deploy chiede di cancellare funzioni, fermati e chiedi.
- Ordine sicuro: prima le funzioni, poi il merge (l'app non deve chiamare funzioni che non esistono).
- Per la produzione chiedi sempre la conferma esplicita dell'utente in chat. Non leggere dati di produzione e non lanciare gli script `*-prod-*` (`inspect-prod-condomini`, `migrate-prod-roles`, `seed-prod-superadmin`).
- Test distruttivi, prove di attacco e migrazioni di prova: solo su emulatori o staging.

## Regole del progetto da non dimenticare
- Testo dell'utente dentro HTML: sempre con `esc()`.
- Metadati `_` e cancellazione logica vanno rispettati dalle scritture nuove. Lo storico dei movimenti è intoccabile (con movimenti si archivia, non si elimina).
- La competenza nei subentri è sempre per giorno. Prima di lavorare su conti, subentri, ruoli o regole rileggi i log `quality/reports/*riparazione*` e le decisioni già prese.
- Stile: Geist, `--primary` nero/bianco, tutto in `css/stile.css`; stampa in `css/stampa.css`, grafici con i colori `--g-*` di `js/core/grafici.js`.

## Agenti di qualità
In `~/.claude/agents/condominio/` ci sono 14 agenti tarati su questo progetto (direttore-qualita, guardiano-sicurezza, revisore-codice, coerenza-progetto, riparatore…). Si lanciano solo su richiesta esplicita, per nome. Profilo: `quality/profilo-progetto.md` (non tracciato).
