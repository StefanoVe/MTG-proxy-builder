import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { app, BrowserWindow } from 'electron';
import { constants } from 'node:fs';
import { copyFile, link, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseDeck } from '../shared/deck.js';
import { loadDeckCards } from '../shared/deck-import.js';
import { archiveOptions, pdfOptions } from '../shared/mcp-export.js';
import type { ExportRequest } from '../shared/mcp-export.js';
import { createProject, projectSchema } from '../shared/model.js';
import type { Project } from '../shared/model.js';
import { getCard, printings, resolveDeck, search } from './catalog.js';
import { getProject, imageLimit, listProjects, readLimitedFile, saveProject, storeImage } from './storage.js';

const id = z.uuid();
const projectId = id.describe('UUID of a saved project.');
const printingId = id.describe('Scryfall printing UUID.');
const decklist = z.string().min(1).max(512_000).refine(value => value.trim().length > 0, 'Enter a decklist.')
  .describe('Decklist text, one card per line. Example: 2 Lightning Bolt (2X2) 117.');
const name = projectSchema.shape.name.trim().min(1);
const absolutePath = z.string().min(1).max(4096).refine(isAbsolute, 'Use an absolute path.');
const readOnly = { readOnlyHint: true, openWorldHint: false };
const catalogRead = { readOnlyHint: true, openWorldHint: true };
const write = { destructiveHint: false, openWorldHint: false };
const exportPage = fileURLToPath(new URL('../../dist/mcp-export.html', import.meta.url));
let pendingExport = Promise.resolve();

