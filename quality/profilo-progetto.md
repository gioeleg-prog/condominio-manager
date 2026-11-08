# Profilo progetto: Condominio Manager (neridarimini20.it)

> Letto da tutti gli agenti della squadra "condominio" (`~/.claude/agents/condominio/`). Dove un dato non è noto c'è `Da Definire`: gli agenti lo riportano tra le informazioni mancanti. Data di compilazione: 2026-10-24. Le voci marcate *(assunzione)* sono dedotte dal repository o dalla storia del progetto e vanno confermate dal proprietario.

## 1. Identità

| Campo | Valore |
|---|---|
| Nome progetto | Condominio Manager (dominio `neridarimini20.it`) |
| Repository | `gioeleg-prog/condominio-manager`: un solo repository per interfaccia, Cloud Functions, regole e test. Pubblico su GitHub |
| Scopo | Gestione di più condomini (edifici): spese, entrate, ripartizione tra condomini, millesimi (opzionali), bilancio e rendiconto, fornitori, bacheca, verbali, lavori, delibere, affitti, allegati, email e link WhatsApp ai condomini, guida in app |
| Utenti | Misto: condomini (sola consultazione), editor, amministratori di edificio, Super Admin |
| Esposizione | Internet (GitHub Pages con dominio proprio; Firebase raggiungibile da chiunque conosca la chiave pubblica) |
| Criticità business | Media: dati contabili e di contatto di persone reali, ma pochi utenti. Un errore di ripartizione o una perdita di dati danneggia la fiducia dei condomini |
| Owner business | Gioele (Super Admin) |
| Owner tecnico | Gioele |
| Lingua | Interfaccia, messaggi, commenti e report: italiano |

## 2. Scelte tecniche

| Scelta | Valore | Note |
|---|---|---|
| Frontend | JavaScript semplice, **nessuna build e nessun framework** | `index.html` + `css/` + `js/`. Script **classici** con variabili globali condivise: l'ordine in `index.html` conta |
| Struttura frontend | `js/core/` (stato, dati, permessi, utils, render, avvio ultimo) e `js/sezioni/` (una per area: spese, entrate, bilancio, condomini, ...) | `azioni.js` e `schede.js` fanno solo da regia verso le sezioni |
| Modulo Firebase | `js/firebase.js` come modulo ES; SDK 12.19 da gstatic | Configurazione in `js/config.js` (produzione) e `js/config.staging.js` |
| Librerie incluse nel repo | jsPDF 4.2.1 e jspdf-autotable 5.0.8 in `js/vendor/` | Nessuna CDN per queste |
| Backend | Cloud Functions Firebase (2ª gen.), Node 22 | `firebase-functions` 7.4, `firebase-admin` 14.5. Tutte in `europe-west1` (il database è in eur3) |
| Database | Cloud Firestore | Modello per edificio: `buildings/{id}/{members, expenses, payments, suppliers, notices, minutes, works, resolutions}`. Metadati con prefisso `_` (`_createdBy`, `_updatedBy`, `_deleted`, ...). `appdata/cm_*` è l'archivio del vecchio formato, in sola lettura |
| Regole di accesso | `firestore.rules` e `storage.rules` | **Lista chiusa**: una chiave o collezione non elencata è negata a tutti |
| File | Cloud Storage (allegati, backup giornaliero 30 giorni) | Backup anche su Google Drive |
| Identità | Firebase Auth con accesso Google; registrazione libera disattivata | Il Super Admin entra solo con Google (2FA attiva sul suo account) |
| Ruoli | Claim e record `members`; `setUserRole`, `whoami`, `mioProfilo` | Un utente uscito perde i permessi (`permessiUsciti`) |
| Sessione | Sessione Firebase Auth nel browser (IndexedDB) | Nessun cookie applicativo |
| Email | Gmail via SMTP con segreto `GMAIL_APP_PASSWORD`, limiti in `functions/limiti.js` | 5 invii/ora e 50 destinatari/24h per condominio, 400/24h sulla casella |
| Migrazioni dati | Script manuali in `scripts/` e `scripts/lib/` | Nessuno strumento di migrazione. Il backfill del modello per edificio è già eseguito in produzione |
| Hosting frontend | GitHub Pages (branch `main`, root) | Nessun controllo sugli header HTTP: protezioni solo via `<meta>` |
| Piattaforma CI | GitHub Actions: `.github/workflows/test.yml` | Esegue le quattro suite sugli emulatori a ogni PR e push su `main`. `main` protetto: PR obbligatoria e controllo `test` |
| Ambienti Firebase | Produzione `condominio-manager-9e99a`, staging `neridarimini-staging`, emulatori `demo-qa` | `index.staging.html` è generato da `index.html` |

