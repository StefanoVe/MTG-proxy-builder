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
  await page.getByRole('heading', { name: 'Cerca una carta' }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: join(paths, 'empty.png') });
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
    return { art: canvas.toDataURL(), catalog: canvas.toDataURL('image/webp'), frame };
  });
  const artFile = join(paths, 'Lightning Bolt.png');
  const frameFile = join(paths, 'Cornice.png');
  await writeFile(artFile, Buffer.from(assetFiles.art.split(',')[1], 'base64'));
  await writeFile(frameFile, Buffer.from(assetFiles.frame.split(',')[1], 'base64'));
  await electron.evaluate(({ dialog }, { artFile, frameFile, pdfPath, zipPath, catalog }) => {
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
    const cardFaces = ['Sole', 'Luna'].map(name => ({ name, image_uris: { display: 'https://cards.scryfall.io/display/demo.webp' } }));
    const double = { ...exact, id: 'd0000000-0000-4000-8000-000000000002', name: 'Sole // Luna', layout: 'transform',
      collector_number: '5', image_uris: undefined, card_faces: cardFaces };
    globalThis.fetch = async (url, init) => {
      const path = new URL(url);
      if (path.hostname === 'cards.scryfall.io') return new Response(Buffer.from(catalog.split(',')[1], 'base64'), { headers: { 'content-type': 'image/webp' } });
      if (path.pathname === '/cards/named') return path.searchParams.get('exact') === exact.name ? Response.json(exact) : new Response(null, { status: 404 });
      if (path.pathname === '/cards/autocomplete') return Response.json({ data: [exact.name] });
      if (path.pathname === '/cards/collection') return Response.json({
        data: JSON.parse(init.body).identifiers.flatMap(item => item.name === exact.name || item.set === exact.set ? [exact] : item.name === double.name ? [double] : [])
      });
      if (path.pathname === '/cards/search') return Response.json({ data: [exact, second] });
      const card = [exact, second, double].find(card => path.pathname === '/cards/' + card.id);
      return card ? Response.json(card) : new Response(null, { status: 404 });
    };
  }, { artFile, frameFile, pdfPath, zipPath, catalog: assetFiles.catalog });
  const input = page.getByRole('searchbox', { name: 'Nome della carta da cercare' });
  await input.fill('Lightning Bol');
  await input.press('Enter');
  await page.locator('.results').getByRole('button', { name: /Lightning Bolt/ }).click();
  await page.getByRole('heading', { name: 'Lightning Bolt', exact: true }).waitFor();
  await input.fill('Lightning Bolt');
  const result = await page.evaluate(() => window.proxy.search('Lightning Bolt'));
  assert.ok(result.exact);
  assert.equal(await page.getByLabel('Costo di mana').inputValue(), '{R}');
  assert.equal(await page.getByLabel('Tipo', { exact: true }).inputValue(), 'Instant');
  assert.equal(await page.getByLabel('Testo della carta').inputValue(), 'Lightning Bolt deals 3 damage to any target.');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return canvas?.width === 744 && Math.abs(canvas.getContext('2d').getImageData(0, 0, 1, 1).data[1] - 56) < 6;
  });
  await input.fill('');
  await page.getByRole('button', { name: 'Edizioni' }).click();
  await page.getByRole('button', { name: /Magic 2011/ }).click();
  await page.locator('.source').getByText('Magic 2011').waitFor();
  await page.getByLabel('Testo della carta').fill('Pesca una carta.');
  await page.getByRole('button', { name: 'Cornice', exact: true }).click();
  const template = page.getByLabel(/^Template/);
  assert.equal(await template.inputValue(), 'full-art');
  await template.selectOption('extended-art');
  await page.getByRole('button', { name: 'Carta', exact: true }).click();
  assert.equal(await page.getByLabel('Testo della carta').inputValue(), 'Pesca una carta.');
  await page.locator('.source').getByText('Magic 2011').waitFor();
  await page.getByRole('button', { name: 'Cornice', exact: true }).click();
  await electron.evaluate(() => globalThis.setSmokeFiles('frame'));
  await page.getByRole('button', { name: 'Gestisci set di cornici' }).click();
  await page.getByLabel('Nome del set').fill('Cornici prova');
  for (const color of ['Bianco', 'Blu', 'Nero', 'Rosso', 'Verde', 'Incolore']) {
    await page.getByRole('button', { name: 'Carica ' + color, exact: true }).click();
    await page.getByRole('button', { name: 'Sostituisci ' + color, exact: true }).waitFor();
  }
  await page.getByLabel('Applica a 1 carta').check();
  await page.getByRole('button', { name: 'Salva e applica' }).click();
  await page.getByText('Set salvato e applicato').waitFor();
  await page.getByText('Cornice applicata · Rosso').waitFor();
  await page.getByRole('button', { name: 'Importa lista', exact: true }).click();
  await page.getByLabel('Lista delle carte').fill('99 Sole // Luna\n1 Non esiste');
  await page.getByRole('button', { name: 'Importa carte' }).click();
  await page.getByText('Carta o edizione non trovata · Non esiste').waitFor();
  await page.getByRole('button', { name: 'Chiudi' }).click();
  await page.locator('.deck-list').getByRole('button', { name: /Lightning Bolt/ }).click();
  await electron.evaluate(() => globalThis.setSmokeFiles('art'));
  await page.getByRole('button', { name: 'Modifica in blocco' }).click();
  await page.getByRole('button', { name: 'Scegli file' }).click();
  await page.getByRole('button', { name: 'Applica a 1 carta' }).click();
  await page.getByText('Modificata 1 carta').waitFor();
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).click();
  await page.getByText('Modifica annullata').waitFor();
  await page.getByRole('button', { name: 'Stampa', exact: true }).click();
  await page.screenshot({ path: join(paths, 'print-choices.png') });
  await page.getByRole('button', { name: 'Carte singole' }).click();
  await page.getByLabel('Abbondanza (bleed)').selectOption('mpc');
  await page.getByText('816 × 1111 px · 3 immagini').waitFor();
  await page.getByRole('img', { name: 'Sole // Luna · Retro' }).waitFor();
  await page.waitForFunction(() => document.querySelector('.card-export-grid canvas')?.width > 1);
  await page.screenshot({ path: join(paths, 'card-export.png') });
  await page.getByRole('button', { name: 'Salva ZIP' }).click();
  await page.getByText('ZIP salvato').waitFor({ timeout: 30000 });
  const images = unzipSync(await readFile(zipPath));
  assert.deepEqual(Object.keys(images).sort(), [
    'fronte/0001-Lightning Bolt.png', 'fronte/0002-Sole -- Luna.png', 'retro/0002-Sole -- Luna.png'
  ]);
  for (const image of Object.values(images).map(bytes => Buffer.from(bytes))) {
    assert.equal(image.readUInt32BE(16), 816);
    assert.equal(image.readUInt32BE(20), 1111);
    const density = image.indexOf('pHYs');
    assert.ok(density >= 0);
    assert.equal(image.readUInt32BE(density + 4), 11811);
    assert.equal(image.readUInt8(density + 12), 1);
  }
  await page.getByRole('button', { name: 'Stampa', exact: true }).click();
  await page.getByRole('button', { name: 'Foglio di stampa' }).click();
  await page.getByRole('button', { name: 'Salva PDF' }).click();
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
  await page.waitForFunction(() => document.querySelector('canvas')?.width === 744);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  await page.getByRole('button', { name: 'Foglio di stampa' }).click();
  await page.getByText(/Pagina 1 di 24/).waitFor();
  await page.screenshot({ path: join(paths, 'print.png') });
  console.log('Workflow verificato', paths);
} finally {
  await electron.close().catch(() => {});
}
