import { z } from 'zod';
import type { Locale } from './i18n.js';
import { manaFiles } from './mana-catalog.ts';

export const assetId = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.uuid();
const rect = z.object({
  x: z.number().min(0).max(99), y: z.number().min(0).max(99),
  w: z.number().min(1).max(100), h: z.number().min(1).max(100)
}).refine(r => r.x + r.w <= 100.001 && r.y + r.h <= 100.001);
export const zonesSchema = z.object({ art: rect, title: rect, type: rect, rules: rect, stats: rect });
export type Zones = z.infer<typeof zonesSchema>;
export const defaultZones: Zones = {
  art: { x: 6, y: 11, w: 88, h: 49 }, title: { x: 7, y: 4.5, w: 86, h: 6 },
  type: { x: 7, y: 60.8, w: 86, h: 5 }, rules: { x: 8, y: 68, w: 84, h: 22 },
  stats: { x: 75, y: 90.5, w: 18, h: 5 }
};

const text = z.string().max(300);
const printingImages = z.object({ front: assetId.optional(), back: assetId.optional(), art: assetId.optional(), backArt: assetId.optional(), error: text.optional() });
const faceDetails = z.object({
  name: text, mana: text, type: text, rules: z.string().max(12000),
  flavor: z.string().max(4000), artist: text, power: text, toughness: text, loyalty: text, defense: text
});
export const cardDataSchema = z.object({
  printingId: z.string(), oracleId: z.string(), name: text, set: text, setName: text, number: text,
  layout: text, editable: z.boolean(), colors: z.array(z.enum(['W', 'U', 'B', 'R', 'G'])).max(5),
  orientation: z.enum(['portrait', 'landscape']).optional(), backOrientation: z.enum(['portrait', 'landscape']).optional(),
  mana: text, type: text, rules: z.string().max(12000), artist: text,
  power: text, toughness: text, loyalty: text, defense: text,
  images: printingImages, faceNames: z.array(text).max(10),
  details: z.object({ printedName: text.optional(), rarity: text, lang: text, layeredArt: z.boolean().optional(), flavor: z.string().max(4000),
    faces: z.array(faceDetails).max(10) }).optional()
});
export const tones = ['auto', 'white', 'blue', 'black', 'red', 'green', 'multi', 'artifact', 'land'] as const;
export const templateNames = { 'full-art': 'fullArt', 'extended-art': 'extendedArt' } as const;
export type Template = keyof typeof templateNames;
const templateSchema = z.enum(Object.keys(templateNames) as Template[]);
export function isTemplate(value: string): value is Template {
  return Object.hasOwn(templateNames, value);
}
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);
export const fontFamilySchema = z.string().trim().min(1).max(256);
export type CardFontFamily = z.infer<typeof fontFamilySchema>;
const motifSchema = z.enum(['frame', 'corners', 'flourish', 'seal']);
export const maxVisibilityQueryLength = 12000;
const visibilityConditionSchema = z.object({
  field: z.enum(['name', 'type', 'rules']), query: z.string().max(maxVisibilityQueryLength), negate: z.boolean()
});
export type FrameVisibilityCondition = z.infer<typeof visibilityConditionSchema>;
const decorationSchema = z.object({
  id: uuid, name: z.string().min(1).max(255), rect, opacity: z.number().min(0).max(1),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('image'), asset: assetId }),
    z.object({ kind: z.literal('motif'), motif: motifSchema })
  ]),
  tint: z.enum(['original', 'card', 'text', 'custom']), color: hexColor,
  fit: z.enum(['contain', 'stretch']), hideWhen: visibilityConditionSchema.optional()
});
export type FrameDecoration = z.infer<typeof decorationSchema>;
export const maxDecorations = 12;
const templateEffectSchema = z.object({
  anchor: z.enum(['title', 'type', 'rules', 'manual']),
  height: z.number().min(0).max(100).optional()
});
export type TemplateEffect = z.infer<typeof templateEffectSchema>;
export const frameTextAreas = ['title', 'type', 'rules', 'stats', 'artist'] as const;
export type FrameTextArea = typeof frameTextAreas[number];
const frameTextStyleSchema = z.object({
  align: z.enum(['left', 'center', 'right']).optional(),
  size: z.number().int().min(8).max(96).optional()
});
export type FrameTextStyle = z.infer<typeof frameTextStyleSchema>;
const symbolStyleSchema = z.object({ asset: assetId.optional(), textColor: hexColor.optional() });
export type SymbolStyle = z.infer<typeof symbolStyleSchema>;
const symbolOverridesSchema = z.partialRecord(z.enum(Object.keys(manaFiles)), symbolStyleSchema);
export type SymbolOverrides = z.infer<typeof symbolOverridesSchema>;
export const templateAppearanceSchema = z.object({
  zones: zonesSchema, overlay: assetId.optional(), symbolOverrides: symbolOverridesSchema.optional(),
  textColor: hexColor, fontFamily: fontFamilySchema.optional(), accent: hexColor.optional(), divider: z.boolean(),
  textStyles: z.partialRecord(z.enum(frameTextAreas), frameTextStyleSchema).optional(),
  titleShade: z.number().min(0).max(1), rulesShade: z.number().min(0).max(1),
  autoTextColor: z.boolean().optional(), shadeColor: hexColor.optional(),
  titleBlur: z.number().min(0).max(32).optional(), rulesBlur: z.number().min(0).max(32).optional(),
  topEffect: templateEffectSchema.optional(), bottomEffect: templateEffectSchema.optional(),
  titleDivider: z.boolean().optional(), dividerLength: z.number().min(5).max(100).optional(),
  dividerWeight: z.number().min(1).max(12).optional(), dividerPadding: z.number().min(0).max(100).optional(),
  dividerAlign: z.enum(['left', 'center', 'right']).optional(),
  dividerStyle: z.enum(['solid', 'fade', 'dashed']).optional(),
  titleDividerHideWhen: visibilityConditionSchema.optional(), dividerHideWhen: visibilityConditionSchema.optional(),
  decorations: z.array(decorationSchema).max(maxDecorations).optional()
});
export type TemplateAppearance = z.infer<typeof templateAppearanceSchema>;

