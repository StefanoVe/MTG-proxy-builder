import test from 'node:test';
import assert from 'node:assert/strict';
import { blankCard, createCard, createProject, defaultZones, projectSchema } from '../src/shared/model.ts';
import type { Asset, Card, FrameSet } from '../src/shared/model.ts';
import { colorFrameLayers, colorsForFrame } from '../src/shared/frame-colors.ts';
import { matchBatch, parseDeck } from '../src/shared/deck.ts';
import { cardWidth, cardHeight, mmToPt, papers, printSheets } from '../src/shared/print.ts';
import { newTemplate, templateAppearance, withProjectTemplate } from '../src/shared/templates.ts';

const options = { paper: 'A4', cut: true, backs: true } as const;
const image = 'a'.repeat(64);
const asset = (name: string): Asset => ({ id: image, name, png: true, alpha: true, width: 744, height: 1039 });
const card = (name: string, count = 1): Card => createCard({ ...blankCard, name }, count);

test('decklist import preserves order, quantities, set and collector number and reports invalid quantities', () => {
  const { entries, errors } = parseDeck('Commander:\n1 Sol Ring\n2 Lightning Bolt (2X2) 117 *F*\n3xForest\nIsland\n0 Mountain\n4x Plains');
  assert.deepEqual(entries, [
    { name: 'Sol Ring', count: 1 },
    { name: 'Lightning Bolt', count: 2, set: '2x2', number: '117' },
    { name: 'Forest', count: 3 }, { name: 'Island', count: 1 }, { name: 'Plains', count: 4 }
  ]);
  assert.equal(errors.length, 1);
});

test('batch uses catalog identity, normalizes accents and protects edits and ambiguous rows', () => {
  const bolt = createCard({ ...blankCard, printingId: 'catalog-id', name: 'Éclair, Rouge' });
  bolt.fields.name = 'Custom name';
  const sol = { ...card('Sol Ring'), art: image };
  const rows = matchBatch([asset('eclair rouge.PNG'), asset('sol_ring.jpg'), asset('Missing.png'), asset('Forest.png'), asset('forest.webp')],
    [bolt, sol, card('Forest')], 'art');
  assert.deepEqual(rows.map(row => row.accept), [true, false, false, false, false]);
  assert.equal(rows[0].cardId, bolt.id);
  assert.equal(rows[1].cardId, sol.id);
  assert.equal(matchBatch([asset('Forest.png')], [card('Forest'), card('Forest')], 'art')[0].cardId, '');
  assert.equal(matchBatch([asset('Forest.png')], [{ ...card('Forest'), frame: { kind: 'classic', tone: 'auto' } }], 'frame')[0].accept, false);
});

test('A4 and Letter print at standard dimensions with matching duplex pages', () => {
  const ordinary = card('Forest', 98);
  const reversible = createCard({ ...blankCard, name: 'Two faces', editable: false, images: { front: image, back: image } }, 2);
  for (const paper of ['A4', 'Letter'] as const) {
    const sheets = printSheets([ordinary, reversible], { ...options, paper });
    assert.equal(sheets.length, 24);
    assert.equal(sheets.filter(sheet => !sheet.back).reduce((sum, sheet) => sum + sheet.slots.length, 0), 100);
    assert.equal(sheets.filter(sheet => sheet.back).reduce((sum, sheet) => sum + sheet.slots.length, 0), 2);
    const [pw, ph] = papers[paper];
    for (const [index, sheet] of sheets.entries()) {
      assert.ok(sheet.slots.length <= 9);
      for (const slot of sheet.slots) {
        assert.ok(slot.x >= 0 && slot.y >= 0 && slot.x + cardWidth <= pw && slot.y + cardHeight <= ph);
      }
      if (sheet.back) for (const slot of sheet.slots) {
        assert.ok(sheets[index - 1].slots.some(front => front.card === slot.card && Math.abs(pw - slot.x - cardWidth - front.x) < 0.00001 && front.y === slot.y));
      }
    }
  }
  assert.equal(mmToPt(25.4), 72);
  assert.equal(printSheets([ordinary], options).length, 11);
});

test('saves and reopens a Full art layout for a card and a project', () => {
  const appearance = { zones: { ...defaultZones, rules: { x: 10, y: 70, w: 80, h: 18 } },
    overlay: image, textColor: '#def123', titleShade: 0.3, rulesShade: 0.72, divider: true };
  const project = { ...createProject(), fullArtBase: appearance,
    cards: [{ ...card('Sol Ring'), frame: { kind: 'template', template: 'full-art', appearance } }] };
  const restored = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored.fullArtBase, appearance);
  assert.deepEqual(restored.cards[0].frame, project.cards[0].frame);
});

test('saved project templates override existing and future cards of the corresponding type', () => {
  const fullArt = newTemplate('full-art');
  const extendedArt = newTemplate('extended-art');
  const legacy = { ...templateAppearance(fullArt), textColor: '#112233' };
  const changed = {
    ...templateAppearance(fullArt), autoTextColor: true, shadeColor: '#445566', titleBlur: 12,
    topEffect: { anchor: 'title', height: 18 }, bottomEffect: { anchor: 'manual', height: 31.5 },
    dividerLength: 40, decorations: [{
      id: crypto.randomUUID(), name: 'Incisione', source: { kind: 'motif', motif: 'frame' },
      rect: { x: 2, y: 2, w: 96, h: 96 }, opacity: .8, tint: 'card', color: '#ffffff', fit: 'stretch'
    }]
  };
  const existing = { ...card('Full art esistente'), frame: { ...fullArt, appearance: legacy } };
  const other = { ...card('Estesa'), frame: extendedArt };
  const modern = card('Moderna');
  const project = projectSchema.parse(JSON.parse(JSON.stringify({
    ...createProject(), cards: [existing, other, modern],
    templateAppearances: { 'full-art': changed }
  })));
  assert.deepEqual(project.templateAppearances?.['full-art'], changed);
  assert.deepEqual(withProjectTemplate(project.cards[0], project.templateAppearances).frame, { ...fullArt, appearance: changed });
  assert.deepEqual(withProjectTemplate({ ...card('Nuova Full art'), frame: fullArt }, project.templateAppearances).frame,
    { ...fullArt, appearance: changed });
  assert.equal(withProjectTemplate(project.cards[1], project.templateAppearances), project.cards[1]);
  assert.equal(withProjectTemplate(project.cards[2], project.templateAppearances), project.cards[2]);
  assert.deepEqual(project.cards[0].frame, existing.frame);
});

test('selects frame layers from the card colors and falls back to colorless when mixing is disabled', () => {
  const set: FrameSet = { id: crypto.randomUUID(), name: 'Carta',
    assets: { W: '1'.repeat(64), U: '2'.repeat(64), B: '3'.repeat(64), R: '4'.repeat(64), G: '5'.repeat(64), C: '6'.repeat(64) },
    mix: true, zones: defaultZones };
  assert.deepEqual(colorsForFrame([], true), ['C']);
  assert.deepEqual(colorsForFrame(['B'], false), ['B']);
  assert.deepEqual(colorsForFrame(['G', 'W', 'R'], true), ['W', 'R', 'G']);
  assert.deepEqual(colorFrameLayers(set, ['G', 'R']), [set.assets.R, set.assets.G]);
  assert.deepEqual(colorFrameLayers({ ...set, mix: false }, ['G', 'R']), [set.assets.C]);
  const project = createProject();
  const item = { ...card('Forest'), frame: { kind: 'color-set', set } };
  assert.deepEqual(projectSchema.parse({ ...project, frameSets: [set], cards: [item] }).cards[0].frame, item.frame);
});
