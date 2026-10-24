import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';

const load = (file: string, name: string, mini = false,
    deps: Record<string, unknown> = {}) => {
  const source = readFileSync(new URL(
      `../src/chrome/browser/resources/webui_browser/rail/${file}.ts`,
      import.meta.url), 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '')
      .replace(/^export /gm, '');
  const compiled = new Bun.Transpiler({loader: 'ts'}).transformSync(source);
  return new Function('SystemBackdropMaterial', 'INCOGNITO', 'MINI',
      'WINDOW_ID', ...Object.keys(deps), `${compiled}\nreturn ${name};`)(
      {kAcrylic: 0, kMica: 1, kMicaAlt: 2}, false, mini, 'test-window',
      ...Object.values(deps));
};

const Spaces = load('spaces', 'Spaces');
const PinnedTabs = load('pinned_tabs', 'PinnedTabs');
const ReopenHistory = load('pinned_tabs', 'ReopenHistory');
const nativeTabMoves = load('tab_drag', 'nativeTabMoves');
const TabDrag = load('tab_drag', 'TabDrag');
const tab = (id: string) => ({id, url: 'https://example.test/', title: id,
  favicon: {dataUrl: ''}});
const state = {activeSpace: 's', spaces: [{id: 's', name: 'S', color: '#192e50',
  activeUrl: '', pinned: [], tabs: []}]};

test('native moves use current indices and preserve collection boundaries', () => {
  const leaf = (id: string) => ({data: {tab: {id}}, children: []});
  const root = {data: {unpinnedTabs: {id: 'unpinned'}}, children: [
    leaf('a'), leaf('b'), leaf('c'),
    {data: {tabGroup: {id: 'group'}}, children: [leaf('g1'), leaf('g2')]},
    leaf('d'), leaf('e'),
  ]};
  const moves = nativeTabMoves(root, ['c', 'b', 'a', 'g2', 'g1', 'e', 'd']);
  expect(moves).toEqual([
    {id: 'c', position: {path: {components: ['unpinned']}, index: 0}},
    {id: 'b', position: {path: {components: ['unpinned']}, index: 1}},
    {id: 'e', position: {path: {components: ['unpinned']}, index: 5}},
    {id: 'g2', position: {path: {components: ['unpinned', 'group']}, index: 0}},
  ]);
  expect(nativeTabMoves(root, ['a', 'b', 'c', 'g1', 'g2', 'd', 'e'])).toEqual([]);
});

test('crossing the divider inserts immediately and crossing back reverts', () => {
  const applied: any[] = [];
  let reverted = 0;
  const host = {
    shadowRoot: {querySelector: () => ({
      getBoundingClientRect: () => ({top: 100, height: 1}),
      classList: {toggle: () => {}},
    })},
    dragSlots: (pinned: boolean) => (pinned ? ['p1', 'p2'] : ['l1', 'l2'])
        .map(id => ({id, kind: 'tab', group: ''})),
    dragElementFor: ({id}: {id: string}) => ({getBoundingClientRect: () => ({
      top: ({p1: 10, p2: 50, l1: 140, l2: 180} as Record<string, number>)[id],
      height: 20,
    })}),
    setTabPinned: () => ({tabId: 'pin-row', rowIds: ['pin-row']}),
    captureDragState: () => () => reverted++,
    applyDragSlots: (slots: any[], pinned: boolean) => applied.push({slots, pinned}),
  };
  const drag = new TabDrag(host);
  drag.tabId_ = drag.originId_ = 'sleeping-row';
  expect(drag.hoverDivider_(40)).toBe(true);
  expect(applied[0].slots.map((s: any) => s.id)).toEqual(['p1', 'pin-row', 'p2']);
  expect(drag.tabId_).toBe('pin-row');
  expect(drag.hoverDivider_(170)).toBe(true);
  expect(reverted).toBe(1);
  expect(applied[1].slots.map((s: any) => s.id))
      .toEqual(['l1', 'sleeping-row', 'l2']);
  expect(drag.tabId_).toBe('sleeping-row');
});

