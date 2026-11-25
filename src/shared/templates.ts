import type { Card, FrameTextArea, Preset, Project, Template, TemplateAppearance, Zones } from './model.js';
import { cardSide, sideState } from './model.ts';

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

export function withProjectFrame(card: Card, project: Project, frame = projectFrame(project)): Card {
  const apply = (side: Card) => withProjectTemplate(frame && side.source.editable ? { ...side, frame } : side, project.templateAppearances);
  const front = apply(card);
  if (!card.source.images.back || !card.source.editable) return front;
  return { ...front, backSide: sideState(apply(cardSide(card, true))) };
}

export function projectCards(project: Project, cards = project.cards): Card[] {
  const frame = projectFrame(project);
  return cards.map(card => withProjectFrame(card, project, frame));
}
