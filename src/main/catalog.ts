import { errorMessage, LocalizedError, translate } from '../shared/i18n.js';
import type { Locale } from '../shared/i18n.js';
import { z } from 'zod';
import type { CardData, DeckEntry, Printing } from '../shared/model.js';
import { normalizeName } from '../shared/deck.js';
import { downloadImage } from './catalog-images.js';
import { imageLimit, storeImage } from './storage.js';

const api = 'https://api.scryfall.com';
const headers = { 'User-Agent': 'MTGProxyBuilder/0.1 (Electron desktop app)', Accept: 'application/json' };

const uris = z.object({
  display: z.url().nullish(), grid: z.url().nullish(), art: z.url().nullish(), thumb: z.url().nullish(), small: z.url().nullish(),
  png: z.url().nullish(), large: z.url().nullish(), normal: z.url().nullish(),
  jpeg: z.url().nullish(), art_crop: z.url().nullish()
});
const face = z.object({
  name: z.string(), mana_cost: z.string().optional(), type_line: z.string().optional(),
  flavor_text: z.string().nullish(), oracle_text: z.string().optional(), printed_text: z.string().optional(), printed_name: z.string().optional(),
  printed_type_line: z.string().optional(), power: z.string().optional(), toughness: z.string().optional(),
  defense: z.string().optional(), loyalty: z.string().optional(), artist: z.string().optional(),
  image_uris: uris.optional()
});
const scryCard = face.extend({
  id: z.uuid(), oracle_id: z.uuid().optional(), lang: z.string(), set: z.string(), set_name: z.string(),
  collector_number: z.string(), rarity: z.string().optional(), layout: z.string(), digital: z.boolean().default(false),
  frame: z.string().optional(), frame_effects: z.array(z.string()).nullish(),
  border_color: z.string().optional(), full_art: z.boolean().optional(),
  colors: z.array(z.enum(['W', 'U', 'B', 'R', 'G'])).default([]),
  card_faces: z.array(face).optional(), prints_search_uri: z.url().optional()
});
type ScryCard = z.infer<typeof scryCard>;
const cardList = z.object({ data: z.array(scryCard), next_page: z.url().optional() });
const cache = new Map<string, { time: number; value: unknown }>();
let nextRequest = Promise.resolve();
let blockedUntil = 0;
const savedCards = new Map<string, CardData>();

async function request(path: string, body?: unknown): Promise<unknown> {
  const url = new URL(path, api);
  if (url.origin !== api) throw new LocalizedError('catalogUrl');
  const key = url.href + (body ? JSON.stringify(body) : '');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < 900_000) return hit.value;
  const queue = nextRequest.then(() => {
    if (Date.now() < blockedUntil) throw new LocalizedError('catalogPaused');
  });
  nextRequest = queue.catch(() => {}).then(() => new Promise<void>(resolve => setTimeout(resolve, 120)));
  await queue;
  const response = await fetch(url, {
    headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
    method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000)
  }).catch(() => { throw new LocalizedError('catalogOffline'); });
  if (response.status === 404) return null;
  if (response.status === 429) {
    blockedUntil = Date.now() + Math.max(60, Number(response.headers.get('Retry-After')) || 0) * 1000;
    throw new LocalizedError('catalogRateLimit');
  }
  if (!response.ok) throw new LocalizedError('catalogStatus', { status: response.status });
  const value: unknown = await response.json();
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(key, { time: Date.now(), value });
  return value;
}

function rememberCard(card: ScryCard) {
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(`${api}/cards/${card.id}`, { time: Date.now(), value: card });
}

function printing(card: ScryCard): Printing {
  const style = card.full_art ? 'full-art' : card.border_color === 'borderless' ? 'borderless'
    : card.frame_effects?.includes('showcase') ? 'showcase' : ['1993', '1997'].includes(card.frame ?? '') ? 'retro'
    : ['2003', '2015'].includes(card.frame ?? '') ? 'modern' : 'other';
  const images = card.image_uris ?? card.card_faces?.[0]?.image_uris;
  const thumbnail = images?.thumb ?? images?.small;
  return { id: card.id, name: card.printed_name ?? card.name, set: card.set, setName: card.set_name,
    number: card.collector_number, lang: card.lang, style,
    thumbnail: thumbnail?.startsWith('https://cards.scryfall.io/') ? thumbnail : undefined };
}

export async function search(name: string) {
  const exact = await request('/cards/named?exact=' + encodeURIComponent(name));
  if (exact) {
    const card = scryCard.parse(exact);
    if (!card.digital) {
      rememberCard(card);
      return { exact: printing(card), choices: [] };
    }
  }
  const suggestions = await request('/cards/autocomplete?q=' + encodeURIComponent(name));
  const names = z.object({ data: z.array(z.string()) }).parse(suggestions ?? { data: [] }).data.slice(0, 15);
  const found = await resolveDeck(names.map(name => ({ name, count: 1 })));
  return { choices: found.filter(candidate => candidate !== null) };
}

export async function printings(id: string) {
  const card = scryCard.parse(await request('/cards/' + id));
  if (!card.prints_search_uri) return [printing(card)];
  let url: string | undefined = card.prints_search_uri;
  const result: Printing[] = [];
  while (url) {
    const page: z.infer<typeof cardList> = cardList.parse(await request(url));
    for (const candidate of page.data) {
      if (candidate.digital) continue;
      rememberCard(candidate);
      result.push(printing(candidate));
    }
    url = page.next_page;
  }
  return result.length ? result : [printing(card)];
}