test('crossing inserts every selected row once', () => {
  let inserted: string[] = [];
  const host = {
    shadowRoot: {querySelector: () => ({
      getBoundingClientRect: () => ({top: 100, height: 1}),
      classList: {toggle: () => {}},
    })},
    dragSlots: () => [{id: 'p1', kind: 'tab', group: ''}],
    dragElementFor: () => ({getBoundingClientRect: () => ({top: 10, height: 20})}),
    setTabPinned: () => ({tabId: 'b', rowIds: ['a', 'b', 'p1']}),
    captureDragState: () => () => {},
    applyDragSlots: (slots: any[]) => { inserted = slots.map(s => s.id); },
  };
  const drag = new TabDrag(host);
  drag.tabId_ = drag.originId_ = 'b';
  drag.hoverDivider_(80);
  expect(inserted).toEqual(['p1', 'a', 'b']);
});

test('a cancelled drag reverts the crossing', () => {
  globalThis.cancelAnimationFrame ??= () => {};
  let reverted = 0;
  let synced = 0;
  const host = {
    shadowRoot: {querySelector: () => null},
    setTabStripNoDrag: () => {},
    setDragInProgressForDrag: () => {},
    dragElementFor: () => null,
    syncTabOrder: () => synced++,
    requestUpdate: () => {},
  };
  const drag = new TabDrag(host);
  drag.dragging_ = true;
  drag.tabId_ = 'pin-row';
  drag.revertCrossing_ = () => reverted++;
  drag.onDragEnded(false);
  expect(reverted).toBe(1);
  expect(synced).toBe(1);
  drag.dragging_ = true;
  drag.revertCrossing_ = () => reverted++;
  drag.onDragEnded(true);
  expect(reverted).toBe(1);
});

test('crossing does not place the dragged tab inside a collapsed folder', () => {
  let inserted: any;
  const host = {
    shadowRoot: {querySelector: () => ({
      getBoundingClientRect: () => ({top: 100, height: 1}),
      classList: {toggle: () => {}},
    })},
    dragSlots: () => [
      {id: 'folder', kind: 'header', group: ''},
      {id: 'hidden', kind: 'tab', group: 'folder'},
    ],
    dragElementFor: ({id}: {id: string}) => id === 'hidden' ? null : {
      getBoundingClientRect: () => ({top: 10, height: 20}),
    },
    setTabPinned: () => ({tabId: 'pin-row', rowIds: ['pin-row']}),
    captureDragState: () => () => {},
    applyDragSlots: (slots: any[]) => { inserted = slots.at(-1); },
  };
  const drag = new TabDrag(host);
  drag.tabId_ = 'loose-row';
  drag.hoverDivider_(80);
  expect(inserted).toEqual({id: 'pin-row', kind: 'tab', group: ''});
});

test('closing searches siblings and children on the left', () => {
  const spaces = new Spaces(() => {});
  spaces.restore(state, [tab('a'), tab('b'), tab('c')], new Set());
  spaces.setOpener('b', 'a');
  spaces.setOpener('c', 'a');
  expect(spaces.successorOf('c').tabId).toBe('b');
  spaces.setOpener('b', 'c');
  expect(spaces.successorOf('c').tabId).toBe('b');
});

test('sidebar refresh preserves local opener and sleep state', () => {
  const spaces = new Spaces(() => {});
  const tabs = [tab('a'), tab('b')];
  spaces.restore(state, tabs, new Set());
  spaces.setOpener('b', 'a');
  spaces.sleep('b');
  spaces.restore(state, tabs, new Set());
  expect(spaces.byTab('b').opener).toBe(spaces.byTab('a').key);
  expect(spaces.isAsleep('b')).toBe(true);
});

test('a trail outlives forgotten openers and a sidebar refresh', () => {
  const spaces = new Spaces(() => {});
  const tabs = [tab('a'), tab('b')];
  spaces.restore(state, tabs, new Set());
  expect(spaces.trailParent('b')).toBeUndefined();
  spaces.setOpener('b', 'a');
  spaces.startTrail('b');
  spaces.forgetOpeners('s');
  spaces.restore(state, tabs, new Set());
  expect(spaces.trailParent('b')?.tabId).toBe('a');
  spaces.restore(state, [tab('b')], new Set());
  expect(spaces.trailParent('b')).toBeUndefined();
});

