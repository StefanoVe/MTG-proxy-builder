import { _electron } from 'playwright';
import { unzipSync } from 'fflate';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const cwd = process.cwd();
const require = createRequire(join(cwd, 'package.json'));
const { PDFDocument } = require('pdf-lib');
const paths = await mkdtemp(join(tmpdir(), 'mtg-workflow-'));
const profile = join(paths, 'profile');
const pdfPath = join(paths, 'smoke.pdf');
const zipPath = join(paths, 'smoke.zip');
const launch = () => _electron.launch({
  executablePath: process.env.MTG_SMOKE_EXECUTABLE ? resolve(process.env.MTG_SMOKE_EXECUTABLE) : require('electron'),
  args: [...(process.env.MTG_SMOKE_EXECUTABLE ? [] : ['.']), '--user-data-dir=' + profile], cwd, timeout: 15000
});
const undoKey = process.platform === 'darwin' ? 'Meta' : 'Control';
let electron = await launch();
try {
  let page = await electron.firstWindow();
  page.on('pageerror', error => console.error('Page error:', error));
  const choose = async (control, value) => {
    await control.click();
    await page.locator(`.select-menu [role=option][data-value=${JSON.stringify(value)}]`).click();
  };
  // Deck style tiles live in the deck settings dialog ("Impostazioni del mazzo"), opened from the deck panel.
  const deckSettings = () => page.getByRole('dialog', { name: 'Impostazioni del mazzo', exact: true });
  const openDeckSettings = async () => {
    if (!await deckSettings().isVisible()) await page.getByRole('button', { name: 'Impostazioni del mazzo', exact: true }).click();
  };
  const deckStyle = () => deckSettings().getByRole('radiogroup', { name: 'Stile delle carte', exact: true });
  const closeDeckSettings = async () => {
    await deckSettings().getByRole('button', { name: 'Fatto', exact: true }).click();
    await deckSettings().waitFor({ state: 'hidden' });
  };
  const chooseDeckStyle = async name => {
    await openDeckSettings();
    await deckStyle().getByRole('radio', { name, exact: true }).click();
    await closeDeckSettings();
  };
  // Frame tiles (role=radio) of the inspector frame tab.
  const frameStyle = () => page.locator('#workspace-properties').getByRole('radiogroup', { name: 'Cornice', exact: true });
  const chooseFrame = name => frameStyle().getByRole('radio', { name, exact: true }).click();
  const frameIs = name => frameStyle().getByRole('radio', { name, exact: true }).isChecked();
  const pickTile = (group, name) => group.getByRole('radio', { name, exact: true }).click();
  // Sections of the frame editor are the tabs of its focus-mode navigation.
  const editorSection = name => page.locator('.editor-section-list').getByRole('tab', { name: new RegExp(`^${name}\\b`) });
  // React updates are asynchronous: poll a read until the check passes.
  const until = async (read, check) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const value = await read();
      if (check(value)) return value;
      await page.waitForTimeout(50);
    }
    throw new Error('Condition not reached');
  };
  const language = page.locator('.language-select .select-trigger');
  await choose(language, 'en');
  await page.getByRole('heading', { name: 'Find a card' }).waitFor({ timeout: 10000 });
  const desktopViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  await page.setViewportSize({ width: 375, height: 812 });
  const emptyStage = page.locator('.stage');
  assert.ok(await emptyStage.getByRole('button', { name: 'Add blank card' }).isVisible());
  await emptyStage.getByRole('button', { name: 'Import decklist' }).click();
  const decklist = page.getByRole('textbox', { name: 'Decklist', exact: true });
  await decklist.fill('0 Mountain');
  await page.getByRole('button', { name: 'Import cards' }).click();
  await page.getByText('Line 1 · 0 Mountain').waitFor();
  await decklist.clear();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.setViewportSize(desktopViewport);
  await page.reload();
  await page.getByRole('heading', { name: 'Find a card' }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await language.getAttribute('data-value'), 'en');
  await choose(language, 'it');
  await page.getByRole('heading', { name: 'Cerca una carta' }).waitFor({ timeout: 10000 });
  assert.equal(await page.locator('html').getAttribute('lang'), 'it');
  await page.screenshot({ path: join(paths, 'empty.png') });
  await page.getByRole('button', { name: 'Aggiungi carta vuota' }).click();
  await chooseDeckStyle('Full art');
  await page.getByRole('button', { name: 'Esporta', exact: true }).click();
  await page.getByRole('button', { name: 'PDF per la stampa' }).click();
  const pdfSetup = page.getByRole('dialog', { name: 'Esporta PDF' });
  await pdfSetup.getByText('Importa un’illustrazione per questa cornice.', { exact: false }).waitFor();
  assert.ok(await pdfSetup.getByRole('button', { name: 'Salva PDF' }).isDisabled());
  const paperSelect = pdfSetup.getByLabel(/^Carta/);
  await choose(paperSelect, 'Letter');
  await paperSelect.press('ArrowDown');
  await pdfSetup.getByRole('listbox').waitFor();
  await page.keyboard.press('Escape');
  await pdfSetup.getByRole('listbox').waitFor({ state: 'hidden' });
  assert.equal(await paperSelect.getAttribute('data-value'), 'Letter');
  assert.ok(await paperSelect.evaluate(element => document.activeElement === element));
  await page.keyboard.press('Escape');
  await pdfSetup.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Esporta', exact: true }).click();
  await page.getByRole('button', { name: 'PDF per la stampa' }).click();
  await choose(paperSelect, 'Letter');
  await choose(pdfSetup.getByLabel('Da esportare'), 'current');
  await pdfSetup.getByRole('button', { name: 'Apri la prima carta da correggere' }).click();
  await pdfSetup.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement === document.querySelector('.stage-heading h1'));
  await page.getByRole('button', { name: 'Torna alle impostazioni PDF' }).click();
  await pdfSetup.waitFor();
  assert.equal(await paperSelect.getAttribute('data-value'), 'Letter');
  assert.equal(await pdfSetup.getByLabel('Da esportare').getAttribute('data-value'), 'current');
  await pdfSetup.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await page.getByRole('button', { name: 'Esporta', exact: true }).click();
  await page.getByRole('button', { name: 'Immagini delle carte (ZIP)' }).click();
  const zipSetup = page.getByRole('dialog', { name: 'Immagini delle carte (ZIP)' });
  const formatSelect = zipSetup.getByLabel(/^Formato/);
  await choose(formatSelect, 'jpg');
  await zipSetup.getByRole('button', { name: 'Salva ZIP' }).click();
  await zipSetup.getByRole('button', { name: 'Apri la carta da correggere' }).click();
  await page.getByRole('button', { name: 'Torna alle impostazioni ZIP' }).click();
  await zipSetup.waitFor();
  assert.equal(await formatSelect.getAttribute('data-value'), 'jpg');
  await zipSetup.getByRole('button', { name: 'Chiudi', exact: true }).click();
  const undoChange = page.getByRole('button', { name: 'Annulla ultima modifica' });
  await undoChange.click();
  await undoChange.click();
  await page.getByRole('heading', { name: 'Cerca una carta' }).waitFor();
  const assetFiles = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 744;
    canvas.height = 1039;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#d9c083';
    ctx.lineWidth = 30;
    ctx.strokeRect(15, 15, 714, 1009);
    ctx.fillStyle = '#ecdbb5';
    ctx.fillRect(25, 36, 694, 80);
    ctx.fillRect(25, 625, 694, 360);
    const frame = canvas.toDataURL();
    ctx.fillStyle = '#1a3843';
    ctx.fillRect(0, 0, 744, 1039);
    ctx.fillStyle = '#efb967';
    ctx.beginPath();
    ctx.arc(354, 338, 148, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#5b6970';
    ctx.beginPath();
    ctx.moveTo(0, 595); ctx.lineTo(325, 300); ctx.lineTo(620, 650); ctx.lineTo(744, 522); ctx.lineTo(744, 1039); ctx.lineTo(0, 1039);
    ctx.fill();
    const art = canvas.toDataURL();
    const catalog = canvas.toDataURL('image/webp');
    ctx.fillStyle = '#bc258e';
    ctx.fillRect(0, 0, 48, 48);
    return { art, catalog, catalogBack: canvas.toDataURL('image/webp'), frame };
  });
  const artFile = join(paths, 'Lightning Bolt.png');
  const frameFile = join(paths, 'Cornice.png');
  await writeFile(artFile, Buffer.from(assetFiles.art.split(',')[1], 'base64'));
  await writeFile(frameFile, Buffer.from(assetFiles.frame.split(',')[1], 'base64'));
  await electron.evaluate(({ dialog }, { artFile, frameFile, pdfPath, zipPath, catalog, catalogBack }) => {
    let nextFiles = [];
    globalThis.setSmokeFiles = (...files) => { nextFiles = files.map(file => ({ art: artFile, frame: frameFile })[file]); };
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: nextFiles });
    dialog.showSaveDialog = async (_window, options) => ({
      canceled: false, filePath: options.filters[0].extensions[0] === 'zip' ? zipPath : pdfPath
    });
    const id = 'd0000000-0000-4000-8000-000000000000';
    const exact = { id, oracle_id: id, name: 'Lightning Bolt', lang: 'en', set: '2x2', set_name: 'Double Masters 2022',
      collector_number: '117', layout: 'normal', colors: ['R'], type_line: 'Instant',
      mana_cost: '{R}', oracle_text: 'Lightning Bolt deals 3 damage to any target.', artist: 'Christopher Moeller',
      image_uris: { art: 'https://cards.scryfall.io/art/demo.webp', display: 'https://cards.scryfall.io/display/demo.webp' },
      prints_search_uri: 'https://api.scryfall.com/cards/search?q=bolt' };
    const second = { ...exact, id: 'd0000000-0000-4000-8000-000000000001', set: 'm11', set_name: 'Magic 2011', collector_number: '149' };
    const grindstone = { ...exact, id: 'd0000000-0000-4000-8000-000000000003', oracle_id: '97560adc-814e-450c-9ca7-f9364e910a0b',
      name: 'Grindstone', set: 'tmp', set_name: 'Tempest', collector_number: '290', colors: [], type_line: 'Artifact', mana_cost: '{1}' };
    const digitalGrindstone = { ...grindstone, id: 'd0000000-0000-4000-8000-000000000004',
      set: 'tpr', set_name: 'Tempest Remastered', collector_number: '223', digital: true };
    const cardFaces = ['Sole', 'Luna'].map((name, index) => {
      const file = index === 0 ? 'demo.webp' : 'back.webp';
      return { name, type_line: 'Creature', oracle_text: `Testo di ${name}.`,
        image_uris: { art: `https://cards.scryfall.io/art/${file}`, display: `https://cards.scryfall.io/display/${file}` } };
    });
    const double = { ...exact, id: 'd0000000-0000-4000-8000-000000000002', name: 'Sole // Luna', layout: 'transform',
      collector_number: '5', full_art: true, image_uris: undefined, card_faces: cardFaces };
    const autocompleteReady = new Promise(resolve => { globalThis.finishSmokeSearch = resolve; });
    globalThis.fetch = async (url, init) => {
      const path = new URL(url);
      if (path.hostname === 'cards.scryfall.io') {
        const image = path.pathname.endsWith('/back.webp') ? catalogBack : catalog;
        return new Response(Buffer.from(image.split(',')[1], 'base64'), { headers: { 'content-type': 'image/webp' } });
      }
      if (path.pathname === '/cards/named') {
        const card = [exact, digitalGrindstone].find(card => card.name === path.searchParams.get('exact'));
        return card ? Response.json(card) : new Response(null, { status: 404 });
      }
      if (path.pathname === '/cards/autocomplete') {
        const query = path.searchParams.get('q');
        if (query === 'Lightning Bol') await autocompleteReady;
        return Response.json({ data: [query.startsWith('Grind') ? grindstone.name : exact.name] });
      }
      if (path.pathname === '/cards/collection') return Response.json({
        data: JSON.parse(init.body).identifiers.flatMap(item => {
          if (item.name === grindstone.name || item.set === digitalGrindstone.set) return [digitalGrindstone];
          if (item.name === exact.name || item.set === exact.set) return [exact];
          return item.name === double.name ? [double] : [];
        })
      });
      if (path.pathname === '/cards/search') {
        const query = path.searchParams.get('q');
        if (query === `oracleid:${grindstone.oracle_id} game:paper`) return Response.json({ data: [grindstone] });
        return Response.json({ data: [exact, second] });
      }
      const card = [exact, second, double].find(card => path.pathname === '/cards/' + card.id);
      return card ? Response.json(card) : new Response(null, { status: 404 });
    };
  }, { artFile, frameFile, pdfPath, zipPath, catalog: assetFiles.catalog, catalogBack: assetFiles.catalogBack });
  const grindstoneSearch = await page.evaluate(() => window.proxy.search('Grindstone'));
  assert.equal(grindstoneSearch.exact?.set, 'tmp');
  assert.deepEqual(grindstoneSearch.choices, []);
  const grindstoneSuggestions = await page.evaluate(() => window.proxy.search('Grindston'));
  assert.deepEqual(grindstoneSuggestions.choices.map(card => card.set), ['tmp']);
  const grindstoneImport = await page.evaluate(() => window.proxy.resolve([
    { name: 'Grindstone', count: 1 }, { name: 'Grindstone', count: 1, set: 'tpr', number: '223' }
  ]));
  assert.equal(grindstoneImport[0]?.set, 'tmp');
  assert.equal(grindstoneImport[1], null);
  const input = page.getByRole('searchbox', { name: 'Nome della carta da cercare' });
  const search = page.getByRole('search').getByRole('button', { name: 'Cerca carta' });
  assert.equal(await search.isDisabled(), true);
  await input.fill('Lightning Bol');
  await input.press('Enter');
  await page.locator('.search-feedback').getByText('Ricerca nel catalogo…', { exact: true }).waitFor();
  assert.equal(await search.isDisabled(), true);
  await electron.evaluate(() => globalThis.finishSmokeSearch());
  const match = page.locator('.results').getByRole('button', { name: /Lightning Bolt/ });
  await match.waitFor();
  await input.press('ArrowDown');
  assert.equal(await match.evaluate(button => button === document.activeElement), true);
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Lightning Bolt', exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement === document.querySelector('.stage-heading h1'));
  await input.fill('Lightning Bolt');
  const result = await page.evaluate(() => window.proxy.search('Lightning Bolt'));
  assert.ok(result.exact);
  assert.equal(await page.getByLabel('Costo di mana').inputValue(), '{R}');
  assert.equal(await page.getByLabel('Tipo', { exact: true }).inputValue(), 'Instant');
  const cardText = page.getByRole('textbox', { name: 'Testo della carta', exact: true });
  assert.equal(await cardText.inputValue(), 'Lightning Bolt deals 3 damage to any target.');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return canvas?.width === 744 && Math.abs(canvas.getContext('2d').getImageData(0, 0, 1, 1).data[1] - 56) < 6;
  });
  await input.fill('');
  await page.getByRole('button', { name: 'Edizioni', exact: true }).click();
  await page.getByRole('button', { name: /Magic 2011/ }).click();
  await page.locator('.source').getByText('Magic 2011').waitFor();
  const inspector = page.locator('#workspace-properties');
  const frameTab = inspector.getByRole('tab', { name: 'Cornice', exact: true });
  const cardTab = inspector.getByRole('tab', { name: 'Carta', exact: true });
  const artTab = inspector.getByRole('tab', { name: 'Illustrazione', exact: true });
  const elementToggle = name => inspector.locator('.element-toggles').getByRole('button', { name, exact: true });
  // Element toggles select one element; clicking the pressed one would clear it, so only click when needed.
  const pressElement = async name => {
    if (await elementToggle(name).getAttribute('aria-pressed') !== 'true') await elementToggle(name).click();
  };
  // Alignment tiles of the selected text element; "Come nella cornice" is the inherited value.
  const alignGroup = () => inspector.getByRole('radiogroup', { name: 'Allineamento', exact: true });
  const chooseAlign = name => alignGroup().getByRole('radio', { name, exact: true }).click();
  const alignIs = name => alignGroup().getByRole('radio', { name, exact: true }).isChecked();
  // The exact position fields sit in a collapsed "Posizione esatta" disclosure.
  const zoneX = inspector.locator('.zone-fields').getByRole('spinbutton', { name: 'X', exact: true });
  const openExactValues = async () => {
    const details = inspector.locator('details.exact-values');
    await details.waitFor();
    if (!await details.evaluate(node => node.open)) await details.locator('summary').click();
  };
  assert.equal(await alignGroup().count(), 0);
  await frameTab.click();
  assert.equal(await frameIs('Originale (scansione)'), true);
  await pressElement('Testo');
  await inspector.getByText('Se cambi l’allineamento del testo, l’editor applica il template Full art.').waitFor();
  assert.equal(await zoneX.count(), 0);
  await chooseAlign('Destra');
  assert.equal(await frameIs('Full art'), true);
  assert.equal(await elementToggle('Testo').getAttribute('aria-pressed'), 'true');
  assert.equal(await alignIs('Destra'), true);
  await openExactValues();
  await zoneX.waitFor();
  await chooseAlign('Come nella cornice');
  await chooseFrame('Originale (scansione)');
  await openDeckSettings();
  const firstEditFrame = deckSettings().getByLabel('Stile per le carte originali modificate');
  await deckSettings().getByText('Opzioni avanzate', { exact: true }).click();
  assert.equal(await firstEditFrame.getAttribute('data-value'), 'full-art');
  await choose(firstEditFrame, 'extended-art');
  await deckSettings().getByRole('button', { name: 'Fatto', exact: true }).click();
  await deckSettings().waitFor({ state: 'hidden' });
  await pressElement('Testo');
  await inspector.getByText('Se cambi l’allineamento del testo, l’editor applica il template Illustrazione estesa.').waitFor();
  await chooseAlign('Destra');
  assert.equal(await frameIs('Illustrazione estesa'), true);
  await chooseAlign('Come nella cornice');
  await chooseFrame('Originale (scansione)');
  await cardTab.click();
  await inspector.getByText('Se modifichi un campo, la carta passa allo stile Illustrazione estesa, così il testo si può riscrivere. Puoi annullare.').waitFor();
  await cardText.fill('Pesca una carta.');
  await frameTab.click();
  assert.equal(await frameIs('Illustrazione estesa'), true);
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const saved = await window.proxy.open(project.id);
    return saved.printingEditTemplate === 'extended-art' && saved.cards[0].frame.template === 'extended-art';
  });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.stage canvas');
    if (canvas?.width !== 744) return false;
    const context = canvas.getContext('2d');
    const red = y => context.getImageData(0, y, 1, 1).data[0];
    return red(0) < red(100) && red(100) < red(300);
  });
  await cardTab.click();
  assert.equal(await cardText.inputValue(), 'Pesca una carta.');
  await page.locator('.source').getByText('Magic 2011').waitFor();
  const stageCard = page.locator('.stage .card-preview');
  const titlePosition = await stageCard.evaluate(node => ({ x: node.clientWidth / 2, y: node.clientHeight * 0.075 }));
  const zoneHover = stageCard.locator('.zone-hover');
  const zoneGuide = stageCard.locator('.zone-guide');
  await stageCard.click({ position: titlePosition });
  assert.equal(await cardTab.getAttribute('aria-selected'), 'true');
  assert.equal(await zoneHover.count(), 0);
  await frameTab.click();
  await stageCard.hover({ position: titlePosition });
  await zoneHover.waitFor();
  await stageCard.click({ position: titlePosition });
  await zoneGuide.waitFor();
  assert.equal(await elementToggle('Nome').getAttribute('aria-pressed'), 'true');
  await frameTab.press('ArrowLeft');
  await stageCard.click({ position: titlePosition });
  assert.equal(await artTab.getAttribute('aria-selected'), 'true');
  assert.equal(await zoneHover.count(), 0);
  assert.equal(await zoneGuide.count(), 0);
  await frameTab.click();
  await electron.evaluate(() => globalThis.setSmokeFiles('frame'));
  const stageGuides = page.locator('.stage').getByRole('button', { name: 'Griglia dei terzi e guide di centratura' });
  const stageGrid = page.locator('.stage .thirds-grid');
  await stageGrid.waitFor({ state: 'visible' });
  assert.equal(await stageGuides.getAttribute('aria-pressed'), 'true');
  await stageGuides.press('Space');
  await stageGrid.waitFor({ state: 'detached' });
  assert.equal(await stageGuides.getAttribute('aria-pressed'), 'false');
  await page.getByRole('button', { name: 'Personalizza cornice', exact: true }).click();
  // Focus mode: the frame editor replaces the deck and the inspector while it is open.
  const frameEditor = page.locator('.columns.is-frame-focus');
  // Undo and redo with the focus outside inputs (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z).
  await editorSection('Sfumature').click();
  const topStrength = frameEditor.getByRole('radiogroup', { name: 'Intensità', exact: true }).first();
  const shownStrength = async () => (await topStrength.getByRole('radio', { checked: true }).innerText()).trim();
  const strengthBefore = await shownStrength();
  const strengthNext = strengthBefore === 'Nessuna' ? 'Forte' : 'Nessuna';
  await topStrength.getByRole('radio', { name: strengthNext, exact: true }).click();
  await topStrength.getByRole('radio', { name: strengthNext, exact: true, checked: true }).waitFor();
  await page.keyboard.press(`${undoKey}+z`);
  await topStrength.getByRole('radio', { name: strengthBefore, exact: true, checked: true }).waitFor();
  await page.keyboard.press(`${undoKey}+Shift+z`);
  await topStrength.getByRole('radio', { name: strengthNext, exact: true, checked: true }).waitFor();
  // Shading reach "Libera" exposes an exact height that the handle grip on the card changes, by keyboard or by dragging.
  const reach = frameEditor.getByRole('radiogroup', { name: 'Arriva fino a', exact: true }).first();
  await pickTile(reach, 'Libera');
  const topHeight = frameEditor.getByRole('spinbutton', { name: /Altezza esatta/ }).first();
  const topGrip = frameEditor.getByRole('slider', { name: 'Fine della sfumatura superiore', exact: true });
  await topGrip.waitFor();
  const heightBefore = Number(await topHeight.inputValue());
  await topGrip.focus();
  await topGrip.press('Shift+ArrowDown');
  await until(() => topHeight.inputValue(), value => Number(value) > heightBefore);
  const heightBeforeDrag = Number(await topHeight.inputValue());
  const grip = await topGrip.boundingBox();
  const gripX = grip.x + grip.width / 2;
  const gripY = grip.y + grip.height / 2;
  await page.mouse.move(gripX, gripY);
  await page.mouse.down();
  await page.mouse.move(gripX, gripY - 30, { steps: 6 });
  await page.mouse.up();
  await until(() => topHeight.inputValue(), value => Number(value) !== heightBeforeDrag);
  // "Ripristina tutto" asks first: cancelling keeps the changes, confirming restores the template.
  const resetAll = frameEditor.getByRole('button', { name: 'Ripristina tutto', exact: true });
  const resetAllDialog = page.getByRole('alertdialog', { name: 'Ripristinare tutta la cornice?', exact: true });
  await resetAll.click();
  await resetAllDialog.waitFor();
  await resetAllDialog.getByRole('button', { name: 'Annulla', exact: true }).click();
  await resetAllDialog.waitFor({ state: 'hidden' });
  await frameEditor.getByText('1 modifica rispetto all’originale', { exact: true }).waitFor();
  await resetAll.click();
  await resetAllDialog.getByRole('button', { name: 'Ripristina tutto', exact: true }).click();
  await resetAllDialog.waitFor({ state: 'hidden' });
  await frameEditor.getByText('Nessuna modifica rispetto all’originale', { exact: true }).waitFor();
  await frameEditor.getByRole('tab', { name: 'Cornici custom', exact: true }).click();
  const frameGuides = page.locator('.stage').getByRole('button', { name: 'Griglia dei terzi e guide di centratura' });
  assert.equal(await frameGuides.getAttribute('aria-pressed'), 'false');
  await frameGuides.click();
  await page.locator('.stage .thirds-grid').waitFor({ state: 'visible' });
  await stageGrid.waitFor({ state: 'visible' });
  assert.equal(await frameEditor.getByRole('tab', { name: 'Cornici custom', exact: true }).getAttribute('aria-selected'), 'true');
  await editorSection('Immagini della cornice').click();
  await page.getByLabel('Nome del set').fill('Cornici prova');
  for (const color of ['Bianco', 'Blu', 'Nero', 'Rosso', 'Verde', 'Incolore']) {
    await page.getByRole('button', { name: 'Carica ' + color, exact: true }).click();
    await page.getByRole('button', { name: 'Sostituisci ' + color, exact: true }).waitFor();
  }
  await frameEditor.getByRole('button', { name: 'Salva set', exact: true }).click();
  // Layout: zone chips pick the element; the text size and the alignment are tiles, exact values under "Personalizzato".
  await editorSection('Posizioni').click();
  const editableZone = frameEditor.getByRole('group', { name: 'Elemento da modificare', exact: true });
  const zoneChip = name => editableZone.getByRole('button', { name, exact: true });
  const sizeGroup = frameEditor.getByRole('radiogroup', { name: 'Dimensione massima del testo', exact: true });
  const exactSize = frameEditor.getByRole('spinbutton', { name: 'Valore esatto' });
  await zoneChip('Illustrazione').click();
  assert.equal(await sizeGroup.count(), 0);
  await zoneChip('Nome').click();
  await pickTile(frameEditor.getByRole('radiogroup', { name: 'Allineamento orizzontale', exact: true }), 'Destra');
  if (!await exactSize.isVisible()) await frameEditor.getByRole('button', { name: 'Personalizzato', exact: true }).click();
  await exactSize.fill('8');
  await exactSize.press('Enter');
  await until(() => exactSize.inputValue(), value => value === '8');
  await zoneChip('Firma').click();
  await sizeGroup.getByRole('radio', { name: 'Normale', exact: true, checked: true }).waitFor();
  await zoneChip('Statistiche').click();
  await choose(page.getByLabel('Carta in anteprima'), '');
  await editorSection('Statistiche').click();
  const statsBox = frameEditor.getByRole('radiogroup', { name: 'Stile del riquadro', exact: true });
  const statsDivider = frameEditor.getByRole('radiogroup', { name: 'Separatore forza/costituzione', exact: true });
  const statsTab = name => frameEditor.locator('.stats-navigation').getByRole('tab', { name, exact: true });
  const stagePreview = page.locator('.stage .card-preview canvas');
  await stagePreview.waitFor();
  const previewPixel = () => document.querySelector('.stage .card-preview canvas').getContext('2d')
    .getImageData(595, 950, 1, 1).data.slice(0, 3).join(',');
  const basePixel = await page.evaluate(previewPixel);
  await frameEditor.getByLabel('Carica immagine del riquadro', { exact: true }).setInputFiles({
    name: 'stats.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 12"><rect width="40" height="12" fill="white"/></svg>')
  });
  await page.waitForFunction(() => document.querySelector('.stage .card-preview canvas').getContext('2d')
    .getImageData(595, 950, 1, 1).data.slice(0, 3).join(',') === '255,255,255');
  await frameEditor.getByRole('checkbox', { name: 'Rendi trasparente un colore dell’immagine', exact: true }).check();
  await page.waitForFunction(base => document.querySelector('.stage .card-preview canvas').getContext('2d')
    .getImageData(595, 950, 1, 1).data.slice(0, 3).join(',') === base, basePixel);
  await frameEditor.getByRole('button', { name: 'Ripristina «Tutti i valori»', exact: true }).click();
  assert.equal(await statsBox.getByRole('radio').count(), 11);
  await pickTile(statsBox, 'Capsula');
  await page.waitForFunction(() => document.querySelector('.stage .card-preview canvas').getContext('2d')
    .getImageData(595, 950, 1, 1).data.slice(0, 3).join(',') === '250,246,237');
  const statsPixels = () => {
    const context = document.querySelector('.stage .card-preview canvas').getContext('2d');
    return { above: context.getImageData(558, 930, 135, 9).data.join(','),
      separator: context.getImageData(617, 950, 15, 32).data.join(',') };
  };
  const originalStats = await page.evaluate(statsPixels);
  await statsTab('Divisore').click();
  await pickTile(statsDivider, 'Filetto verticale');
  await page.waitForFunction(separator => document.querySelector('.stage .card-preview canvas').getContext('2d')
    .getImageData(617, 950, 15, 32).data.join(',') !== separator, originalStats.separator);
  assert.equal((await page.evaluate(statsPixels)).above, originalStats.above);
  const unpadded = (await page.evaluate(statsPixels)).separator;
  await statsTab('Spaziatura').click();
  await frameEditor.getByRole('checkbox', { name: 'Stessa spaziatura su tutti i lati', exact: true }).uncheck();
  const leftPadding = frameEditor.getByRole('spinbutton', { name: 'Sinistra' });
  await leftPadding.fill('64');
  await leftPadding.press('Enter');
  await page.waitForFunction(before => document.querySelector('.stage .card-preview canvas').getContext('2d')
    .getImageData(617, 950, 15, 32).data.join(',') !== before, unpadded);
  await leftPadding.fill('0');
  await leftPadding.press('Enter');
  await page.waitForFunction(before => document.querySelector('.stage .card-preview canvas').getContext('2d')
    .getImageData(617, 950, 15, 32).data.join(',') === before, unpadded);
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const saved = await window.proxy.open(project.id);
    const stats = saved.frameSets.find(set => set.name === 'Cornici prova')?.appearance?.statsAppearance;
    return stats?.box === 'capsule' && stats.divider === 'capsule';
  });
  // "Si applica a" chooses the value level the stats style applies to (Tutti i valori, Solo forza/costituzione, ...).
  const styleScope = frameEditor.getByLabel('Si applica a', { exact: true });
  const previewValues = frameEditor.getByLabel('Valori di prova in anteprima');
  const readStats = () => document.querySelector('.stage .card-preview canvas').getContext('2d')
    .getImageData(550, 935, 150, 55).data.join(',');
  const sampleBefore = await page.evaluate(readStats);
  await choose(previewValues, '1+*/1+*');
  await page.waitForFunction(before => document.querySelector('.stage .card-preview canvas').getContext('2d')
    .getImageData(550, 935, 150, 55).data.join(',') !== before, sampleBefore);
  await choose(styleScope, 'loyalty');
  assert.equal(await previewValues.getAttribute('data-value'), 'loyalty');
  await statsTab('Riquadro').click();
  await pickTile(statsBox, 'Losanga');
  await choose(styleScope, 'defense');
  await pickTile(statsBox, 'Doppio filetto');
  await choose(styleScope, 'pair');
  await statsTab('Divisore').click();
  const beforeGap = await page.evaluate(readStats);
  const gapGroup = frameEditor.getByRole('radiogroup', { name: 'Spazio ai lati del separatore', exact: true });
  const exactGap = frameEditor.getByRole('spinbutton', { name: 'Valore esatto' });
  if (!await exactGap.isVisible()) await frameEditor.getByRole('button', { name: 'Personalizzato', exact: true }).click();
  await exactGap.fill('32');
  await exactGap.press('Enter');
  await until(() => exactGap.inputValue(), value => value === '32');
  await gapGroup.waitFor();
  await page.waitForFunction(before => document.querySelector('.stage .card-preview canvas').getContext('2d')
    .getImageData(550, 935, 150, 55).data.join(',') !== before, beforeGap);
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const saved = await window.proxy.open(project.id);
    const stats = saved.frameSets.find(set => set.name === 'Cornici prova')?.appearance?.statsAppearance;
    return stats?.byKind?.pair?.dividerGap === 32 && stats.byKind.loyalty?.box === 'diamond'
      && stats.byKind.defense?.box === 'double' && stats.box === 'capsule';
  });
  await choose(styleScope, 'base');
  assert.equal(await previewValues.getAttribute('data-value'), 'card');
  await editorSection('Colori delle carte').click();
  assert.equal(await page.locator('.editor-focus-controls').evaluate(node => node.scrollWidth <= node.clientWidth), true);
  await frameEditor.screenshot({ path: join(paths, 'custom-frames.png') });
  await editorSection('Immagini della cornice').click();
  await page.getByLabel(/^Applica alla carta/).check();
  await frameEditor.getByRole('button', { name: 'Salva e applica', exact: true }).click();
  await page.getByText('Set salvato e applicato').waitFor();
  await page.getByRole('button', { name: 'Torna al mazzo', exact: true }).click();
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const saved = await window.proxy.open(project.id);
    const frame = saved.cards[0].frame;
    return frame.kind === 'color-set' && frame.set.appearance?.textStyles?.title?.align === 'right'
      && frame.set.appearance.textStyles.title.size === 8 && frame.set.appearance.statsAppearance?.box === 'capsule';
  });
  await frameTab.click();
  await page.getByText('Cornice applicata · Rosso').waitFor();
  await pressElement('Statistiche');
  const cardStatsBox = inspector.getByRole('radiogroup', { name: 'Stile del riquadro', exact: true });
  const cardStatsDivider = inspector.getByRole('radiogroup', { name: 'Separatore forza/costituzione', exact: true });
  const cardStatsLevel = inspector.getByLabel('Si applica a', { exact: true });
  const statsTabOf = name => inspector.locator('.stats-navigation').getByRole('tab', { name, exact: true });
  assert.ok(await cardStatsBox.getByRole('radio', { name: 'Come nella cornice', exact: true }).isChecked());
  await pickTile(cardStatsBox, 'Stendardo');
  await statsTabOf('Divisore').click();
  await pickTile(cardStatsDivider, 'Standard');
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const saved = await window.proxy.open(project.id);
    const { fields, statsOverrides } = saved.cards[0];
    return fields.power === '' && fields.toughness === '' && statsOverrides?.box === 'banner' && statsOverrides.divider === 'original';
  });
  await statsTabOf('Riquadro').click();
  await pickTile(cardStatsBox, 'Come nella cornice');
  await statsTabOf('Divisore').click();
  await pickTile(cardStatsDivider, 'Come nella cornice');
  // Regression: the level choice must stick after switching the stats tabs.
  await choose(cardStatsLevel, 'pair');
  await statsTabOf('Spaziatura').click();
  await statsTabOf('Riquadro').click();
  assert.equal(await cardStatsLevel.getAttribute('data-value'), 'pair');
  await choose(cardStatsLevel, 'base');
  // The artwork area is edited from the Illustrazione tab, not from the element toggles.
  await artTab.click();
  await inspector.getByRole('button', { name: 'Mostra e modifica area dell’illustrazione', exact: true }).click();
  await zoneX.waitFor();
  assert.equal(await alignGroup().count(), 0);
  await frameTab.click();
  await pressElement('Firma');
  await alignGroup().waitFor();
  await page.locator('.stage .zone-guide').waitFor();
  await openExactValues();
  await zoneX.waitFor();
  await zoneX.fill('12');
  await zoneX.press('Enter');
  await until(() => zoneX.inputValue(), value => value === '12');
  await pressElement('Testo');
  await openExactValues();
  await zoneX.waitFor();
  await page.locator('.stage .zone-guide').waitFor();
  assert.ok(await alignIs('Come nella cornice'));
  await chooseAlign('Centro');
  await pressElement('Nome');
  await chooseAlign('Sinistra');
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const saved = await window.proxy.open(project.id);
    const card = saved.cards[0];
    return card.zoneOverrides?.artist?.x === 12 && card.textAlignOverrides?.rules === 'center' && card.textAlignOverrides.title === 'left'
      && card.frame.set.appearance.textStyles.title.align === 'right';
  });
  await chooseAlign('Come nella cornice');
  await pressElement('Testo');
  assert.ok(await alignIs('Centro'));
  await chooseAlign('Come nella cornice');
  await frameTab.click();
  await openDeckSettings();
  await deckSettings().getByRole('button', { name: 'Carica una cornice PNG…', exact: true }).click();
  await deckStyle().getByRole('radio', { name: 'Cornice PNG', exact: true, checked: true }).waitFor();
  await deckSettings().getByRole('button', { name: 'Fatto', exact: true }).click();
  await deckSettings().waitFor({ state: 'hidden' });
  assert.ok(await inspector.getByRole('radio', { name: 'Usa lo stile del mazzo', exact: true }).isChecked());
  assert.equal(await inspector.getByRole('button', { name: 'Cambia lo stile del mazzo', exact: true }).count(), 0);
  await chooseDeckStyle('Ogni carta il suo stile');
  await page.getByText('Cornice applicata · Rosso').waitFor();
  await chooseDeckStyle('Full art');
  await page.getByRole('button', { name: 'Importa lista', exact: true }).click();
  await page.getByLabel('Lista delle carte').fill('99 Sole // Luna\n1 Non esiste');
  await page.getByRole('button', { name: 'Importa carte' }).click();
  await page.getByText('Carta o edizione non trovata · Non esiste').waitFor();
  await page.getByRole('dialog', { name: 'Importa lista' }).getByText('Importata 1 carta · 1 riga da correggere', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
  const deck = page.locator('.deck-list');
  const bolt = deck.getByRole('button', { name: /Lightning Bolt/ });
  const copyFrame = page.getByRole('button', { name: 'Copia stile', exact: true });
  const pasteFrame = page.getByRole('button', { name: 'Incolla stile', exact: true });
  const pasteSettings = page.getByRole('button', { name: 'Incolla ritocchi', exact: true });
  const typeVisible = page.getByRole('checkbox', { name: 'Tipo', exact: true });
  await bolt.click();
  await frameTab.click();
  assert.ok(await pasteSettings.isDisabled());
  await chooseDeckStyle('Ogni carta il suo stile');
  await pressElement('Nome');
  await openExactValues();
  await zoneX.fill('10');
  await typeVisible.uncheck();
  await copyFrame.click();
  await page.getByText('Cornice copiata', { exact: true }).waitFor();
  await typeVisible.check();
  await page.getByRole('button', { name: 'Ripristina posizione', exact: true }).click();
  await chooseDeckStyle('Full art');
  await deck.getByRole('button', { name: /Sole/ }).click();
  const backSide = page.getByRole('button', { name: 'Retro', exact: true });
  await backSide.click();
  await frameTab.click();
  await pasteSettings.click();
  await page.getByText('Impostazioni della cornice incollate', { exact: true }).waitFor();
  assert.equal(await typeVisible.isChecked(), false);
  await pressElement('Nome');
  await openExactValues();
  assert.equal(await zoneX.inputValue(), '10');
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const saved = await window.proxy.open(project.id);
    const side = saved.cards[1].backSide;
    return saved.frame?.kind === 'template' && saved.frame.template === 'full-art'
      && side?.frame.kind === 'printing' && side.hiddenZones?.includes('type') && side.zoneOverrides?.title?.x === 10;
  });
  await undoChange.click();
  await chooseDeckStyle('Ogni carta il suo stile');
  await backSide.click();
  await frameTab.click();
  assert.ok(await copyFrame.isDisabled());
  await pasteFrame.click();
  await page.getByText('Cornice incollata', { exact: true }).waitFor();
  assert.equal(await typeVisible.isChecked(), false);
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const [source, target] = (await window.proxy.open(project.id)).cards;
    return source.frame.kind === 'color-set' && target.frame.kind === 'printing'
      && target.backSide?.frame.kind === 'color-set' && target.backSide.frame.set.id === source.frame.set.id
      && target.backSide.hiddenZones?.includes('type') && target.backSide.zoneOverrides?.title?.x === 10
      && target.backSide.fields.name === 'Luna';
  });
  await undoChange.click();
  await page.getByText('Modifica annullata', { exact: true }).waitFor();
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    return !(await window.proxy.open(project.id)).cards[1].backSide;
  });
  // Redo brings the undone paste back, and undo removes it again.
  await page.getByRole('button', { name: 'Ripeti la modifica annullata', exact: true }).click();
  await page.getByText('Modifica ripetuta', { exact: true }).waitFor();
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const [, child] = (await window.proxy.open(project.id)).cards;
    return child.backSide?.frame.kind === 'color-set' && child.backSide.fields.name === 'Luna';
  });
  await undoChange.click();
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    return !(await window.proxy.open(project.id)).cards[1].backSide;
  });
  await electron.evaluate(() => globalThis.setSmokeFiles('art'));
  assert.equal(await cardText.inputValue(), 'Testo di Sole.');
  await page.locator('.image-dropzone').click();
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const front = (await window.proxy.open(project.id)).cards[1];
    return front.art && front.frame.kind === 'template' && front.fields.rules === 'Testo di Sole.' && !front.backSide;
  });
  await backSide.click();
  assert.equal(await cardText.inputValue(), 'Testo di Luna.');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.stage-current canvas');
    if (canvas?.width !== 744) return false;
    const [red, green, blue] = canvas.getContext('2d').getImageData(12, 12, 1, 1).data;
    return red > 170 && green < 60 && blue > 120;
  });
  await inspector.getByRole('tab', { name: 'Illustrazione', exact: true }).click();
  assert.equal(await inspector.getByRole('button', { name: 'Torna all’illustrazione di catalogo' }).count(), 0);
  await page.locator('.image-dropzone').click();
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const front = (await window.proxy.open(project.id)).cards[1];
    const back = front.backSide;
    return front.art && front.fields.rules === 'Testo di Sole.'
      && back?.art && back.frame.kind === 'template' && back.fields.rules === 'Testo di Luna.';
  });
  await undoChange.click();
  await undoChange.click();
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const front = (await window.proxy.open(project.id)).cards[1];
    return !front.art && !front.backSide;
  });
  const source = await page.evaluate(async () => {
    const [project] = await window.proxy.projects();
    const [card] = (await window.proxy.open(project.id)).cards;
    return { id: card.id, setId: card.frame.set.id };
  });
  const mirrorSelect = inspector.locator('xpath=.//label[contains(., "Carta da copiare")]//button[contains(@class, "select-trigger")]');
  const copyStyle = inspector.getByRole('radio', { name: 'Copia lo stile di un’altra carta', exact: true });
  const moon = deck.getByRole('button', { name: /Sole/ });
  const mirrorSource = `${source.id}/front`;
  const frameLock = inspector.getByText('Per modificare questa cornice, scegli «Stile proprio».');
  const mirrorWarning = inspector.getByText('La carta copiata usa la scansione originale');
  const resetCard = inspector.getByRole('button', { name: 'Ripristina carta originale' });
  await backSide.click();
  await frameTab.click();
  await copyStyle.check();
  await choose(mirrorSelect, mirrorSource);
  await frameLock.waitFor();
  assert.ok(await pasteFrame.isDisabled());
  assert.ok(await resetCard.isEnabled());
  assert.equal(await inspector.locator('.element-toggles').count(), 0);
  await cardTab.click();
  await cardText.fill('Testo indipendente');
  await electron.evaluate(() => globalThis.setSmokeFiles('art'));
  await page.locator('.image-dropzone').click();
  await inspector.getByRole('tab', { name: 'Illustrazione', exact: true }).click();
  assert.ok(await inspector.locator('.visual-choice').first().getByRole('radio').first().isEnabled());
  await page.waitForFunction(async ({ id }) => {
    const [project] = await window.proxy.projects();
    const [, child] = (await window.proxy.open(project.id)).cards;
    return !child.frameMirror && child.backSide?.frameMirror?.cardId === id
      && child.backSide.frame.kind === 'printing' && child.backSide.art && child.backSide.fields.rules === 'Testo indipendente';
  }, source);
  await page.reload();
  await moon.click();
  await backSide.click();
  await frameTab.click();
  await frameLock.waitFor();
  assert.equal(await mirrorSelect.getAttribute('data-value'), mirrorSource);
  await bolt.click();
  await frameTab.click();
  await chooseFrame('Originale (scansione)');
  await moon.click();
  await backSide.click();
  await mirrorWarning.waitFor();
  await frameTab.click();
  assert.equal(await mirrorSelect.getAttribute('data-value'), mirrorSource);
  await bolt.click();
  await frameTab.click();
  await chooseFrame('Cornici prova');
  await moon.click();
  await backSide.click();
  await frameTab.click();
  await frameLock.waitFor();
  const sourceCheck = deck.locator('input[type="checkbox"]').first();
  await sourceCheck.check();
  await page.getByRole('button', { name: 'Rimuovi 1 carta selezionata' }).click();
  await backSide.click();
  await frameTab.click();
  // With no source left, the copy choice and its card select are no longer offered.
  assert.equal(await mirrorSelect.count(), 0);
  assert.equal(await frameIs('Originale (scansione)'), true);
  await undoChange.click();
  await backSide.click();
  await frameTab.click();
  await frameLock.waitFor();
  await choose(mirrorSelect, '');
  // Choosing "Scegli una carta…" unlinks but keeps the source select open, so another card can be picked directly.
  assert.equal(await mirrorSelect.getAttribute('data-value'), '');
  assert.equal(await copyStyle.isChecked(), true);
  await choose(mirrorSelect, mirrorSource);
  // Reset asks first: cancelling keeps the card modified, confirming restores it.
  const resetDialog = page.getByRole('alertdialog');
  await resetCard.click();
  await resetDialog.getByRole('button', { name: 'Annulla', exact: true }).click();
  await resetDialog.waitFor({ state: 'hidden' });
  assert.equal(await mirrorSelect.getAttribute('data-value'), mirrorSource);
  await resetCard.click();
  await resetDialog.getByRole('button', { name: 'Ripristina', exact: true }).click();
  await resetDialog.waitFor({ state: 'hidden' });
  // After the reset the card is back to its own style: the copy select closes and the frame tiles show.
  assert.equal(await mirrorSelect.count(), 0);
  assert.equal(await inspector.getByRole('radio', { name: 'Stile proprio', exact: true }).isChecked(), true);
  assert.equal(await frameIs('Originale (scansione)'), true);
  await page.waitForFunction(async ({ id, setId }) => {
    const [project] = await window.proxy.projects();
    const [parent, child] = (await window.proxy.open(project.id)).cards;
    return parent.id === id && parent.frame.kind === 'color-set'
      && parent.frame.set.id === setId && !child.backSide;
  }, source);
  await chooseDeckStyle('Full art');
  await bolt.click();
  await electron.evaluate(() => globalThis.setSmokeFiles('art'));
  await page.getByRole('button', { name: 'Modifica in blocco' }).click();
  await page.getByRole('button', { name: 'Scegli file' }).click();
  await page.getByRole('button', { name: 'Applica a 1 carta' }).click();
  await page.getByText('Modificata 1 carta').waitFor();
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).click();
  await page.getByText('Modifica annullata').waitFor();
  assert.equal(await page.locator('#workspace-deck').getByRole('button', { name: /^Stile delle carte/ }).count(), 0);
  await openDeckSettings();
  assert.ok(await deckStyle().getByRole('radio', { name: 'Full art', exact: true }).isChecked());
  await closeDeckSettings();
  await cardText.fill('Pesca una carta. {R}');
  await page.getByRole('button', { name: 'Personalizza cornice', exact: true }).click();
  await editorSection('Simboli di mana').click();
  // Mana symbols are grid tiles named "Simbolo {X}"; the image is replaced from the dropzone.
  const symbolTile = token => frameEditor.getByRole('button', { name: `Simbolo {${token}}`, exact: true });
  await symbolTile('R').click();
  const symbolFile = frameEditor.getByLabel('Sostituisci immagine del simbolo', { exact: true });
  const symbolPng = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const context = canvas.getContext('2d');
    context.fillStyle = '#00ff00';
    context.fillRect(0, 0, 16, 16);
    return canvas.toDataURL().split(',')[1];
  });
  await symbolFile.setInputFiles({ name: 'mana.png', mimeType: 'image/png', buffer: Buffer.from(symbolPng, 'base64') });
  await frameEditor.getByRole('button', { name: 'Ripristina immagine', exact: true }).waitFor();
  const symbolSource = await symbolTile('R').locator('img').getAttribute('src');
  assert.match(symbolSource, /^proxy-asset:\/\/images\//);
  assert.equal(await frameEditor.locator('.symbol-editor-preview img').getAttribute('src'), symbolSource);
  const verifySymbolPixels = (selector, icon, coloredAreas) => page.waitForFunction(({ selector, icon, coloredAreas }) => {
    const canvas = document.querySelector(selector);
    if (canvas?.width !== 744) return false;
    const context = canvas.getContext('2d');
    function contains(color, x, y, width, height) {
      const data = context.getImageData(x, y, width, height).data;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] === color[0] && data[index + 1] === color[1] && data[index + 2] === color[2]) return true;
      }
      return false;
    }
    if (!contains(icon, 640, 30, 104, 80) || !contains(icon, 30, 740, 650, 220)) return false;
    if (!coloredAreas) return true;
    const color = [0, 255, 255];
    const areas = { title: [35, 30, 500, 70], rules: [35, 775, 350, 55], type: [35, 700, 350, 42] };
    return Object.entries(areas).every(([area, box]) => contains(color, ...box) === coloredAreas.includes(area));
  }, { selector, icon, coloredAreas });
  await verifySymbolPixels('.stage .card-preview canvas', [0, 255, 0]);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#ff00ff" d="M0 0H16V16H0Z"/></svg>';
  await symbolFile.setInputFiles({ name: 'mana.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  // Card colors: the red identity sets the color the text takes when it is colored by the card.
  await editorSection('Colori delle carte').click();
  await frameEditor.getByLabel('Rosso', { exact: true }).fill('#00ffff');
  await editorSection('Colori degli elementi').click();
  const textColors = frameEditor.getByRole('group', { name: 'Testi', exact: true });
  const colorSource = label => textColors.getByRole('combobox', { name: label, exact: true });
  const textColorChecks = [['title', 'Titolo'], ['rules', 'Corpo del testo'], ['type', 'Tipo']];
  for (const [area, label] of textColorChecks) {
    await choose(colorSource(label), 'card');
    await verifySymbolPixels('.stage .card-preview canvas', [255, 0, 255], [area]);
    await choose(colorSource(label), 'text');
  }
  for (const [, label] of textColorChecks) await choose(colorSource(label), 'card');
  // A custom divider color shows its swatch; the stats border default then follows it.
  await choose(colorSource('Divisori'), 'custom');
  await textColors.getByLabel('Colore personalizzato: Divisori', { exact: true }).waitFor();
  const statsColors = frameEditor.getByRole('group', { name: 'Statistiche', exact: true });
  assert.equal(await statsColors.getByRole('combobox', { name: 'Bordo', exact: true }).locator('span').first().textContent(), 'Come i divisori');
  await choose(colorSource('Divisori'), 'card');
  await verifySymbolPixels('.stage .card-preview canvas', [255, 0, 255], ['title', 'rules', 'type']);
  await page.screenshot({ path: join(paths, 'frame-symbols.png') });
  await page.getByRole('button', { name: 'Torna al mazzo', exact: true }).click();
  await page.getByRole('button', { name: 'Esporta', exact: true }).click();
  await page.screenshot({ path: join(paths, 'print-choices.png') });
  await page.getByRole('button', { name: 'Immagini delle carte (ZIP)' }).click();
  await choose(formatSelect, 'png');
  await choose(page.getByLabel('Abbondanza (bleed)'), 'mpc');
  await page.getByText('816 × 1111 px · 3 immagini').waitFor();
  await page.getByRole('img', { name: 'Sole · Retro' }).waitFor();
  const captions = page.locator('.card-export-item figcaption');
  assert.ok((await captions.allTextContents()).every(caption => !caption.includes('×')));
  const exportCopies = page.getByRole('checkbox', { name: 'Esporta tutte le copie' });
  await exportCopies.check();
  assert.equal(await captions.filter({ hasText: '×99' }).count(), 2);
  await exportCopies.uncheck();
  await page.waitForFunction(() => document.querySelector('.card-export-grid canvas')?.width > 1);
  await page.screenshot({ path: join(paths, 'card-export.png') });
  await page.getByRole('button', { name: 'Salva ZIP' }).click();
  await page.getByText('ZIP salvato').waitFor({ timeout: 30000 });
  const images = unzipSync(await readFile(zipPath));
  assert.deepEqual(Object.keys(images).sort(), [
    'fronte/0001-Lightning Bolt.png', 'fronte/0002-Sole.png', 'retro/0002-Sole.png'
  ]);
  for (const image of Object.values(images).map(bytes => Buffer.from(bytes))) {
    assert.equal(image.readUInt32BE(16), 816);
    assert.equal(image.readUInt32BE(20), 1111);
    const density = image.indexOf('pHYs');
    assert.ok(density >= 0);
    assert.equal(image.readUInt32BE(density + 4), 11811);
    assert.equal(image.readUInt8(density + 12), 1);
  }
  const firstCardCheckbox = page.locator('.deck-list input[type="checkbox"]').first();
  await firstCardCheckbox.check();
  await page.getByRole('button', { name: 'Esporta', exact: true }).click();
  await page.getByRole('button', { name: 'Immagini delle carte (ZIP)' }).click();
  await choose(zipSetup.getByLabel('Da esportare'), 'selected');
  assert.deepEqual(await captions.allTextContents(), ['Lightning BoltFronte']);
  await zipSetup.getByRole('button', { name: 'Salva ZIP' }).click();
  await zipSetup.waitFor({ state: 'hidden' });
  assert.deepEqual(Object.keys(unzipSync(await readFile(zipPath))), ['fronte/0001-Lightning Bolt.png']);
  await firstCardCheckbox.uncheck();

  await page.getByRole('button', { name: 'Esporta', exact: true }).click();
  await page.getByRole('button', { name: 'PDF per la stampa' }).click();
  await choose(pdfSetup.getByLabel('Da esportare'), 'range');
  const range = pdfSetup.getByLabel('Numeri delle carte');
  await range.fill('1, 3');
  await pdfSetup.getByRole('alert').filter({ hasText: 'Inserisci numeri da 1 a 2' }).waitFor();
  assert.ok(await pdfSetup.getByRole('button', { name: 'Salva PDF' }).isDisabled());
  await range.fill('2, 1-2');
  await pdfSetup.getByText(/Pagina 1 di 24 · Fronte/).waitFor();
  await range.fill('1-1, 1');
  await pdfSetup.getByText(/Pagina 1 di 1 · Fronte/).waitFor();
  assert.equal(await pdfSetup.locator('.paper-card').count(), 1);
  await pdfSetup.getByRole('button', { name: 'Salva PDF' }).click();
  await pdfSetup.waitFor({ state: 'hidden' });
  assert.equal((await PDFDocument.load(await readFile(pdfPath))).getPageCount(), 1);

  await page.getByRole('button', { name: 'Esporta', exact: true }).click();
  await page.getByRole('button', { name: 'PDF per la stampa' }).click();
  await page.getByRole('button', { name: 'Salva PDF' }).click();
  await pdfSetup.waitFor({ state: 'hidden' });
  await page.getByText('PDF salvato').waitFor({ timeout: 30000 });
  const doc = await PDFDocument.load(await readFile(pdfPath));
  assert.equal(doc.getPageCount(), 24);
  assert.ok(Math.abs(doc.getPage(0).getWidth() - 595.27559) < .02);
  assert.ok(Math.abs(doc.getPage(0).getHeight() - 841.88976) < .02);
  await page.screenshot({ path: join(paths, 'editor.png') });
  await electron.close();
  electron = await launch();
  page = await electron.firstWindow();
  await page.getByRole('heading', { name: 'Lightning Bolt', exact: true }).waitFor();
  await openDeckSettings();
  assert.ok(await deckStyle().getByRole('radio', { name: 'Full art', exact: true }).isChecked());
  await closeDeckSettings();
  await verifySymbolPixels('.card-preview canvas', [255, 0, 255], ['title', 'rules', 'type']);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  await page.getByRole('button', { name: 'PDF per la stampa' }).click();
  await page.getByText(/Pagina 1 di 24/).waitFor();
  await page.screenshot({ path: join(paths, 'print.png') });
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 812 });
    assert.equal(await page.locator('.workspace').evaluate(node => node.scrollWidth <= node.clientWidth), true);
    assert.equal(await page.locator('dialog').evaluate(node => node.scrollWidth <= node.clientWidth), true);
  }
  await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  const panels = page.getByRole('navigation', { name: 'Pannelli dell’editor' });
  await panels.getByRole('button', { name: 'Proprietà' }).click();
  assert.equal(await page.locator('.stage').isVisible(), false);
  await page.getByRole('textbox', { name: 'Firma dell’artista' }).waitFor();
  await panels.getByRole('button', { name: 'Cerca una carta' }).click();
  await page.waitForFunction(() => document.activeElement === document.querySelector('.catalog-search input'));
  await page.locator('.deck-list input[type="checkbox"]').first().check();
  assert.equal(await page.locator('.selection-bar input').evaluate(node => node.indeterminate), true);
  await page.locator('.deck-list-search input').fill('Sole');
  await page.locator('.hidden-selection').waitFor();
  assert.equal(await page.locator('.selection-actions button').last().isDisabled(), true);
  await page.getByRole('button', { name: 'Modifica in blocco' }).click();
  const batchDialog = page.getByRole('dialog', { name: 'Modifica in blocco' });
  await batchDialog.getByText('Modifica di 1 carta selezionata', { exact: true }).waitFor();
  await batchDialog.getByText(/1 nascosta dai filtri/).waitFor();
  await batchDialog.getByRole('button', { name: 'Annulla', exact: true }).click();
  const quantity = page.locator('.deck-list input[type="number"]');
  await quantity.fill('0');
  await quantity.press('Tab');
  await page.getByText('Inserisci un numero intero da 1 a 999.', { exact: true }).waitFor();
  assert.equal(await quantity.inputValue(), '99');
  await page.locator('.hidden-selection-actions button').first().click();
  assert.equal(await page.locator('.deck-list input[type="checkbox"]').first().isChecked(), true);

  await electron.evaluate(({ ipcMain }) => {
    globalThis.smokeSaveFailure = true;
    globalThis.smokeSavedProjects = [];
    ipcMain.removeHandler('projects:save');
    ipcMain.handle('projects:save', (_event, project) => {
      if (globalThis.smokeSaveFailure) throw new Error('Simulated project save failure');
      globalThis.smokeSavedProjects.push({ id: project.id, name: project.name });
    });
  });
  const projectSelect = page.getByRole('combobox', { name: 'Apri progetto' });
  const originalProjectId = await projectSelect.getAttribute('data-value');
  // The project name lives in the deck settings dialog.
  const projectTitle = () => deckSettings().getByRole('textbox', { name: 'Nome del progetto', exact: true });
  const changedTitle = 'Verifica recupero salvataggio';
  await openDeckSettings();
  await projectTitle().fill(changedTitle);
  await projectTitle().press('Enter');
  await deckSettings().getByRole('button', { name: 'Fatto', exact: true }).click();
  await deckSettings().waitFor({ state: 'hidden' });
  await page.locator('.save-status').getByRole('button', { name: 'Riprova a salvare' }).waitFor();
  await choose(projectSelect, 'new');
  const unsavedDialog = page.getByRole('dialog', { name: 'Modifiche non salvate' });
  await unsavedDialog.getByText(`Impossibile salvare le modifiche a «${changedTitle}».`).waitFor();
  assert.equal(await projectSelect.getAttribute('data-value'), originalProjectId);
  await unsavedDialog.getByRole('button', { name: 'Continua a modificare' }).click();
  await openDeckSettings();
  assert.equal(await projectTitle().inputValue(), changedTitle);
  await deckSettings().getByRole('button', { name: 'Fatto', exact: true }).click();
  await choose(projectSelect, 'new');
  await electron.evaluate(() => { globalThis.smokeSaveFailure = false; });
  await unsavedDialog.getByRole('button', { name: 'Riprova a salvare' }).click();
  await page.getByRole('heading', { name: 'Cerca una carta' }).waitFor();
  assert.notEqual(await projectSelect.getAttribute('data-value'), originalProjectId);
  const [retriedProject] = await electron.evaluate(() => globalThis.smokeSavedProjects);
  assert.deepEqual(retriedProject, { id: originalProjectId, name: changedTitle });
  console.log('Workflow verificato', paths);
} finally {
  await electron.close().catch(() => {});
}
