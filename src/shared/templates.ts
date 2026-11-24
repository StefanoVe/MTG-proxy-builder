import type { Card, Project, Template, TemplateAppearance, Zones } from './model.js';

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

export function templateAppearance(frame: TemplateFrame): TemplateAppearance {
  return frame.appearance ? { ...frame.appearance, fontFamily: frame.appearance.fontFamily ?? 'Georgia' } : {
    zones: templateZones[frame.template], textColor: '#fff8ea', fontFamily: 'Georgia', divider: true,
    titleShade: 0.96, rulesShade: 0.96
  };
}

export function newTemplate(template: Template, fullArtBase?: TemplateAppearance): TemplateFrame {
  return { kind: 'template', template, appearance: template === 'full-art' ? fullArtBase : undefined };
}

export function withProjectTemplate(card: Card, appearances: Project['templateAppearances']): Card {
  if (card.frame.kind !== 'template') return card;
  const appearance = appearances?.[card.frame.template];
  return appearance ? { ...card, frame: { ...card.frame, appearance } } : card;
}
