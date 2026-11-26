import test from 'node:test';
import assert from 'node:assert/strict';
import { colorForFileName } from '../src/editor/frame-file-names.ts';

test('colorForFileName reads the color from English or Italian file names', () => {
  assert.equal(colorForFileName('white.png'), 'W');
  assert.equal(colorForFileName('Frame-Bianco.png'), 'W');
  assert.equal(colorForFileName('blu_frame.png'), 'U');
  assert.equal(colorForFileName('nero.png'), 'B');
  assert.equal(colorForFileName('red frame 2.png'), 'R');
  assert.equal(colorForFileName('verde.png'), 'G');
  assert.equal(colorForFileName('colorless.png'), 'C');
  assert.equal(colorForFileName('artefatto-set.png'), 'C');
  assert.equal(colorForFileName('grigio.png'), 'C');
});

test('colorForFileName ignores unrelated and ambiguous file names', () => {
  assert.equal(colorForFileName('card-art.png'), undefined);
  assert.equal(colorForFileName('whiteboard.png'), undefined);
  assert.equal(colorForFileName('frame.png'), undefined);
  assert.equal(colorForFileName('red_black.png'), undefined);
});
