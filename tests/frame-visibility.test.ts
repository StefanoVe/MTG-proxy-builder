import test from 'node:test';
import assert from 'node:assert/strict';
import { hiddenByCondition } from '../src/shared/frame-visibility.ts';
import { createProject, projectSchema } from '../src/shared/model.ts';
import { newTemplate, templateAppearance } from '../src/shared/templates.ts';

test('visibility conditions match the chosen field and can negate a match', () => {
  const fields = { name: 'Île', type: 'Basic Land — Island', rules: 'Add {U}.' };
  assert.equal(hiddenByCondition({ field: 'type', query: ' LAND ', negate: false }, fields), true);
  assert.equal(hiddenByCondition({ field: 'name', query: 'I\u0302LE', negate: false }, fields), true);
  assert.equal(hiddenByCondition({ field: 'rules', query: '{U}', negate: true }, fields), false);
  assert.equal(hiddenByCondition({ field: 'rules', query: 'land', negate: true }, fields), true);
  assert.equal(hiddenByCondition({ field: 'rules', query: ' ', negate: true }, fields), false);
  assert.equal(hiddenByCondition(undefined, fields), false);
});

test('a saved project preserves separate conditions for each divider and decoration', () => {
  const appearance = templateAppearance(newTemplate('full-art'));
  appearance.titleDividerHideWhen = { field: 'name', query: 'Island', negate: false };
  appearance.dividerHideWhen = { field: 'type', query: 'land', negate: true };
  appearance.decorations = [{
    id: crypto.randomUUID(), name: 'Seal', source: { kind: 'motif', motif: 'seal' },
    rect: { x: 0, y: 0, w: 20, h: 20 }, opacity: 1, color: '#ffffff', fit: 'contain', tint: 'original',
    hideWhen: { field: 'rules', query: 'Draw', negate: false }
  }];
  const project = { ...createProject(), templateAppearances: { 'full-art': appearance } };
  assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(project))), project);
});
