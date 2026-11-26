import test from 'node:test';
import assert from 'node:assert/strict';
import { blankCard, createCard, createProject, frameSetAssetsSchema, isCardModified, projectSchema, sideFrameSettings } from '../src/shared/model.ts';
import type { Card, FrameSet } from '../src/shared/model.ts';
import { colorFrameLayers, frameSetAsset } from '../src/shared/frame-colors.ts';
import { projectCards, usesProjectFrame } from '../src/shared/templates.ts';

const id = (char: string) => char.repeat(64);
const catalogCard = (): Card => createCard({ ...blankCard, name: 'Bolt', printingId: 'p1', images: { front: id('f') } });
const zones = { art: { x: 0, y: 0, w: 100, h: 100 }, title: { x: 6, y: 4, w: 88, h: 5 }, type: { x: 6, y: 67, w: 88, h: 4 },
  rules: { x: 6, y: 73, w: 88, h: 17 }, stats: { x: 79, y: 91, w: 15, h: 4 } };

test('frame sets accept partial color slots but not an empty set', () => {
  assert.equal(frameSetAssetsSchema.safeParse({ C: id('c') }).success, true);
  assert.equal(frameSetAssetsSchema.safeParse({ R: id('d') }).success, true);
  assert.equal(frameSetAssetsSchema.safeParse({}).success, false);
});

test('missing frame set colors fall back to colorless, then to any image', () => {
  const set = { id: crypto.randomUUID(), name: 'Set', mix: true, zones, assets: { C: id('c'), R: id('d') } } as FrameSet;
  assert.equal(frameSetAsset(set, 'R'), id('d'));
  assert.equal(frameSetAsset(set, 'U'), id('c'));
  const onlyRed = { ...set, assets: { R: id('d') } } as FrameSet;
  assert.equal(frameSetAsset(onlyRed, 'G'), id('d'));
  // Two missing colors resolve to the same image: draw it once.
  assert.deepEqual(colorFrameLayers(set, ['U', 'G']), [id('c')]);
});

test('the original-printing project frame applies to catalog cards and leaves custom cards alone', () => {
  const project = { ...createProject('Deck'), frame: { kind: 'printing' as const } };
  const catalog = { ...catalogCard(), frame: { kind: 'template' as const, template: 'full-art' as const } };
  const custom = createCard({ ...blankCard, name: 'Custom' });
  project.cards = [catalog, custom];
  assert.equal(projectSchema.safeParse(project).success, true);
  const [resolvedCatalog, resolvedCustom] = projectCards(project);
  assert.equal(resolvedCatalog.frame.kind, 'printing');
  assert.equal(resolvedCustom.frame.kind, 'modern');
});

test('a card with frameOverride keeps its own frame under a shared project frame', () => {
  const project = { ...createProject('Deck'), frame: { kind: 'template' as const, template: 'extended-art' as const } };
  const own = { ...createCard({ ...blankCard, name: 'Own' }), frameOverride: true, frame: { kind: 'template' as const, template: 'full-art' as const } };
  const shared = createCard({ ...blankCard, name: 'Shared' });
  project.cards = [own, shared];
  const [resolvedOwn, resolvedShared] = projectCards(project);
  assert.equal(resolvedOwn.frame.kind === 'template' && resolvedOwn.frame.template, 'full-art');
  assert.equal(resolvedShared.frame.kind === 'template' && resolvedShared.frame.template, 'extended-art');
  assert.equal(usesProjectFrame(own, project.cards[1].frame), false);
});

test('per-card text sizes and hidden artist credit are saved, copied and count as modifications', () => {
  const card = { ...createCard({ ...blankCard, name: 'Sized' }), textStyleOverrides: { rules: { size: 22 } }, hiddenZones: ['artist' as const] };
  const project = { ...createProject('Deck'), cards: [card] };
  assert.equal(projectSchema.safeParse(project).success, true);
  assert.deepEqual(sideFrameSettings(card).textStyleOverrides, { rules: { size: 22 } });
  assert.equal(isCardModified(card), true);
  assert.equal(isCardModified({ ...card, textStyleOverrides: { rules: {} }, hiddenZones: [] }), false);
});

test('projects saved before the new optional fields still parse unchanged', () => {
  const legacy = { ...createProject('Old'), cards: [createCard({ ...blankCard, name: 'Old card' })],
    frameSets: [{ id: crypto.randomUUID(), name: 'Full', mix: true, zones,
      assets: { W: id('1'), U: id('2'), B: id('3'), R: id('4'), G: id('5'), C: id('6') } }] };
  const parsed = projectSchema.parse(JSON.parse(JSON.stringify(legacy)));
  assert.equal(parsed.cards[0].frameOverride, undefined);
  assert.equal(Object.keys(parsed.frameSets![0].assets).length, 6);
});
