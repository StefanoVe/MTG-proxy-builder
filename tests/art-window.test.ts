import test from 'node:test';
import assert from 'node:assert/strict';
import { findArtWindow, findTransparentArtWindow } from '../src/shared/art-window.ts';
import type { Raster } from '../src/shared/art-window.ts';

function raster(width: number, height: number, light: (x: number, y: number) => number): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = light(x, y);
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

test('locates an illustration within a scanned frame', () => {
  const texture = (x: number, y: number) => 120 + 45 * Math.sin(x * 0.11 + y * 0.17) +
    40 * Math.cos(x * 0.19 - y * 0.13) + 29 * Math.sin(x * 0.16 + y * 0.29);
  const art = raster(106, 76, texture);
  const scan = raster(126, 176, (x, y) => x >= 10 && x < 116 && y >= 20 && y < 96 ? texture(x - 10, y - 20) : 24);
  const found = findArtWindow(scan, art, 106 / 76);
  assert.ok(found);
  assert.ok(Math.abs(found.x / 100 * scan.width - 10) <= 2);
  assert.ok(Math.abs(found.y / 100 * scan.height - 20) <= 2);
  assert.ok(Math.abs(found.w / 100 * scan.width - 106) <= 2);
  assert.ok(Math.abs(found.h / 100 * scan.height - 76) <= 2);
});

test('requires manual placement when the artwork has too little detail to align', () => {
  const art = raster(106, 76, () => 150);
  const scan = raster(126, 176, () => 150);
  assert.equal(findArtWindow(scan, art, 106 / 76), undefined);
});

test('selects the enclosed transparent artwork opening in an imported frame', () => {
  const image = raster(100, 100, () => 200);
  for (let y = 10; y < 50; y++) {
    for (let x = 10; x < 90; x++) image.data[(y * 100 + x) * 4 + 3] = 0;
  }
  for (let x = 0; x < 100; x++) image.data[x * 4 + 3] = 0;
  assert.deepEqual(findTransparentArtWindow(image), { x: 10, y: 10, w: 80, h: 40 });
});
