import assert from 'node:assert/strict';
import test from 'node:test';
import { automaticTextColor } from '../src/editor/card-colors.ts';
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
    'W/U': { textColor: '#110011' },
    '2/W': { textColor: '#220022' },
    '3': { textColor: '#330033' },
    C: { textColor: '#444444' }
  };
  const card = createCard({ ...blankCard, colors: ['U', 'W'], mana: '{U}{W}' });
  assert.equal(automaticTextColor(card, styles, '#ffffff'), '#110011');
  for (const [mana, color] of [['{2/w}', '#220022'], ['{3}', '#330033'], ['', '#444444'], ['{R}{3}', '#ffffff']]) {
    const customCard = createCard({ ...blankCard, mana });
    assert.equal(automaticTextColor(customCard, styles, '#ffffff'), color);
  }
});
