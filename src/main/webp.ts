export function isWebP(bytes: Buffer): boolean {
  return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

export function webpSize(bytes: Buffer): { width: number; height: number } | undefined {
  if (!isWebP(bytes) || bytes.length < 25 || bytes.readUInt32LE(4) + 8 !== bytes.length) return;
  const kind = bytes.toString('ascii', 12, 16);
  const size = bytes.readUInt32LE(16);
  if (size + 20 > bytes.length) return;
  if (kind === 'VP8X' && size === 10) {
    return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  }
  if (kind === 'VP8L' && size >= 5 && bytes[20] === 0x2f) {
    const dimensions = bytes.readUInt32LE(21);
    return { width: (dimensions & 0x3fff) + 1, height: ((dimensions >>> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8 ' && size >= 10 && bytes.readUIntBE(23, 3) === 0x9d012a) {
    const width = bytes.readUInt16LE(26) & 0x3fff;
    const height = bytes.readUInt16LE(28) & 0x3fff;
    if (width && height) return { width, height };
  }
}
