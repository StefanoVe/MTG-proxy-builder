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
let electron = await launch();
try {
  let page = await electron.firstWindow();
  page.on('pageerror', error => console.error('Page error:', error));
  const choose = async (control, value) => {
    await control.click();
    await page.locator(`.select-menu [role=option][data-value=${JSON.stringify(value)}]`).click();
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
  await choose(page.locator('.deck').getByLabel('Cornice del progetto'), 'full-art');
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
      if (path.pathname === '/cards/named') return path.searchParams.get('exact') === exact.name ? Response.json(exact) : new Response(null, { status: 404 });
      if (path.pathname === '/cards/autocomplete') {
        if (path.searchParams.get('q') === 'Lightning Bol') await autocompleteReady;
        return Response.json({ data: [exact.name] });
      }
      if (path.pathname === '/cards/collection') return Response.json({
        data: JSON.parse(init.body).identifiers.flatMap(item => item.name === exact.name || item.set === exact.set ? [exact] : item.name === double.name ? [double] : [])
      });
      if (path.pathname === '/cards/search') return Response.json({ data: [exact, second] });
      const card = [exact, second, double].find(card => path.pathname === '/cards/' + card.id);
      return card ? Response.json(card) : new Response(null, { status: 404 });
    };
  }, { artFile, frameFile, pdfPath, zipPath, catalog: assetFiles.catalog, catalogBack: assetFiles.catalogBack });
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
  await page.getByRole('button', { name: 'Edizioni' }).click();
  await page.getByRole('button', { name: /Magic 2011/ }).click();
  await page.locator('.source').getByText('Magic 2011').waitFor();
  const inspector = page.locator('#workspace-properties');
  const frameTab = inspector.getByRole('button', { name: 'Cornice', exact: true });
  const cardTab = inspector.getByRole('button', { name: 'Carta', exact: true });
  const frameElement = inspector.getByLabel('Modifica elemento');
  const cardAlignment = inspector.getByLabel('Allineamento orizzontale');
  const zoneX = inspector.locator('.zone-fields').getByRole('spinbutton', { name: 'X', exact: true });
  assert.equal(await cardAlignment.count(), 0);
  await frameTab.click();
  const template = page.getByLabel(/^Template/);
  assert.equal(await template.getAttribute('data-value'), 'printing');
  await choose(frameElement, 'rules');
  await inspector.getByText('Se cambi l’allineamento del testo, l’editor applica il template Full art.').waitFor();
  assert.equal(await zoneX.count(), 0);
  await choose(cardAlignment, 'right');
  assert.equal(await template.getAttribute('data-value'), 'full-art');
  assert.equal(await frameElement.getAttribute('data-value'), 'rules');
  assert.equal(await cardAlignment.getAttribute('data-value'), 'right');
  await zoneX.waitFor();
  await choose(cardAlignment, '');
  await choose(template, 'printing');
  const firstEditFrame = page.locator('.deck').getByLabel('Cornice alla prima modifica');
  assert.equal(await firstEditFrame.getAttribute('data-value'), 'full-art');
  await choose(firstEditFrame, 'extended-art');
  await choose(frameElement, 'rules');
  await inspector.getByText('Se cambi l’allineamento del testo, l’editor applica il template Illustrazione estesa.').waitFor();
  await choose(cardAlignment, 'right');
  assert.equal(await template.getAttribute('data-value'), 'extended-art');
  await choose(cardAlignment, '');
  await choose(template, 'printing');
  await cardTab.click();
  await inspector.getByText('Quando modifichi i dati della stampa originale, l’editor applica il template Illustrazione estesa.').waitFor();
  await cardText.fill('Pesca una carta.');
  await frameTab.click();
  assert.equal(await template.getAttribute('data-value'), 'extended-art');
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
  await page.getByRole('button', { name: 'Carta', exact: true }).click();
  assert.equal(await cardText.inputValue(), 'Pesca una carta.');
  await page.locator('.source').getByText('Magic 2011').waitFor();
  await page.getByRole('button', { name: 'Cornice', exact: true }).click();
  await electron.evaluate(() => globalThis.setSmokeFiles('frame'));
  const stageGuides = page.locator('.stage').getByRole('button', { name: 'Griglia dei terzi e guide di centratura' });
  const stageGrid = page.locator('.stage .thirds-grid');
  await stageGrid.waitFor({ state: 'visible' });
  assert.equal(await stageGuides.getAttribute('aria-pressed'), 'true');
  await stageGuides.press('Space');
  await stageGrid.waitFor({ state: 'detached' });
  assert.equal(await stageGuides.getAttribute('aria-pressed'), 'false');
  await page.getByRole('button', { name: 'Set di cornici', exact: true }).click();
  const frameEditor = page.getByRole('dialog', { name: 'Editor cornici del progetto' });
  const frameGuides = frameEditor.getByRole('button', { name: 'Griglia dei terzi e guide di centratura' });
  assert.equal(await frameGuides.getAttribute('aria-pressed'), 'false');
  await frameGuides.click();
  await frameEditor.locator('.thirds-grid').waitFor({ state: 'visible' });
  await stageGrid.waitFor({ state: 'visible' });
  assert.equal(await frameEditor.getByRole('button', { name: 'Cornici custom', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByLabel('Nome del set').fill('Cornici prova');
  for (const color of ['Bianco', 'Blu', 'Nero', 'Rosso', 'Verde', 'Incolore']) {
    await page.getByRole('button', { name: 'Carica ' + color, exact: true }).click();
    await page.getByRole('button', { name: 'Sostituisci ' + color, exact: true }).waitFor();
  }
  await frameEditor.getByRole('button', { name: 'Salva set', exact: true }).click();
  const fontSize = frameEditor.getByRole('slider', { name: 'Dimensione massima del font' });
  await frameEditor.getByRole('button', { name: 'Testo ed effetti', exact: true }).click();
  assert.equal(await frameEditor.getByLabel('Testo da formattare').count(), 0);
  assert.equal(await fontSize.count(), 0);
  await frameEditor.getByRole('button', { name: 'Zone', exact: true }).click();
  const editableZone = frameEditor.getByLabel('Zona da modificare');
  await choose(editableZone, 'art');
  assert.equal(await fontSize.count(), 0);
  await choose(editableZone, 'title');
  await choose(frameEditor.getByLabel('Allineamento orizzontale'), 'right');
  await fontSize.press('Home');
  assert.equal(await fontSize.inputValue(), '8');
  await choose(editableZone, 'artist');
  assert.equal(await fontSize.inputValue(), '20');
  await choose(editableZone, 'stats');
  await choose(frameEditor.locator('.template-preview-options').getByLabel('Anteprima'), '');
  const statsBox = frameEditor.getByLabel('Stile del riquadro');
  const statsDivider = frameEditor.getByLabel('Separatore forza/costituzione');
  const previewCanvas = frameEditor.locator('canvas');
  await previewCanvas.waitFor();
  await statsBox.click();
  assert.equal(await frameEditor.getByRole('option').count(), 11);
  await frameEditor.getByRole('option', { name: 'Capsula' }).click();
  await page.waitForFunction(() => document.querySelector('.template-preview-card canvas').getContext('2d')
    .getImageData(595, 950, 1, 1).data.slice(0, 3).join(',') === '250,246,237');
  const statsPixels = () => {
    const context = document.querySelector('.template-preview-card canvas').getContext('2d');
    return { above: context.getImageData(558, 930, 135, 9).data.join(','),
      separator: context.getImageData(617, 950, 15, 32).data.join(',') };
  };
  const originalStats = await page.evaluate(statsPixels);
  await choose(statsDivider, 'capsule');
  await page.waitForFunction(separator => document.querySelector('.template-preview-card canvas').getContext('2d')
    .getImageData(617, 950, 15, 32).data.join(',') !== separator, originalStats.separator);
  assert.equal((await page.evaluate(statsPixels)).above, originalStats.above);
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const saved = await window.proxy.open(project.id);
    const stats = saved.frameSets.find(set => set.name === 'Cornici prova')?.appearance?.statsAppearance;
    return stats?.box === 'capsule' && stats.divider === 'capsule';
  });
  await frameEditor.getByRole('button', { name: 'Colori', exact: true }).click();
  assert.equal(await frameEditor.locator('.template-controls-body:visible').evaluate(node => node.scrollWidth <= node.clientWidth), true);
  await frameEditor.screenshot({ path: join(paths, 'custom-frames.png') });
  await page.getByLabel('Applica a 1 carta').check();
  await page.getByRole('button', { name: 'Salva e applica' }).click();
  await page.getByText('Set salvato e applicato').waitFor();
  await page.getByText('Cornice applicata · Rosso').waitFor();
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const saved = await window.proxy.open(project.id);
    const frame = saved.cards[0].frame;
    return frame.kind === 'color-set' && frame.set.appearance?.textStyles?.title?.align === 'right'
      && frame.set.appearance.textStyles.title.size === 8 && frame.set.appearance.statsAppearance?.box === 'capsule';
  });
  await frameTab.click();
  await choose(frameElement, 'stats');
  const cardStatsBox = inspector.getByLabel('Stile del riquadro');
  const cardStatsDivider = inspector.getByLabel('Separatore forza/costituzione');
  assert.equal(await cardStatsBox.getAttribute('data-value'), '');
  await choose(cardStatsBox, 'banner');
  await choose(cardStatsDivider, 'original');
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const saved = await window.proxy.open(project.id);
    const { statsOverrides } = saved.cards[0];
    return statsOverrides?.box === 'banner' && statsOverrides.divider === 'original';
  });
  await choose(cardStatsBox, '');
  await choose(cardStatsDivider, '');
  await choose(frameElement, 'art');
  await zoneX.waitFor();
  assert.equal(await cardAlignment.count(), 0);
  await choose(frameElement, 'artist');
  await cardAlignment.waitFor();
  assert.equal(await zoneX.count(), 0);
  assert.equal(await page.locator('.stage .zone-guide').count(), 0);
  await choose(frameElement, 'rules');
  await zoneX.waitFor();
  await page.locator('.stage .zone-guide').waitFor();
  assert.equal(await cardAlignment.getAttribute('data-value'), '');
  await choose(cardAlignment, 'center');
  await choose(frameElement, 'title');
  await choose(cardAlignment, 'left');
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const saved = await window.proxy.open(project.id);
    const card = saved.cards[0];
    return card.textAlignOverrides?.rules === 'center' && card.textAlignOverrides.title === 'left'
      && card.frame.set.appearance.textStyles.title.align === 'right';
  });
  await choose(cardAlignment, '');
  await choose(frameElement, 'rules');
  assert.equal(await cardAlignment.getAttribute('data-value'), 'center');
  await choose(cardAlignment, '');
  await inspector.getByRole('button', { name: 'Cornice', exact: true }).click();
  const projectFrame = page.locator('.deck').getByLabel('Cornice del progetto');
  await choose(projectFrame, 'import');
  await page.waitForFunction(() => document.querySelector('.deck-controls .select-trigger')?.dataset.value === 'custom');
  await page.getByText('Questa carta usa la cornice del progetto.', { exact: false }).waitFor();
  await choose(projectFrame, '');
  await page.getByText('Cornice applicata · Rosso').waitFor();
  await choose(projectFrame, 'full-art');
  await page.getByRole('button', { name: 'Importa lista', exact: true }).click();
  await page.getByLabel('Lista delle carte').fill('99 Sole // Luna\n1 Non esiste');
  await page.getByRole('button', { name: 'Importa carte' }).click();
  await page.getByText('Carta o edizione non trovata · Non esiste').waitFor();
  await page.getByRole('dialog', { name: 'Importa lista' }).getByText('Importata 1 carta · 1 riga da correggere', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
  const deck = page.locator('.deck-list');
  const bolt = deck.getByRole('button', { name: /Lightning Bolt/ });
  const copyFrame = page.getByRole('button', { name: 'Copia cornice', exact: true });
  const pasteFrame = page.getByRole('button', { name: 'Incolla cornice', exact: true });
  const pasteSettings = page.getByRole('button', { name: 'Incolla impostazioni cornice', exact: true });
  const typeVisible = page.getByRole('checkbox', { name: 'Tipo', exact: true });
  await bolt.click();
  await frameTab.click();
  assert.ok(await pasteSettings.isDisabled());
  await choose(projectFrame, '');
  await choose(frameElement, 'title');
  await zoneX.fill('10');
  await typeVisible.uncheck();
  await copyFrame.click();
  await page.getByText('Cornice copiata', { exact: true }).waitFor();
  await typeVisible.check();
  await page.getByRole('button', { name: 'Ripristina posizione della cornice' }).click();
  await choose(projectFrame, 'full-art');
  await deck.getByRole('button', { name: /Sole/ }).click();
  const backSide = page.getByRole('button', { name: 'Retro', exact: true });
  await backSide.click();
  await frameTab.click();
  await pasteSettings.click();
  await page.getByText('Impostazioni della cornice incollate', { exact: true }).waitFor();
  assert.equal(await typeVisible.isChecked(), false);
  await choose(frameElement, 'title');
  assert.equal(await zoneX.inputValue(), '10');
  await page.waitForFunction(async () => {
    const [project] = await window.proxy.projects();
    const saved = await window.proxy.open(project.id);
    const side = saved.cards[1].backSide;
    return saved.frame?.kind === 'template' && saved.frame.template === 'full-art'
      && side?.frame.kind === 'printing' && side.hiddenZones?.includes('type') && side.zoneOverrides?.title?.x === 10;
  });
  await undoChange.click();
  await choose(projectFrame, '');
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
  await inspector.getByRole('button', { name: 'Illustrazione', exact: true }).click();
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
  const mirrorSelect = inspector.getByLabel('Segui cornice di');
  const moon = deck.getByRole('button', { name: /Sole/ });
  const mirrorSource = `${source.id}/front`;
  const frameLock = inspector.getByText('Per modificare questa cornice, scegli Nessuna sorgente.');
  const mirrorWarning = inspector.getByRole('status').filter({ hasText: 'Mirroring sospeso' });
  const resetCard = inspector.getByRole('button', { name: 'Ripristina carta originale' });
  await backSide.click();
  await frameTab.click();
  await choose(mirrorSelect, mirrorSource);
  await frameLock.waitFor();
  assert.ok(await pasteFrame.isDisabled());
  assert.ok(await resetCard.isEnabled());
  assert.equal(await frameElement.count(), 0);
  await inspector.getByRole('button', { name: 'Carta', exact: true }).click();
  await cardText.fill('Testo indipendente');
  await electron.evaluate(() => globalThis.setSmokeFiles('art'));
  await page.locator('.image-dropzone').click();
  await inspector.getByRole('button', { name: 'Illustrazione', exact: true }).click();
  assert.ok(await inspector.getByRole('slider').first().isEnabled());
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
  await choose(template, 'printing');
  await moon.click();
  await backSide.click();
  await mirrorWarning.waitFor();
  await frameTab.click();
  assert.equal(await mirrorSelect.getAttribute('data-value'), mirrorSource);
  await bolt.click();
  await frameTab.click();
  await choose(template, source.setId);
  await moon.click();
  await backSide.click();
  await frameTab.click();
  await frameLock.waitFor();
  const sourceCheck = deck.locator('input[type="checkbox"]').first();
  await sourceCheck.check();
  await page.getByRole('button', { name: 'Rimuovi 1 carta selezionata' }).click();
  await backSide.click();
  await frameTab.click();
  assert.equal(await mirrorSelect.getAttribute('data-value'), '');
  assert.equal(await template.getAttribute('data-value'), 'printing');
  await undoChange.click();
  await backSide.click();
  await frameTab.click();
  await frameLock.waitFor();
  await choose(mirrorSelect, '');
  assert.equal(await template.getAttribute('data-value'), 'printing');
  await choose(mirrorSelect, mirrorSource);
  await resetCard.click();
  assert.equal(await mirrorSelect.getAttribute('data-value'), '');
  assert.equal(await template.getAttribute('data-value'), 'printing');
  await page.waitForFunction(async ({ id, setId }) => {
    const [project] = await window.proxy.projects();
    const [parent, child] = (await window.proxy.open(project.id)).cards;
    return parent.id === id && parent.frame.kind === 'color-set'
      && parent.frame.set.id === setId && !child.backSide;
  }, source);
  await choose(projectFrame, 'full-art');
  await bolt.click();
  await electron.evaluate(() => globalThis.setSmokeFiles('art'));
  await page.getByRole('button', { name: 'Modifica in blocco' }).click();
  await page.getByRole('button', { name: 'Scegli file' }).click();
  await page.getByRole('button', { name: 'Applica a 1 carta' }).click();
  await page.getByText('Modificata 1 carta').waitFor();
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).click();
  await page.getByText('Modifica annullata').waitFor();
  assert.equal(await projectFrame.getAttribute('data-value'), 'full-art');
  await cardText.fill('Pesca una carta. {R}');
  await page.getByRole('button', { name: 'Editor cornici', exact: true }).click();
  await page.getByRole('button', { name: 'Simboli', exact: true }).click();
  const symbolSelect = page.getByRole('combobox', { name: 'Simbolo', exact: true });
  await symbolSelect.click();
  const redSymbol = page.locator('.select-menu [role=option][data-value="R"]');
  await redSymbol.locator('img').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.select-menu [data-value="R"] img')?.naturalWidth > 0);
  await redSymbol.click();
  const symbolFile = page.getByLabel('File del simbolo');
  const symbolPng = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const context = canvas.getContext('2d');
    context.fillStyle = '#00ff00';
    context.fillRect(0, 0, 16, 16);
    return canvas.toDataURL().split(',')[1];
  });
  await symbolFile.setInputFiles({ name: 'mana.png', mimeType: 'image/png', buffer: Buffer.from(symbolPng, 'base64') });
  await page.getByRole('button', { name: 'Ripristina immagine' }).waitFor();
  assert.match(await symbolSelect.locator('img').getAttribute('src'), /^proxy-asset:\/\/images\//);
  await symbolSelect.click();
  assert.equal(await redSymbol.locator('img').getAttribute('src'), await symbolSelect.locator('img').getAttribute('src'));
  await symbolSelect.press('Escape');
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
  await verifySymbolPixels('.template-preview canvas', [0, 255, 0]);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#ff00ff" d="M0 0H16V16H0Z"/></svg>';
  await symbolFile.setInputFiles({ name: 'mana.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await page.getByLabel('Colore del testo · {R}', { exact: true }).fill('#00ffff');
  const textColorChecks = [
    ['title', 'Colore del titolo dalla carta'], ['rules', 'Colore del corpo dalla carta'], ['type', 'Colore del tipo dalla carta']
  ];
  for (const [area, label] of textColorChecks) {
    const checkbox = page.getByRole('checkbox', { name: label, exact: true });
    await checkbox.check();
    await verifySymbolPixels('.template-preview canvas', [255, 0, 255], [area]);
    await checkbox.uncheck();
  }
  await page.getByRole('button', { name: 'Testo ed effetti' }).click();
  for (const [, label] of textColorChecks) await page.getByRole('checkbox', { name: label, exact: true }).check();
  await verifySymbolPixels('.template-preview canvas', [255, 0, 255], ['title', 'rules', 'type']);
  await page.screenshot({ path: join(paths, 'frame-symbols.png') });
  await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
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
  assert.equal(await page.locator('.deck').getByLabel('Cornice del progetto').getAttribute('data-value'), 'full-art');
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
  const projectTitle = page.getByRole('textbox', { name: 'Nome del progetto' });
  const changedTitle = 'Verifica recupero salvataggio';
  await projectTitle.fill(changedTitle);
  await projectTitle.press('Enter');
  await page.locator('.save-status').getByRole('button', { name: 'Riprova a salvare' }).waitFor();
  await choose(projectSelect, 'new');
  const unsavedDialog = page.getByRole('dialog', { name: 'Modifiche non salvate' });
  await unsavedDialog.getByText(`Impossibile salvare le modifiche a «${changedTitle}».`).waitFor();
  assert.equal(await projectSelect.getAttribute('data-value'), originalProjectId);
  await unsavedDialog.getByRole('button', { name: 'Continua a modificare' }).click();
  assert.equal(await projectTitle.inputValue(), changedTitle);
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
