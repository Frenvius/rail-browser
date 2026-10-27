import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';

const transpile = (url: URL) => {
  const source = readFileSync(url, 'utf8')
      .replace(/^import[\s\S]*?;\r?\n/gm, '')
      .replace(/^export type \{[^}]*\};\r?\n/gm, '')
      .replace(/^export /gm, '')
      .replace(/\baccessor /g, '');
  return new Bun.Transpiler({loader: 'ts'}).transformSync(source);
};

const compile = (file: string) => transpile(new URL(
    `../src/chrome/browser/resources/webui_browser/rail/${file}.ts`,
    import.meta.url));

const load = (file: string, name: string, mini = false,
    deps: Record<string, unknown> = {}) => {
  const compiled = compile(file);
  return new Function('SystemBackdropMaterial', 'INCOGNITO', 'MINI',
      'WINDOW_ID', ...Object.keys(deps), `${compiled}\nreturn ${name};`)(
      {kAcrylic: 0, kMica: 1, kMicaAlt: 2}, false, mini, 'test-window',
      ...Object.values(deps));
};

const mergeState = new Function('loadTimeData', 'location',
    `${compile('sidebar_state')}\nreturn mergeState;`)(
    {isInitialized: () => false}, {search: ''});
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

const twoSpaces = {activeSpace: 's', spaces: [
  {...state.spaces[0], id: 'other', name: 'Other',
    tabs: [{id: 'asleep', url: 'https://asleep.test/', title: 'Asleep',
      favicon: '', group: 'other-group'}]},
  state.spaces[0],
]};

test('an empty id never resolves to a sleeping row', () => {
  const spaces = new Spaces(() => {});
  spaces.restore(twoSpaces, [], new Set());
  expect(spaces.rowsIn('other')[0].tabId).toBe('');
  expect(spaces.rowFor('')).toBeUndefined();
});

test('a tab without an opener never joins a group in another space', () => {
  const spaces = new Spaces(() => {});
  spaces.restore(twoSpaces, [], new Set());
  spaces.adopt('routed', 'https://routed.test/');
  const created: string[] = [];
  spaces.groupWithOpener('routed', (spaceId: string) => {
    created.push(spaceId);
    return 'new-group';
  });
  expect(created).toEqual([]);
  expect(spaces.byTab('routed').group).toBe('');
  expect(spaces.rowsIn('other')[0].group).toBe('other-group');
  expect(spaces.keysInGroup('other-group'))
      .toEqual([spaces.rowsIn('other')[0].key]);
});

test('a link only groups with an opener in its own space', () => {
  const spaces = new Spaces(() => {});
  spaces.restore(twoSpaces, [tab('opener'), tab('routed')], new Set());
  spaces.assign('opener', 'other', 'https://example.test/');
  spaces.setGroup('opener', 'other-group');
  spaces.byTab('routed').opener = spaces.byTab('opener').key;
  spaces.groupWithOpener('routed', () => 'new-group');
  expect(spaces.byTab('routed').group).toBe('');
});

test('a row filed under another space\'s group leaves it on restore', () => {
  const spaces = new Spaces(() => {});
  const saved = {activeSpace: 's', spaces: [twoSpaces.spaces[0], {
    ...state.spaces[0], tabs: [{id: 'stray', url: 'https://stray.test/',
      title: '', favicon: '', group: 'other-group'}],
  }]};
  spaces.restore(saved, [], new Set());
  spaces.dropForeignGroups(
      (id: string) => id === 'other-group' ? 'other' : undefined);
  expect(spaces.rowsIn('s')[0].group).toBe('');
  expect(spaces.rowsIn('other')[0].group).toBe('other-group');
});

test('a tab moved to another space leaves its group behind', () => {
  const spaces = new Spaces(() => {});
  spaces.restore(twoSpaces, [tab('a'), tab('b')], new Set());
  spaces.setGroup('a', 'home-group');
  spaces.setGroup('b', 'home-group');
  spaces.assign('a', 's', 'https://example.test/');
  expect(spaces.byTab('a').group).toBe('home-group');
  spaces.assign('a', 'other', 'https://example.test/');
  expect(spaces.byTab('a').group).toBe('');
  expect(spaces.keysInGroup('home-group')).toEqual(['b']);
  const sleeper = spaces.rowsIn('other')[0];
  spaces.moveDormant(sleeper.key, 's');
  expect(spaces.rowFor(sleeper.key).group).toBe('');
});

