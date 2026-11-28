import test from 'node:test';
import assert from 'node:assert/strict';
import { cardsWithSharedArt } from '../src/shared/shared-art.ts';
import { blankCard, cardSide, createCard, createProject, defaultZones, isCardModified, projectSchema, rebaseBackSide, sideFrameSettings, sideOrientation, sideState } from '../src/shared/model.ts';
import type { Asset, Card, FrameSet } from '../src/shared/model.ts';
import { colorFrameLayers, colorsForFrame } from '../src/shared/frame-colors.ts';
import { matchBatch, matchesCardSearch, parseDeck } from '../src/shared/deck.ts';
import { cardWidth, cardHeight, mmToPt, papers, printSheets } from '../src/shared/print.ts';
import { clearInvalidFrameMirrors, newTemplate, projectCards, projectFrameResolver, templateAppearance, withProjectTemplate } from '../src/shared/templates.ts';

const options = { paper: 'A4', cut: true, backs: true } as const;
const image = 'a'.repeat(64);
const asset = (name: string): Asset => ({ id: image, name, png: true, alpha: true, width: 744, height: 1039 });
const card = (name: string, count = 1): Card => createCard({ ...blankCard, name }, count);

test('added card search includes edited fields and both sides', () => {
  const front = card('Dragon');
  front.fields.type = 'Creature — Dragon';
  front.fields.rules = 'Flying and haste';
  front.backSide = sideState({ ...front, fields: { ...front.fields, name: 'Reverse', type: 'Land', rules: 'Add mana' } });
  for (const query of [' dragon ', 'CREATURE', 'flying', 'land', 'add mana', '']) {
    assert.equal(matchesCardSearch(front, query, 'en', 'Untitled'), true, query);
  }
  assert.equal(matchesCardSearch(front, 'island', 'en', 'Untitled'), false);
});

test('added card search retains original information after edits', () => {
  const original = createCard({ ...blankCard, name: 'Original name', type: 'Creature — Elf', rules: 'Draw a card' });
  original.fields = { ...original.fields, name: 'New name', type: 'Land', rules: 'Add mana' };
  for (const query of ['original name', 'elf', 'draw a card', 'new name', 'land', 'add mana']) {
    assert.equal(matchesCardSearch(original, query, 'en', 'Untitled'), true, query);
  }
});

test('each physical side retains independent edits through project serialization', () => {
  const source = { ...blankCard, printingId: 'printing', name: 'Front // Back', images: { front: image, back: image, backArt: image },
    faceNames: ['Front', 'Back'], details: { rarity: '', lang: 'en', flavor: '', faces: [
      { name: 'Front', mana: '', type: 'Creature', rules: 'front', flavor: '', artist: '', power: '1', toughness: '1', loyalty: '', defense: '' },
      { name: 'Back', mana: '', type: 'Creature', rules: 'back', flavor: '', artist: '', power: '2', toughness: '2', loyalty: '', defense: '' }
    ] } };
  const original = createCard(source, 2);
  const reverse = cardSide(original, true);
  assert.equal(reverse.fields.name, 'Back');
  assert.equal(reverse.source.images.art, image);
  const edited = { ...original, backSide: sideState({ ...reverse, fields: { ...reverse.fields, rules: 'changed' }, frame: newTemplate('full-art') }) };
  assert.equal(isCardModified(edited), true);
  assert.equal(edited.fields.rules, original.fields.rules);
  const restored = projectSchema.parse(JSON.parse(JSON.stringify({ ...createProject(), cards: [edited] })));
  assert.equal(cardSide(restored.cards[0], true).fields.rules, 'changed');
  assert.equal(printSheets(restored.cards, options)[1].slots.length, 2);
  const updatedSource = { ...source, printingId: 'new-printing', details: { ...source.details, faces: [source.details.faces[0],
    { ...source.details.faces[1], name: 'New back', type: 'Land', rules: 'new rules' }] } };
  const rebased = rebaseBackSide(edited, updatedSource)!;
  assert.equal(rebased.fields.name, 'New back');
  assert.equal(rebased.fields.type, 'Land');
  assert.equal(rebased.fields.rules, 'changed');
  assert.equal(rebased.frame.kind, 'template');
  assert.deepEqual(rebaseBackSide(edited, { ...updatedSource, images: { front: image } }), edited.backSide);
});