export async function resolveDeck(entries: DeckEntry[]) {
  const key = (entry: DeckEntry) => entry.set ? `${entry.set}/${entry.number}` : normalizeName(entry.name);
  const unique = [...new Map(entries.map(entry => [key(entry), entry])).values()];
  const found = new Map<string, ScryCard>();
  for (let index = 0; index < unique.length; index += 75) {
    const chunk = unique.slice(index, index + 75);
    const response = cardList.parse(await request('/cards/collection', {
      identifiers: chunk.map(entry => entry.set ? { set: entry.set, collector_number: entry.number } : { name: entry.name })
    }));
    for (const card of response.data) {
      if (card.digital) continue;
      rememberCard(card);
      found.set(`${card.set}/${card.collector_number}`, card);
      for (const name of [card.name, card.printed_name, ...card.card_faces?.flatMap(face => [face.name, face.printed_name]) ?? []]) {
        if (name && !found.has(normalizeName(name))) found.set(normalizeName(name), card);
      }
    }
  }
  return entries.map(entry => {
    const match = found.get(key(entry));
    if (!match) return null;
    if (entry.set && ![match.name, match.printed_name, ...match.card_faces?.flatMap(face => [face.name, face.printed_name]) ?? []]
      .some(name => name && normalizeName(name) === normalizeName(entry.name))) return null;
    return printing(match);
  });
}

async function image(urls: Array<string | null | undefined>, name: string) {
  return downloadImage(urls.map(url => url ?? undefined), imageLimit, headers['User-Agent'],
    async bytes => (await storeImage(bytes, name)).id);
}

export async function getCard(id: string, includeImages = true, locale: Locale = 'it'): Promise<CardData> {
  const saved = savedCards.get(id);
  if (saved) return saved;
  const card = scryCard.parse(await request('/cards/' + id));
  const firstFace = card.card_faces?.[0];
  const backFace = card.card_faces?.[1];
  const frontImages = card.image_uris ?? firstFace?.image_uris;
  const backImages = card.image_uris ? undefined : backFace?.image_uris;
  const editable = true;
  const physicalFaces = !!backImages;
  const sections = !physicalFaces && card.card_faces?.length ? card.card_faces : undefined;
  const sectionText = sections?.map(face => [
    [face.printed_name ?? face.name, face.mana_cost].filter(Boolean).join(' · '),
    face.printed_type_line ?? face.type_line,
    face.printed_text ?? face.oracle_text
  ].filter(Boolean).join('\n')).join('\n\n');
  const result: CardData = {
    printingId: card.id, oracleId: card.oracle_id ?? card.id, name: card.name,
    set: card.set, setName: card.set_name, number: card.collector_number, layout: card.layout,
    editable, colors: card.colors, images: {},
    orientation: ['battle', 'split', 'aftermath', 'planar', 'scheme'].includes(card.layout) || /\bBattle\b/i.test(firstFace?.type_line ?? card.type_line ?? '') ? 'landscape' : 'portrait',
    backOrientation: physicalFaces && /\bBattle\b/i.test(backFace?.type_line ?? '') ? 'landscape' : 'portrait',
    faceNames: card.card_faces?.map(face => face.printed_name ?? face.name) ?? [],
    details: {
      printedName: physicalFaces ? firstFace?.printed_name ?? firstFace?.name : card.printed_name, rarity: card.rarity ?? '', lang: card.lang,
      layeredArt: !card.full_art && card.border_color !== 'borderless' && !card.frame_effects?.includes('extendedart'), flavor: card.flavor_text ?? '',
      faces: card.card_faces?.map(face => ({
        name: face.printed_name ?? face.name, mana: face.mana_cost ?? '',
        type: face.printed_type_line ?? face.type_line ?? '', rules: face.printed_text ?? face.oracle_text ?? '',
        flavor: face.flavor_text ?? '', artist: face.artist ?? '',
        power: face.power ?? '', toughness: face.toughness ?? '', loyalty: face.loyalty ?? '', defense: face.defense ?? ''
      })) ?? []
    },
    mana: card.mana_cost ?? firstFace?.mana_cost ?? '', type: (physicalFaces ? firstFace?.printed_type_line ?? firstFace?.type_line : card.printed_type_line ?? card.type_line) ?? '',
    rules: (physicalFaces ? firstFace?.printed_text ?? firstFace?.oracle_text : sectionText ?? card.printed_text ?? card.oracle_text) ?? '', artist: card.artist ?? firstFace?.artist ?? '',
    power: card.power ?? firstFace?.power ?? '', toughness: card.toughness ?? firstFace?.toughness ?? '', loyalty: card.loyalty ?? firstFace?.loyalty ?? '', defense: card.defense ?? firstFace?.defense ?? ''
  };
  if (!includeImages) return result;
  const getFace = (urls: typeof frontImages) => [urls?.display, urls?.large, urls?.jpeg, urls?.normal, urls?.png, urls?.grid];
  const [front, back, art, backArt] = await Promise.allSettled([
    image(getFace(frontImages), card.name),
    image(getFace(backImages), card.name),
    image([frontImages?.art, frontImages?.art_crop], card.name),
    image([backImages?.art, backImages?.art_crop], card.name)
  ]);
  result.images = {
    front: front.status === 'fulfilled' ? front.value : undefined,
    back: back.status === 'fulfilled' ? back.value : undefined,
    art: art.status === 'fulfilled' ? art.value : undefined,
    backArt: backArt.status === 'fulfilled' ? backArt.value : undefined,
    error: front.status === 'rejected'
      ? (front.reason instanceof Error ? errorMessage(front.reason, locale) : translate(locale, 'scryfallDownloadFailed')).slice(0, 300)
      : undefined
  };
  if (savedCards.size >= 500) savedCards.delete(savedCards.keys().next().value!);
  if (result.images.front && (!backImages || result.images.back) && (!editable || !(frontImages?.art || frontImages?.art_crop) || result.images.art)) savedCards.set(id, result);
  return result;
}
