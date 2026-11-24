import test from 'node:test';
import assert from 'node:assert/strict';
import { shadeTemplate } from '../src/editor/template-effects.ts';
import { pixels } from '../src/shared/print.ts';
import { newTemplate, templateAppearance } from '../src/shared/templates.ts';

test('anchored shading ends at the element edge facing the card center', () => {
  for (const [effect, zone, expectedY] of [
    ['topEffect', { x: 0, y: 10, w: 100, h: 10 }, 20],
    ['topEffect', { x: 0, y: 70, w: 100, h: 10 }, 70],
    ['bottomEffect', { x: 0, y: 10, w: 100, h: 10 }, 20],
    ['bottomEffect', { x: 0, y: 70, w: 100, h: 10 }, 70],
    ['topEffect', { x: 0, y: 45, w: 100, h: 10 }, 45]
  ] as const) {
    const gradients: number[][] = [];
    const ctx = {
      createLinearGradient: (...coordinates: number[]) => {
        gradients.push(coordinates);
        return { addColorStop() {} };
      },
      fillRect() {}, fillStyle: ''
    } as unknown as CanvasRenderingContext2D;
    const appearance = templateAppearance(newTemplate('full-art'));
    appearance.zones.title = zone;
    appearance.titleShade = effect === 'topEffect' ? 1 : 0;
    appearance.rulesShade = effect === 'bottomEffect' ? 1 : 0;
    appearance[effect] = { anchor: 'title' };
    shadeTemplate(ctx, 'full-art', appearance);
    assert.equal(gradients.length, 1);
    assert.equal(gradients[0][effect === 'topEffect' ? 3 : 1], expectedY * pixels.height / 100);
  }
});
