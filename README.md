# MTG Proxy Builder

Crea e stampa proxy di Magic: The Gathering su macOS e Windows. Importa una decklist, personalizza le carte e porta il mazzo su carta o esportalo come immagini.

[Scarica l’ultima release](https://github.com/StefanoVe/mtg-proxy-builder/releases/latest) · [Tutte le versioni](https://github.com/StefanoVe/mtg-proxy-builder/releases)

![Editor con Lightning Bolt selezionato, mazzo a sinistra e proprietà della carta a destra](docs/screenshots/editor.jpg)

## Download

| Sistema | Installer |
| --- | --- |
| macOS con Apple Silicon (serie M) | `-arm64.dmg` |
| macOS con processore Intel | `-x64.dmg` |
| Windows a 64 bit | `-x64.exe` |

Gli installer delle release automatiche sono distribuiti senza firma di distribuzione o notarizzazione.

## Dalla decklist alla stampa

Scegli **Italiano** o **English** nella barra superiore. Al primo avvio l’app usa la lingua di sistema se supportata, altrimenti l’inglese. La scelta viene ricordata ai successivi avvii.

1. **Importa il mazzo.** Cerca una carta su Scryfall oppure incolla una lista. Puoi indicare quantità, set e numero di collezione, per esempio `2 Lightning Bolt (2X2) 117`. I progetti e le immagini già acquisite sono salvati in locale.
2. **Personalizza le carte.** Seleziona un’edizione, modifica il testo o trascina un PNG, JPEG o WebP sull’anteprima. Regola ritaglio e zoom dalla scheda **Illustrazione**. Il primo edit del testo di una scansione originale attiva il template Full art.
3. **Scegli la cornice.** Sfoglia le edizioni o usa Full art e Illustrazione estesa. Da **Cornice → Personalizza template** puoi spostare e ridimensionare le zone, modificare colori e ombre, importare un overlay PNG e salvare la configurazione come base del progetto.
4. **Applica modifiche in blocco.** Abbina le immagini ai nomi delle carte, per esempio `Lightning Bolt.jpg`, e scegli come gestire duplicati e modifiche esistenti. Puoi applicare preset o set di cornici a tutta la selezione.
5. **Esporta.** Scegli **Foglio di stampa** per un PDF A4 o Letter, oppure **Carte singole** per salvare PNG o JPG in uno ZIP con risoluzione, abbondanza (bleed), retro e copie configurabili.

![Pannello Stampa con le opzioni Foglio di stampa e Carte singole](docs/screenshots/esportazione.jpg)

Per carte da **63 × 88 mm**, stampa il PDF al **100%**. Per le carte a due facce, scegli il ribaltamento sul lato lungo. I layout speciali mantengono la grafica dell’edizione selezionata. Ogni esportazione accetta fino a 1500 copie.

<details>
<summary>Set di cornici e simboli nel testo</summary>

- Da **Set di cornici** importa sei PNG trasparenti allineati, uno per ogni colore e uno incolore. Attiva la miscela per fondere le cornici delle carte multicolore. Con la miscela disattivata, le multicolore usano il PNG incolore, come le carte senza colore.
- Usa la notazione `{T}`, `{Q}`, `{E}`, `{W/U}` o `{U/P}` per inserire i simboli nel testo. L’anteprima e il PDF usano gli stessi SVG.

</details>

## Server MCP

MTG Proxy Builder include un server MCP locale su `stdio`. Il client avvia una seconda istanza senza finestra visibile. Il server usa la stessa libreria locale dell’editor e può funzionare con l’editor aperto.

Nel client MCP aggiungi una configurazione come questa, usando il percorso assoluto dell’eseguibile installato.

```json
{
  "mcpServers": {
    "mtg-proxy-builder": {
      "command": "/Applications/MTG Proxy Builder.app/Contents/MacOS/MTG Proxy Builder",
      "args": ["--mcp"]
    }
  }
}
```

Su Windows imposta `command` sul percorso di `MTG Proxy Builder.exe`, con i backslash raddoppiati nel JSON. Per avviare il server dal repository, esegui `npm ci` e `npm run build`, poi usa `npm` come comando e `["--prefix", "/percorso/assoluto/mtg-proxy-builder", "--silent", "run", "mcp"]` come argomenti.

| Strumenti | Operazioni |
| --- | --- |
| `list_projects`, `get_project` | Elenca e legge i progetti salvati. |
| `search_cards`, `list_printings`, `get_printing` | Cerca carte, edizioni e dettagli su Scryfall. |
| `parse_decklist`, `import_decklist` | Controlla le righe offline o importa la lista da Scryfall in un nuovo progetto. Usa `allowPartial: true` per salvare le righe riuscite anche in presenza di errori. |
| `import_image`, `save_project_copy` | Importa illustrazioni o cornici e salva un progetto completo con un nuovo ID. Per modificare un progetto esistente, parti dai dati restituiti da `get_project`. |
| `export_pdf`, `export_cards` | Esporta un progetto salvato in PDF A4 o Letter oppure in uno ZIP con PNG o JPG. Indica un nuovo percorso assoluto in una cartella esistente. |

I nuovi progetti compaiono nell’elenco quando l’editor torna in primo piano. Lo smoke test MCP si avvia con `npm run build && npm run test:mcp`.

## Sviluppo

Con Node.js 24:

```sh
npm ci
npm run dev
```

- `npm test` verifica parsing, abbinamenti, immagini e impaginazione.
- `npm run build && npm run test:desktop` prova l’editor Electron con un catalogo di test, esporta un PDF e uno ZIP e riapre il progetto offline.
- `npm run dist:mac` genera i DMG per Apple Silicon e Intel su macOS. `npm run dist:win` genera l’installer NSIS x64 su Windows.

Il workflow [Desktop builds and releases](.github/workflows/desktop.yml) prova i pacchetti per tutte e tre le piattaforme sulle pull request e sui push a `main`. Dopo ogni push riuscito su `main`, pubblica i tre installer in un’unica release con un tag nel formato `v<versione>-build.<numero>`. Puoi anche avviare manualmente la build dalla scheda Actions.

## Crediti

Le immagini di catalogo e i simboli provengono da Scryfall. Magic: The Gathering e i suoi simboli appartengono a Wizards of the Coast. [Catalogo dei simboli](https://api.scryfall.com/symbology)
