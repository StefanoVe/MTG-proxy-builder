import test from 'node:test';
import assert from 'node:assert/strict';
import { webpSize } from '../src/main/webp.ts';
import { downloadImage } from '../src/main/catalog-images.ts';

const webp = Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=', 'base64');

test('reads WebP dimensions and rejects a truncated buffer', () => {
  assert.deepEqual(webpSize(webp), { width: 1, height: 1 });
  assert.equal(webpSize(webp.subarray(0, 23)), undefined);
});

test('falls back after an unusable URL and follows redirects on the image CDN', async context => {
  const requests: string[] = [];
  context.mock.method(globalThis, 'fetch', async (url: URL) => {
    requests.push(url.href);
    if (url.pathname === '/legacy') return new Response(null, { status: 403 });
    if (url.pathname === '/display') return new Response(null, { status: 302, headers: { Location: '/image.webp' } });
    return new Response(new Uint8Array(webp), { headers: { 'Content-Type': 'image/webp' } });
  });
  const bytes = await downloadImage(['https://cards.scryfall.io/legacy', 'https://cards.scryfall.io/display'],
    10_000, 'MTG Proxy Builder test', async data => Buffer.from(data));
  assert.deepEqual(bytes, webp);
  assert.deepEqual(requests, ['https://cards.scryfall.io/legacy', 'https://cards.scryfall.io/display', 'https://cards.scryfall.io/image.webp']);
});

test('rejects redirects outside the image CDN', async context => {
  const fetchStub = context.mock.method(globalThis, 'fetch', async () =>
    new Response(null, { status: 302, headers: { Location: 'https://example.com/image.webp' } }));
  await assert.rejects(downloadImage(['https://cards.scryfall.io/display'], 10_000, 'MTG Proxy Builder test', async data => data),
    /Origine dell’immagine/);
  assert.equal(fetchStub.mock.callCount(), 1);
});