test('orientation is determined independently for physical sides and split cards', () => {
  const face = { name: '', mana: '', type: '', rules: '', flavor: '', artist: '', power: '', toughness: '', loyalty: '', defense: '' };
  const battle = createCard({ ...blankCard, layout: 'battle', type: 'Battle — Siege', images: { front: image, back: image },
    details: { rarity: '', lang: 'en', flavor: '', faces: [{ ...face, type: 'Battle — Siege' }, { ...face, type: 'Creature' }] } });
  assert.equal(sideOrientation(battle), 'landscape');
  assert.equal(sideOrientation(battle, true), 'portrait');
  assert.equal(sideOrientation(cardSide(battle, true)), 'portrait');
  assert.equal(sideOrientation(createCard({ ...blankCard, layout: 'split' })), 'landscape');
  assert.equal(sideOrientation(card('Normal')), 'portrait');
});

test('alignment overrides survive saving and project frames independently for each side', () => {
  const front = createCard({ ...blankCard, images: { front: image, back: image } });
  front.textAlignOverrides = { title: 'right', rules: 'center' };
  assert.equal(isCardModified(front), true);
  assert.equal(cardSide(front, true).textAlignOverrides, undefined);

  const back = cardSide(front, true);
  front.backSide = sideState({ ...back, textAlignOverrides: { rules: 'right' } });
  const frame = newTemplate('full-art');
  const project = projectSchema.parse(JSON.parse(JSON.stringify({ ...createProject(), cards: [front], frame })));
  const [rendered] = projectCards(project);
  assert.deepEqual(rendered.textAlignOverrides, { title: 'right', rules: 'center' });
  assert.deepEqual(cardSide(rendered, true).textAlignOverrides, { rules: 'right' });
});

test('an unedited reverse does not inherit the front artwork or hidden text', () => {
  const front: Card = {
    ...createCard({ ...blankCard, images: { front: image, back: image, backArt: image } }),
    art: 'b'.repeat(64), hiddenZones: ['title', 'type', 'rules', 'stats'],
    zoneOverrides: { rules: defaultZones.rules }, dividerOverrides: { divider: false }
  };
  const reverse = cardSide(front, true);
  assert.equal(reverse.art, undefined);
  assert.equal(reverse.source.images.art, image);
  assert.equal(reverse.hiddenZones, undefined);
  assert.equal(reverse.zoneOverrides, undefined);
  assert.equal(reverse.dividerOverrides, undefined);
});

test('multiple sides mirror the source settings in previews and scoped exports', () => {
  const source = createCard({ ...blankCard, name: 'Source', images: { back: image } });
  source.backSide = sideState({ ...cardSide(source, true), frame: newTemplate('extended-art'),
    zoneOverrides: { title: defaultZones.title }, hiddenZones: ['type'], dividerOverrides: { titleDivider: true },
    textAlignOverrides: { rules: 'center' } });
  const first = { ...card('First'), frameMirror: { cardId: source.id, back: true }, art: image, crop: { x: 0.5, y: 0.25, zoom: 2 } };
  const second = createCard({ ...blankCard, name: 'Second', images: { back: image } });
  second.backSide = sideState({ ...cardSide(second, true), frameMirror: first.frameMirror });
  const project = projectSchema.parse(JSON.parse(JSON.stringify({ ...createProject(), cards: [source, first, second] })));
  const [savedSource, savedFirst, savedSecond] = project.cards;
  assert.ok(isCardModified(savedSecond));
  assert.equal(cardSide(savedFirst, true).frameMirror, undefined);
  const [renderedFirst, renderedSecond] = projectCards(project, [savedFirst, savedSecond]);
  const sourceSettings = sideFrameSettings(cardSide(savedSource, true));
  assert.deepEqual(sideFrameSettings(renderedFirst), sourceSettings);
  assert.deepEqual(sideFrameSettings(cardSide(renderedSecond, true)), sourceSettings);
  assert.deepEqual(sideFrameSettings(renderedSecond), sideFrameSettings(savedSecond));
  assert.deepEqual(renderedFirst.fields, first.fields);
  assert.equal(renderedFirst.art, first.art);
  assert.deepEqual(renderedFirst.crop, first.crop);
  assert.deepEqual(savedFirst.frame, first.frame);

  const projectFrame = newTemplate('full-art');
  savedSource.backSide!.hiddenZones = ['title'];
  savedSource.backSide!.dividerOverrides = undefined;
  const [updatedFirst, updatedSecond] = projectCards({ ...project, frame: projectFrame }, [savedFirst, savedSecond]);
  for (const side of [updatedFirst, cardSide(updatedSecond, true)]) {
    assert.deepEqual(side.frame, projectFrame);
    assert.deepEqual(side.hiddenZones, ['title']);
    assert.equal(side.dividerOverrides, undefined);
  }
});

