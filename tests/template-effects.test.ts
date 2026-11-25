import test from 'node:test';
import assert from 'node:assert/strict';
import { blurTemplateArt, shadeTemplate } from '../src/editor/template-effects.ts';
import { pixels } from '../src/shared/print.ts';
import { newTemplate, templateAppearance } from '../src/shared/templates.ts';

test('anchored shading extends past the element edge facing the card center', () => {
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
    shadeTemplate(ctx, appearance);
    assert.equal(gradients.length, 1);
    const boundary = expectedY * pixels.height / 100;
    const end = gradients[0][effect === 'topEffect' ? 3 : 1];
    assert.ok(effect === 'topEffect' ? end > boundary : end < boundary);
  }
});

test('template shading fades smoothly and symmetrically at both edges', () => {
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
  shadeTemplate(ctx, appearance);
  const alpha = (color: string) => parseInt(color.slice(-2), 16);
  assert.equal(alpha(gradients[0][0][1]), 255);
  assert.equal(alpha(gradients[0][96][1]), 0);
  assert.equal(alpha(gradients[0][1][1]), 255);
  assert.ok(alpha(gradients[0][95][1]) <= 5);
  assert.ok(alpha(gradients[0][48][1]) > 100 && alpha(gradients[0][48][1]) < 155, 'effect fades gradually across its extent');
  for (let i = 0; i <= 96; i++) assert.equal(alpha(gradients[0][i][1]), alpha(gradients[1][96 - i][1]));
});

test('anchored template effects remain visible across the selected boundary', () => {
  for (const effect of ['topEffect', 'bottomEffect'] as const) {
    let coordinates: number[] = [];
    const stops: [number, string][] = [];
    const ctx = {
      createLinearGradient: (...args: number[]) => {
        coordinates = args;
        return { addColorStop: (position: number, color: string) => stops.push([position, color]) };
      },
      fillRect() {}, fillStyle: ''
    } as unknown as CanvasRenderingContext2D;
    const appearance = templateAppearance(newTemplate('full-art'));
    appearance.zones.title = { x: 0, y: 45, w: 100, h: 10 };
    appearance.titleShade = effect === 'topEffect' ? 1 : 0;
    appearance.rulesShade = effect === 'bottomEffect' ? 1 : 0;
    appearance[effect] = { anchor: 'title' };
    shadeTemplate(ctx, appearance);
    const boundary = 45 * pixels.height / 100;
    const position = (boundary - coordinates[1]) / (coordinates[3] - coordinates[1]);
    const index = Math.round(position * 96);
    const alpha = (i: number) => parseInt(stops[i][1].slice(-2), 16);
    assert.ok(alpha(index) > 0 && alpha(index) < 255);
    assert.ok(alpha(effect === 'topEffect' ? index + 1 : index - 1) > 0, 'effect continues beyond the boundary');
    assert.ok(Math.abs(alpha(index + 1) - alpha(index - 1)) < 12, 'transition stays gradual at the boundary');
  }
});

test('template blur uses progressively stronger blur radii', () => {
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
    const appearance = templateAppearance(newTemplate('extended-art'));
    appearance.titleBlur = 12;
    appearance.rulesBlur = 0;
    blurTemplateArt({ canvas: pixels, drawImage() {} } as unknown as CanvasRenderingContext2D, appearance);
    assert.deepEqual(filters, ['blur(2px)', 'blur(4px)', 'blur(6px)', 'blur(8px)', 'blur(10px)', 'blur(12px)']);
  } finally {
    if (originalDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
    else Object.assign(globalThis, { document: originalDocument });
  }
});
