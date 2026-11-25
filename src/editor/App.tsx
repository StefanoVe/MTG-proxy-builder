import { Dropdown } from './Dropdown.js';
import { Select } from './Select.js';
import type { Locale, MessageKey } from '../shared/i18n.js';
import { errorMessage, LocalizedError } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { clearInvalidFrameMirrors, customFrameAppearance, frameAppearance, frameMirrorFor, presetFrame, projectCards, projectFrame, projectFrameResolver, templateAppearance } from '../shared/templates.js';
import type { CustomFrame } from '../shared/templates.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { assetURL, blankCard, cardSide, createCard, createProject, defaultCrop, defaultZones, isCardModified, rebaseBackSide, sideFrameSettings, sideOrientation, sideState } from '../shared/model.js';
import type { Card, DeckEntry, FrameSet, Printing, Project, Rect, Template, TemplateAppearance } from '../shared/model.js';
import { matchesCardSearch, parseDeckRows } from '../shared/deck.js';
import { cardsWithSharedArt } from '../shared/shared-art.js';
import { loadDeckCards } from '../shared/deck-import.js';
import { FrameSets } from './FrameSets.js';
import { FrameGallery } from './FrameGallery.js';
import { Batch } from './Batch.js';
import { Inspector } from './Inspector.js';
import type { FrameElement } from './Inspector.js';
import { Preview, PreviewGuidesButton } from './Preview.js';
import { PrintPanel } from './PrintPanel.js';
import type { PrintDraft } from './PrintPanel.js';
import { PrintChoices } from './PrintChoices.js';
import { CardExportPanel } from './CardExportPanel.js';
import type { CardExportDraft } from './CardExportPanel.js';
import { Icon } from './Icon.js';
import { TemplateEditor } from './TemplateEditor.js';
import type { FrameEditorTab } from './TemplateEditor.js';
import { ProjectFrameSelect } from './ProjectFrameSelect.js';
import { pngArtZone } from './compose.js';

type ExportMode = 'sheet' | 'cards';
type Panel = 'deck' | 'batch' | 'print' | ExportMode | 'printings' | 'frames' | 'templates' | 'switch-project';
type WorkspacePane = 'deck' | 'preview' | 'properties';
type FrameSettings = Pick<Card, 'zoneOverrides' | 'hiddenZones' | 'dividerOverrides'>;
const workspacePanes: WorkspacePane[] = ['deck', 'preview', 'properties'];
const usesArt = (card: Card) => card.source.editable && card.frame.kind !== 'printing';
const imageKey = (projectId: string, card: Card) => `${projectId}/${card.id}/${card.source.printingId}/${usesArt(card) ? 'art' : 'scan'}`;
const needsImages = (card: Card) => !!card.source.printingId && (usesArt(card)
  ? !(card.art || card.source.images.art) : !card.source.images.front);
const mirrorValue = (cardId: string, back: boolean) => `${cardId}/${back ? 'back' : 'front'}`;
function editableSource(source: Card['source']): Card['source'] {
  if (source.editable) return source;
  const sections = ['split', 'aftermath', 'adventure'].includes(source.layout) ? source.details?.faces : undefined;
  const rules = !source.rules && sections?.length ? sections.map(face => [
    [face.name, face.mana].filter(Boolean).join(' · '), face.type, face.rules
  ].filter(Boolean).join('\n')).join('\n\n') : source.rules;
  return { ...source, editable: true, rules };
}

function Dialog({ title, children, close, busy, wide, back }: {
  title: string; children: ReactNode; close: () => void; busy: boolean; wide?: boolean; back?: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => { heading.current?.focus(); }, [title]);
  return <dialog ref={ref} className={wide ? "dialog dialog-wide" : "dialog"} onCancel={event => { event.preventDefault(); if (!busy) close(); }} aria-labelledby="dialog-title">
    <header><div className="dialog-heading">
      {back && <button className="icon-button" aria-label={t('backToExport')} title={t('backToExport')} onClick={back} disabled={busy}><Icon name="undo" /></button>}
      <h2 id="dialog-title" ref={heading} tabIndex={-1}>{title}</h2>
    </div><button className="icon-button" aria-label={t('close')} title={t('close')} onClick={close} disabled={busy}><Icon name="close" /></button></header>
    <div className="dialog-body">{children}</div>
  </dialog>;
}

const titles: Record<Panel, MessageKey> = { deck: 'importList', batch: 'batchEdit', print: 'exportProject', sheet: 'exportPdf', cards: 'exportCardImages', printings: 'chooseEdition', frames: 'chooseFrame', templates: 'projectFrameEditor', 'switch-project': 'unsavedChanges' };

