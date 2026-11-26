import assert from 'node:assert/strict';
import test from 'node:test';
import { blankCard, cardSchema, createCard, resolveStatsAppearance } from '../src/shared/model.ts';
import { newTemplate, templateAppearance } from '../src/shared/templates.ts';
import { translate } from '../src/shared/i18n.ts';
import { messages } from '../src/shared/messages.ts';
import { statsMessages } from '../src/shared/messages-stats.ts';
import { inspectorMessages } from '../src/shared/messages-inspector.ts';

test('stats gap and per-kind styles validate without recursive variants', () => {
  const card = createCard(blankCard);
  for (const dividerGap of [0, 32]) {
    assert.equal(cardSchema.safeParse({ ...card, statsOverrides: {
      dividerGap, byKind: { pair: { dividerGap }, loyalty: { paddingLeft: 4 }, defense: { ink: '#123456' } }
    } }).success, true);
  }
  for (const dividerGap of [-1, 1.5, 33]) {
    assert.equal(cardSchema.safeParse({ ...card, statsOverrides: { dividerGap } }).success, false);
  }
  assert.equal(cardSchema.safeParse({ ...card, statsOverrides: { byKind: { unknown: { size: 20 } } } }).success, false);
  assert.equal(cardSchema.safeParse({ ...card, statsOverrides: { byKind: { pair: { byKind: { loyalty: {} } } } } }).success, false);
});

test('stats style resolves frame and card variants in order and keeps null overrides', () => {
  const base = newTemplate('full-art');
  const frame = { ...base, appearance: { ...templateAppearance(base), statsAppearance: {
    ink: '#111111', boxAsset: 'a'.repeat(64), dividerGap: 3,
    byKind: { pair: { ink: '#222222', dividerGap: 5 }, loyalty: { size: 21 } }
  } } } as const;
  const card = { ...createCard(blankCard), frame, statsOverrides: {
    ink: '#333333', dividerGap: 7,
    byKind: { pair: { ink: '#444444', boxAsset: null, dividerGap: 9 }, defense: { size: 29 } }
  } };
  assert.equal(cardSchema.safeParse(card).success, true);
  const frameStyle = frame.appearance.statsAppearance;
  const cardStyle = card.statsOverrides;
  assert.deepEqual(resolveStatsAppearance(frameStyle, cardStyle, 'pair'), {
    ink: '#444444', boxAsset: null, dividerGap: 9
  });
  assert.deepEqual(resolveStatsAppearance(frameStyle, cardStyle, 'loyalty'), {
    ink: '#333333', boxAsset: 'a'.repeat(64), dividerGap: 7, size: 21
  });
  assert.deepEqual(resolveStatsAppearance(frameStyle, cardStyle, 'defense'), {
    ink: '#333333', boxAsset: 'a'.repeat(64), dividerGap: 7, size: 29
  });
  assert.deepEqual(resolveStatsAppearance(frameStyle, cardStyle), {
    ink: '#333333', boxAsset: 'a'.repeat(64), dividerGap: 7
  });
});

test('stats editor strings override base wording in both languages', () => {
  assert.equal(translate('it', 'statsKindLoyalty'), 'Solo fedeltà');
  assert.equal(translate('en', 'statsStyleStandard'), 'Standard');
  assert.equal(translate('en', 'statsOutline'), 'Outline the values');
  for (const key of Object.keys(statsMessages) as (keyof typeof statsMessages)[]) {
    assert.equal(messages[key], statsMessages[key]);
    assert.ok(translate('it', key).length > 0 && translate('en', key).length > 0, key);
  }
});

test('visual tile and inspector strings are present in both languages', () => {
  assert.equal(translate('it', 'statsSideTop'), 'Sopra');
  assert.equal(translate('it', 'statsSideLeft'), 'Sinistra');
  assert.equal(translate('en', 'statsSpacingWide'), 'Wide');
  assert.equal(translate('it', 'inspectorArtHint'), 'Trascina l’illustrazione sulla carta per spostarla; usa la rotella per ingrandire.');
  assert.equal(translate('en', 'inspectorPreciseAdjust'), 'Precise adjustment');
  for (const key of Object.keys(inspectorMessages) as (keyof typeof inspectorMessages)[]) {
    assert.ok(translate('it', key).length > 0 && translate('en', key).length > 0, key);
  }
});

test('the reset label names the level being edited', () => {
  assert.equal(translate('it', 'statsResetLevel', { level: translate('it', 'statsKindLoyalty') }), 'Ripristina «Solo fedeltà»');
  assert.equal(translate('en', 'statsResetLevel', { level: translate('en', 'statsKindBase') }), 'Reset «All values»');
});
