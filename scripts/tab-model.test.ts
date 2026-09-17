import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';

const load = (file: string, name: string) => {
  const source = readFileSync(new URL(
      `../src/chrome/browser/resources/webui_browser/rail/${file}.ts`,
      import.meta.url), 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '')
      .replace(/^export /gm, '');
  const compiled = new Bun.Transpiler({loader: 'ts'}).transformSync(source);
  return new Function('SystemBackdropMaterial', 'INCOGNITO',
      `${compiled}\nreturn ${name};`)({kAcrylic: 0, kMica: 1, kMicaAlt: 2}, false);
};

const Spaces = load('spaces', 'Spaces');
const PinnedTabs = load('pinned_tabs', 'PinnedTabs');
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

test('merging native order keeps current items and drops stale ones', () => {
  const mergeItemOrder = load('tab_drag', 'mergeItemOrder');
  const item = (id: string, title = id) =>
      ({type: 'tab', id, tabData: {title}});
  const current = [item('a', 'fresh'), item('b'), item('new')];
  const merged = mergeItemOrder(current, [item('b'), item('gone'), item('a')]);
  expect(merged.map((i: any) => i.id)).toEqual(['b', 'a', 'new']);
  expect(merged[1]).toBe(current[0]);
});