test('mirroring a switched-off or invalid source restores the saved settings', () => {
  const source = { ...card('Source'), frame: newTemplate('full-art') };
  const local = { ...card('Local'), frame: newTemplate('extended-art'), hiddenZones: ['stats'] as const };
  const target: Card = { ...local, hiddenZones: [...local.hiddenZones], frameMirror: { cardId: source.id, back: false } };
  const project = { ...createProject(), cards: [source, target] };
  const resolver = projectFrameResolver(project);
  assert.deepEqual(resolver.mirrorOptions(source, false), []);
  assert.deepEqual(resolver.mirrorOptions(target, false), [target.frameMirror]);

  const scan: Card = { ...source, frame: { kind: 'printing' } };
  const paused = { ...project, cards: [scan, target] };
  assert.equal(clearInvalidFrameMirrors(paused), paused);
  assert.equal(projectFrameResolver(paused).sourceSide(target, false, target.frameMirror!)?.frame.kind, 'printing');
  assert.deepEqual(sideFrameSettings(projectCards(paused)[1]), sideFrameSettings(target));
  assert.deepEqual(projectFrameResolver(paused).mirrorOptions(target, false), []);
  assert.deepEqual(projectCards(project)[1].frame, source.frame);

  const invalidTargets = [target, { ...target, frameMirror: { cardId: source.id, back: true } },
    { ...target, frameMirror: { cardId: target.id, back: false } }];
  for (const [index, invalid] of invalidTargets.entries()) {
    const broken = { ...project, cards: index === 0 ? [invalid] : [source, invalid] };
    const cleaned = clearInvalidFrameMirrors(broken).cards.at(-1)!;
    assert.equal(cleaned.frameMirror, undefined);
    assert.deepEqual(sideFrameSettings(cleaned), sideFrameSettings(target));
    assert.deepEqual(sideFrameSettings(projectCards(broken).at(-1)!), sideFrameSettings(target));
  }
});

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

test('deck rows distinguish card customizations from catalog data and copy counts', () => {
  const original = createCard({ ...blankCard, printingId: 'catalog-id', name: 'Lightning Bolt',
    details: { printedName: 'Fulmine', rarity: 'common', lang: 'it', flavor: '', faces: [] }, images: { art: image } }, 4);
  assert.equal(isCardModified(original), false);
  assert.equal(isCardModified(card('Carta vuota')), false);
  assert.equal(isCardModified({ ...original, zoneOverrides: {}, dividerOverrides: {} }), false);

  const customizations: Partial<Card>[] = [
    { fields: { ...original.fields, rules: 'Pesca una carta.' } },
    { art: image },
    { crop: { ...original.crop, zoom: 2 } },
    { frame: { kind: 'printing', artZone: defaultZones.art } },
    { frame: { kind: 'modern', tone: 'auto' } },
    { frame: newTemplate('full-art') },
    { zoneOverrides: { art: defaultZones.art } },
    { hiddenZones: ['title'] },
    { dividerOverrides: { divider: false } }
  ];
  const project = { ...createProject(), cards: customizations.map(change => ({ ...original, ...change })) };
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(reopened.cards.map(isCardModified), customizations.map(() => true));
});

test('a project frame preserves individual card modification status', () => {
  const untouched = createCard({ ...blankCard, printingId: 'catalog-id', name: 'Lightning Bolt' });
  const customized = { ...card('Carta personalizzata'), art: image };
  const project = { ...createProject(), cards: [untouched, customized], frame: newTemplate('full-art') };

  assert.deepEqual(projectCards(project).map(item => item.frame.kind), ['template', 'template']);
  assert.deepEqual(project.cards.map(isCardModified), [false, true]);
});

test('project frame and template appearance apply to both sides without changing saved side settings', () => {
  const original = createCard({ ...blankCard, printingId: 'two-faces', images: { front: image, back: image } });
  const back = cardSide(original, true);
  const doubleSided = { ...original, backSide: sideState({ ...back, fields: { ...back.fields, name: 'Retro personalizzato' }, frame: newTemplate('full-art') }) };
  const appearance = { ...templateAppearance(newTemplate('full-art')), textColor: '#123456' };
  const project = { ...createProject(), cards: [doubleSided], frame: newTemplate('full-art'), templateAppearances: { 'full-art': appearance } };
  const rendered = projectCards(project)[0];
  assert.deepEqual(rendered.frame, { kind: 'template', template: 'full-art', appearance });
  assert.deepEqual(cardSide(rendered, true).frame, rendered.frame);
  assert.equal(cardSide(rendered, true).fields.name, 'Retro personalizzato');
  assert.deepEqual(doubleSided.backSide.frame, newTemplate('full-art'));
  const perCard = projectCards({ ...project, frame: undefined })[0];
  assert.deepEqual(cardSide(perCard, true).frame, { kind: 'template', template: 'full-art', appearance });
});

