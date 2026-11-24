const cdn = new Set(['cards.scryfall.io', 'c1.scryfall.com']);
const maxRedirects = 3;

export async function downloadImage<T>(urls: Array<string | undefined>, limit: number, userAgent: string, save: (bytes: Uint8Array) => Promise<T>): Promise<T | undefined> {
  const candidates = [...new Set(urls.filter((url): url is string => !!url))];
  if (!candidates.length) return;
  const signal = AbortSignal.timeout(20_000);
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      let uri = new URL(candidate);
      for (let redirects = 0; redirects <= maxRedirects; redirects++) {
        if (uri.protocol !== 'https:' || !cdn.has(uri.hostname) || uri.port || uri.username || uri.password) {
          throw new Error('Origine dell’immagine di Scryfall non valida.');
        }
        const response = await fetch(uri, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(7_000)]), redirect: 'manual',
          headers: { 'User-Agent': userAgent, Accept: 'image/webp,image/png,image/jpeg' }
        });
        const location = response.headers.get('location');
        if ([301, 302, 303, 307, 308].includes(response.status) && location) {
          await response.body?.cancel();
          uri = new URL(location, uri);
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`Scryfall risponde con HTTP ${response.status}.`);
        }
        const type = response.headers.get('content-type')?.split(';', 1)[0].toLowerCase();
        if (Number(response.headers.get('content-length')) > limit || !response.body || (type && !type.startsWith('image/') && type !== 'application/octet-stream')) {
          await response.body?.cancel();
          throw new Error('Risposta immagine di Scryfall non valida.');
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > limit) {
            await reader.cancel();
            throw new Error('L’immagine di Scryfall supera 32 MB.');
          }
          chunks.push(value);
        }
        return await save(Buffer.concat(chunks, length));
      }
      throw new Error('Troppi reindirizzamenti per l’immagine di Scryfall.');
    } catch (error) {
      lastError = error;
      if (signal.aborted) break;
    }
  }
  if (lastError instanceof TypeError) throw new Error('Connessione al server delle immagini di Scryfall non riuscita.');
  if (lastError instanceof DOMException && lastError.name === 'TimeoutError') throw new Error('Il server delle immagini di Scryfall non ha risposto in tempo.');
  throw lastError;
}