function DeckQuantity({ card, change }: { card: Card; change: (count: number) => void }) {
  const { t } = useI18n();
  const [rejected, setRejected] = useState(false);
  const errorId = `quantity-error-${card.id}`;
  return <>
    <input type="number" aria-label={t('cardQuantity', { name: card.fields.name || t('untitledCard') })}
      aria-describedby={rejected ? errorId : undefined} min={1} max={999} defaultValue={card.count}
      onChange={() => setRejected(false)} onBlur={event => {
        const count = event.target.valueAsNumber;
        if (Number.isInteger(count) && count >= 1 && count <= 999) {
          if (count !== card.count) change(count);
        } else {
          event.target.value = String(card.count);
          setRejected(true);
        }
      }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
    <small id={errorId} className="deck-quantity-error error" role="status">{rejected ? t('quantityRange') : ''}</small>
  </>;
}

function projectTemplate(project: Project, template: Template, active?: Card) {
  const sharedFrame = projectFrame(project);
  if (sharedFrame?.kind === 'template' && sharedFrame.template === template) {
    return templateAppearance({ ...sharedFrame, appearance: project.templateAppearances?.[template] ?? sharedFrame.appearance });
  }
  const frame = active?.frame;
  const selectedAppearance = frame?.kind === 'template' && frame.template === template ? frame.appearance : undefined;
  const legacyFrame = project.cards.find(card =>
    card.frame.kind === 'template' && card.frame.template === template && card.frame.appearance)?.frame;
  const appearance = project.templateAppearances?.[template]
    ?? (template === 'full-art' ? project.fullArtBase : undefined)
    ?? selectedAppearance
    ?? (legacyFrame?.kind === 'template' ? legacyFrame.appearance : undefined);
  return templateAppearance({ kind: 'template', template, appearance });
}

function editableCustomFrame(project: Project, selection: string, side?: Card): CustomFrame | undefined {
  if (selection === 'project') return project.frame?.kind === 'custom' ? project.frame : undefined;
  if (selection === 'card') return side?.frame.kind === 'custom' ? side.frame : undefined;
  if (selection.startsWith('preset/')) {
    const preset = project.presets.find(item => item.id === selection.slice(7));
    return preset && presetFrame(preset);
  }
  const set = project.frameSets?.find(item => item.id === selection);
  if (set) return { kind: 'color-set', set };
  if (side?.frame.kind === 'color-set' && side.frame.set.id === selection) return side.frame;
}

export function App() {
  const { t, locale, setLocale } = useI18n();
  const listSearchRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const cardHeading = useRef<HTMLHeadingElement>(null);
  const pendingCardFocus = useRef<string>(null);
  const [project, setProject] = useState<Project | null>(null);
  const live = useRef<Project | null>(null);
  const [projects, setProjects] = useState<Array<Pick<Project, 'id' | 'name'>>>([]);
  const [systemFonts, setSystemFonts] = useState(['Arial', 'Arial Black', 'Calibri', 'Cambria', 'Georgia', 'Helvetica', 'Times New Roman', 'Verdana']);
  const [active, setActive] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zone, setZone] = useState<FrameElement>();
  const [back, setBack] = useState(false);
  const [compare, setCompare] = useState(false);
  const [showPreviewGuides, setShowPreviewGuides] = useState(true);
  const togglePreviewGuides = () => setShowPreviewGuides(visible => !visible);
  const [panel, setPanel] = useState<Panel>();
  const [switchTarget, setSwitchTarget] = useState('');
  const [pdfDraft, setPdfDraft] = useState<PrintDraft>();
  const [zipDraft, setZipDraft] = useState<CardExportDraft>();
  const [exportRepair, setExportRepair] = useState<ExportMode>();
  const [editorTab, setEditorTab] = useState<FrameEditorTab>('full-art');
  const [customFrameId, setCustomFrameId] = useState('');
  const [copiedFrame, setCopiedFrame] = useState<{ frame: Card['frame']; settings: FrameSettings }>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ key: MessageKey; count?: number }>();
  const [busy, setBusy] = useState(false);
  const [draggingImage, setDraggingImage] = useState(false);
  const [query, setQuery] = useState('');
  const [searchRevision, setSearchRevision] = useState(0);
  const [listQuery, setListQuery] = useState('');
  const [modificationFilter, setModificationFilter] = useState<'all' | 'unmodified' | 'modified'>('all');
  const [deckCollapsed, setDeckCollapsed] = useState(false);
  const [workspacePane, setWorkspacePane] = useState<WorkspacePane>('preview');
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const [searchFeedback, setSearchFeedback] = useState<Error>();
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [addingCatalogCard, setAddingCatalogCard] = useState(false);
  const [imageLoads, setImageLoads] = useState<Set<string>>(new Set());
  const attemptedImages = useRef(new Set<string>());
  const [choices, setChoices] = useState<Printing[]>([]);
  const [deckText, setDeckText] = useState('');
  const [deckErrors, setDeckErrors] = useState<string[]>([]);
  const [deckProgress, setDeckProgress] = useState('');
  const [deckImported, setDeckImported] = useState(0);
  const [history, setHistory] = useState<Project[]>([]);
  const revision = useRef(0);
  const lastHistory = useRef(0);
  const card = project?.cards.find(item => item.id === active) ?? project?.cards[0];
  const sharedFrame = project ? projectFrame(project) : undefined;
  const usesSharedFrame = !!sharedFrame && !!card?.source.editable;
  const frameResolver = useMemo(() => project && projectFrameResolver(project), [project]);
  const renderedCard = useMemo(() => card && frameResolver ? frameResolver.resolve(card) : undefined, [card, frameResolver]);
  const mirror = card && frameMirrorFor(card, back);
  const mirrorSource = card && mirror && frameResolver ? frameResolver.sourceSide(card, back, mirror) : undefined;
  const forEditing = (item: Card) => {
    const side = cardSide(item, back);
    return side.source.editable ? side : { ...side, source: editableSource(side.source) };
  };
  const selectedCard = card ? forEditing(card) : undefined;
  const cardSet = !mirror && selectedCard?.frame.kind === 'color-set' ? selectedCard.frame.set : undefined;
  const selectedRendered = renderedCard ? forEditing(renderedCard) : undefined;
  const selectedFrame = selectedRendered?.frame;
  const canCopyFrame = selectedFrame?.kind === 'custom' || selectedFrame?.kind === 'color-set' || selectedFrame?.kind === 'template';
  const needsDownload = (item: Card) => !!project && needsImages(item) && !attemptedImages.current.has(imageKey(project.id, item));
  const nextImageCard = [selectedRendered, renderedCard].find(item => item && needsDownload(item))
    ?? project?.cards.filter(item => sharedFrame || item.frameMirror || item.backSide?.frameMirror)
      .map(item => frameResolver!.resolve(item))
      .flatMap(item => item.source.images.back && item.source.editable ? [item, cardSide(item, true)] : [item]).find(needsDownload);
  const loadingImages = !!nextImageCard || imageLoads.size > 0;
  const editedCustom = panel === 'templates' && editorTab === 'custom' && project
    ? editableCustomFrame(project, customFrameId, mirror ? undefined : selectedCard) : undefined;
  const editedAppearance = panel === 'templates' && project
    ? editorTab === 'custom' ? editedCustom ? frameAppearance(editedCustom) : customFrameAppearance(defaultZones)
      : projectTemplate(project, editorTab, card)
    : undefined;

  useEffect(() => {
    if (!card || panel || pendingCardFocus.current !== card.id || !cardHeading.current) return;
    pendingCardFocus.current = null;
    cardHeading.current.focus();
  }, [card?.id, panel, workspacePane]);

  function showProject(value: Project) {
    revision.current++;
    live.current = value;
    setProject(value);
    setActive(value.cards[0]?.id ?? '');
    setWorkspacePane('preview');
    setSelected(new Set());
    setListQuery('');
    setHistory([]);
    lastHistory.current = 0;
    pendingCardFocus.current = null;
    setQuery('');
    setChoices([]);
    setSearchFeedback(undefined);
    setZone(undefined);
    setBack(false);
    setCustomFrameId('');
    setCopiedFrame(undefined);
    clearExportRepair();
    setSaving(false);
    setSaveError('');
    setNotice(undefined);
    localStorage.setItem('active-project', value.id);
  }
  useEffect(() => {
    void window.proxy.projects().then(async list => {
      setProjects(list);
      const last = list.find(item => item.id === localStorage.getItem('active-project')) ?? list[0];
      showProject(last ? await window.proxy.open(last.id) : createProject(t('untitledDeck')));
    }).catch(cause => { showProject(createProject(t('untitledDeck'))); setError(errorMessage(cause, locale)); });
  }, []);
  useEffect(() => { void window.proxy.fonts().then(setSystemFonts).catch(() => {}); }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void window.proxy.projects().then(list => { if (active) setProjects(list); }).catch(() => {});
    };
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, []);

  function openCatalogSearch(hasCard: boolean) {
    setWorkspacePane(hasCard ? 'deck' : 'preview');
    setSearchFocusRequest(request => request + 1);
  }
  useEffect(() => {
    if (searchFocusRequest) searchRef.current?.focus();
  }, [searchFocusRequest]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        if (!panel && history.length && !typing) { event.preventDefault(); undo(); }
      } else if (event.key === '/' && !typing && !panel) {
        event.preventDefault(); openCatalogSearch(!!project?.cards.length);
      } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !panel && project?.cards.length && !busy && !loadingImages) {
        event.preventDefault(); setError(''); setPanel('print');
      } else if (event.key === 'Escape' && !panel && target === document.body) {
        setSelected(new Set());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [history, panel, project, busy, loadingImages]);

  function persist(next: Project) {
    const current = ++revision.current;
    setSaving(true);
    setSaveError('');
    return window.proxy.save(next).then(() => {
      setProjects(list => [...list.filter(item => item.id !== next.id), { id: next.id, name: next.name }]
        .sort((a, b) => a.name.localeCompare(b.name, 'it')));
      return true;
    }).catch(cause => {
      if (current === revision.current) setSaveError(errorMessage(cause, locale));
      return false;
    }).finally(() => { if (current === revision.current) setSaving(false); });
  }

  function switchProject(id: string) {
    setSwitchTarget('');
    setPanel(undefined);
    if (id === 'new') {
      const next = createProject(t('untitledDeck'));
      showProject(next);
      void persist(next);
    } else {
      void action(async () => { showProject(await window.proxy.open(id)); });
    }
  }

  async function retryProjectSwitch() {
    if (live.current && await persist(live.current)) switchProject(switchTarget);
  }

  function commit(change: (project: Project) => Project, group = false) {
    if (!live.current) return;
    const previous = live.current;
    const next = change(previous);
    if (next === previous) return;
    const time = Date.now();
    if (!group || time - lastHistory.current > 800) setHistory(list => [...list.slice(-39), previous]);
    lastHistory.current = group ? time : 0;
    live.current = next;
    setProject(next);
    persist(next);
  }

  function undo() {
    const last = history.at(-1);
    if (!last) return;
    live.current = last;
    setProject(last);
    setHistory(history.slice(0, -1));
    setSelected(new Set());
    setZone(undefined);
    setBack(false);
    setNotice({ key: 'undoDone' });
    persist(last);
  }

  function update(id: string, patch: Partial<Card>, group = false) {
    commit(value => clearInvalidFrameMirrors({ ...value, cards: value.cards.map(item => item.id === id ? { ...item, ...patch } : item) }), group);
  }

  function updateSide(id: string, patch: Partial<Card>, group = false) {
    commit(value => ({ ...value, cards: value.cards.map(item => {
      if (item.id !== id) return item;
      const side = cardSide(item, back);
      const updated = { ...side, ...patch, ...(side.frameMirror && sideFrameSettings(side)) };
      return back ? { ...item, backSide: sideState(updated) }
        : { ...updated, source: patch.source ?? editableSource(item.source) };
    }) }), group);
  }

  function changeFrameMirror(value: string) {
    if (!card) return;
    commit(current => {
      const item = current.cards.find(item => item.id === card.id);
      if (!item) return current;
      const next = value ? projectFrameResolver(current).mirrorOptions(item, back)
        .find(option => mirrorValue(option.cardId, option.back) === value) : undefined;
      if (value && !next || !value && !frameMirrorFor(item, back)) return current;
      const updated = back ? { ...item, backSide: sideState({ ...cardSide(item, true), frameMirror: next }) }
        : { ...item, frameMirror: next };
      return { ...current, cards: current.cards.map(entry => entry.id === item.id ? updated : entry) };
    });
    setZone(undefined);
  }

  function activate(id: string) {
    setActive(id);
    setZone(undefined);
    setBack(false);
    if (window.matchMedia('(max-width: 620px)').matches) {
      if (document.activeElement?.closest('.deck')) pendingCardFocus.current = id;
      setWorkspacePane('preview');
    }
  }

  function activateAndFocus(id: string) {
    pendingCardFocus.current = id;
    activate(id);
  }

  function openCardForExport(mode: ExportMode, id: string, back: boolean) {
    activateAndFocus(id);
    setBack(back);
    setExportRepair(mode);
    setPanel(undefined);
  }

  function clearExportRepair() {
    setPdfDraft(undefined);
    setZipDraft(undefined);
    setExportRepair(undefined);
  }

  function finishExport(key: 'pdfSaved' | 'zipSaved') {
    clearExportRepair();
    setNotice({ key });
    setPanel(undefined);
  }

  function addCards(additions: Card[], focus = false) {
    if (!additions.length) return;
    if ((live.current?.cards.length ?? 0) + additions.length > 1500) throw new LocalizedError('projectLimit');
    commit(value => ({ ...value, cards: [...value.cards, ...additions] }));
    if (focus) activateAndFocus(additions[0].id);
    else activate(additions[0].id);
  }

  async function action(run: () => Promise<void>) {
    setError('');
    setNotice(undefined);
    setBusy(true);
    try { await run(); }
    catch (cause) { setError(errorMessage(cause, locale)); }
    finally { setBusy(false); }
  }

  async function loadPrintingImages(card: Card) {
    const projectId = live.current?.id;
    if (!projectId) return;
    const key = imageKey(projectId, card);
    if (imageLoads.has(key)) return;
    attemptedImages.current.add(key);
    setImageLoads(loads => new Set(loads).add(key));
    let images: Card['source']['images'];
    try {
      images = (await window.proxy.card(card.source.printingId)).images;
    } catch (cause) {
      images = { error: errorMessage(cause, locale).slice(0, 300) };
    } finally {
      setImageLoads(loads => {
        const next = new Set(loads);
        next.delete(key);
        return next;
      });
    }

    const current = live.current;
    if (!current || current.id !== projectId || !current.cards.some(item => item.id === card.id && item.source.printingId === card.source.printingId)) return;
    const next = { ...current, cards: current.cards.map(item => item.id === card.id
      ? { ...item, source: { ...item.source, images: {
        front: images.front ?? item.source.images.front, back: images.back ?? item.source.images.back,
        art: images.art ?? item.source.images.art, backArt: images.backArt ?? item.source.images.backArt, error: images.error
      } } } : item) };
    live.current = next;
    setProject(next);
    persist(next);
  }

  useEffect(() => {
    if (nextImageCard && !imageLoads.size && needsDownload(nextImageCard)) void loadPrintingImages(nextImageCard);
  }, [nextImageCard, imageLoads.size]);

  useEffect(() => {
    if (compare && renderedCard?.source.printingId && !(back ? renderedCard.source.images.back : renderedCard.source.images.front)
      && !imageLoads.size && !attemptedImages.current.has(`compare/${renderedCard.id}/${back}`)) {
      attemptedImages.current.add(`compare/${renderedCard.id}/${back}`);
      void loadPrintingImages(renderedCard);
    }
  }, [compare, renderedCard, back, imageLoads.size]);

  useEffect(() => {
    const name = query.trim();
    let current = true;
    setChoices([]);
    setSearchFeedback(undefined);
    setCatalogLoading(false);
    if (!name) return () => { current = false; };
    const timer = window.setTimeout(() => {
      setCatalogLoading(true);
      void window.proxy.search(name).then(result => {
        if (!current) return;
        const options = [...(result.exact ? [result.exact] : []), ...result.choices];
        setChoices(options);
        if (!options.length) setSearchFeedback(new LocalizedError('noCardsFound'));
      }).catch(cause => {
        if (current) setSearchFeedback(cause instanceof Error ? cause : new Error(String(cause)));
      }).finally(() => {
        if (current) setCatalogLoading(false);
      });
    }, 350);
    return () => { current = false; window.clearTimeout(timer); };
  }, [query, searchRevision]);

  async function lookup(printing: Printing) {
    if (busy) return;
    searchRef.current?.focus();
    setSearchFeedback(undefined);
    setAddingCatalogCard(true);
    await action(async () => {
      try {
        const card = createCard(await window.proxy.card(printing.id, false));
        addCards([card], true);
        setQuery('');
        setChoices([]);
      } catch (cause) {
        setSearchFeedback(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
    setAddingCatalogCard(false);
  }

  const [editions, setEditions] = useState<Printing[]>([]);
  function choosePrinting(view: 'printings' | 'frames') {
    if (!card) return;
    setEditions([]);
    setPanel(view);
    void action(async () => { setEditions(await window.proxy.printings(card.source.printingId)); });
  }

  function replacePrinting(printing: Printing, frameOnly = false, keepArt = false) {
    if (!card) return;
    void action(async () => {
      const source = await window.proxy.card(printing.id);
      const fields = { ...card.fields };
      for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
        const previous = key === 'name' ? card.source.details?.printedName ?? card.source.name : card.source[key];
        if (card.fields[key] === previous) fields[key] = key === 'name' ? source.details?.printedName ?? source.name : source[key];
      }
      const frame = !card.frameMirror && (frameOnly || card.frame.kind === 'printing')
        ? (source.printingId === card.source.printingId && card.frame.kind === 'printing' ? card.frame : { kind: 'printing' as const })
        : card.frame;
      const changed = source.printingId !== card.source.printingId;
      const art = frameOnly
        ? keepArt ? card.art ?? (changed ? card.source.images.art : undefined) : undefined
        : card.art;
      update(card.id, { source, fields, frame, art, crop: art ? card.crop : defaultCrop, backSide: rebaseBackSide(card, source) });
      setZone(undefined);
      setBack(false);
      setPanel(undefined);
    });
  }

  async function selectAssets(frame: boolean) {
    if (busy) return undefined;
    setError('');
    try {
      const { assets, errors } = await window.proxy.images('single', frame);
      if (errors.length) setError(errors.join('\n'));
      return assets[0];
    } catch (cause) {
      setError(errorMessage(cause, locale));
      return undefined;
    }
  }

  function changeProjectFrame(frame: Project['frame']) {
    commit(value => ({ ...value, frame }));
    setZone(undefined);
    setBack(false);
  }

  function importProjectFrame() {
    void action(async () => {
      const { assets, errors } = await window.proxy.images('single', true);
      if (errors.length) setError(errors.join('\n'));
      const asset = assets[0];
      if (!asset) return;
      const art = await pngArtZone(asset.id).catch(() => undefined);
      changeProjectFrame({ kind: 'custom', asset: asset.id, zones: art ? { ...defaultZones, art } : defaultZones });
    });
  }

  function saveColorSet(set: FrameSet, applyTo: Card[] = [], group = false) {
    const selected = new Set(applyTo.filter(card => card.source.editable && !card.frameMirror).map(card => card.id));
    commit(value => {
      const sets = value.frameSets ?? [];
      const frameSets = sets.some(item => item.id === set.id) ? sets.map(item => item.id === set.id ? set : item)
        : sets.length < 200 ? [...sets, set] : sets;
      return { ...value, frameSets, cards: value.cards.map(item => {
        const replaceFront = !item.frameMirror && (selected.has(item.id) || (item.frame.kind === 'color-set' && item.frame.set.id === set.id));
        const replaceBack = !item.backSide?.frameMirror && item.backSide?.frame.kind === 'color-set' && item.backSide.frame.set.id === set.id;
        if (!replaceFront && !replaceBack) return item;
        const frame = { kind: 'color-set' as const, set };
        return { ...item, frame: replaceFront ? frame : item.frame,
          backSide: replaceBack && item.backSide ? { ...item.backSide, frame } : item.backSide };
      }) };
    }, group);
  }

  function manageFrameSets() {
    const frame = project?.frame;
    const set = mirror ? undefined : selectedRendered?.frame;
    const selection = frame?.kind === 'custom' ? 'project'
      : frame?.kind === 'preset' ? 'preset/' + frame.id
      : frame?.kind === 'color-set' ? frame.id
      : set?.kind === 'color-set' ? set.set.id
      : set?.kind === 'custom' && selectedCard?.frame.kind === 'custom' ? 'card' : '';
    setCustomFrameId(selection);
    editTemplate('custom');
  }

  function selectEditorTab(next: FrameEditorTab) {
    lastHistory.current = 0;
    setEditorTab(next);
  }

  function editTemplate(next: FrameEditorTab) {
    selectEditorTab(next);
    setError('');
    setPanel('templates');
  }

  function changeTemplate(update: (appearance: TemplateAppearance) => TemplateAppearance) {
    const value = live.current;
    if (!value || value.id !== project?.id) return;
    if (editorTab !== 'custom') {
      commit(previous => ({
        ...previous,
        templateAppearances: { ...previous.templateAppearances, [editorTab]: update(projectTemplate(previous, editorTab, card)) }
      }), true);
      return;
    }
    const current = value.cards.find(item => item.id === card?.id);
    const frame = editableCustomFrame(value, customFrameId, current && !frameMirrorFor(current, back) ? cardSide(current, back) : undefined);
    if (!frame) return;
    const appearance = update(frameAppearance(frame));
    if (frame.kind === 'color-set') saveColorSet({ ...frame.set, appearance }, [], true);
    else if (customFrameId === 'project') commit(previous => ({ ...previous, frame: { ...frame, appearance } }), true);
    else if (customFrameId === 'card' && current) updateSide(current.id, { frame: { ...frame, appearance } }, true);
    else commit(previous => ({
      ...previous, presets: previous.presets.map(item => 'preset/' + item.id === customFrameId ? { ...item, appearance } : item)
    }), true);
  }

  function resetEditedFrame() {
    if (editedCustom) {
      const base = editedCustom.kind === 'color-set' ? editedCustom.set : editedCustom;
      changeTemplate(() => customFrameAppearance(base.zones, base.textColor, base.fontFamily));
    } else if (editorTab !== 'custom') {
      changeTemplate(() => templateAppearance({ kind: 'template', template: editorTab }));
    }
  }

  function changeZone(rect: Rect) {
    if (!selectedRendered || !zone || zone === 'artist' || mirror) return;
    if (selectedRendered.frame.kind === 'printing' && zone === 'art') {
      updateSide(selectedRendered.id, { frame: { ...selectedRendered.frame, artZone: rect } }, true);
    } else if (selectedRendered.frame.kind !== 'printing') {
      updateSide(selectedRendered.id, { zoneOverrides: { ...selectedRendered.zoneOverrides, [zone]: rect } }, true);
    }
  }

  function importDeck() {
    const { entries: names, invalidLines } = parseDeckRows(deckText);
    const errors = invalidLines.map(line => t('invalidDeckLine', line));
    setDeckErrors(errors);
    if (!names.length) return;
    if ((project?.cards.length ?? 0) + names.length > 1500) {
      setDeckErrors([...errors, t('projectLimit')]);
      return;
    }
    void action(async () => {
      setDeckProgress(t('findingCards'));
      try {
        const matches = await window.proxy.resolve(names);
        const resolved = await loadDeckCards(names, matches, id => window.proxy.card(id),
          complete => setDeckProgress(t('cardsProcessed', { done: complete, total: names.length })), locale);
        const additions = resolved.flatMap(item => item.card ? [item.card] : []);
        const failed = resolved.filter(item => item.error);
        addCards(additions);
        if (!failed.length && !invalidLines.length) { setDeckText(''); setPanel(undefined); }
        else {
          const entryText = ({ count, name, set, number }: DeckEntry) => `${count} ${name}${set ? ` (${set.toUpperCase()}) ${number}` : ''}`;
          const invalid = invalidLines.map(({ line }) => line);
          setDeckText([...failed.map(({ item }) => entryText(item)), ...invalid].join('\n'));
          setDeckErrors([...errors, ...failed.flatMap(({ error }) => error ? [error] : [])]);
        }
        if (additions.length) {
          const count = deckImported + additions.length;
          setDeckImported(count);
          setNotice({ key: count === 1 ? 'cardsImportedOne' : 'cardsImported', count });
        }
      } finally {
        setDeckProgress('');
      }
    });
  }

  function toggleSelected(id: string) {
    setSelected(list => {
      const next = new Set(list);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (!project) return <div className="initial" role="status">{t('openingApp')}</div>;
  const total = project.cards.reduce((sum, item) => sum + item.count, 0);
  const selection = project.cards.filter(item => selected.has(item.id));
  const scopeOptions = { currentId: card?.id, selectedIds: selection.map(item => item.id) };
  const visibleCards = project.cards.filter(item => (modificationFilter === 'all' || isCardModified(item) === (modificationFilter === 'modified')) && matchesCardSearch(item, listQuery, locale, t('untitledCard')));
  const visibleSelection = visibleCards.filter(item => selected.has(item.id));
  const hiddenSelectionCount = selection.length - visibleSelection.length;
  const allVisibleSelected = visibleCards.length > 0 && visibleSelection.length === visibleCards.length;
  const batchCards = selection.length ? selection : project.cards;
  const sharedArt = cardsWithSharedArt(project.cards);
  const loadingImage = !!selectedRendered && (imageLoads.has(imageKey(project.id, selectedRendered)) || needsDownload(selectedRendered));
  const missingArtwork = !!selectedRendered?.source.printingId && usesArt(selectedRendered)
    && !(selectedRendered.art || selectedRendered.source.images.art) && !selectedRendered.hiddenZones?.includes('art');
  const mirrorOptions = card && frameResolver ? frameResolver.mirrorOptions(card, back) : [];
  if (mirror && mirrorSource?.frame.kind === 'printing') mirrorOptions.push(mirror);
  const mirrorChoices = new Map(project.cards.map((item, index) => [item.id, { item, number: index + 1 }]));
  const mirrorLabels = mirrorOptions.map(option => {
    const value = mirrorValue(option.cardId, option.back);
    const { item, number } = mirrorChoices.get(option.cardId)!;
    const side = cardSide(item, option.back);
    const name = side.fields.name || t('untitledCard');
    const edition = side.source.set ? `${side.source.set.toUpperCase()} ${side.source.number}` : '';
    return { value, label: [name, edition, item.source.images.back ? t(option.back ? 'back' : 'front') : ''].filter(Boolean).join(' · '), number };
  });
  const mirrorLabelCounts = new Map<string, number>();
  for (const { label } of mirrorLabels) mirrorLabelCounts.set(label, (mirrorLabelCounts.get(label) ?? 0) + 1);
  const deckAddActions = <>
    <button className="icon-label" onClick={() => { setError(''); setDeckErrors([]); setDeckImported(0); setPanel('deck'); }} aria-label={t('importList')} disabled={busy}><Icon name="import" /><span>{t('importList')}</span></button>
    <button className="icon-label" onClick={() => addCards([createCard({ ...blankCard, name: t('untitledCard') })], !card)} aria-label={t('addBlankCard')} disabled={busy || project.cards.length >= 1500}><Icon name="add" /><span>{t('blankCard')}</span></button>
  </>;
  const catalogSearch = <div className="catalog-search" onKeyDown={event => {
    if (busy || !choices.length || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey) return;
    const inSearch = event.target === searchRef.current;
    if (!inSearch && !searchResultsRef.current?.contains(event.target as Node)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setChoices([]);
      searchRef.current?.focus();
    } else if (inSearch && event.key === 'Enter') {
      event.preventDefault();
      void lookup(choices[0]);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const buttons = Array.from(searchResultsRef.current?.querySelectorAll('button') ?? []);
      const index = buttons.findIndex(button => button === event.target);
      const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index <= 0 ? buttons.length - 1 : index - 1);
      buttons[next]?.focus();
    }
  }}>
    <form className="search" role="search" onSubmit={event => {
      event.preventDefault();
      if (query.trim() && !busy && !catalogLoading) setSearchRevision(value => value + 1);
    }}>
      <input ref={searchRef} type="search" aria-label={t('cardSearchName')} placeholder={t('cardSearchExample')} maxLength={300} value={query}
        autoFocus={!card} readOnly={addingCatalogCard} aria-controls={choices.length ? 'catalog-search-results' : undefined} onChange={event => {
          setQuery(event.target.value); setSearchFeedback(undefined); setChoices([]);
        }} />
      <button className={`icon-button${card ? '' : ' primary'}`} aria-label={t('searchCard')} title={t('searchShortcut')} disabled={!query.trim() || busy || catalogLoading}><Icon name="search" /></button>
    </form>
    <p className="search-feedback" role="status">{addingCatalogCard ? t('addingCatalogCard') : catalogLoading ? t('searching') : searchFeedback ? errorMessage(searchFeedback, locale) : ''}</p>
    {choices.length > 0 && <Dropdown ref={searchResultsRef} className="results" id="catalog-search-results" role="group" aria-label={t('searchResults')}>
      {choices.map(printing => <button key={printing.id} disabled={busy} onClick={() => void lookup(printing)}>
        <strong>{printing.name}</strong><small>{printing.setName}</small>
      </button>)}
    </Dropdown>}
  </div>;

  return <div className="workspace">
    <header className="toolbar">
      <div className="brand"><i aria-hidden="true" /><span>MTG Proxy Builder</span></div>
      <div className="project-tools">
        <Select aria-label={t('openProject')} disabled={busy || saving} value={project.id} onChange={event => {
          const id = event.target.value;
          if (saveError) {
            setError('');
            setSwitchTarget(id);
            setPanel('switch-project');
          } else switchProject(id);
        }}>
          {!projects.some(item => item.id === project.id) && <option value={project.id}>{project.name}</option>}
          {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          <option value="new">{t('newProject')}</option>
        </Select>
        <button className="icon-button" aria-label={t('undoLast')} title={t('undoShortcut')} disabled={!history.length || busy} onClick={undo}><Icon name="undo" /></button>
      </div>
      <div className="output-tools">
        <Select className="language-select" aria-label={t('language')} title={t('language')}
          value={locale} disabled={busy} onChange={event => setLocale(event.target.value as Locale)}>
          <option value="it" lang="it">Italiano</option>
          <option value="en" lang="en">English</option>
        </Select>
        <button className="icon-label frame-editor-button" aria-label={t('frameEditor')} title={t('frameEditor')} disabled={busy} onClick={() => {
          const frame = sharedFrame ?? renderedCard?.frame;
          if (frame?.kind === 'color-set' || frame?.kind === 'custom') manageFrameSets();
          else editTemplate(frame?.kind === 'template' ? frame.template : 'full-art');
        }}>
          <Icon name="settings" /><span>{t('frameEditor')}</span>
        </button>
        <button className="icon-button" aria-label={t('frameSets')} title={t('frameSets')} disabled={busy} onClick={manageFrameSets}><Icon name="frames" /></button>
        <button className="icon-label primary" aria-keyshortcuts="Meta+Enter Control+Enter" title={t('exportShortcut')} disabled={!project.cards.length || busy || loadingImages} onClick={() => { setError(''); setPanel('print'); }}><Icon name="export" /><span>{t('exportProject')}</span></button>
      </div>
    </header>
    <nav className="workspace-nav" aria-label={t('workspacePanels')}>
      {workspacePanes.map(pane => <button key={pane} type="button" aria-controls={`workspace-${pane}`}
        aria-pressed={workspacePane === pane} onClick={() => setWorkspacePane(pane)}>{t(pane)}</button>)}
      <button className="icon-button" type="button" aria-label={t('findCard')} title={t('findCard')} onClick={() => openCatalogSearch(!!card)}><Icon name="search" /></button>
    </nav>
    <div className="columns" data-pane={workspacePane}>
      <aside id="workspace-deck" className="deck">
        <div className="panel-title deck-title">
          <h2>{t('deck')}</h2><span className="muted">{t(total === 1 ? 'copyCountOne' : 'copyCount', { count: total })}</span>
          <button className="icon-button" aria-label={t(deckCollapsed ? 'expandDeck' : 'collapseDeck')} title={t(deckCollapsed ? 'expandDeck' : 'collapseDeck')} aria-expanded={!deckCollapsed} aria-controls="deck-content" onClick={() => setDeckCollapsed(value => !value)}><Icon name={deckCollapsed ? 'expand' : 'collapse'} /></button>
        </div>
        <div id="deck-content" className="deck-controls" hidden={deckCollapsed}>
          <input aria-label={t('projectName')} key={`${project.id}/${project.name}`} defaultValue={project.name} maxLength={100}
            onBlur={event => {
              const name = event.target.value.trim() || t('untitledDeck');
              event.target.value = name;
              if (name !== project.name) commit(value => ({ ...value, name }));
            }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
          <ProjectFrameSelect project={project} disabled={busy} change={changeProjectFrame} importFrame={importProjectFrame} />
          <div className="deck-add">{deckAddActions}</div>
        </div>
        {card && <div className="deck-catalog-search">{catalogSearch}</div>}
        {project.cards.length > 0 && <>
          <div className="deck-list-search">
            <input ref={listSearchRef} type="search" aria-label={t('filterAddedCards')} placeholder={t('filterAddedCards')} value={listQuery} onChange={event => setListQuery(event.target.value)} />
            <button className="icon-button" type="button" aria-label={t(modificationFilter === 'all' ? 'filterAllCards' : modificationFilter === 'unmodified' ? 'filterUnmodifiedCards' : 'filterModifiedCards')} title={t(modificationFilter === 'all' ? 'filterAllCards' : modificationFilter === 'unmodified' ? 'filterUnmodifiedCards' : 'filterModifiedCards')} data-active={modificationFilter !== 'all'} onClick={() => setModificationFilter(value => value === 'all' ? 'unmodified' : value === 'unmodified' ? 'modified' : 'all')}><Icon name={modificationFilter === 'all' ? 'filter' : modificationFilter === 'unmodified' ? 'unmodified' : 'edit'} /></button>
          </div>
          <div className="selection-bar">
            <label className="check">
              <input type="checkbox" aria-label={t('selectVisibleCards')} disabled={!visibleCards.length}
                checked={allVisibleSelected} ref={node => { if (node) node.indeterminate = visibleSelection.length > 0 && !allVisibleSelected; }}
                onChange={event => {
                  const checked = event.target.checked;
                  setSelected(previous => {
                    const next = new Set(previous);
                    visibleCards.forEach(item => checked ? next.add(item.id) : next.delete(item.id));
                    return next;
                  });
                }} />
              <span role="status" className="selection-count">
                {selection.length ? t('selectedCount', { count: selection.length }) : t('all')}
                {hiddenSelectionCount > 0 && <small>{t(hiddenSelectionCount === 1 ? 'hiddenSelectionCountOne' : 'hiddenSelectionCount', { count: hiddenSelectionCount })}</small>}
              </span>
            </label>
            <div className="selection-actions" role="group" aria-label={t('deckActions')}>
              <button className="icon-label" aria-label={t('batchEdit')} title={t('batchEdit')} disabled={busy} onClick={() => { setError(''); setPanel('batch'); }}><Icon name="batch" /><span>{t('batch')}</span></button>
              <button className="icon-button" aria-label={visibleSelection.length ? t(visibleSelection.length === 1 ? 'removeCardsOne' : 'removeCards', { count: visibleSelection.length }) : t('removeSelectedCards')}
                aria-describedby={hiddenSelectionCount ? 'selection-removal-scope' : undefined}
                title={t(hiddenSelectionCount ? 'removeVisibleSelection' : 'removeSelected')} disabled={!visibleSelection.length || busy} onClick={() => {
                  const removed = new Set(visibleSelection.map(item => item.id));
                  commit(value => clearInvalidFrameMirrors({ ...value, cards: value.cards.filter(item => !removed.has(item.id)) }));
                  setSelected(previous => new Set([...previous].filter(id => !removed.has(id))));
                  setZone(undefined); setBack(false);
                  if (project.cards.length > removed.size) listSearchRef.current?.focus();
              }}><Icon name="remove" /></button>
            </div>
          </div>
          {hiddenSelectionCount > 0 && <div className="hidden-selection">
            <small id="selection-removal-scope">{t('selectionRemovalScope')}</small>
            <div className="hidden-selection-actions">
              <button type="button" onClick={() => {
                setListQuery('');
                setModificationFilter('all');
                listSearchRef.current?.focus();
              }}>{t('showAllCards')}</button>
              <button type="button" onClick={() => {
                setSelected(new Set(visibleSelection.map(item => item.id)));
                listSearchRef.current?.focus();
              }}>{t('clearHiddenSelection')}</button>
            </div>
          </div>}
          <ul className="deck-list">
            {visibleCards.map(item => {
              const modified = isCardModified(item) ? t('modifiedCard') : undefined;
              const shared = sharedArt.has(item.id) ? t('sharedArtwork') : undefined;
              return <li key={item.id} className={item.id === card?.id ? 'active' : ''}>
                <input type="checkbox" aria-label={t('selectCard', { name: item.fields.name })} checked={selected.has(item.id)} onChange={() => toggleSelected(item.id)} />
                <button className="card-row" aria-current={item.id === card?.id ? 'true' : undefined} aria-description={[modified, shared].filter(Boolean).join('. ') || undefined} onClick={() => activate(item.id)}>
                  <span className="card-row-title">
                    <strong>{item.fields.name || t('untitledCard')}</strong>
                    {shared && <span className="card-shared-art" title={shared} aria-hidden="true"><Icon name="warning" size={15} /></span>}
                    {modified && <span className="card-modified" title={modified} aria-hidden="true"><Icon name="edit" size={13} /></span>}
                  </span>
                  <small>{item.source.set ? `${item.source.set.toUpperCase()} · ${item.source.number}` : t('customCard')}</small>
                </button>
                <DeckQuantity key={item.count} card={item} change={count => update(item.id, { count })} />
              </li>;
            })}
          </ul>
          {!visibleCards.length && <p className="deck-list-empty" role="status">{t(modificationFilter === 'unmodified' ? 'noUnmodifiedCardsFound' : modificationFilter === 'modified' ? 'noModifiedCardsFound' : 'noAddedCardsFound')}</p>}
        </>}
      </aside>
      <main id="workspace-preview" className="stage" onDragOver={event => { if (selectedCard?.source.editable && event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDraggingImage(true); } }} onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingImage(false);
      }} onDrop={event => {
        event.preventDefault();
        setDraggingImage(false);
        const file = event.dataTransfer.files[0];
        if (!card || !selectedCard?.source.editable || !file) return;
        void action(async () => {
          if (file.size > 32 * 1024 * 1024) throw new LocalizedError('imageSize');
          const asset = await window.proxy.dropped(new Uint8Array(await file.arrayBuffer()), file.name, false);
          updateSide(card.id, { art: asset.id, crop: defaultCrop,
            ...(selectedCard && selectedCard.frame.kind === 'printing' && sideOrientation(card, back) === 'landscape' ? { frame: { kind: 'template', template: 'full-art' } } : {}) });
          if (renderedCard?.frame.kind === 'printing') setZone(undefined);
        });
      }}>
        {card && renderedCard ? <>
          <div className="stage-heading">
            <h1 ref={cardHeading} tabIndex={-1} title={card.fields.name || undefined}>{card.fields.name || t('untitledCard')}</h1>
            {exportRepair && <button className="icon-label" disabled={busy || loadingImages} onClick={() => {
              setError('');
              setPanel(exportRepair);
            }}><Icon name="export" />{t(exportRepair === 'sheet' ? 'returnToPdfSetup' : 'returnToZipSetup')}</button>}
          </div>
          <div className={`stage-sheet${compare && card.source.printingId ? ' is-comparing' : ''}`}>
            <div className="stage-preview-actions">
              <PreviewGuidesButton visible={showPreviewGuides} toggle={togglePreviewGuides} />
              {card.source.printingId && <button className="icon-button compare-button" aria-label={t('compareOriginal')} title={t('compareOriginal')} aria-pressed={compare} onClick={() => {
                const next = !compare;
                setCompare(next);
              }}><Icon name="compare" /></button>}
            </div>
            <div className="stage-current">
            {missingArtwork && loadingImage ? (
              <p className="missing-printing" role="status">{t('loadingArt')}</p>
            ) : selectedRendered && !usesArt(selectedRendered) && !selectedRendered.source.images.front ? <div className="missing-printing">
              <p role="status">{loadingImage ? t('loadingScan') : card.source.images.error ?? t('scanUnavailable')}</p>
              {!loadingImage && <button onClick={() => void loadPrintingImages(selectedRendered)}>{t('retryLoading')}</button>}
            </div> : <Preview card={selectedRendered!} showThirds={showPreviewGuides} zone={mirror || zone === 'artist' ? undefined : zone} onZone={mirror ? undefined : changeZone}
              hideArtworkWarning={missingArtwork}
              onCrop={selectedCard?.source.editable && (selectedRendered?.frame.kind !== 'printing' || !!selectedCard.art) ? crop => updateSide(card.id, { crop }, true) : undefined} />}
            </div>
            {compare && card.source.printingId && <div className="stage-original">
              <span>{t('original')}</span>
              {(back ? card.source.images.back : card.source.images.front) ? <img src={assetURL((back ? card.source.images.back : card.source.images.front)!)} alt={t('originalPrinting')} /> : <div className="missing-printing" role="status">
                <p>{imageLoads.size ? t('loadingScan') : card.source.images.error ?? t('scanUnavailable')}</p>
                {!imageLoads.size && <button onClick={() => void loadPrintingImages(renderedCard)}>{t('retryLoading')}</button>}
              </div>}
            </div>}
          </div>
          {missingArtwork && !loadingImage && <div className="artwork-recovery">
            <p className="muted" role="status">{t('catalogArtworkUnavailable')}</p>
            <button disabled={busy} onClick={() => void loadPrintingImages(selectedRendered!)}>{t('retryArtworkDownload')}</button>
          </div>}
          {selectedCard?.source.editable && <button className={`image-dropzone${draggingImage ? ' dragging' : ''}`} disabled={busy} onClick={() => void selectAssets(false).then(image => {
            if (image) updateSide(card.id, { art: image.id, crop: defaultCrop,
              ...(selectedCard && selectedCard.frame.kind === 'printing' && sideOrientation(card, back) === 'landscape' ? { frame: { kind: 'template', template: 'full-art' } } : {}) });
          })}>{t(missingArtwork && !loadingImage ? 'chooseArtwork' : 'dropImage')}</button>}
          <div className="stage-meta">
            <span>63 × 88 mm</span>
            {card.source.images.back && <div className="toggle" role="group" aria-label={t('cardSide')}>
              <button aria-pressed={!back} onClick={() => setBack(false)}>{t('front')}</button>
              <button aria-pressed={back} onClick={() => setBack(true)}>{t('back')}</button>
            </div>}
            {card.source.setName && <span className="stage-edition">{card.source.setName}</span>}
          </div>
        </> : <div className="empty">
          <h1>{t('findCard')}</h1>
          <p>{t('findCardHelp')}</p>
          {catalogSearch}
          <div className="deck-add empty-deck-add">{deckAddActions}</div>
        </div>}
      </main>
      {card && selectedCard && selectedRendered ? <Inspector key={`${card.id}/${back}`} card={selectedCard} renderedCard={selectedRendered} back={back} sharedFrame={usesSharedFrame} presets={project.presets} frameSets={project.frameSets ?? []}
        editCustomFrame={manageFrameSets}
        mirror={card.source.editable ? {
          value: mirror ? mirrorValue(mirror.cardId, mirror.back) : '',
          suspended: mirrorSource?.frame.kind === 'printing',
          options: mirrorLabels.map(({ value, label, number }) => ({ value, label: mirrorLabelCounts.get(label)! > 1 ? `${label} (#${number})` : label })),
          change: changeFrameMirror
        } : undefined}
        copyFrame={canCopyFrame ? () => {
          const { frame, zoneOverrides, hiddenZones, dividerOverrides } = selectedRendered;
          setCopiedFrame(structuredClone({ frame, settings: { zoneOverrides, hiddenZones, dividerOverrides } }));
          setNotice({ key: 'frameCopied' });
        } : undefined}
        pasteFrame={copiedFrame && !mirror ? () => {
          const { frame, settings } = copiedFrame;
          updateSide(card.id, usesSharedFrame ? settings : { frame, ...settings });
          setZone(undefined);
          setNotice({ key: usesSharedFrame ? 'frameSettingsPasted' : 'framePasted' });
        } : undefined}
        resetCard={() => {
          if (mirror) return;
          if (back) update(card.id, { backSide: undefined });
          else commit(value => ({ ...value, cards: value.cards.map(item => item.id === card.id ? { ...createCard(item.source, item.count), id: item.id, backSide: item.backSide } : item) }));
          setZone(undefined);
        }}
        update={patch => updateSide(card.id, patch, true)}
        selectAssets={selectAssets} choosePrinting={() => choosePrinting('printings')} zone={mirror ? undefined : zone} selectZone={setZone}
        fullArtBase={project.templateAppearances?.['full-art'] ? undefined : project.fullArtBase}
        savePreset={name => {
          if (selectedCard.frame.kind !== 'custom') return;
          const { asset, zones, textColor, fontFamily, appearance } = selectedCard.frame;
          const existing = project.presets.find(preset => preset.name.localeCompare(name, 'it', { sensitivity: 'base' }) === 0);
          if (!existing && project.presets.length >= 200) { setError(t('presetLimit')); return; }
          commit(value => ({ ...value, presets: [...value.presets.filter(preset => preset.id !== existing?.id), { id: existing?.id ?? crypto.randomUUID(), name, asset, zones, textColor, fontFamily, appearance }] }));
          setNotice({ key: existing ? 'presetUpdated' : 'presetSaved' });
        }} />
        : <aside id="workspace-properties" className="inspector empty-inspector"><div className="panel-title"><h2>{t('properties')}</h2></div><p className="muted">{t('propertiesHelp')}</p></aside>}
    </div>
    <footer className="status" aria-live="polite">
      <span className="save-status">{saveError ? <><span className="error">{t('projectSaveFailed', { project: project.name })}</span> <button onClick={() => void persist(project)}>{t('retrySave')}</button></> : saving ? t('saving') : t('localProject')}</span>
      <span className={error && !panel ? 'error' : ''}>{error && !panel ? error : busy && !panel ? t('loading') : notice && t(notice.key, notice.count === undefined ? undefined : { count: notice.count })}</span>
    </footer>
    {panel && <Dialog title={t(titles[panel])} busy={busy || (panel === 'switch-project' && saving)} wide={panel === 'cards' || panel === 'templates'}
      back={panel === 'sheet' || panel === 'cards' ? () => setPanel('print') : undefined} close={() => {
        if (panel === 'templates') lastHistory.current = 0;
        if (panel === 'switch-project') setSwitchTarget('');
        if (panel === 'print' || panel === 'sheet' || panel === 'cards') clearExportRepair();
        setError('');
        setPanel(undefined);
      }}>
      {error && <p className="error" role="alert">{error}</p>}
      {panel === 'switch-project' && <>
        <p role="status">{saving ? t('saving') : t('projectSaveFailed', { project: project.name })}</p>
        <div className="dialog-actions">
          <button disabled={saving} onClick={() => { setSwitchTarget(''); setPanel(undefined); }}>{t('keepEditing')}</button>
          <button disabled={saving} onClick={() => switchProject(switchTarget)}>{t('switchWithoutSaving')}</button>
          <button className="primary" disabled={saving} onClick={() => void retryProjectSwitch()}>{t('retrySave')}</button>
        </div>
      </>}
      {panel === 'templates' && editedAppearance && <TemplateEditor tab={editorTab} selectTab={selectEditorTab}
        showPreviewGuides={showPreviewGuides} togglePreviewGuides={togglePreviewGuides}
        appearance={editedAppearance} activeCard={renderedCard} cards={projectCards(project)} fonts={systemFonts} change={changeTemplate}
        customFrame={editedCustom} reset={resetEditedFrame}
        customControls={editorTab === 'custom' && <>
          <label>{t('frameSets')}<Select value={customFrameId} onChange={event => {
            lastHistory.current = 0;
            setCustomFrameId(event.target.value);
          }}>
            <option value="">{t('newSet')}</option>
            {project.frameSets?.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}
            {cardSet && !project.frameSets?.some(set => set.id === cardSet.id)
              && <option value={cardSet.id}>{cardSet.name}</option>}
            {project.frame?.kind === 'custom' && <option value="project">{t('projectCustomFrame')}</option>}
            {!mirror && selectedCard?.frame.kind === 'custom' && <option value="card">{t('existingPngFrame')}</option>}
            {project.presets.map(preset => <option key={preset.id} value={'preset/' + preset.id}>{preset.name}</option>)}
          </Select></label>
          {editedCustom?.kind === 'custom'
            ? <img className="single-frame-thumbnail" src={assetURL(editedCustom.asset)} alt={t('pngLoaded')} />
            : <FrameSets key={customFrameId} sets={project.frameSets ?? []} existing={editedCustom?.set}
              count={sharedFrame ? 0 : batchCards.filter(item => item.source.editable && !item.frameMirror).length} save={(set, apply) => {
                if (live.current?.id !== project.id) return;
                saveColorSet(set, apply ? batchCards : []);
                setZone(undefined);
                if (apply) setPanel(undefined);
                else setCustomFrameId(set.id);
                setNotice({ key: apply ? 'setSavedApplied' : 'setSaved' });
              }} />}
        </>}
        saving={saving} saveError={saveError} retry={() => persist(project)} />}
      {panel === 'deck' && <>
        <div className="dialog-tools">
          <button disabled={busy} onClick={() => void action(async () => {
            const text = await window.proxy.deckFile();
            if (text !== null) setDeckText(text);
          })}>{t('openTextFile')}</button>
        </div>
        <label>{t('decklist')}<textarea rows={9} value={deckText} onChange={event => setDeckText(event.target.value)} disabled={busy}
          placeholder={'2 Lightning Bolt (2X2) 117\n1 Sol Ring\nForest'} /></label>
        <p className="deck-import-status" role="status">{deckProgress || (deckErrors.length ? [
          deckImported ? t(deckImported === 1 ? 'cardsImportedOne' : 'cardsImported', { count: deckImported }) : '',
          t(deckErrors.length === 1 ? 'deckImportAttentionOne' : 'deckImportAttention', { count: deckErrors.length })
        ].filter(Boolean).join(' · ') : '')}</p>
        {deckErrors.length > 0 && <ul className="error messages">{deckErrors.map((entry, i) => <li key={i}>{entry}</li>)}</ul>}
        <div className="dialog-actions">
          <button className="primary" disabled={busy || !deckText.trim()} onClick={importDeck}>{t('importCards')}</button>
        </div>
      </>}
      {panel === 'batch' && <Batch cards={batchCards} selectionCount={selection.length} hiddenSelectionCount={hiddenSelectionCount}
        sharedFrame={!!sharedFrame} presets={project.presets} fullArtBase={project.templateAppearances?.['full-art'] ? undefined : project.fullArtBase} frameSets={project.frameSets ?? []} close={() => setPanel(undefined)} apply={updates => {
        const map = new Map(updates.map(item => [item.id, item]));
        commit(value => ({ ...value, cards: value.cards.map(item => map.get(item.id) ?? item) }));
        setNotice({ key: updates.length === 1 ? 'changedCardsOne' : 'changedCards', count: updates.length }); setPanel(undefined);
      }} />}
      {panel === 'print' && <PrintChoices cards={projectCards(project, project.cards.slice(0, 9))} choose={setPanel} />}
      {panel === 'cards' && <CardExportPanel project={project} scopeOptions={scopeOptions} initialDraft={zipDraft} onBusy={setBusy} onOpenCard={(id, back, draft) => {
        setZipDraft(draft);
        openCardForExport('cards', id, back);
      }} onExport={() => finishExport('zipSaved')} />}
      {panel === 'sheet' && <PrintPanel project={project} scopeOptions={scopeOptions} initialDraft={pdfDraft} onBusy={setBusy} onOpenCard={(id, back, draft) => {
        setPdfDraft(draft);
        openCardForExport('sheet', id, back);
      }} onExport={() => finishExport('pdfSaved')} />}
      {panel === 'frames' && <FrameGallery editions={editions} active={card?.frame.kind === 'printing' ? card.source.printingId : undefined}
        pending={busy} hasArt={!!(card?.art ?? card?.source.images.art)} select={(printing, keepArt) => replacePrinting(printing, true, keepArt)} />}
      {panel === 'printings' && <div className="edition-list">
        {busy && <p role="status">{t('loadingPrintings')}</p>}
        {editions.map(printing => <button key={printing.id} disabled={busy || printing.id === card?.source.printingId} onClick={() => replacePrinting(printing)}>
          <strong>{printing.setName}</strong><small>{printing.set.toUpperCase()} · {printing.number} · {printing.lang.toUpperCase()}</small>
        </button>)}
      </div>}
    </Dialog>}
  </div>;
}
