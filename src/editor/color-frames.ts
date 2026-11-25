import { colorBand } from './card-colors.js';

export function blendColorFrames(images: HTMLImageElement[], width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const out = canvas.getContext('2d')!;
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const ctx = scratch.getContext('2d')!;
  out.globalCompositeOperation = 'lighter';

  images.forEach((image, index) => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    if (images.length > 1) {
      const { start, end, feather } = colorBand(index, images.length);
      const mask = ctx.createLinearGradient(0, 0, width, 0);
      if (index > 0) {
        mask.addColorStop(start - feather, 'transparent');
        mask.addColorStop(start + feather, '#000');
      } else {
        mask.addColorStop(0, '#000');
      }
      if (index < images.length - 1) {
        mask.addColorStop(end - feather, '#000');
        mask.addColorStop(end + feather, 'transparent');
      } else {
        mask.addColorStop(1, '#000');
      }
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = mask;
      ctx.fillRect(0, 0, width, height);
    }
    out.drawImage(scratch, 0, 0);
  });
  return canvas;
}