## 3. Comandi del progetto

| Operazione | Comando |
|---|---|
| Install | `npm ci` e `npm ci --prefix functions` |
| Lint | Da Definire: nessun linter configurato |
| Test regole Firestore (64 casi) | `npm test` |
| Test unitari e asset | `npm run test:unit` |
| Test integrazione Cloud Functions (emulatori) | `npm run test:functions` |
| Test end-to-end nel browser (Playwright) | `npm run test:e2e` |
| Prestazioni | `npm run bench` |
| Build | Nessuna. Dopo aver toccato `css/` o `js/`: `node scripts/stamp-assets.js`. Dopo aver toccato `index.html`: `node scripts/sync-staging.js` |
| Avvio locale | `npm run qa:emulators`, poi `node qa/seed.js` e `node qa/build-harness.js`; pagina su `http://localhost:8911/qa/out/harness.html` (configurazione `qa-harness`) |
| Deploy | Ordine: functions, poi pagina (merge su `main` e Pages), poi regole. Staging prima di produzione. Lo esegue Claude solo su richiesta |

Prima volta sul computer: `npx playwright install chromium`. Le suite richiedono Java (emulatore Firestore).

## 4. Dati e conformità

| Campo | Valore |
|---|---|
| Dati personali trattati | Sì: nome, email, telefono, unità, quote e versamenti per condomino, contatti dei fornitori, registro degli accessi (visibile solo al Super Admin) |
| Dati particolari o sensibili | No, per quanto noto. Da confermare: eventuali note libere con dati di salute o morosità |
| Normativa applicabile | GDPR. Nomina a responsabile (art. 28), informativa, termini di servizio e DPIA: Da Definire (fase 4 legale, non ancora affrontata) |
| Retention dei dati | Backup 30 giorni. Dati nell'app: nessun limite stabilito. Altro: Da Definire |
| Livello OWASP ASVS target | L2 *(assunzione: app su Internet con dati personali)* |
| Livello accessibilità | WCAG 2.2 AA |
| European Accessibility Act applicabile | Da Definire |
| Privacy tra condomini | **Decisione aperta**: oggi in "Bilancio per condomino" e "Confronto" tutti vedono quote e versamenti di tutti |
| Repository pubblico | Segreti e dati reali non devono mai finire nel repository né nella storia. Il file `.gitignore` esclude script con UID reali e report di assessment |

## 5. Ruoli e permessi

| Ruolo | Descrizione | Operazioni consentite | Note |
|---|---|---|---|
| `superAdmin` | Gioele, globale su tutti gli edifici | Tutto: edifici, ruoli, impostazioni, registro accessi, stato del servizio, marchio, reset dell'edificio attivo | Solo da `cm_config` o da claim, mai da un campo scritto dall'utente |
| `isAdmin` (amministratore di edificio) | Gestisce solo il proprio edificio | Dati dell'edificio, ruoli del proprio edificio, impostazioni, email ai condomini | Non può diventare superAdmin |
| `canEdit` (editor) | Aggiunge e modifica dati del proprio edificio | Spese, entrate, verbali, lavori e simili | Vede Impostazioni solo se admin |
| Lettura (condomino) | Consulta il proprio edificio | Lettura, `mioProfilo` (solo campi propri, cambio email verificato) | Vede i dati secondo la decisione aperta sulla privacy |
| Utente non collegato o disattivato | Nessun accesso | Messaggio di account disattivato | Registrazione libera disabilitata |

Regola chiave: l'isolamento tra edifici. Nessun ruolo diverso da `superAdmin` deve leggere o scrivere dati di un altro edificio.

## 6. Operazioni critiche

Su cui si concentrano `avversario-tecnico` e `avversario-regole`.