test('the saved project frame applies to new cards and preserves cards that require scans', () => {
  const original = createCard({ ...blankCard, printingId: 'catalog-card', images: { front: image } });
  const special = createCard({ ...blankCard, printingId: 'double-sided', editable: false, images: { front: image, back: image } });
  const preset = { id: crypto.randomUUID(), name: 'Cornice PNG', asset: image, zones: defaultZones, textColor: '#fff8ea', fontFamily: 'Georgia' };
  const project = projectSchema.parse(JSON.parse(JSON.stringify({
    ...createProject(), cards: [original, special], presets: [preset], frame: { kind: 'preset', id: preset.id }
  })));
  const added = card('Nuova carta');
  const [first, second, third] = projectCards({ ...project, cards: [...project.cards, added] });
  assert.deepEqual(first.frame, { kind: 'custom', asset: image, zones: defaultZones, textColor: '#fff8ea', fontFamily: 'Georgia' });
  assert.deepEqual(third.frame, first.frame);
  assert.equal(second, project.cards[1]);
  assert.deepEqual(projectCards({ ...project, frame: undefined })[0].frame, original.frame);
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

test('legacy frame layouts receive an editable artist credit zone', () => {
  const fullArt = templateAppearance(newTemplate('full-art'));
  const { artist: _artist, ...legacyZones } = fullArt.zones;
  const project = projectSchema.parse({ ...createProject(), templateAppearances: {
    'full-art': { ...fullArt, zones: legacyZones }
  } });
  assert.deepEqual(project.templateAppearances?.['full-art']?.zones.artist, defaultZones.artist);
});

test('saved project templates override existing and future cards of the corresponding type', () => {
  const fullArt = newTemplate('full-art');
  const extendedArt = newTemplate('extended-art');
  const legacy = { ...templateAppearance(fullArt), textColor: '#112233' };
  const changed = {
    ...templateAppearance(fullArt), autoTextColors: { title: true, rules: false, type: true }, shadeColor: '#445566', titleBlur: 12,
    topEffect: { anchor: 'title', height: 18 }, bottomEffect: { anchor: 'manual', height: 31.5 },
    dividerLength: 40, dividerPadding: 14, decorations: [{
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
  assert.deepEqual(colorsForFrame(['G', 'W', 'R'], true), ['G', 'W', 'R']);
  assert.deepEqual(colorFrameLayers(set, ['G', 'R']), [set.assets.G, set.assets.R]);
  assert.deepEqual(colorFrameLayers({ ...set, mix: false }, ['G', 'R']), [set.assets.C]);
  const project = createProject();
  const item = { ...card('Forest'), frame: { kind: 'color-set', set } };
  assert.deepEqual(projectSchema.parse({ ...project, frameSets: [set], cards: [item] }).cards[0].frame, item.frame);
});

test('print bleed fits within the page without overlap and keeps duplex trim aligned', () => {
  const reversible = createCard({ ...blankCard, name: 'Two faces', editable: false, images: { front: image, back: image } }, 10);
  for (const paper of ['A4', 'Letter'] as const) for (const margin of [3.048, 10]) {
    const sheets = printSheets([reversible], { ...options, paper, bleed: 'custom', customMm: margin });
    const [width, height] = papers[paper];
    for (let i = 0; i < sheets.length; i += 2) {
      const front = sheets[i], back = sheets[i + 1];
      for (const [index, slot] of front.slots.entries()) {
        assert.ok(slot.x - margin >= 0 && slot.y - margin >= 0);
        assert.ok(slot.x + cardWidth + margin <= width && slot.y + cardHeight + margin <= height);
        assert.ok(Math.abs(back.slots[index].x - (width - slot.x - cardWidth)) < 1e-9);
        assert.equal(back.slots[index].y, slot.y);
        for (const other of front.slots.slice(index + 1)) {
          assert.ok(Math.abs(slot.x - other.x) >= cardWidth + 2 * margin - 1e-9 || Math.abs(slot.y - other.y) >= cardHeight + 2 * margin - 1e-9);
        }
      }
    }
  }
});


test('shared artwork identifies different cards, including back faces and overrides', () => {
  const first = card('First', 3);
  const second = card('Second');
  const third = card('Third');
  for (const item of [first, second, third]) item.source = { ...item.source, images: {} };
  first.art = image;
  second.source.images.art = image;
  third.source.images.art = image;
  third.art = 'b'.repeat(64);
  assert.deepEqual(cardsWithSharedArt([first, second, third]), new Set([first.id, second.id]));
  second.art = 'c'.repeat(64);
  assert.equal(cardsWithSharedArt([first, second, third]).size, 0);
  third.source.images.back = 'd'.repeat(64);
  third.source.images.backArt = image;
  third.backSide = sideState({ ...third, art: image });
  assert.deepEqual(cardsWithSharedArt([first, second, third]), new Set([first.id, third.id]));
  assert.equal(cardsWithSharedArt([third]).size, 0);
});