test('trail level nests by generation and caps at the depth', () => {
  const spaces = new Spaces(() => {});
  spaces.restore(state, [tab('a'), tab('b'), tab('c'), tab('d')], new Set());
  for (const [child, parent] of [['b', 'a'], ['c', 'b'], ['d', 'c']]) {
    spaces.setOpener(child, parent);
    spaces.startTrail(child);
    spaces.setGroup(spaces.byTab(child).key, 'g');
  }
  spaces.setGroup(spaces.byTab('a').key, 'g');
  expect(['a', 'b', 'c', 'd'].map(id => spaces.trailLevel(id, 0)))
      .toEqual([0, 1, 2, 3]);
  expect(['a', 'b', 'c', 'd'].map(id => spaces.trailLevel(id, 1)))
      .toEqual([0, 0, 0, 0]);
  expect(['a', 'b', 'c', 'd'].map(id => spaces.trailLevel(id, 3)))
      .toEqual([0, 1, 2, 2]);
  spaces.setGroup(spaces.byTab('b').key, '');
  expect(spaces.trailLevel('c', 0)).toBe(0);
});

test('a reopened tab rejoins its group and a live trail parent', () => {
  const spaces = new Spaces(() => {});
  spaces.restore(state, [tab('a'), tab('b')], new Set());
  const parent = spaces.byTab('a').key;
  spaces.rejoin('b', 'g', parent);
  expect(spaces.byTab('b').group).toBe('g');
  expect(spaces.trailParent('b')?.tabId).toBe('a');
  spaces.rejoin('b', '', 'gone');
  expect(spaces.byTab('b').group).toBe('');
  expect(spaces.trailParent('b')).toBeUndefined();
});

test('a link lands after its opener\'s whole trail', () => {
  const spaces = new Spaces(() => {});
  spaces.restore(state, [tab('a'), tab('b'), tab('c'), tab('x'), tab('d')],
                 new Set());
  spaces.setOpener('b', 'a');
  spaces.startTrail('b');
  spaces.setOpener('c', 'b');
  spaces.startTrail('c');
  spaces.forgetOpeners('s');
  spaces.setOpener('d', 'a');
  spaces.placeAfterOpener('d');
  expect(spaces.tabsIn('s')).toEqual(['a', 'b', 'c', 'd', 'x']);
});

test('sidebar refresh keeps an open tab in its own space', () => {
  const spaces = new Spaces(() => {});
  const other = {...state.spaces[0], id: 'first', name: 'First',
    tabs: ['https://example.test/']};
  const saved = {activeSpace: 's', spaces: [other, state.spaces[0]]};
  spaces.restore(saved, [], new Set());
  spaces.adopt('live', 'https://example.test/');
  expect(spaces.spaceOf('live')).toBe('s');
  spaces.restore(saved, [tab('live')], new Set());
  expect(spaces.spaceOf('live')).toBe('s');
  expect(spaces.rowsIn('first')[0].tabId).toBe('');
});

test('a row already waking is not woken twice', () => {
  const spaces = new Spaces(() => {});
  const saved = {activeSpace: 's', spaces: [{...state.spaces[0],
    tabs: ['https://example.test/']}]};
  spaces.restore(saved, [], new Set());
  const row = spaces.rowsIn('s')[0];
  expect(spaces.wake(row.key)).toBe(row);
  expect(spaces.wake(row.key)).toBeUndefined();
});

test('sidebar refresh keeps a waking row and its key', () => {
  const spaces = new Spaces(() => {});
  const saved = {activeSpace: 's', spaces: [{...state.spaces[0],
    tabs: ['https://example.test/']}]};
  spaces.restore(saved, [], new Set());
  const row = spaces.wake(spaces.rowsIn('s')[0].key);
  spaces.restore(saved, [], new Set());
  expect(spaces.rowsIn('s')[0].key).toBe(row.key);
  expect(spaces.rowsIn('s')[0].pending).toBe(true);
  spaces.adopt('live', 'https://example.test/');
  spaces.bind(row.key, 'live');
  expect(spaces.rowsIn('s')).toHaveLength(1);
  expect(spaces.rowsIn('s')[0].tabId).toBe('live');
});

test('sidebar refresh keeps the key of a live row', () => {
  const spaces = new Spaces(() => {});
  const tabs = [tab('a')];
  spaces.restore(state, tabs, new Set());
  const key = spaces.byTab('a').key;
  spaces.restore(state, tabs, new Set());
  expect(spaces.byTab('a').key).toBe(key);
});