| Operazione | Entità | Stati | Integrazioni coinvolte |
|---|---|---|---|
| Registrare spesa o entrata e ripartirla tra condomini (split, millesimi, arrotondamenti, ricorrenze) | `expenses`, `payments`, `members` | Bozza, registrata, modificata, cancellata (logica) | Firestore, regole, `auditTrail` |
| Salvataggio concorrente dello stesso record da due utenti o due schede (stale save, fusione a 3 vie) | Tutti i record di `buildings/{id}` | Versione letta, versione salvata | Regole, `_updatedAt` e `_updatedBy` |
| Assegnare o cambiare un ruolo, collegare l'account (`setUserRole`, `whoami`, subentro, uscita di un condomino) | `members`, claim Auth | Invitato, collegato, attivo, uscito, revocato | Firebase Auth, `permessiUsciti` |
| Inviare email ai condomini (avvisi, verbali, rendiconti, estratti conto, promemoria rate) | `notices`, `limitiEmail`, `mailLog` | Prenotato, inviato, rifiutato | Gmail SMTP, scheduler 08:00 |
| Backup giornaliero e ripristino | `backups/`, `appSettings/backupStatus` | Eseguito, fallito, ripristinato (`_restoredAt`) | Storage, Google Drive, `scripts/restore-backup.js` |
| Caricare e cancellare allegati | Storage `allegati`, riferimenti nei record | Caricato, collegato, scollegato, file mancante | Storage, regole Storage |
| Chiusura e rendiconto di un anno, vista multi-anno | Spese, entrate, filtro anni | Anno aperto, chiuso, consultato | Generazione PDF e CSV |
| Cancellazione logica e reset dell'edificio | Tutti i record | Attivo, `_deleted` | `auditTrail`, regole |

## 7. Requisiti non funzionali

| Requisito | Valore | Stato |
|---|---|---|
| Utenti concorrenti | Pochi: 3 edifici e circa 10 condomini oggi | Da approvare |
| Tempo di risposta p95 delle operazioni standard | Da Definire. Banco di misura in `qa/bench` | Da approvare |
| Disponibilità | Da Definire (dipende da GitHub Pages e Firebase) | |
| RPO / RTO | RPO 24 ore (backup alle 03:00). RTO: Da Definire | RPO di fatto, non approvato |
| Soglia copertura test backend | Da Definire | |
| Soglia copertura test frontend | Da Definire | |
| Matrice dispositivi | Telefono (uso principale dei condomini), tablet, desktop, widescreen. Zoom 200% | Da approvare |
| Limiti dati | Documento Firestore max 1 MiB; max 10 allegati per record; limite di 1000 espressioni nelle regole | Tecnico |

## 8. Ambienti

| Ambiente | URL | Dati | Uso consentito agli agenti |
|---|---|---|---|
| Locale (emulatori `demo-qa`) | `http://localhost:8911` | Sintetici (`qa/seed.js`) | Tutto, salvo azioni distruttive sui file del repository |
| Staging (`neridarimini-staging`) | `index.staging.html` su GitHub Pages (URL esatto: Da Definire) | Di prova | Nessuna richiesta in rete senza conferma in chat |
| Produzione (`condominio-manager-9e99a`, `neridarimini20.it`) | https://neridarimini20.it | Reali | Nessuno. Mai leggere, scrivere o fare richieste |

## 9. Autorizzazioni per test attivi

| Test | Autorizzato | Firmatario | Data | Target | Finestra | Limiti | Contatto di emergenza |
|---|---|---|---|---|---|---|---|
| Penetration test | Solo sugli emulatori locali *(assunzione, non tocca dati reali)*. Staging e produzione: No | Gioele (da confermare) | Da Definire | Emulatori `demo-qa` | In qualsiasi momento | Nessuna richiesta verso host remoti | Gioele |
| Load / stress test | Solo `npm run bench` e misure locali. Altro: No | | | | | | |
| Failure injection | Solo sugli emulatori locali. Altro: No | | | | | | |

## 10. Strumenti già presenti

| Categoria | Strumento | Dove produce i report |
|---|---|---|
| Test regole | `test/rules.spec.js` (130 casi, Firestore e Storage) | Output di `npm test` |
| Test unitari | `qa/unit.spec.js`, `qa/assets.spec.js` | Output di `npm run test:unit` |
| Test integrazione | `qa/functions.spec.js` (matrice ruoli, isolamento edifici, concorrenza) | Output di `npm run test:functions` |
| Test E2E | Playwright in `qa/e2e/` | `qa/out/e2e-risultati/` |
| Accessibilità | axe-core dentro i test E2E | Output dei test |
| XSS | `qa/seed-xss.js` e `qa/xss-crawl.js` | Output dello script |
| Prestazioni | `qa/bench/` | `qa/out/` |
| SAST | Nessuno | |
| SCA / dipendenze | `npm audit --omit=dev --audit-level=high` nella CI (radice e functions) e Dependabot (.github/dependabot.yml) | CI |
| Secret scanning | Da Definire | |
| Monitoring | Pannello "Stato del servizio" (backup, registro modifiche, errori client), `controlloServizio` con email al Super Admin | Impostazioni, e email |

