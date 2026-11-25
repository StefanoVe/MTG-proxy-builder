import assert from 'node:assert/strict';
import test from 'node:test';
import { checkForUpdate } from '../src/main/updates.ts';

test('compares the numeric app version in GitHub release tags', async t => {
  let tag = 'v0.10.0-build.25';
  t.mock.method(globalThis, 'fetch', async () => Response.json({ tag_name: tag }));

  assert.equal(await checkForUpdate('0.9.9'), '0.10.0');
  assert.equal(await checkForUpdate('0.10.0'), null);
  assert.equal(await checkForUpdate('1.0.0'), null);

  tag = 'v2.0.0';
  assert.equal(await checkForUpdate('1.99.99'), '2.0.0');
  tag = 'v2.0.0-rc.1';
  assert.equal(await checkForUpdate('1.99.99'), null);
});

test('silently skips unsuccessful and unpublished release responses', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 403 }));
  assert.equal(await checkForUpdate('0.9.9'), null);

  fetch.mock.mockImplementationOnce(async () => Response.json({ tag_name: 'v2.0.0', prerelease: true }));
  assert.equal(await checkForUpdate('0.9.9'), null);

  fetch.mock.mockImplementationOnce(async () => { throw new TypeError('Failed to fetch'); });
  assert.equal(await checkForUpdate('0.9.9'), null);
});