export const frameColors = ['W', 'U', 'B', 'R', 'G', 'C'] as const;
export const frameColorNames = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green', C: 'colorless' } as const;
export const frameSetAssetsSchema = z.object({ W: assetId, U: assetId, B: assetId, R: assetId, G: assetId, C: assetId });
export const frameSetSchema = z.object({
  id: uuid, name: z.string().trim().min(1).max(100), assets: frameSetAssetsSchema, mix: z.boolean(), zones: zonesSchema,
  textColor: hexColor.optional(), fontFamily: fontFamilySchema.optional(), appearance: templateAppearanceSchema.optional()
});
export type FrameColor = typeof frameColors[number];
export type FrameSet = z.infer<typeof frameSetSchema>;

const builtInFrameSchema = z.object({ kind: z.enum(['modern', 'classic']), tone: z.enum(tones) });
const templateFrameSchema = z.object({ kind: z.literal('template'), template: templateSchema, appearance: templateAppearanceSchema.optional() });
const customFrameSchema = z.object({ kind: z.literal('custom'), asset: assetId, zones: zonesSchema, textColor: hexColor.optional(),
  fontFamily: fontFamilySchema.optional(), appearance: templateAppearanceSchema.optional() });
const projectFrameSchema = z.discriminatedUnion('kind', [
  builtInFrameSchema, templateFrameSchema, customFrameSchema,
  z.object({ kind: z.literal('color-set'), id: uuid }),
  z.object({ kind: z.literal('preset'), id: uuid })
]);

const cardSideSchema = z.object({
  fields: cardDataSchema.pick({ name: true, mana: true, type: true, rules: true, artist: true, power: true, toughness: true, loyalty: true, defense: true }),
  art: assetId.optional(),
  zoneOverrides: zonesSchema.partial().optional(),
  hiddenZones: z.array(z.enum(['art', 'title', 'type', 'rules', 'stats'])).optional(),
  dividerOverrides: z.object({ titleDivider: z.boolean().optional(), divider: z.boolean().optional() }).optional(),
  crop: z.object({ x: z.number().min(-1).max(1), y: z.number().min(-1).max(1), zoom: z.number().min(1).max(5) }),
  frame: z.discriminatedUnion('kind', [builtInFrameSchema, z.object({ kind: z.literal('printing'), artZone: rect.optional() }), templateFrameSchema,
    z.object({ kind: z.literal('color-set'), set: frameSetSchema }), customFrameSchema])
});