## 11. Percorsi delle fonti

| Fonte | Percorso |
|---|---|
| Regole comuni | `~/.claude/quality-kit/condominio/regole-comuni.md` |
| Contesto.md e Istruzioni.md | Non applicabili: descrivono lo stack Angular, Java e SQL Server. Le conformità si valutano contro la sezione 12 di questo file |
| Documentazione di progetto | `qa/README.md`; `js/sezioni/guida.js` (guida in app); `Condominio-Manager-Documentazione.docx` (locale, escluso dal repository) |
| Report | `quality/reports/` |

## 12. Convenzioni del progetto (le "regole della casa")

Gli agenti le usano come standard di riferimento al posto di `Contesto.md`.

1. **Regole Firestore a lista chiusa.** Ogni nuova collezione o chiave `cm_*` va elencata a mano in `firestore.rules`; altrimenti è negata a tutti, anche al Super Admin.
2. **Ogni modifica a `css/` o `js/` richiede `node scripts/stamp-assets.js`**; ogni modifica a `index.html` richiede `node scripts/sync-staging.js`. Il test `qa/assets.spec.js` controlla le impronte `?v=`.
3. **Script classici con globali condivise**: niente `import` nei file di `js/core` e `js/sezioni`; `avvio.js` va caricato per ultimo.
4. **Guida in app sempre aggiornata**: ogni funzione visibile aggiunta o cambiata aggiorna `js/sezioni/guida.js` nella stessa PR.
5. **Testo dell'utente sempre con `esc()`** quando finisce in HTML. La protezione XSS sta nell'escape in pagina, non nel divieto di `<` e `>` lato server.
6. **Nessun segreto nel repository** (è pubblico). Segreti solo in Secret Manager (`GMAIL_APP_PASSWORD`, `DRIVE_BACKUP`) e sugli emulatori in `functions/.secret.local` (ignorato).
7. **Regione `europe-west1`** per tutte le funzioni; `REGIONI_CALLABLE` in `functions/regioni.js`.
8. **Metadati `_`**: `_createdBy` e `_createdAt` immutabili, `_updatedBy` e `_updatedAt` firmati dal server, cancellazione solo logica (`_deleted`).
9. **Ruoli**: nessun campo scritto dal client può dare `superAdmin`. Il ruolo nasce solo da `cm_config` o da claim.
10. **Deploy**: functions, poi Pages, poi regole; staging prima di produzione; attendere circa 10 minuti la cache di Pages.
11. **Test**: i test di regressione esistenti non si indeboliscono per farli passare. Un difetto corretto fa diventare verde il test che lo documentava.
12. **Lingua**: italiano ovunque (interfaccia, commenti, messaggi, report).

## 13. Decisioni prese e aperte (aggiornato 2026-10-26)

Prese: D4 la spesa segue la data (si aggiunge a mano chi è uscito); D1 la quota di chi esce resta a lui e il piano la segnala; solo importi positivi; Applica i millesimi solo dalla data Valgono dal; un rappresentante per appartamento; subentro futuro: chi esce resta attivo fino alla data; con movimenti si archivia; editor: segnalazione senza blocco; anni passati: avviso senza blocco; operazioni sensibili rileggono il ruolo dal database (finestra di circa un'ora per le letture dirette su Firestore e Storage, ancora da registrare come rischio accettato).

Aperte: ADV-FUNC-013 (rate previste di chi esce), ADV-FUNC-033, RA-14, RA-15, SEC-018, users/{uid} (negare la scrittura), CONS-009 (controllo di versione nelle regole), residuo SEC-019/021 (otto o più allegati nuovi con tutti i riferimenti), privacy tra condomini, vendita a canone, GitHub Pro o Firebase Hosting, restrizione della chiave API, provider del Super Admin, storia del repository, copia degli allegati nel backup.
