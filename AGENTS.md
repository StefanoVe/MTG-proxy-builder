# MTG Proxy Builder

## Avvio e test di Electron su macOS

- Esegui `npm run dev`, `npm run test:desktop` e `npm run test:mcp` in una sessione utente grafica con accesso a Launch Services e WindowServer. Il requisito vale anche per `--mcp`, che usa Electron per esportare PDF e immagini.
- Se Electron termina subito con `SIGABRT` in `_RegisterApplication`, controlla i rapporti in `~/Library/Logs/DiagnosticReports` e il log di sistema. Una voce `Sandbox restriction` per `com.apple.coreservices.launchservicesd` conferma che la sandbox del processo di avvio blocca la registrazione prima che venga eseguito il codice dell’app.
- Quando il log conferma il blocco, rilancia dalla sessione grafica usando un ambiente autorizzato ad accedere ai servizi di macOS. Se quell’ambiente non è disponibile, segnala il blocco e completa le verifiche possibili con `npm test` e `npm run build`.

## Token efficiency

Rules from https://github.com/drona23/claude-token-efficient (MIT). Shared by Claude Code and Codex.

- Read existing files before writing. Don't re-read unless changed.
- Thorough in reasoning, concise in output.
- Skip files over 100KB unless required.
- No sycophantic openers or closing fluff.
- No emojis or em-dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names. Verify by reading code or docs before asserting.

### Coding profile

From `profiles/CLAUDE.coding.md` of the same repo.

- Return code first. Explanation after, only if non-obvious.
- Simplest working solution. No over-engineering, no speculative features.
- No abstractions for single-use operations. Three similar lines beat a premature abstraction.
- No boilerplate, docstrings or type annotations on code not being changed.
- No error handling for scenarios that cannot happen.
- Never edit blind: read the file before modifying it.
- Review: state the bug, show the fix, stop. No suggestions beyond scope, no compliments.
- Debugging: never speculate before reading the relevant code. State what, where, fix. If the cause is unclear, say so.
- Plain hyphens and straight quotes only. Accented letters are fine when content needs them.