test('an arriving tab takes over a dormant row with its URL', () => {
  const spaces = new Spaces(() => {});
  const saved = {activeSpace: 's', spaces: [{...state.spaces[0],
    tabs: ['https://example.test/']}]};
  spaces.restore(saved, [], new Set());
  const dormant = spaces.rowsIn('s')[0];
  spaces.adopt('live', 'https://example.test/');
  expect(spaces.rowsIn('s')).toHaveLength(1);
  expect(spaces.rowsIn('s')[0].key).toBe(dormant.key);
  expect(spaces.rowsIn('s')[0].tabId).toBe('live');
});

test('moving a tab into a space replaces its dormant twin', () => {
  const spaces = new Spaces(() => {});
  const other = {...state.spaces[0], id: 'first', name: 'First',
    tabs: ['https://example.test/']};
  const saved = {activeSpace: 's', spaces: [other, state.spaces[0]]};
  spaces.restore(saved, [], new Set());
  spaces.adopt('live', 'https://example.test/');
  spaces.assign('live', 'first', 'https://example.test/');
  expect(spaces.rowsIn('first')).toHaveLength(1);
  expect(spaces.rowsIn('first')[0].tabId).toBe('live');
  expect(spaces.rowsIn('s')).toHaveLength(0);
});

test('an unclaimed tab binds to the waking row with its URL', () => {
  const spaces = new Spaces(() => {});
  const other = {...state.spaces[0], id: 'first', name: 'First',
    tabs: ['https://example.test/']};
  const saved = {activeSpace: 's', spaces: [other, state.spaces[0]]};
  spaces.restore(saved, [], new Set());
  const row = spaces.wake(spaces.rowsIn('first')[0].key);
  spaces.adopt('live', 'https://example.test/');
  expect(spaces.spaceOf('live')).toBe('first');
  expect(spaces.rowsIn('first')[0].key).toBe(row.key);
  expect(spaces.rowsIn('s')).toHaveLength(0);
});

test('a mini window keeps its tab in the active space', () => {
  const MiniSpaces = load('spaces', 'Spaces', true);
  const spaces = new MiniSpaces(() => {});
  const other = {...state.spaces[0], id: 'first', name: 'First',
    tabs: ['https://example.test/']};
  const saved = {activeSpace: 's', spaces: [other, state.spaces[0]]};
  spaces.restore(saved, [tab('mini')], new Set(['mini']));
  expect(spaces.spaceOf('mini')).toBe('s');
  spaces.restore(saved, [tab('mini')], new Set());
  expect(spaces.spaceOf('mini')).toBe('s');
});

test('restoring a pin never claims a loose tab by URL', () => {
  const pins = new PinnedTabs(() => {});
  const entry = pins.pin(tab('p'), 's');
  const saved = {...state, spaces: [{...state.spaces[0],
    pinned: [{...entry, id: entry.key}]}]};
  pins.restore(saved, [tab('loose'), tab('p')], new Set());
  expect(pins.entries[0].tabId).toBe('p');
  pins.release('p');
  pins.restore(saved, [tab('loose')], new Set());
  expect(pins.entries[0].tabId).toBe('');
});

test('the first restore reattaches pins to open tabs by URL', () => {
  const pins = new PinnedTabs(() => {});
  const pin = {id: 'pinned-a', home: 'https://example.test/',
    url: 'https://example.test/', title: '', favicon: ''};
  const saved = {...state, spaces: [{...state.spaces[0], pinned: [pin]}]};
  pins.restore(saved, [tab('open')], new Set());
  expect(pins.entries[0].tabId).toBe('open');
  expect(pins.entries[0].key).toBe('pinned-a');
});

test('pin keys are unique and legacy duplicates get distinct keys', () => {
  const pins = new PinnedTabs(() => {});
  const first = pins.pin(tab('a'), 's');
  const second = pins.pin(tab('b'), 's');
  expect(first.key).not.toBe(second.key);
  const legacy = {home: 'https://example.test/', url: 'https://example.test/',
    title: '', favicon: ''};
  const saved = {...state, spaces: [{...state.spaces[0],
    pinned: [legacy, legacy]}]};
  pins.restore(saved, [tab('a'), tab('b')], new Set());
  expect(pins.entries.map((entry: any) => entry.tabId)).toEqual(['a', 'b']);
  expect(new Set(pins.entries.map((entry: any) => entry.key)).size).toBe(2);
});

