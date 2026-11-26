import test from 'node:test';
import assert from 'node:assert/strict';
import { appearanceChanges, restoreAppearanceKeys } from '../src/editor/appearance-diff.ts';
import { newTemplate, templateAppearance } from '../src/shared/templates.ts';

const base = () => templateAppearance(newTemplate('full-art'));

test('an unchanged appearance has no changes', () => {
  assert.deepEqual(appearanceChanges(base(), base()), []);
});

test('changes are grouped by the part of the frame they touch', () => {
  const current = { ...base(), fontFamily: 'Garamond', titleDivider: true, dividerLength: 60 };
  assert.deepEqual(appearanceChanges(current, base()).map(change => change.id), ['font', 'dividers']);
});

test('absent, undefined and empty values count as the same', () => {
  const current = { ...base(), symbolOverrides: {}, decorations: [], statsAppearance: {}, topEffect: undefined };
  assert.deepEqual(appearanceChanges(current, base()), []);
});

test('nested settings compare by value and ignore key order', () => {
  const right = { ...base(), topEffect: { height: 3, anchor: 'title' as const } };
  const same = { ...base(), topEffect: { anchor: 'title' as const, height: 3 } };
  assert.deepEqual(appearanceChanges(same, right), []);
  const changed = { ...base(), topEffect: { anchor: 'manual' as const, height: 4 } };
  assert.deepEqual(appearanceChanges(changed, right).map(change => change.id), ['shading']);
});

test('restoring a group sets its keys back to the base values', () => {
  const current = { ...base(), fontFamily: 'Garamond', titleDivider: true, shadeColor: '#000000' };
  const restored = restoreAppearanceKeys(current, base(), ['fontFamily', 'titleDivider']);
  assert.equal(restored.fontFamily, 'Georgia');
  assert.equal(restored.titleDivider, undefined);
  assert.equal(restored.shadeColor, '#000000');
  assert.equal(current.fontFamily, 'Garamond');
  assert.deepEqual(appearanceChanges(restored, base()).map(change => change.id), ['shading']);
});
