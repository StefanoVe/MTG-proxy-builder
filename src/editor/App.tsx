import type { Locale, MessageKey } from '../shared/i18n.js';
import { errorMessage, LocalizedError } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { templateAppearance, withProjectTemplate } from '../shared/templates.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { blankCard, createCard, createProject, defaultCrop } from '../shared/model.js';
import type { Card, DeckEntry, FrameSet, Printing, Project, Rect, Template, TemplateAppearance, Zones } from '../shared/model.js';
import { parseDeckRows } from '../shared/deck.js';
import { loadDeckCards } from '../shared/deck-import.js';
import { FrameSets } from './FrameSets.js';
import { FrameGallery } from './FrameGallery.js';
import { Batch } from './Batch.js';
import { Inspector } from './Inspector.js';
import { Preview } from './Preview.js';
import { PrintPanel } from './PrintPanel.js';
import { PrintChoices } from './PrintChoices.js';
import { CardExportPanel } from './CardExportPanel.js';
import { Icon } from './Icon.js';
import { TemplateEditor } from './TemplateEditor.js';

type Panel = 'deck' | 'batch' | 'print' | 'sheet' | 'cards' | 'printings' | 'frames' | 'frame-sets' | 'templates';
const usesArt = (card: Card) => card.frame.kind === 'template' || card.frame.kind === 'color-set';
const imageKey = (card: Card) => `${card.id}/${card.source.printingId}/${usesArt(card) ? 'art' : 'scan'}`;

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
      {back && <button className="icon-button" aria-label={t('backToPrint')} title={t('backToPrint')} onClick={back} disabled={busy}><Icon name="undo" /></button>}
      <h2 id="dialog-title" ref={heading} tabIndex={-1}>{title}</h2>
    </div><button className="icon-button" aria-label={t('close')} title={t('close')} onClick={close} disabled={busy}><Icon name="close" /></button></header>
    <div className="dialog-body">{children}</div>
  </dialog>;
}

const titles: Record<Panel, MessageKey> = { deck: 'importList', batch: 'batchEdit', print: 'print', sheet: 'exportPdf', cards: 'individualCards', printings: 'chooseEdition', frames: 'chooseFrame', 'frame-sets': 'frameSets', templates: 'projectFrameEditor' };