export const cardSchema = z.object({
  id: uuid, count: z.number().int().min(1).max(999), source: cardDataSchema,
  fields: cardDataSchema.pick({ name: true, mana: true, type: true, rules: true, artist: true, power: true, toughness: true, loyalty: true, defense: true }),
  art: assetId.optional(),
  zoneOverrides: zonesSchema.partial().optional(),
  hiddenZones: z.array(z.enum(['art', 'title', 'type', 'rules', 'stats'])).optional(),
  dividerOverrides: z.object({ titleDivider: z.boolean().optional(), divider: z.boolean().optional() }).optional(),
  crop: z.object({ x: z.number().min(-1).max(1), y: z.number().min(-1).max(1), zoom: z.number().min(1).max(5) }),
  backSide: cardSideSchema.optional(),
  frame: z.discriminatedUnion('kind', [
    builtInFrameSchema,
    z.object({ kind: z.literal('printing'), artZone: rect.optional() }),
    templateFrameSchema,
    z.object({ kind: z.literal('color-set'), set: frameSetSchema }),
    customFrameSchema
  ])
});
export const presetSchema = customFrameSchema.omit({ kind: true }).extend({ id: uuid, name: z.string().trim().min(1).max(100) });
export const projectSchema = z.object({
  version: z.literal(1), id: uuid, name: z.string().min(1).max(100),
  cards: z.array(cardSchema).max(1500), presets: z.array(presetSchema).max(200),
  frame: projectFrameSchema.optional(),
  fullArtBase: templateAppearanceSchema.optional(),
  templateAppearances: z.partialRecord(templateSchema, templateAppearanceSchema).optional(),
  frameSets: z.array(frameSetSchema).max(200).optional()
});
export const assetSchema = z.object({ id: assetId, name: z.string(), width: z.number(), height: z.number(), alpha: z.boolean(), png: z.boolean() });

export type CardData = z.infer<typeof cardDataSchema>;
export type Card = z.infer<typeof cardSchema>;
export type Preset = z.infer<typeof presetSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Rect = z.infer<typeof rect>;
export type Tone = typeof tones[number];
export type DeckEntry = { name: string; count: number; set?: string; number?: string };
export const styles = ['modern', 'retro', 'showcase', 'borderless', 'full-art', 'other'] as const;
export type PrintingStyle = typeof styles[number];
export type Printing = {
  id: string; name: string; set: string; setName: string; number: string; lang: string;
  style?: PrintingStyle; thumbnail?: string;
};
export type PrintSettings = { paper: 'A4' | 'Letter'; cut: boolean; backs: boolean; bleed?: 'none' | 'mpc' | 'custom'; customMm?: number; fill?: 'mirror' | 'solid'; color?: string };
export type ProxyAPI = {
  getLocale(): Promise<Locale>;
  setLocale(locale: Locale): Promise<void>;
  checkForUpdate(): Promise<string | null>;
  openReleases(): Promise<void>;
  fonts(): Promise<string[]>;
  projects(): Promise<Array<Pick<Project, 'id' | 'name'>>>;
  open(id: string): Promise<Project>;
  save(project: Project): Promise<void>;
  search(name: string): Promise<{ exact?: Printing; choices: Printing[] }>;
  printings(id: string): Promise<Printing[]>;
  card(id: string, includeImages?: boolean): Promise<CardData>;
  resolve(entries: DeckEntry[]): Promise<Array<Printing | null>>;
  deckFile(): Promise<string | null>;
  images(mode: 'files' | 'folder' | 'single', frame: boolean): Promise<{ assets: Asset[]; errors: string[] }>;
  dropped(bytes: Uint8Array, name: string, frame: boolean): Promise<Asset>;
  pdf(name: string, bytes: Uint8Array): Promise<boolean>;
  cardArchive(name: string, bytes: Uint8Array): Promise<boolean>;
};

export const defaultCrop = { x: 0, y: 0, zoom: 1 };
export const blankCard: CardData = {
  printingId: '', oracleId: '', name: 'Carta senza titolo', set: '', setName: '', number: '',
  layout: 'normal', editable: true, colors: [], mana: '', type: '', rules: '', artist: '',
  power: '', toughness: '', loyalty: '', defense: '', images: {}, faceNames: []
};

export function printingFields(source: CardData): Card['fields'] {
  const { name, mana, type, rules, artist, power, toughness, loyalty, defense } = source;
  return { name: source.details?.printedName ?? name, mana, type, rules, artist, power, toughness, loyalty, defense };
}

