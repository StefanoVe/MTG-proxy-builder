import type { Card, FrameMirror, FrameTextArea, Preset, Project, Template, TemplateAppearance, Zones } from './model.js';
import { cardSide, sideFrameSettings, sideState } from './model.ts';

const templateZones: Record<Template, Zones> = {
  'full-art': {
    art: { x: 0, y: 0, w: 100, h: 100 }, title: { x: 6, y: 4, w: 88, h: 5 },
    type: { x: 6, y: 67, w: 88, h: 4 }, rules: { x: 6, y: 73, w: 88, h: 17 },
    stats: { x: 79, y: 91, w: 15, h: 4 }
  },
  'extended-art': {
    art: { x: 2, y: 2, w: 96, h: 71 }, title: { x: 7, y: 5, w: 86, h: 5 },
    type: { x: 7, y: 63, w: 86, h: 4 }, rules: { x: 7, y: 70, w: 86, h: 20 },
    stats: { x: 78, y: 91, w: 15, h: 4 }
  }
};

export type TemplateFrame = Extract<Card['frame'], { kind: 'template' }>;
export type CustomFrame = Extract<Card['frame'], { kind: 'custom' | 'color-set' }>;
export const defaultFrameTextSizes: Record<FrameTextArea, number> = { title: 43, type: 32, rules: 31, stats: 34, artist: 19 };
export const defaultFrameTextAlign = (area: FrameTextArea) => area === 'stats' ? 'center' : 'left';

export function templateAppearance(frame: TemplateFrame): TemplateAppearance {
  return frame.appearance ? { ...frame.appearance, fontFamily: frame.appearance.fontFamily ?? 'Georgia' } : {
    zones: templateZones[frame.template], textColor: '#fff8ea', fontFamily: 'Georgia', divider: true,
    titleShade: 0.96, rulesShade: 0.96
  };
}

export function customFrameAppearance(zones: Zones, textColor = '#24211e', fontFamily = 'Georgia'): TemplateAppearance {
  return { zones, textColor, fontFamily, divider: false, titleShade: 0, rulesShade: 0 };
}

export function frameAppearance(frame: TemplateFrame | CustomFrame): TemplateAppearance;
export function frameAppearance(frame: Card['frame']): TemplateAppearance | undefined;
export function frameAppearance(frame: Card['frame']): TemplateAppearance | undefined {
  if (frame.kind === 'template') return templateAppearance(frame);
  const custom = frame.kind === 'color-set' ? frame.set : frame.kind === 'custom' ? frame : undefined;
  return custom && (custom.appearance ?? customFrameAppearance(custom.zones, custom.textColor, custom.fontFamily));
}

export function newTemplate(template: Template, fullArtBase?: TemplateAppearance): TemplateFrame {
  return { kind: 'template', template, appearance: template === 'full-art' ? fullArtBase : undefined };
}

export function withProjectTemplate(card: Card, appearances: Project['templateAppearances']): Card {
  if (card.frame.kind !== 'template') return card;
  const appearance = appearances?.[card.frame.template];
  return appearance ? { ...card, frame: { ...card.frame, appearance } } : card;
}

export function presetFrame({ asset, zones, textColor, fontFamily, appearance }: Preset): Extract<CustomFrame, { kind: 'custom' }> {
  return { kind: 'custom', asset, zones, textColor, fontFamily, ...(appearance && { appearance }) };
}

export function projectFrame(project: Project): Card['frame'] | undefined {
  const frame = project.frame;
  if (frame?.kind === 'color-set') {
    const set = project.frameSets?.find(item => item.id === frame.id);
    return set && { kind: 'color-set', set };
  }
  if (frame?.kind === 'preset') {
    const preset = project.presets.find(item => item.id === frame.id);
    if (!preset) return;
    return presetFrame(preset);
  }
  if (frame?.kind === 'template' && !frame.appearance) return newTemplate(frame.template, project.fullArtBase);
  return frame;
}

export function frameMirrorFor(card: Card, back: boolean) {
  return back ? card.backSide?.frameMirror : card.frameMirror;
}

function canMirrorSide(card: Card, back: boolean) {
  return card.source.editable && (!back || !!card.source.images.back);
}

function mirrorSource(cards: ReadonlyMap<string, Card>, card: Card, back: boolean, mirror: FrameMirror) {
  const source = cards.get(mirror.cardId);
  if (!source || source.id === card.id || !canMirrorSide(card, back) || !canMirrorSide(source, mirror.back)
    || frameMirrorFor(source, mirror.back)) return;
  return source;
}

export function clearInvalidFrameMirrors(project: Project): Project {
  const cards = new Map(project.cards.map(card => [card.id, card]));
  const updated = project.cards.map(card => {
    const front = card.frameMirror;
    const rear = card.backSide?.frameMirror;
    const clearFront = front && !mirrorSource(cards, card, false, front);
    const clearBack = rear && !mirrorSource(cards, card, true, rear);
    if (!clearFront && !clearBack) return card;
    return { ...card, frameMirror: clearFront ? undefined : front,
      backSide: clearBack && card.backSide ? { ...card.backSide, frameMirror: undefined } : card.backSide };
  });
  return updated.some((card, index) => card !== project.cards[index]) ? { ...project, cards: updated } : project;
}

export function projectFrameResolver(project: Project, frame = projectFrame(project)) {
  const cards = new Map(project.cards.map(card => [card.id, card]));
  const apply = (side: Card) => withProjectTemplate(frame && side.source.editable ? { ...side, frame } : side, project.templateAppearances);

  function sourceSide(card: Card, back: boolean, mirror: FrameMirror) {
    const source = mirrorSource(cards, card, back, mirror);
    return source && apply(cardSide(source, mirror.back));
  }

  function mirrorOptions(card: Card, back: boolean): FrameMirror[] {
    if (!canMirrorSide(card, back)) return [];
    const isSource = project.cards.some(child => [false, true].some(rear => {
      const mirror = frameMirrorFor(child, rear);
      return mirror?.cardId === card.id && mirror.back === back;
    }));
    if (isSource) return [];
    return project.cards.flatMap(source => [false, true].flatMap(rear => {
      const mirror = { cardId: source.id, back: rear };
      const side = sourceSide(card, back, mirror);
      return side && side.frame.kind !== 'printing' ? [mirror] : [];
    }));
  }

  function resolveSide(card: Card, back: boolean) {
    const local = apply(cardSide(card, back));
    const mirror = local.frameMirror;
    const source = mirror && sourceSide(card, back, mirror);
    return source && source.frame.kind !== 'printing' ? { ...local, ...sideFrameSettings(source) } : local;
  }

  function resolve(card: Card): Card {
    const front = resolveSide(card, false);
    if (!canMirrorSide(card, true)) return front;
    return { ...front, backSide: sideState(resolveSide(card, true)) };
  }

  return { resolve, mirrorOptions, sourceSide };
}

export function withProjectFrame(card: Card, project: Project, frame = projectFrame(project)): Card {
  return projectFrameResolver(project, frame).resolve(card);
}

export function projectCards(project: Project, cards = project.cards): Card[] {
  return cards.map(projectFrameResolver(project).resolve);
}