function projectTemplate(project: Project, template: Template, active?: Card) {
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

export function App() {
  const { t, locale, setLocale } = useI18n();
  const searchRef = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<Project | null>(null);
  const live = useRef<Project | null>(null);
  const [projects, setProjects] = useState<Array<Pick<Project, 'id' | 'name'>>>([]);
  const [systemFonts, setSystemFonts] = useState(['Arial', 'Arial Black', 'Calibri', 'Cambria', 'Georgia', 'Helvetica', 'Times New Roman', 'Verdana']);
  const [active, setActive] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zone, setZone] = useState<keyof Zones>();
  const [back, setBack] = useState(false);
  const [panel, setPanel] = useState<Panel>();
  const [template, setTemplate] = useState<Template>('full-art');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ key: MessageKey; count?: number }>();
  const [busy, setBusy] = useState(false);
  const [draggingImage, setDraggingImage] = useState(false);
  const [query, setQuery] = useState('');
  const [searchFeedback, setSearchFeedback] = useState<Error>();
  const [searching, setSearching] = useState(false);
  const [imageLoads, setImageLoads] = useState<Set<string>>(new Set());
  const attemptedImages = useRef(new Set<string>());
  const [choices, setChoices] = useState<Printing[]>([]);
  const [deckText, setDeckText] = useState('');
  const [deckErrors, setDeckErrors] = useState<string[]>([]);
  const [deckProgress, setDeckProgress] = useState('');
  const [history, setHistory] = useState<Project[]>([]);
  const revision = useRef(0);
  const lastHistory = useRef(0);
  const card = project?.cards.find(item => item.id === active) ?? project?.cards[0];
  const appearances = project?.templateAppearances;
  const renderedCard = useMemo(() => card && withProjectTemplate(card, appearances), [card, appearances]);
  const editedAppearance = useMemo(() => panel === 'templates' && project
    ? projectTemplate(project, template, card) : undefined, [panel, project, template, card]);

  function showProject(value: Project) {
    live.current = value;
    setProject(value);
    setActive(value.cards[0]?.id ?? '');
    setSelected(new Set());
    setHistory([]);
    lastHistory.current = 0;
    setChoices([]);
    setSearchFeedback(undefined);
    setZone(undefined);
    setBack(false);
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        if (!panel && history.length && !typing) { event.preventDefault(); undo(); }
      } else if (event.key === '/' && !typing && !panel) {
        event.preventDefault(); searchRef.current?.focus();
      } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !panel && project?.cards.length && !busy && !imageLoads.size) {
        event.preventDefault(); setError(''); setPanel('print');
      } else if (event.key === 'Escape' && !panel && target === document.body) {
        setSelected(new Set());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [history, panel, project, busy, imageLoads.size]);

  function persist(next: Project) {
    const current = ++revision.current;
    setSaving(true);
    setSaveError('');
    void window.proxy.save(next).then(() => {
      setProjects(list => [...list.filter(item => item.id !== next.id), { id: next.id, name: next.name }]
        .sort((a, b) => a.name.localeCompare(b.name, 'it')));
    }).catch(cause => {
      if (current === revision.current) setSaveError(errorMessage(cause, locale));
    }).finally(() => { if (current === revision.current) setSaving(false); });
  }

  function commit(change: (project: Project) => Project, group = false) {
    if (!live.current) return;
    const previous = live.current;
    const time = Date.now();
    if (!group || time - lastHistory.current > 800) setHistory(list => [...list.slice(-39), previous]);
    lastHistory.current = group ? time : 0;
    const next = change(previous);
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
    commit(value => ({ ...value, cards: value.cards.map(item => item.id === id ? { ...item, ...patch } : item) }), group);
  }

  function activate(id: string) {
    setActive(id);
    setZone(undefined);
    setBack(false);
  }

  function addCards(additions: Card[]) {
    if (!additions.length) return;
    if ((live.current?.cards.length ?? 0) + additions.length > 1500) throw new LocalizedError('projectLimit');
    commit(value => ({ ...value, cards: [...value.cards, ...additions] }));
    activate(additions[0].id);
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
    const key = imageKey(card);
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
    if (!current?.cards.some(item => item.id === card.id && item.source.printingId === card.source.printingId)) return;
    const next = { ...current, cards: current.cards.map(item => item.id === card.id
      ? { ...item, source: { ...item.source, images: {
        front: images.front ?? item.source.images.front, back: images.back ?? item.source.images.back,
        art: images.art ?? item.source.images.art, error: images.error
      } } } : item) };
    live.current = next;
    setProject(next);
    persist(next);
  }

  useEffect(() => {
    if (!card?.source.printingId) return;
    const needsImage = usesArt(card) ? !(card.art || card.source.images.art) : !card.source.images.front;
    if (!needsImage) return;
    const key = imageKey(card);
    if (!attemptedImages.current.has(key)) void loadPrintingImages(card);
  }, [card]);

  async function lookup(printing?: Printing) {
    if (busy || (!printing && !query.trim())) return;
    setSearchFeedback(undefined);
    setSearching(true);
    await action(async () => {
      try {
        const result = printing ? { exact: printing, choices: [] } : await window.proxy.search(query.trim());
        if (result.exact) {
          const card = createCard(await window.proxy.card(result.exact.id, false));
          addCards([card]);
          setQuery('');
          setChoices([]);
        } else {
          setChoices(result.choices);
          if (!result.choices.length) setSearchFeedback(new LocalizedError('noCardsFound'));
        }
      } catch (cause) {
        setSearchFeedback(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
    setSearching(false);
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
      const frame = frameOnly || card.frame.kind === 'printing'
        ? (source.printingId === card.source.printingId && card.frame.kind === 'printing' ? card.frame : { kind: 'printing' as const })
        : card.frame;
      const changed = source.printingId !== card.source.printingId;
      const art = frameOnly
        ? keepArt ? card.art ?? (changed ? card.source.images.art : undefined) : undefined
        : card.art;
      update(card.id, { source, fields, frame, art, crop: art ? card.crop : defaultCrop });
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

  function saveColorSet(set: FrameSet, applyTo: Card[] = [], group = false) {
    const selected = new Set(applyTo.filter(card => card.source.editable).map(card => card.id));
    commit(value => {
      const sets = value.frameSets ?? [];
      const frameSets = sets.some(item => item.id === set.id) ? sets.map(item => item.id === set.id ? set : item) : [...sets, set];
      return { ...value, frameSets, cards: value.cards.map(item =>
        selected.has(item.id) || (item.frame.kind === 'color-set' && item.frame.set.id === set.id)
          ? { ...item, frame: { kind: 'color-set', set } } : item
      ) };
    }, group);
  }

  function manageFrameSets() {
    setError('');
    setPanel('frame-sets');
  }

  function selectTemplate(next: Template) {
    lastHistory.current = 0;
    setTemplate(next);
  }

  function editTemplate(next: Template) {
    selectTemplate(next);
    setError('');
    setPanel('templates');
  }

  function changeTemplate(update: (appearance: TemplateAppearance) => TemplateAppearance) {
    if (live.current?.id !== project?.id) return;
    commit(value => ({
      ...value,
      templateAppearances: { ...value.templateAppearances, [template]: update(projectTemplate(value, template, card)) }
    }), true);
  }

  function changeZone(rect: Rect) {
    if (!card || !zone) return;
    if (card.frame.kind === 'printing' && zone === 'art') {
      update(card.id, { frame: { ...card.frame, artZone: rect } }, true);
    } else if (card.frame.kind !== 'printing') {
      update(card.id, { zoneOverrides: { ...card.zoneOverrides, [zone]: rect } }, true);
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
        if (additions.length) setNotice({ key: additions.length === 1 ? 'cardsImportedOne' : 'cardsImported', count: additions.length });
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
  const batchCards = selection.length ? selection : project.cards;
  const loadingImage = !!card && imageLoads.has(imageKey(card));
  const catalogSearch = <div className="catalog-search">
    <form className="search" role="search" onSubmit={event => { event.preventDefault(); void lookup(); }}>
      <input ref={searchRef} type="search" aria-label={t('cardSearchName')} placeholder={t('cardSearchExample')} maxLength={300} value={query}
        autoFocus={!card} disabled={searching} onChange={event => {
          setQuery(event.target.value); setSearchFeedback(undefined); setChoices([]);
        }} />
      <button className={`icon-button${card ? '' : ' primary'}`} aria-label={searching ? t('searching') : t('searchCard')} title={t('searchShortcut')} disabled={!query.trim() || busy}><Icon name="search" /></button>
    </form>
    {searchFeedback && <p className="search-feedback" role="status">{errorMessage(searchFeedback, locale)}</p>}
    {choices.length > 0 && <div className="results" aria-label={t('searchResults')}>
      {choices.map(printing => <button key={printing.id} disabled={busy} onClick={() => void lookup(printing)}>
        <strong>{printing.name}</strong><small>{printing.setName}</small>
      </button>)}
    </div>}
  </div>;

  return <div className="workspace">
    <header className="toolbar">
      <div className="brand"><i aria-hidden="true" /><span>MTG Proxy Builder</span></div>
      <div className="project-tools">
        <select aria-label={t('openProject')} disabled={busy || saving} value={project.id} onChange={event => {
          const id = event.target.value;
          if (id === 'new') { const next = createProject(t('untitledDeck')); showProject(next); persist(next); return; }
          void action(async () => { showProject(await window.proxy.open(id)); });
        }}>
          {!projects.some(item => item.id === project.id) && <option value={project.id}>{project.name}</option>}
          {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          <option value="new">{t('newProject')}</option>
        </select>
        <button className="icon-button" aria-label={t('undoLast')} title={t('undoShortcut')} disabled={!history.length || busy} onClick={undo}><Icon name="undo" /></button>
      </div>
      <div className="output-tools">
        <select className="language-select" aria-label={t('language')} title={t('language')}
          value={locale} disabled={busy} onChange={event => setLocale(event.target.value as Locale)}>
          <option value="it" lang="it">Italiano</option>
          <option value="en" lang="en">English</option>
        </select>
        <button className="icon-label" disabled={busy} onClick={() => editTemplate(card?.frame.kind === 'template' ? card.frame.template : 'full-art')}>
          <Icon name="settings" /><span>{t('frameEditor')}</span>
        </button>
        <button className="icon-button" aria-label={t('frameSets')} title={t('frameSets')} disabled={busy} onClick={manageFrameSets}><Icon name="frames" /></button>
        <button className="icon-label primary" aria-label={t('print')} title={t('printShortcut')} disabled={!project.cards.length || busy || !!imageLoads.size} onClick={() => { setError(''); setPanel('print'); }}><Icon name="print" /><span>{t('print')}</span></button>
      </div>
    </header>
    <div className="columns">
      <aside className="deck">
        <div className="panel-title"><h2>{t('deck')}</h2><span className="muted">{t(total === 1 ? 'copyCountOne' : 'copyCount', { count: total })}</span></div>
        <div className="deck-controls">
          <input aria-label={t('projectName')} key={`${project.id}/${project.name}`} defaultValue={project.name} maxLength={100}
            onBlur={event => {
              const name = event.target.value.trim() || t('untitledDeck');
              event.target.value = name;
              if (name !== project.name) commit(value => ({ ...value, name }));
            }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
          {card && catalogSearch}
          <div className="deck-add">
            <button className="icon-label" onClick={() => { setError(''); setDeckErrors([]); setPanel('deck'); }} aria-label={t('importList')} disabled={busy}><Icon name="import" /><span>{t('importList')}</span></button>
            <button className="icon-label" onClick={() => addCards([createCard({ ...blankCard, name: t('untitledCard') })])} aria-label={t('addBlankCard')} disabled={busy || project.cards.length >= 1500}><Icon name="add" /><span>{t('blankCard')}</span></button>
          </div>
        </div>
        {project.cards.length > 0 && <>
          <div className="selection-bar">
            <label className="check"><input type="checkbox" aria-label={t('selectAll')} checked={selection.length === project.cards.length} onChange={event =>
              setSelected(event.target.checked ? new Set(project.cards.map(item => item.id)) : new Set())
            } />{selection.length ? t('selectedCount', { count: selection.length }) : t('all')}</label>
            <div className="selection-actions" role="group" aria-label={t('deckActions')}>
              <button className="icon-label" aria-label={t('batchEdit')} title={t('batchEdit')} disabled={busy} onClick={() => { setError(''); setPanel('batch'); }}><Icon name="batch" /><span>{t('batch')}</span></button>
              <button className="icon-button" aria-label={selection.length ? t(selection.length === 1 ? 'removeCardsOne' : 'removeCards', { count: selection.length }) : t('removeSelectedCards')} title={t('removeSelected')} disabled={!selection.length || busy} onClick={() => {
                commit(value => ({ ...value, cards: value.cards.filter(item => !selected.has(item.id)) }));
                setSelected(new Set()); setZone(undefined); setBack(false);
              }}><Icon name="remove" /></button>
            </div>
          </div>
          <ul className="deck-list">
            {project.cards.map(item => <li key={item.id} className={item.id === card?.id ? 'active' : ''}>
              <input type="checkbox" aria-label={t('selectCard', { name: item.fields.name })} checked={selected.has(item.id)} onChange={() => toggleSelected(item.id)} />
              <button className="card-row" aria-current={item.id === card?.id ? 'true' : undefined} onClick={() => activate(item.id)}>
                <strong>{item.fields.name || t('untitledCard')}</strong>
                <small>{item.source.set ? `${item.source.set.toUpperCase()} · ${item.source.number}` : t('customCard')}</small>
              </button>
              <input type="number" aria-label={t('cardQuantity', { name: item.fields.name })} key={item.count} min={1} max={999} defaultValue={item.count}
                onBlur={event => {
                  const count = Math.trunc(event.target.valueAsNumber);
                  if (count >= 1 && count <= 999 && count !== item.count) update(item.id, { count });
                  else event.target.value = String(item.count);
                }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
            </li>)}
          </ul>
        </>}
      </aside>
      <main className="stage" onDragOver={event => { if (card?.source.editable && event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDraggingImage(true); } }} onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingImage(false);
      }} onDrop={event => {
        event.preventDefault();
        setDraggingImage(false);
        const file = event.dataTransfer.files[0];
        if (!card?.source.editable || !file) return;
        void action(async () => {
          if (file.size > 32 * 1024 * 1024) throw new LocalizedError('imageSize');
          const asset = await window.proxy.dropped(new Uint8Array(await file.arrayBuffer()), file.name, false);
          update(card.id, { art: asset.id, crop: defaultCrop });
          if (card.frame.kind === 'printing') setZone(undefined);
        });
      }}>
        {card ? <>
          <div className="stage-heading">
            <h1 title={card.fields.name || undefined}>{card.fields.name || t('untitledCard')}</h1>
          </div>
          <div className="stage-sheet">
            {usesArt(card) && loadingImage && !(card.art || card.source.images.art) ? (
              <p className="missing-printing" role="status">{t('loadingArt')}</p>
            ) : card.frame.kind === 'printing' && !card.source.images.front ? <div className="missing-printing">
              <p role="status">{loadingImage ? t('loadingScan') : card.source.images.error ?? t('scanUnavailable')}</p>
              {!loadingImage && <button onClick={() => void loadPrintingImages(card)}>{t('retryLoading')}</button>}
            </div> : <Preview card={renderedCard ?? card} back={back} showThirds zone={zone} onZone={changeZone}
              onCrop={card.source.editable && !back && (card.frame.kind !== 'printing' || !!card.art) ? crop => update(card.id, { crop }, true) : undefined} />}
          </div>
          {card.source.editable && <button className={`image-dropzone${draggingImage ? ' dragging' : ''}`} disabled={busy} onClick={() => void selectAssets(false).then(image => {
            if (image) update(card.id, { art: image.id, crop: defaultCrop });
          })}>{t('dropImage')}</button>}
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
        </div>}
      </main>
      {card ? <Inspector key={card.id} card={card} renderedCard={renderedCard ?? card} presets={project.presets} frameSets={project.frameSets ?? []}
        systemFonts={systemFonts}
        manageFrameSets={manageFrameSets} editFrameSet={set => saveColorSet(set, [], true)} update={patch => update(card.id, patch, true)}
        selectAssets={selectAssets} choosePrinting={() => choosePrinting('printings')} chooseFrames={() => choosePrinting('frames')} zone={zone} selectZone={setZone}
        fullArtBase={project.templateAppearances?.['full-art'] ? undefined : project.fullArtBase} editTemplate={editTemplate}
        savePreset={name => {
          if (card.frame.kind !== 'custom') return;
          const { asset, zones, textColor, fontFamily } = card.frame;
          const existing = project.presets.find(preset => preset.name.localeCompare(name, 'it', { sensitivity: 'base' }) === 0);
          if (!existing && project.presets.length >= 200) { setError(t('presetLimit')); return; }
          commit(value => ({ ...value, presets: [...value.presets.filter(preset => preset.id !== existing?.id), { id: existing?.id ?? crypto.randomUUID(), name, asset, zones, textColor, fontFamily }] }));
          setNotice({ key: existing ? 'presetUpdated' : 'presetSaved' });
        }} />
        : <aside className="inspector empty-inspector"><div className="panel-title"><h2>{t('properties')}</h2></div><p className="muted">{t('propertiesHelp')}</p></aside>}
    </div>
    <footer className="status" aria-live="polite">
      <span className="save-status">{saveError ? <><span className="error">{saveError}</span> <button onClick={() => persist(project)}>{t('retry')}</button></> : saving ? t('saving') : t('localProject')}</span>
      <span className={error && !panel ? 'error' : ''}>{error && !panel ? error : busy && !panel ? t('loading') : notice && t(notice.key, notice.count === undefined ? undefined : { count: notice.count })}</span>
    </footer>
    {panel && <Dialog title={t(titles[panel])} busy={busy} wide={panel === 'cards' || panel === 'templates'}
      back={panel === 'sheet' || panel === 'cards' ? () => setPanel('print') : undefined} close={() => {
        if (panel === 'templates') lastHistory.current = 0;
        setError('');
        setPanel(undefined);
      }}>
      {error && <p className="error" role="alert">{error}</p>}
      {panel === 'templates' && editedAppearance && <TemplateEditor template={template} selectTemplate={selectTemplate}
        appearance={editedAppearance} activeCard={card} cards={project.cards} fonts={systemFonts} change={changeTemplate}
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
        {deckProgress && <p role="status">{deckProgress}</p>}
        {deckErrors.length > 0 && <ul className="error messages">{deckErrors.map((entry, i) => <li key={i}>{entry}</li>)}</ul>}
        <div className="dialog-actions">
          <button className="primary" disabled={busy || !deckText.trim()} onClick={importDeck}>{t('importCards')}</button>
        </div>
      </>}
      {panel === 'batch' && <Batch cards={batchCards} presets={project.presets} fullArtBase={project.templateAppearances?.['full-art'] ? undefined : project.fullArtBase} frameSets={project.frameSets ?? []} close={() => setPanel(undefined)} apply={updates => {
        const map = new Map(updates.map(item => [item.id, item]));
        commit(value => ({ ...value, cards: value.cards.map(item => map.get(item.id) ?? item) }));
        setNotice({ key: updates.length === 1 ? 'changedCardsOne' : 'changedCards', count: updates.length }); setPanel(undefined);
      }} />}
      {panel === 'frame-sets' && <FrameSets sets={project.frameSets ?? []} active={card?.frame.kind === 'color-set' ? card.frame.set.id : undefined}
        count={batchCards.filter(item => item.source.editable).length} save={(set, apply) => {
          saveColorSet(set, apply ? batchCards : []);
          setZone(undefined);
          setPanel(undefined);
          setNotice({ key: apply ? 'setSavedApplied' : 'setSaved' });
        }} />}
      {panel === 'print' && <PrintChoices cards={project.cards.slice(0, 9).map(item => withProjectTemplate(item, project.templateAppearances))} choose={setPanel} />}
      {panel === 'cards' && <CardExportPanel project={project} onBusy={setBusy} onExport={() => {
        setNotice({ key: 'zipSaved' }); setPanel(undefined);
      }} />}
      {panel === 'sheet' && <PrintPanel project={project} onBusy={setBusy} onExport={() => {
        setNotice({ key: 'pdfSaved' }); setPanel(undefined);
      }} />}
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
