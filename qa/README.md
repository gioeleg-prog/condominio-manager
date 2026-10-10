# QA — suite di regressione e assessment di prontezza

Suite creata per l'assessment del 2026-10-04 (branch `qa-assessment-2026-10`).
Struttura secondo ISTQB (livelli di test) e ISO/IEC/IEEE 29119-3 (documentazione);
qualità valutata sul modello ISO/IEC 25010:2023.

| Livello ISTQB | File | Cosa copre | Ambiente |
|---|---|---|---|
| Componente (statico, regole) | `test/rules.spec.js` | firestore.rules: 64 casi | emulatore Firestore |
| Componente (unitario) | `qa/unit.spec.js` | calcoli, ricorrenze, id, CSV, escape | Node, nessun browser |
| Integrazione | `qa/functions.spec.js` | Cloud Functions + regole, matrice ruoli, isolamento edifici, concorrenza | emulatori auth/firestore/functions |
| Sistema (E2E) | `qa/out/harness.html` (generato) | app reale nel browser contro gli emulatori | browser + emulatori |

I test che oggi **falliscono** sono intenzionali: documentano difetti reali
(vedi report). Quando un difetto viene corretto, il relativo test diventa verde
e resta come test di regressione.

## Come eseguire

```bash
npm test                 # regole Firestore (64)
npm run test:unit        # logica di business
npm run test:functions   # Cloud Functions su emulatori (avvio/arresto automatico)
```

E2E manuale/assistito:

```bash
npm run qa:emulators     # in un terminale: auth, firestore, functions, storage
node qa/seed.js          # dati fittizi: 2 edifici, un utente per ruolo + casi limite
node qa/build-harness.js # genera qa/out/harness.html collegato agli emulatori
```

Poi servire la cartella (configurazione `qa-harness` in `.claude/launch.json`,
porta 8911) e aprire `http://localhost:8911/qa/out/harness.html`.
Gli utenti di test e la password (valida solo sull'emulatore) sono in `qa/seed.js`.

### Migrazione al modello per edificio (fase 2)

Il seed degli emulatori scrive i dati nel vecchio formato (`appdata/cm_*`) e poi
esegue la **stessa** migrazione usata sui progetti reali
(`scripts/lib/buildings-migration.js`): ogni esecuzione dei test la collauda.
`qa/seed.js` con `{ legacyOnly: true }` si ferma prima della migrazione.

Sui progetti reali:

```bash
node scripts/backfill-buildings.js --project=<id> --dry-run       # solo controlli e conteggi
node scripts/backfill-buildings.js --project=<id>                 # copia + verifica
node scripts/verify-backfill.js --project=<id>                    # sola verifica
node scripts/backfill-buildings.js --project=<id> --mark-cutover  # dopo il rilascio: blocca nuove copie
```

### Test di XSS memorizzata

Da rieseguire dopo ogni modifica che mostra dati nell'interfaccia (i testi
possono contenere `<` e `>`: la protezione è l'escape in pagina).

```bash
node qa/seed-xss.js      # al posto di qa/seed.js: payload HTML in ogni campo di testo
```

Nella pagina harness, dalla console:

```js
const s = document.createElement('script'); s.textContent = await (await fetch('/qa/xss-crawl.js')).text(); document.head.appendChild(s);
await qaXss.login('admin1@qa.test');
await qaXss.crawl(['dashboard','spese','entrate','bilancio','fornitori','vita','condomini','impostazioni']);
```

`hits` deve restare vuoto per ogni ruolo (member1, editor1, admin1, superadmin), anche a larghezza mobile.

### Struttura della pagina e file da aggiornare

`index.html` contiene solo intestazione e l'elenco dei file: lo stile è in `css/`, il codice in `js/`
(`js/core/` per stato, dati, permessi, utilità e avvio; `js/sezioni/` per le singole sezioni).
Gli script di `js/` sono "classici" e condividono le variabili globali: l'ordine in `index.html` conta
(`js/core/avvio.js` per ultimo). La configurazione Firebase è in `js/config.js` (produzione) e
`js/config.staging.js` (staging).

Dopo ogni modifica a `css/` o `js/`:

```bash
node scripts/stamp-assets.js   # aggiorna le impronte ?v= (evita file vecchi in cache nei browser)
```

Dopo ogni modifica a `index.html`: `node scripts/sync-staging.js` (rigenera `index.staging.html`).
Il test `qa/assets.spec.js` fallisce se impronte o pagina di staging non sono aggiornate.

Il progetto emulato è `demo-qa`: il prefisso `demo-` impedisce qualunque
accesso ai progetti Firebase reali (staging e produzione non vengono toccati).
