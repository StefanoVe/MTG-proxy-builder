import test from 'node:test';
import assert from 'node:assert/strict';
import { blurTemplateArt, shadeTemplate } from '../src/editor/template-effects.ts';
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

test('full-art shading fades smoothly and symmetrically at both edges', () => {
  const gradients: [number, string][][] = [];
  const ctx = {
    createLinearGradient: () => {
      const stops: [number, string][] = [];
      gradients.push(stops);
      return { addColorStop: (position: number, color: string) => stops.push([position, color]) };
    },
    fillRect() {}, fillStyle: ''
  } as unknown as CanvasRenderingContext2D;
  const appearance = templateAppearance(newTemplate('full-art'));
  appearance.titleShade = appearance.rulesShade = 1;
  shadeTemplate(ctx, 'full-art', appearance);
  const alpha = (color: string) => parseInt(color.slice(-2), 16);
  assert.equal(alpha(gradients[0][0][1]), 255);
  assert.equal(alpha(gradients[0][96][1]), 0);
  assert.equal(alpha(gradients[0][1][1]), 255);
  assert.ok(alpha(gradients[0][95][1]) <= 5);
  assert.ok(alpha(gradients[0][72][1]) > 230, 'effect remains strong across most of its extent');
  for (let i = 0; i <= 96; i++) assert.equal(alpha(gradients[0][i][1]), alpha(gradients[1][96 - i][1]));
});

test('full-art blur uses progressively stronger blur radii', () => {
  const filters: string[] = [];
  const makeContext = () => ({
    filter: 'none', globalCompositeOperation: 'source-over', fillStyle: '',
    clearRect() {}, fillRect() {},
    drawImage() { if (this.filter !== 'none') filters.push(this.filter); },
    createLinearGradient: () => ({ addColorStop() {} })
  });
  const originalDocument = globalThis.document;
  Object.assign(globalThis, { document: { createElement: () => ({ getContext: makeContext }) } });
  try {
    const appearance = templateAppearance(newTemplate('full-art'));
    appearance.titleBlur = 12;
    appearance.rulesBlur = 0;
    blurTemplateArt({ canvas: {}, drawImage() {} } as unknown as CanvasRenderingContext2D, 'full-art', appearance);
    assert.deepEqual(filters, ['blur(2px)', 'blur(4px)', 'blur(6px)', 'blur(8px)', 'blur(10px)', 'blur(12px)']);
  } finally {
    if (originalDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
    else Object.assign(globalThis, { document: originalDocument });
  }
});
