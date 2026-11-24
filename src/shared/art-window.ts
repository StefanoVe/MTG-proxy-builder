import type { Rect } from './model.js';

export type Raster = { data: Uint8ClampedArray; width: number; height: number };
type Placement = { x: number; y: number; w: number; h: number; score: number };

function luminance(raster: Raster, x: number, y: number) {
  const index = (Math.round(y) * raster.width + Math.round(x)) * 4;
  return raster.data[index] * 0.21 + raster.data[index + 1] * 0.72 + raster.data[index + 2] * 0.07;
}

function boundary(scan: Raster, axis: 'x' | 'y', expected: number, from: number, to: number, direction: -1 | 1) {
  const span = to - from;
  const low = Math.round(from + span * 0.16);
  const high = Math.round(to - span * 0.16);
  const extent = axis === 'x' ? scan.width : scan.height;
  const radius = axis === 'x' ? 6 : 3;
  const margin = axis === 'x' ? Math.ceil(scan.width * 0.066) : 1;
  let best = expected;
  let score = 16;
  for (let offset = 0; offset <= radius; offset++) {
    const pos = expected + offset * direction;
    if (pos < margin || pos > extent - margin) continue;
    let red = 0, green = 0, blue = 0;
    let sumBefore = 0, sumAfter = 0, squaresBefore = 0, squaresAfter = 0;
    for (let line = low; line < high; line++) {
      const point = (axis === 'x' ? line * scan.width + pos : pos * scan.width + line) * 4;
      const previous = point - (axis === 'x' ? 4 : scan.width * 4);
      red += scan.data[point] - scan.data[previous];
      green += scan.data[point + 1] - scan.data[previous + 1];
      blue += scan.data[point + 2] - scan.data[previous + 2];
      if (axis === 'x') {
        const before = (scan.data[previous] + scan.data[previous + 1] + scan.data[previous + 2]) / 3;
        const after = (scan.data[point] + scan.data[point + 1] + scan.data[point + 2]) / 3;
        sumBefore += before; sumAfter += after;
        squaresBefore += before ** 2; squaresAfter += after ** 2;
      }
    }
    const count = high - low;
    const contrast = (Math.abs(red) + Math.abs(green) + Math.abs(blue)) / ((high - low) * 3);
    if (axis === 'y' && contrast >= 23) return pos;
    if (axis === 'x') {
      const before = Math.sqrt(Math.max(0, squaresBefore / count - (sumBefore / count) ** 2));
      const after = Math.sqrt(Math.max(0, squaresAfter / count - (sumAfter / count) ** 2));
      const textureGain = (before - after) * direction;
      const strength = 3 * textureGain + 0.25 * contrast - offset;
      if (strength > score) { best = pos; score = strength; }
    }
  }
  return best;
}

export function findArtWindow(scan: Raster, artwork: Raster, aspect: number): Rect | undefined {
  if (!Number.isFinite(aspect) || aspect <= 0 || scan.width < 40 || scan.height < 60) return;
  const samples = Array.from({ length: 64 }, (_, i) => {
    const u = ((i % 8) + 0.5) / 8;
    const v = (Math.floor(i / 8) + 0.5) / 8;
    return { u, v, light: luminance(artwork, u * (artwork.width - 1), v * (artwork.height - 1)) };
  });
  const mean = samples.reduce((sum, item) => sum + item.light, 0) / samples.length;
  const reference = samples.map(({ u, v, light }) => ({ u, v, light: light - mean }));
  const energy = reference.reduce((sum, item) => sum + item.light ** 2, 0);
  if (energy < 3200) return;

  let best: Placement = { x: 0, y: 0, w: 0, h: 0, score: -1 };
  function evaluate(x: number, y: number, w: number, h: number) {
    if (x < 0 || y < 0 || w < 20 || h < 20 || x + w > scan.width || y + h > scan.height * 0.76) return;
    let sum = 0, squared = 0, similarity = 0;
    for (const { u, v, light } of reference) {
      const value = luminance(scan, x + u * (w - 1), y + v * (h - 1));
      sum += value;
      squared += value * value;
      similarity += light * value;
    }
    const variance = squared - sum * sum / reference.length;
    if (variance <= 0) return;
    const score = similarity / Math.sqrt(variance * energy);
    if (score > best.score) best = { x, y, w, h, score };
  }

  const width = scan.width;
  for (let w = Math.floor(width * 0.57); w <= width; w += 2) {
    const expectedHeight = Math.round(w / aspect);
    for (let h = expectedHeight - 6; h <= expectedHeight + 6; h += 3) {
      const centered = Math.round((width - w) / 2);
      for (let x = Math.max(0, centered - 4); x <= centered + 4; x += 2) {
        for (let y = 1; y <= scan.height * 0.3; y += 2) evaluate(x, y, w, h);
      }
    }
  }
  const coarse = best;
  for (let x = coarse.x - 2; x <= coarse.x + 2; x++) {
    for (let y = coarse.y - 2; y <= coarse.y + 2; y++) {
      for (let w = coarse.w - 2; w <= coarse.w + 2; w++) {
        for (let h = coarse.h - 2; h <= coarse.h + 2; h++) evaluate(x, y, w, h);
      }
    }
  }
  if (best.score < 0.82) return;
  const left = boundary(scan, 'x', best.x, best.y, best.y + best.h, -1);
  const right = boundary(scan, 'x', best.x + best.w, best.y, best.y + best.h, 1);
  const top = boundary(scan, 'y', best.y, best.x, best.x + best.w, -1);
  const bottom = boundary(scan, 'y', best.y + best.h, best.x, best.x + best.w, 1);
  return { x: left / width * 100, y: top / scan.height * 100, w: (right - left) / width * 100, h: (bottom - top) / scan.height * 100 };
}

export function findTransparentArtWindow(image: Raster): Rect | undefined {
  const { width, height, data } = image;
  const seen = new Uint8Array(width * height);
  let best: { count: number; left: number; top: number; right: number; bottom: number } | undefined;
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || data[start * 4 + 3] > 40) continue;
    const queue = [start];
    seen[start] = 1;
    let left = width, top = height, right = 0, bottom = 0;
    for (let index = 0; index < queue.length; index++) {
      const pixel = queue[index];
      const x = pixel % width, y = Math.floor(pixel / width);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      const neighbors = [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1,
        y > 0 ? pixel - width : -1, y < height - 1 ? pixel + width : -1];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || seen[neighbor] || data[neighbor * 4 + 3] > 40) continue;
        seen[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    const w = right - left + 1, h = bottom - top + 1;
    if (left === 0 || top === 0 || right === width - 1 || bottom === height - 1) continue;
    if (w < width * 0.38 || h < height * 0.2 || top > height * 0.46 || queue.length < w * h * 0.6) continue;
    if (!best || queue.length > best.count) best = { count: queue.length, left, top, right, bottom };
  }
  if (best) {
    return { x: best.left / width * 100, y: best.top / height * 100,
      w: (best.right - best.left + 1) / width * 100, h: (best.bottom - best.top + 1) / height * 100 };
  }
}
