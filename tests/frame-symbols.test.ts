import assert from 'node:assert/strict';
import test from 'node:test';
import { cardFrameColors, cardPaint, colorStops, defaultSymbolTextColor, resolveCardColors, symbolPaint } from '../src/editor/card-colors.ts';
import { manaFiles } from '../src/shared/mana-catalog.ts';
import { manaSymbol, manaTokens } from '../src/shared/mana.ts';
import { blankCard, cardSide, createCard, createProject, projectSchema } from '../src/shared/model.ts';
import { newTemplate, projectCards, templateAppearance } from '../src/shared/templates.ts';

test('project frame persists independent image and color overrides for canonical symbols', () => {
  const frame = newTemplate('full-art');
  const symbolOverrides = { 'W/U': { asset: 'a'.repeat(64), textColor: '#123456' }, R: { textColor: '#fedcba' } };
  const project = projectSchema.parse(JSON.parse(JSON.stringify({
    ...createProject(), frame, cards: [createCard(blankCard)],
    templateAppearances: { 'full-art': { ...templateAppearance(frame), symbolOverrides } }
  })));
  const [card] = projectCards(project);
  assert.equal(manaSymbol('u/w'), 'W/U');
  assert.deepEqual(card.frame.kind === 'template' && card.frame.appearance?.symbolOverrides, symbolOverrides);
});

test('saved automatic text colors migrate to three individually configurable areas', () => {
  const frame = newTemplate('full-art');
  const appearance = templateAppearance(frame);
  const restored = projectSchema.parse({
    ...createProject(), frame, fullArtBase: { ...appearance, autoTextColor: true }
  }).fullArtBase;
  assert.deepEqual(restored, { ...appearance, autoTextColors: { title: true, rules: true, type: true } });
  const selected = { title: false, rules: true };
  const edited = projectSchema.parse({
    ...createProject(), frame, fullArtBase: { ...appearance, autoTextColor: true, autoTextColors: selected }
  }).fullArtBase;
  assert.deepEqual(edited, { ...appearance, autoTextColors: selected });
});

const styles = Object.fromEntries(
  ['W', 'U', 'B', 'R', 'G', 'C', '2', 'P', '3'].map((key, index) => [key, { textColor: '#' + String(index + 1).repeat(6) }])
);
const paint = (mana: string) => resolveCardColors(createCard({ ...blankCard, mana }), styles).cardColor;

test('every compound symbol uses the settings of its component symbols', () => {
  for (const token of Object.keys(manaFiles).filter(key => key.includes('/'))) {
    const [left, right] = token.split('/');
    const expected = [styles[left].textColor, styles[right].textColor];
    const overrides = { ...styles, [token]: { textColor: '#ff0000' } };
    const card = createCard({ ...blankCard, mana: '{' + token + '}' });
    assert.deepEqual(symbolPaint(token, overrides), expected, token);
    assert.deepEqual(resolveCardColors(card, overrides).cardColor, expected, token);
    assert.deepEqual(symbolPaint(token), [defaultSymbolTextColor(left), defaultSymbolTextColor(right)], token);
    assert.deepEqual(manaTokens(token), [token], token);
  }
  assert.deepEqual(paint('{W/G}'), paint('{G/W}'));
  assert.deepEqual(paint('G/W'), paint('{G/W}'));
});

test('automatic colors use one palette for text and frame surfaces', () => {
  assert.equal(paint('{3}'), styles.C.textColor);
  assert.equal(paint(''), styles.C.textColor);
  assert.equal(paint('{3}{R}'), styles.R.textColor);
  assert.deepEqual(paint('{W}{G}'), [styles.G.textColor, styles.W.textColor]);
  assert.deepEqual(paint('{C}{W}'), [styles.C.textColor, styles.W.textColor]);
  const card = createCard({ ...blankCard, mana: '{G}{B}{U}{R}{W}' });
  const palette = resolveCardColors(card, styles);
  assert.deepEqual(palette.cardColor, ['W', 'U', 'B', 'R', 'G'].map(key => styles[key].textColor));
  assert.deepEqual(palette.panel, palette.cardColor);
  assert.equal(palette.border.length, 5);
  assert.deepEqual(cardFrameColors(createCard({ ...blankCard, mana: '{2/W}' })), ['C', 'W']);
  assert.deepEqual(cardFrameColors(createCard({ ...blankCard, mana: '{W/P}' })), ['W', 'C']);
});

test('numeric and generic symbol overrides never define the color of a colorless card', () => {
  const defaultColor = resolveCardColors(createCard({ ...blankCard, mana: '' })).cardColor;
  for (const mana of ['{3}', '{X}']) {
    const card = createCard({ ...blankCard, mana });
    const token = mana.slice(1, -1);
    assert.equal(resolveCardColors(card, { [token]: { textColor: '#123456' } }).cardColor, defaultColor, mana);
    assert.equal(resolveCardColors(card, { C: { textColor: '#abcdef' } }).cardColor, '#abcdef', mana);
  }
});

test('catalog colors follow each physical side and reflect changes to the mana cost', () => {
  const face = { name: 'Front', mana: '{W}', type: '', rules: '', flavor: '', artist: '',
    power: '', toughness: '', loyalty: '', defense: '' };
  const card = createCard({ ...blankCard, printingId: 'catalog-id', colors: ['W'], mana: '{W}',
    images: { back: 'a'.repeat(64) },
    details: { rarity: '', lang: 'en', flavor: '', faces: [face, { ...face, name: 'Back', mana: '{U}' }] }
  });
  assert.deepEqual(cardFrameColors(card), ['W']);
  assert.deepEqual(cardFrameColors(cardSide(card, true)), ['U']);
  card.fields.mana = '{G/W}';
  assert.deepEqual(cardFrameColors(card), ['G', 'W']);
});

test('canvas and preview stops keep solid bands along both halves with an optional edge fade', () => {
  const stops: [number, string][] = [];
  const ctx = { createLinearGradient: (...bounds: number[]) => {
    assert.deepEqual(bounds, [10, 0, 110, 0]);
    return { addColorStop: (position: number, color: string) => stops.push([position, color]) };
  } } as unknown as CanvasRenderingContext2D;
  const left = '#006600';
  const right = '#ffffff';
  cardPaint(ctx, [left, right], 10, 100);
  assert.deepEqual(stops, [[0, left], [.44, left], [.56, right], [1, right]]);
  assert.deepEqual(colorStops([left, right], true), [
    [0, left + '00'], [.25, left], [.44, left], [.56, right], [.75, right], [1, right + '00']
  ]);
  const positions = colorStops([left, '#bbbbbb', '#aaaaaa', '#999999', right], true).map(([position]) => position);
  assert.deepEqual(positions, positions.toSorted((a, b) => a - b));
});