export function createCard(source: CardData, count = 1): Card {
  return {
    id: crypto.randomUUID(), count, source, fields: printingFields(source),
    frame: source.printingId ? { kind: 'printing' } : { kind: 'modern', tone: 'auto' }, crop: defaultCrop
  };
}

/** Present one physical side as an ordinary card to the editor and renderer. */
export function cardSide(card: Card, back: boolean): Card {
  if (!back) return card;
  const face = card.source.details?.faces[1];
  const source = { ...card.source, name: face?.name ?? card.source.faceNames[1] ?? card.source.name,
    ...(face ? { mana: face.mana, type: face.type, rules: face.rules, artist: face.artist, power: face.power,
      toughness: face.toughness, loyalty: face.loyalty, defense: face.defense } : {}),
    editable: true, orientation: card.source.backOrientation ?? (/\b(battle|battaglia)\b/i.test(face?.type ?? '') ? 'landscape' as const : 'portrait' as const),
    backOrientation: undefined, images: { front: card.source.images.back, art: card.source.images.backArt },
    details: card.source.details ? { ...card.source.details, printedName: face?.name, faces: [] } : undefined };
  const initial = createCard(source, card.count);
  return { ...card, ...initial, ...card.backSide, id: card.id, source, backSide: undefined };
}

/** Orientation describes the readable face, independently of the physical sheet slot. */
export function sideOrientation(card: Card, back = false): 'portrait' | 'landscape' {
  const recorded = back ? card.source.backOrientation : card.source.orientation;
  if (recorded) return recorded;
  const type = back ? card.source.details?.faces[1]?.type : card.source.details?.faces[0]?.type ?? card.source.type;
  if (/\b(battle|battaglia)\b/i.test(type ?? '')) return 'landscape';
  if (!back && ['battle', 'split', 'aftermath', 'planar', 'scheme'].includes(card.source.layout)) return 'landscape';
  return 'portrait';
}

export function sideState(card: Card): NonNullable<Card['backSide']> {
  const { fields, art, crop, frame, zoneOverrides, hiddenZones, dividerOverrides } = card;
  return { fields, art, crop, frame, zoneOverrides, hiddenZones, dividerOverrides };
}

export function rebaseBackSide(card: Card, source: CardData): Card['backSide'] {
  if (!card.backSide || !source.images.back) return card.backSide;
  const oldDefault = cardSide({ ...card, backSide: undefined }, true);
  const newDefault = cardSide({ ...card, source, backSide: undefined }, true);
  const fields = { ...card.backSide.fields };
  for (const key of Object.keys(fields) as Array<keyof Card['fields']>) {
    if (fields[key] === oldDefault.fields[key]) fields[key] = newDefault.fields[key];
  }
  const frame = card.backSide.frame.kind === 'printing' && card.source.printingId !== source.printingId
    ? { kind: 'printing' as const } : card.backSide.frame;
  return { ...card.backSide, fields, frame };
}

export function isCardModified(card: Card): boolean {
  if (card.backSide && isCardModified(cardSide(card, true))) return true;
  const { frame, crop } = card;
  const defaultFrame = card.source.printingId
    ? frame.kind === 'printing' && !frame.artZone
    : frame.kind === 'modern' && frame.tone === 'auto';
  if (!defaultFrame || card.art || crop.x !== defaultCrop.x || crop.y !== defaultCrop.y || crop.zoom !== defaultCrop.zoom
    || (card.hiddenZones?.length ?? 0) > 0
    || Object.values(card.zoneOverrides ?? {}).some(value => value !== undefined)
    || Object.values(card.dividerOverrides ?? {}).some(value => value !== undefined)) return true;

  const originalFields = printingFields(card.source);
  return (Object.keys(originalFields) as (keyof Card['fields'])[]).some(key => card.fields[key] !== originalFields[key]);
}

export function createProject(name = 'Mazzo senza titolo'): Project {
  return { id: crypto.randomUUID(), name, version: 1, cards: [], presets: [] };
}

export function assetURL(id: string): string {
  return `proxy-asset://images/${id}`;
}

export function cardArtZone(card: Card) {
  return card.frame.kind === 'printing' ? card.frame.artZone ?? defaultZones.art : defaultZones.art;
}