function result(data: Record<string, unknown>) {
  return { structuredContent: data, content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

function parseList(text: string) {
  const parsed = parseDeck(text);
  if (parsed.entries.length > 1500) throw new Error('Il progetto può contenere al massimo 1500 righe.');
  return parsed;
}

async function renderFile(project: Project, path: string, request: ExportRequest) {
  if (extname(path).toLowerCase() !== `.${request.format}`) throw new Error(`Usa un percorso .${request.format}.`);
  const renderer = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  try {
    renderer.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    renderer.webContents.on('will-navigate', event => event.preventDefault());
    await renderer.loadFile(exportPage);
    const response: { data: Uint8Array } | { error: string } = await renderer.webContents.executeJavaScript(
      `globalThis.renderExport(${JSON.stringify(project)}, ${JSON.stringify(request)})`
    );
    if ('error' in response) throw new Error(response.error);
    // A hard link publishes the complete file atomically and fails if the destination exists.
    const temp = join(dirname(path), `.mtg-export-${crypto.randomUUID()}.tmp`);
    try {
      await writeFile(temp, response.data, { flag: 'wx', mode: 0o600 });
      await link(temp, path).catch(async (cause: NodeJS.ErrnoException) => {
        if (!['ENOSYS', 'ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'EXDEV'].includes(cause.code ?? '')) throw cause;
        await copyFile(temp, path, constants.COPYFILE_EXCL);
      });
      return { path, bytes: response.data.byteLength };
    } finally {
      await rm(temp, { force: true });
    }
  } finally {
    if (!renderer.isDestroyed()) renderer.destroy();
  }
}

async function exportProject(id: string, path: string, request: ExportRequest) {
  const job = pendingExport.then(async () => renderFile(await getProject(id), path, request));
  pendingExport = job.then(() => {}, () => {});
  return result(await job);
}

function createServer() {
  const server = new McpServer({ name: 'mtg-proxy-builder', version: app.getVersion() });

  server.registerTool('list_projects', {
    description: 'List projects saved in the local MTG Proxy Builder library.',
    inputSchema: z.object({}), annotations: readOnly
  }, async () => result({ projects: await listProjects() }));

  server.registerTool('get_project', {
    description: 'Read the saved project and its card IDs, fields, artwork, and frame settings.',
    inputSchema: z.object({ projectId }), annotations: readOnly
  }, async ({ projectId }) => result({ project: await getProject(projectId) }));

  server.registerTool('search_cards', {
    description: 'Look up a Magic card by name in Scryfall. Returns an exact printing or suggestions.',
    inputSchema: z.object({ name: z.string().trim().min(1).max(300) }), annotations: catalogRead
  }, async ({ name }) => result(await search(name)));

  server.registerTool('list_printings', {
    description: 'List editions of a card given any Scryfall printing ID of that card.',
    inputSchema: z.object({ printingId }), annotations: catalogRead
  }, async ({ printingId }) => result({ printings: await printings(printingId) }));

  server.registerTool('get_printing', {
    description: 'Read card details for one Scryfall printing. Optionally cache the scans and artwork locally.',
    inputSchema: z.object({ printingId, cacheImages: z.boolean().default(false) }),
    annotations: { destructiveHint: false, openWorldHint: true }
  }, async ({ printingId, cacheImages }) => result({ card: await getCard(printingId, cacheImages) }));

  server.registerTool('parse_decklist', {
    description: 'Parse decklist text and report invalid lines. Works offline.',
    inputSchema: z.object({ decklist }), annotations: readOnly
  }, ({ decklist }) => result(parseList(decklist)));

  server.registerTool('import_decklist', {
    description: 'Resolve a decklist through Scryfall, cache its images, and save it as a new project. Set allowPartial to save valid rows even when some rows fail.',
    inputSchema: z.object({ name, decklist, allowPartial: z.boolean().default(false) }),
    annotations: { destructiveHint: false, openWorldHint: true }
  }, async ({ name, decklist, allowPartial }) => {
    const { entries, errors } = parseList(decklist);
    if (!entries.length) return result({ errors: [...errors, 'La lista non contiene carte.'] });
    if (errors.length && !allowPartial) return result({ errors });
    const loaded = await loadDeckCards(entries, await resolveDeck(entries), getCard);
    const cards = loaded.flatMap(({ card, error }) => {
      if (error) errors.push(error);
      if (!card) return [];
      if (card.source.images.front) return [card];
      errors.push(`${card.source.name} · ${card.source.images.error ?? 'Scansione dell’edizione non disponibile.'}`);
      return [];
    });
    if (!cards.length || (errors.length && !allowPartial)) return result({ errors });
    const project = projectSchema.parse({ ...createProject(), name, cards });
    await saveProject(project);
    return result({ projectId: project.id, cardRows: cards.length, errors });
  });

  server.registerTool('save_project_copy', {
    description: 'Save a complete project document as a new project with a fresh ID. Use get_project as a starting point to edit cards or settings.',
    inputSchema: z.object({ project: projectSchema }), annotations: write
  }, async ({ project }) => {
    if (new Set(project.cards.map(card => card.id)).size !== project.cards.length) {
      throw new Error('Gli ID delle carte devono essere univoci nel progetto.');
    }
    const copy = { ...project, id: crypto.randomUUID() };
    await saveProject(copy);
    return result({ projectId: copy.id, name: copy.name });
  });

  server.registerTool('import_image', {
    description: 'Import a local PNG, JPEG, or WebP. Use the returned asset ID for project artwork. With frame=true, requires a transparent PNG.',
    inputSchema: z.object({ path: absolutePath, frame: z.boolean().default(false) }),
    annotations: { ...write, idempotentHint: true }
  }, async ({ path, frame }) => result({ asset: await storeImage(await readLimitedFile(path, imageLimit), basename(path), frame) }));

  server.registerTool('export_pdf', {
    description: 'Export a saved project to an A4 or Letter PDF at a new absolute file path. The parent directory must exist.',
    inputSchema: pdfOptions.extend({ projectId, path: absolutePath }), annotations: write
  }, ({ projectId, path, ...options }) => exportProject(projectId, path, { format: 'pdf', options }));

  server.registerTool('export_cards', {
    description: 'Export individual cards as a PNG or JPG ZIP at a new absolute file path. The parent directory must exist.',
    inputSchema: archiveOptions.extend({ projectId, path: absolutePath }), annotations: write
  }, ({ projectId, path, ...options }) => exportProject(projectId, path, { format: 'zip', options }));

  return server;
}

export function startMcp() {
  const server = serveStdio(createServer, { onerror: error => console.error(error.message) });
  const stop = () => {
    process.stdin.off('end', stop);
    process.stdin.off('close', stop);
    void server.close().finally(() => app.quit());
  };
  process.stdin.once('end', stop);
  process.stdin.once('close', stop);
}
