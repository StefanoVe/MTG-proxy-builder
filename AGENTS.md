# MTG Proxy Builder

## Avvio e test di Electron su macOS

- Esegui `npm run dev`, `npm run test:desktop` e `npm run test:mcp` in una sessione utente grafica con accesso a Launch Services e WindowServer. Il requisito vale anche per `--mcp`, che usa Electron per esportare PDF e immagini.
- Se Electron termina subito con `SIGABRT` in `_RegisterApplication`, controlla i rapporti in `~/Library/Logs/DiagnosticReports` e il log di sistema. Una voce `Sandbox restriction` per `com.apple.coreservices.launchservicesd` conferma che la sandbox del processo di avvio blocca la registrazione prima che venga eseguito il codice dell’app.
- Quando il log conferma il blocco, rilancia dalla sessione grafica usando un ambiente autorizzato ad accedere ai servizi di macOS. Se quell’ambiente non è disponibile, segnala il blocco e completa le verifiche possibili con `npm test` e `npm run build`.