test('a native group never files a tab from another space', () => {
  const NativeGroupLinks = load('native_groups', 'NativeGroupLinks');
  const Folders = load('folders', 'Folders');
  const spaces = new Spaces(() => {});
  const tidy = new Folders(() => {});
  spaces.restore(twoSpaces, [tab('a'), tab('b')], new Set());
  spaces.assign('b', 'other', 'https://example.test/');
  const links = new NativeGroupLinks();
  links.reconcile([{id: 'native', visual: {title: 'Work', isCollapsed: false},
    tabs: ['a', 'b'], exit: {}}], spaces, tidy);
  const folder = tidy.in('s')[0];
  expect(spaces.byTab('a').group).toBe(folder.id);
  expect(spaces.byTab('b').group).toBe('');
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

test('a startup beside another window matches an earlier run by URL', () => {
  const spaces = new Spaces(() => {});
  const ids = ['a', 'b', 'c'];
  const url = (id: string) => `https://${id}.test/`;
  const saved = {activeSpace: 'a', spaces: ids.map(space => ({
    ...state.spaces[0], id: space, name: space, activeUrl: '',
    tabs: [0, 1].map(index => ({id: `${space}${index}`,
      url: url(`${space}${index}`), title: '', favicon: '', owner: 'old.w',
      tab: `old-${space}${index}`})),
  }))};
  saved.spaces[0]!.tabs[1]!.tab = 'b0';
  const tabs = ids.flatMap(space => [0, 1].map(index =>
      ({...tab(`${space}${index}`), url: url(`${space}${index}`)})));
  spaces.restore(saved, tabs, new Set(),
      (owner?: string) => !!owner && owner.startsWith('old.'));
  for (const space of ids) {
    expect(spaces.rowsIn(space).map((row: {tabId: string}) => row.tabId))
        .toEqual([`${space}0`, `${space}1`]);
  }
  expect(spaces.remotes()).toEqual([]);
});

test('a window binding a row keeps its tab when the id repeats a run', () => {
  const row = {id: 'r', url: 'https://example.test/'};
  const base = {tabs: [{...row, owner: 'old.w', tab: '10:2'}]};
  const mine = {tabs: [{...row, owner: 'new.a', tab: '10:2'}]};
  const theirs = {tabs: [row]};
  for (const merged of [mergeState(base, mine, theirs),
           mergeState(base, theirs, mine)]) {
    expect(merged.tabs[0]).toEqual({...row, owner: 'new.a', tab: '10:2'});
  }
  const moved = {tabs: [{...row, owner: 'old.w', tab: '11:2'}]};
  expect(mergeState(base, moved, base).tabs[0].tab).toBe('11:2');
  expect(mergeState(base, base, theirs).tabs[0]).toEqual(row);
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

test('a pin from an earlier run never binds a tab by its old id', () => {
  const pins = new PinnedTabs(() => {});
  const pin = {id: 'pinned-a', home: 'https://example.test/',
    url: 'https://example.test/', title: '', favicon: '', owner: 'old.w',
    tab: 'other'};
  const saved = {...state, spaces: [{...state.spaces[0], pinned: [pin]}]};
  pins.restore(saved,
      [{...tab('other'), url: 'https://other.test/'}, tab('open')], new Set(),
      (owner?: string) => !!owner && owner.startsWith('old.'));
  expect(pins.entries[0].tabId).toBe('open');
  expect(pins.entries[0].remote).toBe('');
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

const spacesWith = (ids: string[], saved: object = state) => {
  const spaces = new Spaces(() => {});
  spaces.restore(saved, ids.map(tab), new Set());
  return spaces;
};
const URL_OF = 'https://example.test/';

test('closing a lone tab picks the next row, then the previous one', () => {
  const spaces = spacesWith(['a', 'b', 'c']);
  expect(spaces.successorOf('b').tabId).toBe('c');
  expect(spaces.successorOf('c').tabId).toBe('b');
  expect(spaces.successorOf('gone')).toBeUndefined();
});

test('closing a child goes back to its opener once no sibling is left', () => {
  const spaces = spacesWith(['a', 'x', 'b']);
  spaces.setOpener('b', 'a');
  expect(spaces.successorOf('b').tabId).toBe('a');
  spaces.forget('a');
  expect(spaces.successorOf('b').tabId).toBe('x');
});

test('closing an opener prefers its child over a nearer sibling', () => {
  const spaces = spacesWith(['a', 'b', 'd', 'c']);
  spaces.setOpener('b', 'a');
  spaces.setOpener('d', 'a');
  spaces.setOpener('c', 'b');
  expect(spaces.successorOf('b').tabId).toBe('c');
});

test('closing several tabs never picks one that closes with them', () => {
  const spaces = spacesWith(['a', 'b', 'c', 'd']);
  expect(spaces.successorOf('b', new Set(['b', 'c'])).tabId).toBe('d');
  expect(spaces.successorOf('b', new Set(['b', 'c', 'd'])).tabId).toBe('a');
  spaces.setOpener('c', 'b');
  expect(spaces.successorOf('b', new Set(['b', 'c'])).tabId).toBe('d');
});

test('closing stays inside the space and may land on a sleeping row', () => {
  const spaces = spacesWith(['a', 'b'], twoSpaces);
  spaces.assign('b', 'other', URL_OF);
  expect(spaces.successorOf('a')).toBeUndefined();
  expect(spaces.successorOf('b').key).toBe(spaces.rowsIn('other')[0].key);
});

test('closing never lands on a tab another window holds', () => {
  const saved = {activeSpace: 's', spaces: [{...state.spaces[0], tabs: [
    {id: 'far', url: 'https://far.test/', title: '', favicon: '',
      owner: 'other.w', tab: 'r1'}]}]};
  const spaces = spacesWith(['a'], saved);
  expect(spaces.rowsIn('s').map((row: any) => row.remote)).toEqual(['r1', '']);
  expect(spaces.successorOf('a')).toBeUndefined();
});

test('an opener from another space is never recorded', () => {
  const spaces = spacesWith(['a', 'b'], twoSpaces);
  spaces.assign('b', 'other', URL_OF);
  spaces.setOpener('a', 'b');
  expect(spaces.byTab('a').opener).toBe('');
  expect(spaces.hasOpeners()).toBe(false);
});

test('openers survive only while the native strip still reports them', () => {
  const spaces = spacesWith(['a', 'b', 'c']);
  spaces.setOpener('b', 'a');
  spaces.setOpener('c', 'a');
  expect(spaces.retainOpeners(new Map([['b', 'a'], ['c', 'b']]))).toBe(true);
  expect(spaces.byTab('b').opener).toBe(spaces.byTab('a').key);
  expect(spaces.byTab('c').opener).toBe('');
  expect(spaces.retainOpeners(new Map([['b', 'a']]))).toBe(false);
});

test('tabs opened from one page count as related', () => {
  const spaces = spacesWith(['a', 'b', 'c', 'd']);
  spaces.setOpener('b', 'a');
  spaces.setOpener('c', 'a');
  expect(spaces.relatedRows('a', 'b')).toBe(true);
  expect(spaces.relatedRows('c', 'a')).toBe(true);
  expect(spaces.relatedRows('b', 'c')).toBe(true);
  expect(spaces.relatedRows('a', 'd')).toBe(false);
  expect(spaces.relatedRows('d', 'gone')).toBe(true);
});

test('forgetting openers stays inside one space', () => {
  const spaces = spacesWith(['a', 'b', 'c', 'd'], twoSpaces);
  spaces.assign('c', 'other', URL_OF);
  spaces.assign('d', 'other', URL_OF);
  spaces.setOpener('b', 'a');
  spaces.setOpener('d', 'c');
  spaces.forgetOpeners('s');
  expect(spaces.byTab('b').opener).toBe('');
  expect(spaces.byTab('d').opener).toBe(spaces.byTab('c').key);
  spaces.clearOpener('d');
  expect(spaces.hasOpeners()).toBe(false);
});

test('each space remembers the tab it was left on', () => {
  const spaces = spacesWith(['a', 'b', 'c'], twoSpaces);
  spaces.assign('c', 'other', URL_OF);
  spaces.noteActive('b');
  spaces.noteActive('c');
  expect(spaces.activeId).toBe('other');
  expect(spaces.lastActiveIn('s')).toBe('b');
  expect(spaces.lastActiveIn('other')).toBe('c');
  spaces.restore(twoSpaces, [tab('a'), tab('b'), tab('c')], new Set());
  expect(spaces.lastActiveIn('s')).toBe('b');
  expect(spaces.lastActiveIn('other')).toBe('c');
});

test('a space falls back to its last live tab when its active row sleeps', () => {
  const spaces = spacesWith(['a', 'c'], twoSpaces);
  spaces.assign('c', 'other', URL_OF);
  expect(spaces.activeRow('other').tabId).toBe('');
  expect(spaces.lastActiveIn('other')).toBe('c');
  spaces.noteActive('c');
  spaces.forget('c');
  expect(spaces.lastActiveIn('other')).toBe('');
});

test('entering an empty space wakes the row it was left on, once', () => {
  const spaces = spacesWith(['a'], twoSpaces);
  expect(spaces.wakeActive('s')).toBeUndefined();
  const row = spaces.wakeActive('other');
  expect(row.url).toBe('https://asleep.test/');
  expect(row.pending).toBe(true);
  expect(spaces.wakeActive('other')).toBeUndefined();
});

test('a saved active page picks the active row on restore', () => {
  const saved = {activeSpace: 's', spaces: [{...state.spaces[0],
    activeUrl: 'https://two.test/',
    tabs: ['https://one.test/', 'https://two.test/']}]};
  const spaces = spacesWith([], saved);
  expect(spaces.activeUrlIn('s')).toBe('https://two.test/');
});

test('a tab moved onto its sleeping twin inherits the active row', () => {
  const saved = {...twoSpaces, spaces: [
    {...twoSpaces.spaces[0], activeUrl: 'https://asleep.test/'},
    state.spaces[0]]};
  const spaces = spacesWith([], saved);
  spaces.adopt('live', 'https://asleep.test/');
  spaces.assign('live', 'other', 'https://asleep.test/');
  expect(spaces.rowsIn('other')).toHaveLength(1);
  expect(spaces.activeRow('other').tabId).toBe('live');
});

test('a tab sleeps once and stirs back', () => {
  const spaces = spacesWith(['a']);
  expect(spaces.sleep('a')).toBe(true);
  expect(spaces.sleep('a')).toBe(false);
  expect(spaces.isAsleep('a')).toBe(true);
  spaces.stir('a');
  expect(spaces.isAsleep('a')).toBe(false);
  expect(spaces.sleep('gone')).toBe(false);
  expect(spaces.isAsleep('gone')).toBe(false);
});

test('a detached tab keeps its row for the tab that rebuilds it', () => {
  const spaces = spacesWith(['a', 'b']);
  spaces.sleep('a');
  const key = spaces.byTab('a').key;
  expect(spaces.detach('a')).toBe(key);
  expect(spaces.rowFor(key))
      .toMatchObject({tabId: '', pending: true, asleep: false});
  spaces.adopt('rebuilt', URL_OF);
  expect(spaces.byTab('rebuilt').key).toBe(key);
  expect(spaces.tabsIn('s')).toEqual(['rebuilt', 'b']);
});

test('only a sleeping row can be dropped', () => {
  const spaces = spacesWith(['a'], twoSpaces);
  expect(spaces.drop(spaces.byTab('a').key)).toBe(false);
  expect(spaces.drop(spaces.rowsIn('other')[0].key)).toBe(true);
  expect(spaces.rowsIn('other')).toEqual([]);
});

test('a link joins the group its opener is already in', () => {
  const spaces = spacesWith(['a', 'b']);
  spaces.setGroup('a', 'g');
  spaces.setOpener('b', 'a');
  spaces.groupWithOpener('b', () => {
    throw new Error('created a group');
  });
  expect(spaces.keysInGroup('g')).toEqual(['a', 'b']);
});

test('a link and a loose opener form a group named after the opener', () => {
  const spaces = spacesWith(['a', 'b']);
  spaces.track(tab('a'));
  spaces.setOpener('b', 'a');
  const created: string[][] = [];
  spaces.groupWithOpener('b', (spaceId: string, name: string) => {
    created.push([spaceId, name]);
    return 'new';
  });
  expect(created).toEqual([['s', 'a']]);
  expect(spaces.keysInGroup('new')).toEqual(['a', 'b']);
});

test('a grouped link stays in its own group', () => {
  const spaces = spacesWith(['a', 'b']);
  spaces.setGroup('a', 'g');
  spaces.setGroup('b', 'mine');
  spaces.setOpener('b', 'a');
  spaces.groupWithOpener('b', () => 'new');
  expect(spaces.byTab('b').group).toBe('mine');
});

test('ungrouping releases every row of the group, sleeping ones too', () => {
  const saved = {activeSpace: 's', spaces: [{...state.spaces[0], tabs: [
    {id: 'z', url: 'https://z.test/', title: '', favicon: '', group: 'g'}]}]};
  const spaces = spacesWith(['a', 'b'], saved);
  spaces.setGroup('a', 'g');
  spaces.setGroup('b', 'h');
  expect(spaces.keysInGroup('g')).toEqual(['z', 'a']);
  spaces.clearGroup('g');
  expect(spaces.keysInGroup('g')).toEqual([]);
  expect(spaces.keysInGroup('h')).toEqual(['b']);
});

test('a tab created for a space lands there, not in the active one', () => {
  const spaces = spacesWith([], twoSpaces);
  spaces.claim('new', 'other');
  expect(spaces.requested('new')).toBe(true);
  spaces.adopt('new', 'https://new.test/');
  expect(spaces.spaceOf('new')).toBe('other');
  expect(spaces.requested('new')).toBe(false);
  spaces.claim('new', 's');
  expect(spaces.spaceOf('new')).toBe('s');
  spaces.claim('late', 'gone');
  expect(spaces.requested('late')).toBe(false);
});

test('a claimed tab takes its space\'s waking row even after a redirect', () => {
  const spaces = spacesWith([], twoSpaces);
  const row = spaces.wake(spaces.rowsIn('other')[0].key);
  spaces.claim('t', 'other');
  spaces.adopt('t', 'https://redirected.test/');
  expect(spaces.byTab('t').key).toBe(row.key);
  expect(spaces.rowsIn('other')).toHaveLength(1);
  expect(spaces.rowsIn('s')).toHaveLength(0);
});

test('tabs being created count as requested until each one settles', () => {
  const spaces = spacesWith([]);
  spaces.expectTab();
  spaces.expectTab();
  spaces.settleTab();
  expect(spaces.requested('any')).toBe(true);
  spaces.settleTab();
  spaces.settleTab();
  expect(spaces.requested('any')).toBe(false);
  spaces.expectTab();
  expect(spaces.requested('any')).toBe(true);
});

test('stepping through spaces wraps around and ignores unknown ids', () => {
  const spaces = spacesWith([], twoSpaces);
  expect(spaces.peek(1)).toBe('other');
  spaces.step(1);
  expect(spaces.activeId).toBe('other');
  spaces.step(-1);
  expect(spaces.activeId).toBe('s');
  spaces.select('gone');
  expect(spaces.activeId).toBe('s');
});

test('moving a space stops at either end', () => {
  const spaces = spacesWith([], twoSpaces);
  const order = () => spaces.all.map((space: any) => space.id);
  spaces.move('s', -1);
  expect(order()).toEqual(['s', 'other']);
  spaces.move('s', -1);
  spaces.move('other', 1);
  expect(order()).toEqual(['s', 'other']);
});

test('removing a space hands back its live tabs and drops its rows', () => {
  const spaces = spacesWith(['a', 'c'], twoSpaces);
  spaces.assign('c', 'other', URL_OF);
  expect(spaces.remove('other')).toEqual(['c']);
  expect(spaces.rowsIn('other')).toEqual([]);
  expect(spaces.byTab('c')).toBeUndefined();
  expect(spaces.activeId).toBe('s');
  expect(spaces.remove('s')).toEqual([]);
});

test('a tab moves before or after another only inside its space', () => {
  const spaces = spacesWith(['a', 'b', 'c', 'd'], twoSpaces);
  expect(spaces.placeAfter('a', 'c')).toBe(true);
  expect(spaces.tabsIn('s')).toEqual(['b', 'c', 'a', 'd']);
  expect(spaces.placeBefore('d', 'b')).toBe(true);
  expect(spaces.tabsIn('s')).toEqual(['d', 'b', 'c', 'a']);
  expect(spaces.placeAfter('a', 'a')).toBe(false);
  spaces.assign('d', 'other', URL_OF);
  expect(spaces.placeAfter('a', 'd')).toBe(false);
  expect(spaces.placeAfter('a', 'gone')).toBe(false);
});

test('reordering a space moves only the rows it names', () => {
  const spaces = spacesWith(['a', 'b', 'c'], twoSpaces);
  const sleeper = spaces.rowsIn('other')[0].key;
  spaces.reorder('s', ['c', sleeper, spaces.byTab('a').key]);
  expect(spaces.tabsIn('s')).toEqual(['c', 'b', 'a']);
  expect(spaces.rowsIn('other')[0].key).toBe(sleeper);
});

test('a tab moved onto its sleeping twin takes the twin\'s group', () => {
  const spaces = spacesWith([], twoSpaces);
  spaces.adopt('live', 'https://asleep.test/');
  spaces.setGroup('live', 'home-group');
  spaces.assign('live', 'other', 'https://asleep.test/');
  expect(spaces.rowsIn('other')).toHaveLength(1);
  expect(spaces.byTab('live').group).toBe('other-group');
  expect(spaces.keysInGroup('home-group')).toEqual([]);
});

const proxy: {handler: Record<string, (...args: any[]) => unknown>} =
    {handler: {}};
const TabStripElement = new Function('CrLitElement', 'customElements',
    'browserProxyFactory', 'INCOGNITO', 'MINI',
    `${transpile(new URL(
        '../build/src/chrome/browser/resources/webui_browser/tab_strip/tab_strip.ts',
        import.meta.url))}\nreturn TabStripElement;`)(
    class {}, {define: () => {}}, {getInstance: () => proxy}, false, false);

const stripWith = (spaces: any, live: string[], active: string) => {
  const Folders = load('folders', 'Folders');
  const log: string[] = [];
  proxy.handler = {
    forgetOpeners: (ids: string[]) => log.push(`forget:${ids}`),
    closeRemoteTab: (id: string) => log.push(`remote:${id}`),
  };
  const strip = Object.create(TabStripElement.prototype,
      Object.getOwnPropertyDescriptors({
        spaces_: spaces,
        pinnedTabs_: new PinnedTabs(() => {}),
        tidyGroups_: new Folders(() => {}),
        nativeGroups_: {release: () => ''},
        reopenHistory_: new ReopenHistory(),
        items_: live.map(id => ({type: 'tab', id, tabData: tab(id)})),
        activeTab_: active,
        tabStripService_: {closeNodes: (ids: string[]) => log.push(`close:${ids}`)},
        activateTab(id: string) {
          log.push(`activate:${id}`);
          this.activeTab_ = id;
        },
        archiveRows_: (ids: string[]) => log.push(`archive:${ids}`),
        collapseSelection_: () => {},
        refreshSections_: () => {},
      }));
  return {strip, log};
};

test('closing the active tab activates its successor before it goes', () => {
  const spaces = spacesWith(['a', 'b', 'c']);
  const {strip, log} = stripWith(spaces, ['a', 'b', 'c'], 'b');
  strip.closeTabs_(['b']);
  expect(log).toEqual(['activate:c', 'close:b']);
});

test('closing a background tab leaves the active one alone', () => {
  const spaces = spacesWith(['a', 'b', 'c']);
  const {strip, log} = stripWith(spaces, ['a', 'b', 'c'], 'a');
  strip.closeTabs_(['c']);
  expect(log).toEqual(['close:c']);
});

test('closing the active tab never wakes a sleeping neighbor', () => {
  const saved = {activeSpace: 's', spaces: [{...state.spaces[0],
    tabs: ['https://asleep.test/']}]};
  const spaces = spacesWith(['a'], saved);
  const {strip, log} = stripWith(spaces, ['a'], 'a');
  strip.closeTabs_(['a']);
  expect(log).toEqual(['close:a']);
  expect(spaces.rowsIn('s')[0].pending).toBe(false);
});

test('closing a tab of a space in the background activates nothing', () => {
  const spaces = spacesWith(['a', 'b', 'c'], twoSpaces);
  spaces.assign('b', 'other', URL_OF);
  spaces.assign('c', 'other', URL_OF);
  const {strip, log} = stripWith(spaces, ['a', 'b', 'c'], 'b');
  strip.closeTabs_(['b']);
  expect(log).toEqual(['close:b']);
});

test('closing a sleeping row drops it and the group it emptied', () => {
  const saved = {activeSpace: 's', spaces: [{...state.spaces[0], tabs: [
    {id: 'y', url: 'https://y.test/', title: '', favicon: ''},
    {id: 'z', url: 'https://z.test/', title: '', favicon: ''}]}]};
  const spaces = spacesWith(['a'], saved);
  const {strip, log} = stripWith(spaces, ['a'], 'a');
  const lone = strip.tidyGroups_.create('s', 'Lone');
  const shared = strip.tidyGroups_.create('s', 'Shared');
  spaces.setGroup('y', lone.id);
  spaces.setGroup('z', shared.id);
  spaces.setGroup('a', shared.id);
  strip.closeTarget_('y');
  strip.closeTarget_('z');
  expect(log).toEqual(['archive:y', 'archive:z']);
  expect(spaces.rowsIn('s').map((row: any) => row.tabId)).toEqual(['a']);
  expect(strip.tidyGroups_.byId(lone.id)).toBeUndefined();
  expect(strip.tidyGroups_.byId(shared.id)).toBeDefined();
});

test('closing a row another window holds closes the tab over there', () => {
  const saved = {activeSpace: 's', spaces: [{...state.spaces[0], tabs: [
    {id: 'far', url: 'https://far.test/', title: '', favicon: '',
      owner: 'other.w', tab: 'r1'}]}]};
  const spaces = spacesWith(['a'], saved);
  const {strip, log} = stripWith(spaces, ['a'], 'a');
  strip.closeTarget_('far');
  expect(log).toEqual(['archive:far', 'remote:r1']);
  expect(spaces.rowsIn('s')).toHaveLength(1);
});

test('closing a live tab archives it and hands focus on', () => {
  const spaces = spacesWith(['a', 'b']);
  const {strip, log} = stripWith(spaces, ['a', 'b'], 'b');
  strip.closeTarget_('b');
  expect(log).toEqual(['archive:b', 'activate:a', 'close:b']);
});

test('closing a group closes its live tabs and drops its sleeping rows', () => {
  const saved = {activeSpace: 's', spaces: [{...state.spaces[0], tabs: [
    {id: 'z', url: 'https://z.test/', title: '', favicon: ''}]}]};
  const spaces = spacesWith(['a', 'b', 'c'], saved);
  const {strip, log} = stripWith(spaces, ['a', 'b', 'c'], 'c');
  const group = strip.tidyGroups_.create('s', 'G');
  for (const id of ['z', 'a', 'b']) {
    spaces.setGroup(id, group.id);
  }
  strip.closeGroup_(group.id);
  expect(log).toEqual(['archive:z,a,b', 'close:a,b']);
  expect(spaces.dormantIn('s')).toEqual([]);
  expect(strip.tidyGroups_.byId(group.id)).toBeUndefined();
});

test('going back to the opener activates it, then closes the tab', () => {
  const spaces = spacesWith(['a', 'b']);
  spaces.setOpener('b', 'a');
  spaces.startTrail('b');
  const {strip, log} = stripWith(spaces, ['a', 'b'], 'b');
  expect(strip.canReturnToOpener()).toBe(true);
  expect(strip.returnToOpener()).toBe(true);
  expect(log).toEqual(['activate:a', 'close:b']);
});

test('a tab without a trail has no opener to go back to', () => {
  const spaces = spacesWith(['a', 'b']);
  spaces.setOpener('b', 'a');
  const {strip, log} = stripWith(spaces, ['a', 'b'], 'b');
  expect(strip.canReturnToOpener()).toBe(false);
  expect(strip.returnToOpener()).toBe(false);
  expect(log).toEqual([]);
});

test('picking an unrelated tab forgets the openers of the space', () => {
  const spaces = spacesWith(['a', 'b', 'c']);
  spaces.setOpener('b', 'a');
  const {strip, log} = stripWith(spaces, ['a', 'b', 'c'], 'b');
  strip.selectRow_('a');
  expect(spaces.byTab('b').opener).toBe(spaces.byTab('a').key);
  strip.selectRow_('c');
  expect(spaces.byTab('b').opener).toBe('');
  expect(log).toEqual(['activate:a', 'forget:a,b,c', 'activate:c']);
});

test('entering a space focuses the tab it was left on, never another space\'s', () => {
  const spaces = spacesWith(['a', 'b', 'c'], twoSpaces);
  spaces.assign('c', 'other', URL_OF);
  spaces.noteActive('b');
  const {strip, log} = stripWith(spaces, ['a', 'b', 'c'], 'c');
  strip.focusSpace_();
  expect(log).toEqual(['activate:b']);
  spaces.assign('c', 's', URL_OF);
  spaces.select('other');
  strip.focusSpace_();
  expect(log).toEqual(['activate:b']);
});
