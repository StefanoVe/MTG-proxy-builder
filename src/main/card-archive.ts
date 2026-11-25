import { Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js';
import { open, rm } from 'node:fs/promises';
import { LocalizedError } from '../shared/i18n.js';
import { cardArchiveLimit } from '../shared/print.js';

export async function openCardArchive(path: string) {
  const file = await open(path, 'wx', 0o600);
  let bytes = 0;
  let entries = 0;
  let sealed = false;
  let pending: Promise<unknown> | undefined;
  let closing: Promise<void> | undefined;
  const closeFile = () => closing ??= file.close();
  const zip = new ZipWriter(new WritableStream<Uint8Array>({
    async write(chunk) {
      await file.writeFile(chunk);
      bytes += chunk.byteLength;
    }
  }), { level: 0, useWebWorkers: false });

  return {
    path,
    async append(paths: string[], data: Uint8Array) {
      if (sealed || pending || !paths.length || !data.byteLength || entries + paths.length > cardArchiveLimit) {
        throw new LocalizedError('invalidZip');
      }
      const job = (async () => {
        for (const entry of paths) await zip.add(entry, new Uint8ArrayReader(data));
        entries += paths.length;
      })();
      pending = job;
      try {
        await job;
      } catch (cause) {
        sealed = true;
        throw cause;
      } finally {
        pending = undefined;
      }
    },
    async finish() {
      if (sealed || pending || !entries) throw new LocalizedError('invalidZip');
      sealed = true;
      const job = (async () => {
        await zip.close();
        await closeFile();
        return bytes;
      })();
      pending = job;
      try {
        return await job;
      } finally {
        pending = undefined;
      }
    },
    async discard() {
      sealed = true;
      await pending?.catch(() => {});
      try {
        await closeFile();
      } finally {
        await rm(path, { force: true });
      }
    }
  };
}