test('reverting pins and rows drops tabs that left the window', () => {
  const pins = new PinnedTabs(() => {});
  const spaces = new Spaces(() => {});
  spaces.restore(state, [tab('a'), tab('b')], new Set());
  const entry = pins.pin(tab('a'), 's');
  const pinSnapshot = pins.snapshot();
  const rowSnapshot = spaces.snapshot();
  pins.unpin(entry.key);
  entry.title = 'mutated';
  pins.revert(pinSnapshot, new Set(['b']));
  spaces.revert(rowSnapshot, new Set(['b']));
  expect(pins.entries[0].key).toBe(entry.key);
  expect(pins.entries[0].tabId).toBe('');
  expect(spaces.byTab('a')).toBeUndefined();
  expect(spaces.byTab('b')).toBeDefined();
});

test('a pin has left home only when a live tab shows another page', () => {
  const pins = new PinnedTabs(() => {});
  const entry = pins.pin({...tab('p'), url: 'https://Example.test/docs/'}, 's');
  expect(pins.hasLeftHome('p')).toBe(false);
  pins.track({...tab('p'), url: 'https://example.test/docs?page=2#top'});
  expect(pins.hasLeftHome('p')).toBe(false);
  pins.track({...tab('p'), url: 'https://example.test/other'});
  expect(pins.hasLeftHome('p')).toBe(true);
  expect(pins.hasLeftHome(entry.key)).toBe(true);
  pins.release('p');
  expect(pins.hasLeftHome(entry.key)).toBe(false);
});

test('a removed pin comes back once, at its old position', () => {
  const pins = new PinnedTabs(() => {});
  const keys = ['a', 'b', 'c'].map(id => pins.pin(tab(id), 's').key);
  pins.release('b');
  const removed = pins.remove(keys[1]);
  expect(pins.entries.map((entry: any) => entry.key)).toEqual([keys[0], keys[2]]);
  pins.reinstate(removed);
  pins.reinstate(removed);
  expect(pins.entries.map((entry: any) => entry.key)).toEqual(keys);
  expect(pins.entries[1].tabId).toBe('');
});

test('reopen walks pin removals and tab closes newest first', () => {
  const history = new ReopenHistory();
  const pin = {entry: {key: 'k'}, index: 0};
  history.closedTab();
  history.removedPin(pin);
  history.closedPinTab('live', 'https://example.test/');
  expect(history.next()).toBeNull();
  expect(history.next()).toBe(pin);
  expect(history.next()).toBeNull();
  expect(history.next()).toBeNull();
});

test('a reopened pinned tab finds its own row by the page it showed', () => {
  const pins = new PinnedTabs(() => {});
  const history = new ReopenHistory();
  const entry = pins.pin(tab('p'), 's');
  pins.track({...tab('p'), url: 'https://example.test/away'});
  history.closedPinTab(entry.key, pins.byTab('p').url);
  pins.release('p');
  expect(history.claimPinTab('https://example.test/')).toBeUndefined();
  expect(history.claimPinTab('https://example.test/away')).toBe(entry.key);
  expect(history.claimPinTab('https://example.test/away')).toBeUndefined();
});

test('merging native order keeps current items and drops stale ones', () => {
  const mergeItemOrder = load('tab_drag', 'mergeItemOrder');
  const item = (id: string, title = id) =>
      ({type: 'tab', id, tabData: {title}});
  const current = [item('a', 'fresh'), item('b'), item('new')];
  const merged = mergeItemOrder(current, [item('b'), item('gone'), item('a')]);
  expect(merged.map((i: any) => i.id)).toEqual(['b', 'a', 'new']);
  expect(merged[1]).toBe(current[0]);
});

test('deleting the active space lands on its neighbor', () => {
  const space = (id: string) =>
      ({id, name: id, color: '#192e50', activeUrl: '', pinned: [], tabs: []});
  const spaces = new Spaces(() => {});
  spaces.restore(
      {activeSpace: 'b', spaces: ['a', 'b', 'c'].map(space)}, [], new Set());
  spaces.remove('b');
  expect(spaces.activeId).toBe('a');
  spaces.remove('a');
  expect(spaces.activeId).toBe('c');
  expect(spaces.fallbackFor('c')).toBe('');
});

