import assert from 'node:assert/strict';
import test from 'node:test';
import { automaticTextColor, cardPaint, defaultSymbolTextColor, splitSymbolColor } from '../src/editor/card-colors.ts';
import { manaSymbol } from '../src/shared/mana.ts';
import { blankCard, createCard, createProject, projectSchema } from '../src/shared/model.ts';
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

test('automatic text colors follow the card colors and compatible mana costs', () => {
  const styles = {
    '2/W': { textColor: '#220022' },
    '3': { textColor: '#330033' },
    C: { textColor: '#444444' }
  };
  for (const [mana, color] of [['{2/w}', '#220022'], ['{3}', '#330033'], ['', '#444444'], ['{R}{3}', '#ffffff']]) {
    const customCard = createCard({ ...blankCard, mana });
    assert.equal(automaticTextColor(customCard, styles, '#ffffff'), color);
  }
});

test('hybrid card colors use the component settings in canonical symbol order', () => {
  const styles = { 'G/W': { textColor: '#110011' }, G: { textColor: '#008800' }, W: { textColor: '#eeeeee' } };
  for (const mana of ['{G/W}', '{W/G}', '{G/W/P}', '{W}{G}']) {
    const card = createCard({ ...blankCard, mana });
    assert.deepEqual(automaticTextColor(card, styles, '#ffffff'), ['#008800', '#eeeeee']);
    assert.deepEqual(automaticTextColor(card, undefined, '#ffffff'), [
      defaultSymbolTextColor('G'), defaultSymbolTextColor('W')
    ]);
  }
});

test('split paint keeps the two base colors on either side of the center transition', () => {
  const stops = new Map<number, string>();
  const ctx = { createLinearGradient: (...bounds: number[]) => {
    assert.deepEqual(bounds, [10, 0, 110, 0]);
    return { addColorStop: (position: number, color: string) => stops.set(position, color) };
  } } as unknown as CanvasRenderingContext2D;
  const colors = splitSymbolColor('G/W')!;
  cardPaint(ctx, colors, 10, 100);
  assert.deepEqual([...stops].sort(), [[0, colors[0]], [.44, colors[0]], [.56, colors[1]], [1, colors[1]]]);
  stops.clear();
  cardPaint(ctx, colors, 10, 100, true);
  assert.deepEqual([...stops].sort(), [
    [0, colors[0] + '00'], [.25, colors[0]], [.44, colors[0]], [.56, colors[1]], [.75, colors[1]], [1, colors[1] + '00']
  ]);
});
