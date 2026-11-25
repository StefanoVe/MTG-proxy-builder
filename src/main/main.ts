import { errorMessage, locales, LocalizedError, resolveLocale, translate } from '../shared/i18n.js';
import type { Locale } from '../shared/i18n.js';
import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron';
import type { IpcMainInvokeEvent, OpenDialogOptions } from 'electron';
import { execFile } from 'node:child_process';
import { constants, mkdtempSync, rmSync } from 'node:fs';
import { copyFile, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { projectSchema } from '../shared/model.js';
import { cardArchiveLimit, pdfMaxBytes } from '../shared/print.js';
import { openCardArchive } from './card-archive.js';
import { getCard, printings, resolveDeck, search } from './catalog.js';
import { checkForUpdate, releasesURL } from './updates.js';
import { atomicWrite, getProject, imageLimit, imageResponse, listProjects, readLimitedFile, saveProject, storeImage } from './storage.js';

protocol.registerSchemesAsPrivileged([{ scheme: 'proxy-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const rendererPath = fileURLToPath(new URL('../../dist/index.html', import.meta.url));
const rendererURL = pathToFileURL(rendererPath).href;
let window: BrowserWindow | null = null;
let locale: Locale = 'en';
let pendingSave = Promise.resolve();
let writing = 0;
let activeCardArchive: {
  id: string;
  file: ReturnType<typeof openCardArchive>;
  saving?: boolean;
  publishing?: Promise<void>;
} | undefined;
const idSchema = z.uuid();
const imageExtensions = ['png', 'jpg', 'jpeg', 'webp'];
const execFileAsync = promisify(execFile);
let systemFonts: Promise<string[]> | undefined;
let updateCheck: Promise<string | null> | undefined;

async function listSystemFonts(): Promise<string[]> {
  if (!systemFonts) systemFonts = (async () => {
    const script = process.platform === 'darwin'
      ? ['-l', 'JavaScript', '-e', 'ObjC.import("AppKit"); ObjC.deepUnwrap($.NSFontManager.sharedFontManager.availableFontFamilies).join("\\n")']
      : process.platform === 'win32'
        ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Add-Type -AssemblyName PresentationCore; [System.Windows.Media.Fonts]::SystemFontFamilies | ForEach-Object { $_.Source }']
        : ['--format=%{family}\\n'];
    const command = process.platform === 'darwin' ? '/usr/bin/osascript' : process.platform === 'win32' ? 'powershell.exe' : 'fc-list';
    const { stdout } = await execFileAsync(command, script, { timeout: 15_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    return [...new Set(stdout.split(/[\r\n]+/).map(font => font.trim()).filter(font => font.length > 0 && font.length <= 256))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  })().catch(() => ['Arial', 'Arial Black', 'Calibri', 'Cambria', 'Georgia', 'Helvetica', 'Times New Roman', 'Verdana']);
  return systemFonts;
}

function handle<T extends unknown[], R>(channel: string, schema: z.ZodType<T>, run: (...args: T) => R) {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (event.sender !== window?.webContents || event.senderFrame?.url !== rendererURL || event.senderFrame.parent) {
      throw new Error(translate(locale, 'unauthorizedRequest'));
    }
    try {
      return await run(...schema.parse(args));
    } catch (error) {
      if (error instanceof LocalizedError) throw new Error(errorMessage(error, locale));
      throw error;
    }
  });
}

async function choose(options: OpenDialogOptions) {
  if (!window) return [];
  const result = await dialog.showOpenDialog(window, options);
  return result.canceled ? [] : result.filePaths;
}

handle('locale:get', z.tuple([]), () => locale);
handle('locale:set', z.tuple([z.enum(locales)]), next => { locale = next; });
handle('updates:check', z.tuple([]), () => updateCheck ??= checkForUpdate(app.getVersion()));
handle('updates:open-releases', z.tuple([]), () => shell.openExternal(releasesURL));
handle('projects:list', z.tuple([]), listProjects);
handle('fonts:list', z.tuple([]), listSystemFonts);
handle('projects:open', z.tuple([idSchema]), getProject);
handle('projects:save', z.tuple([projectSchema]), project => {
  writing++;
  const job = pendingSave.then(() => saveProject(project));
  pendingSave = job.catch(() => {}).finally(() => { writing--; });
  return job;
});
handle('catalog:search', z.tuple([z.string().trim().min(1).max(300)]), search);
handle('catalog:printings', z.tuple([idSchema]), printings);
handle('catalog:card', z.tuple([idSchema, z.boolean()]), (id, images) => getCard(id, images, locale));
handle('catalog:resolve', z.tuple([z.array(z.object({
  name: z.string().min(1).max(300), count: z.number().int().min(1).max(999),
  set: z.string().regex(/^[a-z0-9]+$/).max(20).optional(), number: z.string().min(1).max(40).optional()
})).max(1500)]), resolveDeck);

handle('files:deck', z.tuple([]), async () => {
  const [path] = await choose({ properties: ['openFile'], filters: [{ name: translate(locale, 'deckFile'), extensions: ['txt', 'dec', 'deck'] }] });
  return path ? (await readLimitedFile(path, 512_000)).toString('utf8') : null;
});
handle('files:images', z.tuple([z.enum(['files', 'folder', 'single']), z.boolean()]), async (mode, frame) => {
  const extensions = frame ? ['png'] : imageExtensions;
  const paths = await choose(mode !== 'folder' ? {
    properties: mode === 'single' ? ['openFile'] : ['openFile', 'multiSelections'], filters: [{ name: translate(locale, 'images'), extensions }]
  } : { properties: ['openDirectory'] });
  const folder = paths[0];
  const files = mode === 'folder' && folder ? (await readdir(folder, { withFileTypes: true }))
    .filter(entry => entry.isFile() && extensions.includes(entry.name.split('.').pop()?.toLowerCase() ?? ''))
    .map(entry => join(folder, entry.name)).sort() : paths;
  if (files.length > 1500) throw new LocalizedError('imageSelectionLimit');
  const assets = [];
  const errors = [];
  for (const path of files) {
    try {
      assets.push(await storeImage(await readLimitedFile(path, imageLimit), basename(path), frame));
    } catch (error) {
      errors.push(`${basename(path)} · ${error instanceof Error ? errorMessage(error, locale) : translate(locale, 'unreadableFile')}`);
    }
  }
  return { assets, errors };
});
const bytes = z.instanceof(Uint8Array);
handle('files:dropped', z.tuple([bytes, z.string().max(255), z.boolean()]), storeImage);
handle('files:pdf', z.tuple([z.string().max(100), bytes]), async (name, data) => {
  if (!window || data.length > pdfMaxBytes || Buffer.from(data.subarray(0, 5)).toString() !== '%PDF-') {
    throw new LocalizedError('invalidPdf');
  }
  const result = await dialog.showSaveDialog(window, {
    defaultPath: name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim() + '.pdf',
    filters: [{ name: translate(locale, 'pdfFile'), extensions: ['pdf'] }]
  });
  if (result.canceled || !result.filePath) return false;
  await atomicWrite(result.filePath, data);
  return true;
});

function getCardArchive(id: string) {
  if (activeCardArchive?.id !== id) throw new LocalizedError('invalidZip');
  return activeCardArchive;
}

async function discardCardArchive(id = activeCardArchive?.id) {
  if (!activeCardArchive || activeCardArchive.id !== id) return;
  const { file, publishing } = activeCardArchive;
  activeCardArchive = undefined;
  await publishing?.catch(() => {});
  await (await file.catch(() => undefined))?.discard();
}

async function moveCardArchive(source: string, destination: string) {
  try {
    await rename(source, destination);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'EXDEV') throw cause;
    const temp = `${destination}.${crypto.randomUUID()}.tmp`;
    await copyFile(source, temp, constants.COPYFILE_EXCL);
    try {
      await rename(temp, destination);
    } finally {
      await rm(temp, { force: true });
    }
  }
}

handle('files:begin-card-archive', z.tuple([]), async () => {
  if (activeCardArchive) throw new LocalizedError('invalidZip');
  const id = crypto.randomUUID();
  // Stage the archive before showing the save dialog so render errors can be fixed first.
  const file = openCardArchive(join(tmpdir(), `mtg-archive-${id}.tmp`));
  activeCardArchive = { id, file };
  try {
    await file;
    return id;
  } catch (cause) {
    await discardCardArchive(id);
    throw cause;
  }
});

const archivePaths = z.array(z.string().max(96).regex(/^(fronte|retro)\/[0-9]{4}-[^\\/:*?"<>|\u0000-\u001f]+\.(png|jpg)$/u)).min(1).max(cardArchiveLimit);
handle('files:append-card-archive', z.tuple([idSchema, archivePaths, bytes]), async (id, paths, data) => {
  const archive = getCardArchive(id);
  if (archive.saving) throw new LocalizedError('invalidZip');
  await (await archive.file).append(paths, data);
});
handle('files:discard-card-archive', z.tuple([idSchema]), discardCardArchive);
handle('files:save-card-archive', z.tuple([idSchema, z.string().max(100)]), async (id, name) => {
  if (!window) throw new LocalizedError('invalidZip');
  const owner = window;
  const archive = getCardArchive(id);
  if (archive.saving) throw new LocalizedError('invalidZip');
  archive.saving = true;
  try {
    const file = await archive.file;
    await file.finish();
    if (activeCardArchive?.id !== id || owner.isDestroyed()) return false;
    const filename = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim();
    const result = await dialog.showSaveDialog(owner, {
      defaultPath: translate(locale, 'archiveFilename', { name: filename || translate(locale, 'archiveDefaultName') }),
      filters: [{ name: translate(locale, 'zipFile'), extensions: ['zip'] }]
    });
    if (result.canceled || !result.filePath || activeCardArchive?.id !== id) return false;
    archive.publishing = moveCardArchive(file.path, result.filePath);
    await archive.publishing;
    return true;
  } finally {
    await discardCardArchive(id);
  }
});

function createWindow() {
  const editor = new BrowserWindow({
    width: 1400, height: 900, minWidth: 320, minHeight: 520, backgroundColor: '#202830',
    webPreferences: {
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
      sandbox: true, contextIsolation: true, nodeIntegration: false
    }
  });
  window = editor;
  editor.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  editor.webContents.on('will-navigate', event => event.preventDefault());
  const abandonArchive = () => { void discardCardArchive().catch(console.error); };
  editor.webContents.on('did-start-navigation', details => {
    if (details.isMainFrame && !details.isSameDocument) abandonArchive();
  });
  editor.webContents.on('render-process-gone', abandonArchive);
  editor.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  editor.webContents.session.setPermissionCheckHandler(() => false);
  editor.on('close', event => {
    if (!writing && !activeCardArchive) return;
    event.preventDefault();
    void Promise.allSettled([pendingSave, discardCardArchive()])
      .then(() => { if (!editor.isDestroyed()) editor.close(); });
  });
  editor.on('closed', () => { window = null; });
  void editor.loadFile(rendererPath);
}

const mcpEnabled = false;
const mcpRequested = process.argv.includes('--mcp');
if (mcpRequested && !mcpEnabled) {
  console.error('MCP support is temporarily disabled.');
  app.exit(1);
} else if (mcpRequested) {
  const sessionDir = mkdtempSync(join(tmpdir(), 'mtg-proxy-builder-mcp-'));
  app.setPath('sessionData', sessionDir);
  // Closing a hidden export window must leave the stdio server running.
  app.on('window-all-closed', () => {});
  app.on('quit', () => {
    try { rmSync(sessionDir, { recursive: true, force: true }); } catch { /* Chromium may still hold files open. */ }
  });
  void app.whenReady().then(async () => {
    app.dock?.hide();
    protocol.handle('proxy-asset', imageResponse);
    const { startMcp } = await import('./mcp.js');
    startMcp();
  }).catch(error => {
    console.error(error);
    app.exit(1);
  });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  void app.whenReady().then(() => {
    protocol.handle('proxy-asset', imageResponse);
    locale = resolveLocale(app.getPreferredSystemLanguages());
    createWindow();
    app.on('activate', () => { if (!window) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