test('the space board lists every space with its pinned and today tabs', () => {
  const spaceBoard = load('space_board', 'spaceBoard', false,
      {layoutPinned: load('sections', 'layoutPinned')});
  const Folders = load('folders', 'Folders');
  const space = (id: string, tabs: string[] = []) =>
      ({id, name: id, color: '#192e50', activeUrl: '', pinned: [], tabs});
  const spaces = new Spaces(() => {});
  spaces.restore({activeSpace: 'a', spaces: [
    space('a'), space('b', ['https://asleep.test/']),
  ]}, [], new Set());
  spaces.adopt('live', 'https://example.test/');
  spaces.adopt('kept', 'https://example.test/');
  spaces.adopt('filed', 'https://example.test/');
  spaces.adopt('grouped', 'https://example.test/');
  const pinned = new PinnedTabs(() => {});
  const pin = pinned.pin(tab('kept'), 'a');
  const filed = pinned.pin(tab('filed'), 'a');
  const folders = new Folders(() => {});
  const folder = folders.create('a', 'Work');
  const empty = folders.create('b', 'Empty');
  pinned.setFolder(filed.key, folder.id);
  const tidyGroups = new Folders(() => {});
  const group = tidyGroups.create('a', 'Research');
  spaces.setGroup(spaces.byTab('grouped').key, group.id);
  const items = ['live', 'kept', 'filed', 'grouped'].map(id => ({type: 'tab',
    id, tabData: {...tab(id), title: `${id} now`}}));
  const board = spaceBoard(items, pinned, spaces, folders, tidyGroups);
  const layout = (entries: any[]) => entries.map(one => one.kind === 'row' ?
      [one.row.id, one.row.title] :
      [one.section.folder.name, one.section.rows.map((row: any) => row.id)]);
  expect(layout(board.a.pinned))
      .toEqual([[pin.key, 'kept now'], ['Work', [filed.key]]]);
  expect(layout(board.a.today))
      .toEqual([['live', 'live now'], ['Research', ['grouped']]]);
  expect(board.b.pinned)
      .toEqual([{kind: 'folder', section: {folder: empty, rows: []}}]);
  expect(board.b.today.map((one: any) => one.row.url))
      .toEqual(['https://asleep.test/']);
  expect(board.b.today[0].row.id).toBe(spaces.rowsIn('b')[0].key);
  const spare = tidyGroups.create('a', 'Spare');
  tidyGroups.moveTo(spare.id, 'b');
  const moved = spaceBoard(items, pinned, spaces, folders, tidyGroups);
  expect(layout(moved.a.today))
      .toEqual([['live', 'live now'], ['Research', ['grouped']]]);
  expect(layout(moved.b.today))
      .toEqual([[spaces.rowsIn('b')[0].key, 'https://asleep.test/'],
                ['Spare', []]]);
});

test('space shortcuts address spaces by position', () => {
  const runCommand = load('command_registry', 'runCommand');
  const picked: number[] = [];
  const host = {selectSpaceAt: (index: number) => picked.push(index)};
  runCommand('select-space:0', host);
  runCommand('select-space:7', host);
  runCommand('select-space:last', host);
  expect(picked).toEqual([0, 7, -1]);
});

const memoryStore = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

test('closed tabs land in the archive newest first, once per url and space', () => {
  const ArchiveStore = load('tab_archive', 'ArchiveStore');
  let now = 1_000;
  const archive = new ArchiveStore(memoryStore(), () => now);
  const closed = (id: string, url: string, space = 's') =>
      ({id, url, title: id, favicon: '', space});
  archive.add([closed('a', 'https://a.test/')]);
  now = 2_000;
  archive.add([closed('b', 'https://b.test/'), closed('c', 'https://a.test/')]);
  expect(archive.list().map((tab: any) => tab.id)).toEqual(['b', 'c']);
  archive.add([closed('d', 'https://a.test/', 'other')]);
  expect(archive.list().map((tab: any) => tab.id)).toEqual(['d', 'b', 'c']);
  expect(archive.take('b').url).toBe('https://b.test/');
  expect(archive.take('b')).toBeUndefined();
  expect(archive.list().map((tab: any) => tab.id)).toEqual(['d', 'c']);
});

