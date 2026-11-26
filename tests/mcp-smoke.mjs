import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { blankCard, createCard, createProject } from '../dist-main/shared/model.js';

const require = createRequire(import.meta.url);
const root = await mkdtemp(join(tmpdir(), 'mtg-mcp-smoke-'));
const profile = join(root, 'profile');
const executable = process.env.MTG_SMOKE_EXECUTABLE;
const transport = new StdioClientTransport({
  command: executable ? resolve(executable) : require('electron'),
  args: [...(executable ? [] : ['.']), '--mcp', `--user-data-dir=${profile}`]
});
const client = new Client({ name: 'mtg-mcp-smoke', version: '1.0.0' });
const protocolErrors = [];
client.onerror = error => protocolErrors.push(error);
const call = (name, args = {}) => client.callTool({ name, arguments: args }, { timeout: 20_000 });
async function ok(name, args) {
  const response = await call(name, args);
  assert.ok(!response.isError, JSON.stringify(response.content));
  return response.structuredContent;
}

try {
  await client.connect(transport, { timeout: 20_000 });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), [
    'export_cards', 'export_pdf', 'get_printing', 'get_project', 'import_decklist', 'import_image',
    'list_printings', 'list_projects', 'parse_decklist', 'save_project_copy', 'search_cards'
  ]);
  assert.deepEqual(await ok('list_projects'), { projects: [] });
  const parsed = await ok('parse_decklist', { decklist: '2 Lightning Bolt (2X2) 117\n0 Mountain' });
  assert.deepEqual(parsed.entries, [{ name: 'Lightning Bolt', count: 2, set: '2x2', number: '117' }]);
  assert.equal(parsed.errors.length, 1);
  const rejected = await ok('import_decklist', { name: 'Invalid', decklist: '0 Mountain' });
  assert.ok(rejected.errors.length);

  const artwork = join(root, 'art.png');
  await writeFile(artwork, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOQt3B+vzOdITKvQEpWFgAg0gQ1noIrUAAAAABJRU5ErkJggg==', 'base64'
  ));
  const { asset } = await ok('import_image', { path: artwork });
  const master = {
    ...createCard({ ...blankCard, name: 'MCP Test', mana: '{R}', power: '2', toughness: '3' }, 2),
    art: asset.id,
    statsOverrides: { boxAsset: asset.id, dividerAsset: asset.id, transparentColor: '#ffffff', paddingTop: 2, paddingLeft: 4 },
    frame: { kind: 'template', template: 'full-art' }
  };
  const child = {
    ...createCard({ ...blankCard, name: 'MCP Mirror' }),
    art: asset.id,
    frame: { kind: 'printing' },
    frameMirror: { cardId: master.id, back: false }
  };
  const project = { ...createProject(), name: 'MCP smoke', cards: [master, child] };
  const { projectId } = await ok('save_project_copy', { project });
  assert.notEqual(projectId, project.id);
  assert.deepEqual(await ok('list_projects'), { projects: [{ id: projectId, name: project.name }] });
  assert.deepEqual((await ok('get_project', { projectId })).project, { ...project, id: projectId });
  assert.equal(JSON.parse(await readFile(join(profile, 'projects', `${projectId}.json`), 'utf8')).name, project.name);

  const pdf = join(root, 'cards.pdf');
  const zip = join(root, 'cards.zip');
  await ok('export_pdf', { projectId, path: pdf, paper: 'Letter' });
  await ok('export_cards', { projectId, path: zip, format: 'jpg', bleed: 'mpc', copies: true });
  const original = await readFile(pdf);
  const doc = await PDFDocument.load(original);
  const { width, height } = doc.getPage(0).getSize();
  assert.ok(Math.abs(width - 612) < 0.001 && Math.abs(height - 792) < 0.001);
  const entries = unzipSync(await readFile(zip));
  assert.deepEqual(Object.keys(entries), ['fronte/0001-MCP Test.jpg', 'fronte/0002-MCP Test.jpg', 'fronte/0003-MCP Mirror.jpg']);
  assert.deepEqual(Array.from(entries['fronte/0001-MCP Test.jpg'].subarray(0, 2)), [255, 216]);
  assert.ok((await call('export_pdf', { projectId, path: pdf })).isError);
  assert.ok((await call('export_pdf', { projectId, path: 'relative.pdf' })).isError);
  assert.deepEqual(await readFile(pdf), original);
  assert.deepEqual(protocolErrors, []);
  console.log('MCP smoke passed.');
} finally {
  await client.close();
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
}
