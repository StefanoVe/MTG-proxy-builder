import { LocalizedError } from '../shared/i18n.js';
import { pixels } from '../shared/print.js';

export async function importFrameArtwork(file: File, bounds = { width: pixels.width * 2, height: pixels.height * 2 }) {
  const name = file.name.slice(0, 255);
  if (/\.png$/i.test(file.name)) {
    if (file.size > 32 * 1024 * 1024) throw new LocalizedError('pngSize');
    const asset = await window.proxy.dropped(new Uint8Array(await file.arrayBuffer()), name, false);
    if (!asset.png) throw new LocalizedError('decorationType');
    return asset;
  }
  if (!/\.svg$/i.test(file.name)) throw new LocalizedError('chooseDecorationFile');
  if (file.size > 2 * 1024 * 1024) throw new LocalizedError('svgSize');
  // Decoding in an image element disables scripts and external SVG resources.
  const url = URL.createObjectURL(new Blob([file], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => { throw new LocalizedError('svgReadFailed'); });
    const { naturalWidth: w, naturalHeight: h } = image;
    if (!w || !h) throw new LocalizedError('svgDimensions');
    const scale = Math.min(bounds.width / w, bounds.height / h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve));
    if (!png) throw new LocalizedError('svgPreparationFailed');
    return await window.proxy.dropped(new Uint8Array(await png.arrayBuffer()), name, false);
  } finally {
    URL.revokeObjectURL(url);
  }
}