test('the archive drops month-old entries and survives a corrupt store', () => {
  const ArchiveStore = load('tab_archive', 'ArchiveStore');
  const store = memoryStore();
  let now = 0;
  const archive = new ArchiveStore(store, () => now);
  archive.add([{id: 'old', url: 'https://old.test/', title: '', favicon: '',
    space: 's'}]);
  now = 31 * 24 * 60 * 60 * 1000;
  expect(archive.list()).toEqual([]);
  store.setItem('rail.archivedTabs', '{broken');
  expect(archive.list()).toEqual([]);
});

test('untouched rows archive after the configured hours', () => {
  const TabArchive = load('tab_archive', 'TabArchive');
  const hour = 60 * 60 * 1000;
  let now = 0;
  let rows = [
    {key: 'a', url: '', profile: ''},
    {key: 'b', url: '', profile: ''},
  ];
  const archived: string[][] = [];
  const clock = new TabArchive(
      memoryStore(), () => rows, (keys: string[]) => archived.push(keys),
      () => now);
  clock.setHours({'': 12});
  clock.tick();
  expect(archived).toEqual([]);
  now = 11 * hour;
  clock.touch('b');
  clock.tick();
  expect(archived).toEqual([]);
  now = 12 * hour;
  clock.tick();
  expect(archived).toEqual([['a']]);
  rows = [{key: 'b', url: '', profile: ''}];
  now = 22 * hour;
  clock.setHours({'': 0});
  clock.tick();
  now = 40 * hour;
  clock.setHours({'': 12});
  clock.tick();
  expect(archived).toEqual([['a']]);
});

test('each profile archives on its own hours and the rest follow the default', () => {
  const TabArchive = load('tab_archive', 'TabArchive');
  const hour = 60 * 60 * 1000;
  let now = 0;
  const rows = [
    {key: 'home', url: '', profile: ''},
    {key: 'work', url: '', profile: 'work'},
    {key: 'side', url: '', profile: 'side'},
    {key: 'kept', url: '', profile: 'kept'},
  ];
  const archived: string[] = [];
  const clock = new TabArchive(
      memoryStore(), () => rows.filter(row => !archived.includes(row.key)),
      (keys: string[]) => archived.push(...keys), () => now);
  clock.setHours({'': 12, work: 1, kept: 0});
  clock.tick();
  now = hour;
  clock.tick();
  expect(archived).toEqual(['work']);
  now = 12 * hour;
  clock.tick();
  expect(archived).toEqual(['work', 'home', 'side']);
  now = 100 * hour;
  clock.tick();
  expect(archived).toEqual(['work', 'home', 'side']);
});

test('the archive hours fall back to the default profile', () => {
  const archiveHoursFor = load('tab_archive', 'archiveHoursFor');
  expect(archiveHoursFor({}, 'work')).toBe(12);
  expect(archiveHoursFor({'': 168}, 'work')).toBe(168);
  expect(archiveHoursFor({'': 168, work: 0}, 'work')).toBe(0);
});

test('rows the candidate pass keeps busy are not archived', () => {
  const TabArchive = load('tab_archive', 'TabArchive');
  const hour = 60 * 60 * 1000;
  let now = 0;
  const archived: string[][] = [];
  const store = memoryStore();
  const seen = () => JSON.parse(store.getItem('rail.tabSeen') ?? '{}');
  const clock: any = new TabArchive(
      store, () => {
        clock.touch('playing');
        return [{key: 'idle', url: '', profile: ''}];
      },
      (keys: string[]) => archived.push(keys), () => now);
  clock.tick();
  expect(seen()).toEqual({playing: 0, idle: 0});
  now = 13 * hour;
  clock.tick();
  expect(archived).toEqual([['idle']]);
  expect(seen()).toEqual({playing: 13 * hour});
});

test('archived tabs group by day', () => {
  const groupByDay = load('tab_archive', 'groupByDay');
  const noon = new Date(2026, 9, 23, 12).getTime();
  const at = (id: string, time: number) => ({id, archivedAt: time});
  const day = 24 * 60 * 60 * 1000;
  const days = groupByDay(
      [at('now', noon), at('last-night', noon - 13 * 60 * 60 * 1000),
       at('tuesday', noon - 3 * day), at('ancient', noon - 40 * day)],
      noon);
  expect(days.map((group: any) => [group.label,
    group.tabs.map((tab: any) => tab.id)])).toEqual([
    ['Today', ['now']],
    ['Yesterday', ['last-night']],
    ['This Week', ['tuesday']],
    ['Older', ['ancient']],
  ]);
});

