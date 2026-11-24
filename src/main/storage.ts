import { LocalizedError } from '../shared/i18n.js';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { app, nativeImage } from 'electron';
import { assetId, projectSchema } from '../shared/model.js';
import type { Asset, Project } from '../shared/model.js';
import { isWebP, webpSize } from './webp.js';

export const imageLimit = 32 * 1024 * 1024;
const root = () => app.getPath('userData');
const projectDir = () => join(root(), 'projects');
const imageDir = () => join(root(), 'images');

export async function atomicWrite(path: string, data: string | Uint8Array) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, data);
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}

export async function getProject(id: string) {
  const project = projectSchema.parse(JSON.parse(await readFile(join(projectDir(), `${id}.json`), 'utf8')));
  for (const card of project.cards) {
    if (card.source.images.front && card.frame.kind === 'modern' && card.frame.tone === 'auto' && !card.art
      && Object.entries(card.fields).every(([key, value]) => card.source[key as keyof typeof card.fields] === value)) {
      card.frame = { kind: 'printing' };
    }
  }
  return project;
}

export async function listProjects() {
  await mkdir(projectDir(), { recursive: true });
  const paths = await readdir(projectDir());
  const projects = await Promise.allSettled(paths.filter(path => path.endsWith('.json'))
    .map(path => getProject(path.slice(0, -5))));
  return projects.flatMap(result => result.status === 'fulfilled'
    ? [{ id: result.value.id, name: result.value.name }] : [])
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

export async function saveProject(project: Project) {
  await mkdir(projectDir(), { recursive: true });
  await atomicWrite(join(projectDir(), `${project.id}.json`), JSON.stringify(project));
}

export async function readLimitedFile(path: string, limit: number) {
  const file = await stat(path);
  if (!file.isFile()) throw new LocalizedError('fileRequired');
  if (file.size > limit) throw new LocalizedError('fileSize');
  const data = await readFile(path);
  if (data.length > limit) throw new LocalizedError('fileSize');
  return data;
}

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export async function storeImage(bytes: Uint8Array, name: string, frame = false): Promise<Asset> {
  if (bytes.byteLength > imageLimit) throw new LocalizedError('imageSize');
  const buffer = Buffer.from(bytes);
  const png = buffer.subarray(0, 8).equals(pngSignature);
  const jpeg = buffer[0] === 255 && buffer[1] === 216;
  const webp = isWebP(buffer);
  if (!png && !jpeg && !webp) throw new LocalizedError('imageType');
  if (frame && !png) throw new LocalizedError('framePng');
  const image = webp ? undefined : nativeImage.createFromBuffer(buffer);
  const dimensions = webp ? webpSize(buffer) : image?.isEmpty() ? undefined : image?.getSize();
  if (!dimensions) throw new LocalizedError('imageReadFailed');
  const { width, height } = dimensions;
  if (width * height > 64_000_000) throw new LocalizedError('imageDimensions');
  let alpha = false;
  if (frame && image) {
    const bitmap = image.toBitmap();
    for (let i = 3; i < bitmap.length; i += 4) {
      if (bitmap[i] < 255) { alpha = true; break; }
    }
    if (!alpha) throw new LocalizedError('frameTransparency');
  }
  const id = createHash('sha256').update(buffer).digest('hex');
  await mkdir(imageDir(), { recursive: true });
  if (!(await stat(join(imageDir(), id)).catch(() => null))) await atomicWrite(join(imageDir(), id), buffer);
  return { id, name: basename(name).slice(0, 255), width, height, alpha, png };
}

export async function imageResponse(request: Request) {
  const url = new URL(request.url);
  const id = assetId.safeParse(url.pathname.slice(1));
  if (url.host !== 'images' || !id.success) return new Response(null, { status: 404 });
  try {
    const data = await readFile(join(imageDir(), id.data));
    const type = isWebP(data) ? 'image/webp' : data.subarray(0, 8).equals(pngSignature) ? 'image/png' : 'image/jpeg';
    return new Response(new Uint8Array(data), { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400', 'Access-Control-Allow-Origin': '*' } });
  } catch {
    return new Response(null, { status: 404 });
  }
}
