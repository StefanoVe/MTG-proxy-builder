# MTG Proxy Builder

## Avvio e test di Electron su macOS

- Esegui `npm run dev`, `npm run test:desktop` e `npm run test:mcp` in una sessione utente grafica con accesso a Launch Services e WindowServer. Il requisito vale anche per `--mcp`, che usa Electron per esportare PDF e immagini.
- Se Electron termina subito con `SIGABRT` in `_RegisterApplication`, controlla i rapporti in `~/Library/Logs/DiagnosticReports` e il log di sistema. Una voce `Sandbox restriction` per `com.apple.coreservices.launchservicesd` conferma che la sandbox del processo di avvio blocca la registrazione prima che venga eseguito il codice dell’app.
- Quando il log conferma il blocco, rilancia dalla sessione grafica usando un ambiente autorizzato ad accedere ai servizi di macOS. Se quell’ambiente non è disponibile, segnala il blocco e completa le verifiche possibili con `npm test` e `npm run build`.

## Token efficiency

Rules from https://github.com/drona23/claude-token-efficient (MIT), vendored in `vendor/claude-token-efficient/` (see `SOURCE.txt` for the commit). Shared by Claude Code and Codex. User instructions always override these rules.

### Universal (`CLAUDE.md`)

- Read existing files before writing. Don't re-read unless changed.
- Thorough in reasoning, concise in output.
- Skip files over 100KB unless required.
- No sycophantic openers or closing fluff.
- No emojis or em-dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names. Verify by reading code or docs before asserting.

### Compressed output (`RULES.md`, `profiles/CLAUDE.compressed.md`)

- Short sentences. No filler, no preamble, no pleasantries.
- Tool first, result first. No explanation unless asked.
- Code stays normal. Only prose gets compressed.
- Avoid parenthetical clauses. Hyphens only where grammar needs them.

### Coding (`profiles/CLAUDE.coding.md`)

- Return code first. Explanation after, only if non-obvious.
- Comments sparingly, only where logic is unclear. No boilerplate unless requested.
- Simplest working solution. No over-engineering, no speculative features or "you might also want...".
- No abstractions for single-use operations. Three similar lines beat a premature abstraction.
- No docstrings or type annotations on code not being changed.
- No error handling for scenarios that cannot happen.
- Never edit blind: read the file before modifying it. Prefer editing over rewriting whole files.
- Review: state the bug, show the fix, stop. No suggestions beyond scope, no compliments.
- Debugging: never speculate before reading the relevant code. State what, where, fix, in one pass. If the cause is unclear, say so.
- No smart quotes or decorative Unicode. Plain hyphens and straight quotes only. Accented letters are fine when content needs them. Code output must be copy-paste safe.

### Workflow (`profiles/CLAUDE.benchmark.md`, `profiles/*/rules/workflow.md`)

- Understand the requirements and read the relevant files, tests included, before writing code. The tests define success.
- Plan the full change before writing. Avoid partial, incremental rewrites.
- Run the relevant tests after changing code. Never declare done without running them at least once.
- Fix failures before moving on. Never iterate more than twice on the same error: rethink the approach instead.
- Once tests pass, stop. Do not refactor or polish passing code unless asked.
- Deliver exactly what was requested. No extras.
- Use relative paths. Never hardcode absolute paths.
- Handle edge cases in data: nulls, empty strings, type mismatches.

### Agents and automation (`profiles/CLAUDE.agents.md`)

- Execute the task. Do not narrate ("Now I will...", "I have completed...").
- Do not ask confirmation on clearly defined tasks. Use sensible defaults.
- If a step fails: state what failed, why, and what was attempted. Stop.
- Output consumed by programs (MCP, scripts, JSON) must be structured and parseable without post-processing, and safe for JSON serialization.
- Never invent file paths, API endpoints, function names, or field names. Unknown values are null or "UNKNOWN", never guessed.
- Never reference the contents of a file or resource that was not read.
- Cap parallel subagents at 3 unless explicitly instructed otherwise.

### Analysis and reporting (`profiles/CLAUDE.analysis.md`)

- Lead with the finding. Context and methodology after.
- Tables and bullets over prose. Numbers always carry units.
- Never state a number without a source or derivation. Never fabricate data, statistics, or citations.
- Missing data or low confidence: say so explicitly, with a reason. Do not estimate silently or round aggressively.
- Distinguish what the data shows from what is inferred, and label inferences.
- Reports: summary first (3 bullets max), supporting data, then caveats.

Not applied: the fixed tool-call budgets and the WebSocket patterns of the J/K/M benchmark profiles, which are specific to the upstream benchmark challenges.