test('archived tabs of one group gather under the group within a day', () => {
  const groupByDay = load('tab_archive', 'groupByDay');
  const ArchiveStore = load('tab_archive', 'ArchiveStore');
  const noon = new Date(2026, 9, 23, 12).getTime();
  const research = {id: 'g', name: 'Research'};
  const at = (id: string, group?: object) =>
      ({id, url: `https://${id}.test/`, title: id, favicon: '', space: 's',
        group, archivedAt: noon});
  const [today] = groupByDay(
      [at('a', research), at('loose'), at('b', research)], noon);
  expect(today.entries.map((entry: any) => entry.kind === 'tab' ?
      entry.tab.id : [entry.group.name, entry.tabs.map((tab: any) => tab.id)]))
      .toEqual([['Research', ['a', 'b']], 'loose']);
  const archive = new ArchiveStore(memoryStore(), () => noon);
  archive.add([at('a', research), at('loose'), at('b', research)]);
  expect(archive.takeMany(['b', 'gone', 'a']).map((tab: any) => tab.id))
      .toEqual(['b', 'a']);
  expect(archive.list().map((tab: any) => tab.id)).toEqual(['loose']);
});

test('restoring archived tabs brings their group back once', () => {
  const restoreArchivedRows = load('tab_archive', 'restoreArchivedRows');
  const Folders = load('folders', 'Folders');
  const spaces = new Spaces(() => {});
  spaces.restore(state, [tab('a')], new Set());
  const tidyGroups = new Folders(() => {});
  const archived = (id: string, space: string, group?: object) =>
      ({id, url: `https://${id}.test/`, title: id, favicon: '', space, group,
        archivedAt: 0});
  const research = {id: 'g', name: 'Research'};
  const rows = restoreArchivedRows(
      [archived('x', 's', research), archived('y', 'gone', research),
       archived('z', 'gone')],
      spaces, tidyGroups);
  expect(rows.map((row: any) => [row.url, row.space, row.group])).toEqual([
    ['https://x.test/', 's', 'g'],
    ['https://y.test/', 's', 'g'],
    ['https://z.test/', 's', ''],
  ]);
  expect(tidyGroups.in('s').map((group: any) => [group.id, group.name]))
      .toEqual([['g', 'Research']]);
});

test('an empty group keeps its place and new tabs open below it', () => {
  const deps = {dormantTabData: load('pinned_tabs', 'dormantTabData')};
  const splitSections = load('sections', 'splitSections', false, deps);
  const reanchorEmptyGroups =
      load('sections', 'reanchorEmptyGroups', false, deps);
  const Folders = load('folders', 'Folders');
  const spaces = new Spaces(() => {});
  spaces.restore(state, [tab('a'), tab('b')], new Set());
  const pinned = new PinnedTabs(() => {});
  const tidyGroups = new Folders(() => {});
  const group = tidyGroups.create('s', 'G');
  const legacy = tidyGroups.create('s', 'Legacy');
  spaces.setGroup(spaces.byTab('b').key, group.id);
  let looseEntries: any[] = [];
  const layout = (ids: string[]) => {
    reanchorEmptyGroups(looseEntries, spaces, tidyGroups);
    ({looseEntries} = splitSections(
        ids.map(id => ({type: 'tab', id, tabData: tab(id)})), pinned, spaces,
        new Folders(() => {}), tidyGroups));
    return looseEntries.map((entry: any) => entry.kind === 'item' ?
        entry.item.id : `[${entry.section.group.name}]`);
  };
  expect(layout(['a', 'b'])).toEqual(['a', '[G]', '[Legacy]']);
  spaces.adopt('c', 'https://c.test/');
  expect(layout(['a', 'b', 'c'])).toEqual(['a', '[G]', '[Legacy]', 'c']);
  spaces.forget('b');
  expect(layout(['a', 'c'])).toEqual(['a', '[G]', '[Legacy]', 'c']);
  spaces.adopt('d', 'https://d.test/');
  expect(layout(['a', 'c', 'd'])).toEqual(['a', '[G]', '[Legacy]', 'c', 'd']);
  spaces.forget('a');
  expect(layout(['c', 'd'])).toEqual(['[G]', '[Legacy]', 'c', 'd']);
});
