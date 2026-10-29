import type {TabItem, TabStripItem} from '../tab_strip/items.js';

import type {Folder, Folders} from './folders.js';
import type {PinnedEntry, PinnedTabs} from './pinned_tabs.js';
import {dormantTabData} from './pinned_tabs.js';
import type {Spaces} from './spaces.js';
import type {DragSlot} from './tab_drag.js';

export interface PinnedRow {
  item: TabItem;
  dormant: boolean;
}

export interface FolderSectionOf<T> {
  folder: Folder;
  rows: T[];
  children?: Array<PinnedLayout<T>>;
}

export type FolderSection = FolderSectionOf<PinnedRow>;

export interface TidySection {
  group: Folder;
  items: TabStripItem[];
}

export type LooseEntry = {
  kind: 'item',
  item: TabStripItem,
}|{
  kind: 'group',
  section: TidySection,
};

export type PinnedLayout<T> = {
  kind: 'row',
  row: T,
}|{
  kind: 'folder',
  section: FolderSectionOf<T>,
};

export type PinnedEntryRow = PinnedLayout<PinnedRow>;

export interface Sections {
  favoriteRows: PinnedRow[];
  pinnedEntries: PinnedEntryRow[];
  folderSections: FolderSection[];
  pinnedRows: PinnedRow[];
  looseEntries: LooseEntry[];
}

export function layoutPinned<T>(
    entries: PinnedEntry[], folders: Folder[],
    rowFor: (entry: PinnedEntry) => T): Array<PinnedLayout<T>> {
  const sections = new Map<string, FolderSectionOf<T>>(
      folders.map(folder => [folder.id, {folder, rows: [], children: []}]));
  const routes = new Map<string, string[]>();
  for (const folder of folders) {
    const route: string[] = [];
    let current: Folder|undefined = folder;
    while (current && !route.includes(current.id)) {
      route.unshift(current.id);
      const parent: Folder|undefined = sections.get(current.parent)?.folder;
      current = parent?.space === folder.space ? parent : undefined;
    }
    routes.set(folder.id, route);
  }
  const rows = entries.map(entry => ({entry, row: rowFor(entry)}));
  for (const {entry, row} of rows) {
    for (const id of routes.get(entry.folder) ?? []) {
      sections.get(id)!.rows.push(row);
    }
  }
  const layout: Array<PinnedLayout<T>> = [];
  for (const parent of ['', ...sections.keys()]) {
    const children = parent ? sections.get(parent)!.children! : layout;
    const siblings = folders.filter(folder =>
        (sections.has(folder.parent) ? folder.parent : '') === parent);
    const empty = siblings.filter(folder => !sections.get(folder.id)!.rows.length);
    const placed = new Set<string>();
    const place = (folder: Folder) => {
      if (placed.has(folder.id)) {
        return;
      }
      placed.add(folder.id);
      children.push({kind: 'folder', section: sections.get(folder.id)!});
    };
    const anchors = new Set(rows.filter(({entry}) =>
        !parent || routes.get(entry.folder)?.includes(parent))
                                .map(({entry}) => entry.key));
    for (const folder of empty) {
      if (!anchors.has(folder.after) &&
          !siblings.some(sibling => sibling.id === folder.after)) {
        place(folder);
      }
    }
    for (const {entry, row} of rows) {
      const route = routes.get(entry.folder) ?? [];
      const level = parent ? route.indexOf(parent) + 1 : 0;
      if (parent && level === 0) {
        continue;
      }
      const child = route[level];
      if (child) {
        place(sections.get(child)!.folder);
      } else {
        children.push({kind: 'row', row});
      }
      for (const folder of empty.filter(folder => folder.after === entry.key)) {
        place(folder);
      }
    }
    for (let index = 0; index < children.length; index++) {
      const item = children[index]!;
      if (item.kind !== 'folder') {
        continue;
      }
      const anchored = empty.filter(folder =>
          folder.after === item.section.folder.id && !placed.has(folder.id));
      for (const folder of anchored.reverse()) {
        placed.add(folder.id);
        children.splice(index + 1, 0, {kind: 'folder', section: sections.get(folder.id)!});
      }
    }
    for (const folder of empty) {
      place(folder);
    }
  }
  return layout;
}

export function visiblePinnedLayout<T>(
    layout: Array<PinnedLayout<T>>, active: (row: T) => boolean = () => false):
    Array<PinnedLayout<T>&{depth: number}> {
  const visible: Array<PinnedLayout<T>&{depth: number}> = [];
  const visit = (children: Array<PinnedLayout<T>>, depth: number) => {
    for (const child of children) {
      visible.push({...child, depth});
      if (child.kind !== 'folder') {
        continue;
      }
      const section = child.section;
      if (section.folder.expanded) {
        visit(section.children ?? section.rows.map(row => ({kind: 'row', row})), depth + 1);
      } else {
        visible.push(...section.rows.filter(active).map(row =>
            ({kind: 'row' as const, row, depth: depth + 1})));
      }
    }
  };
  visit(layout, 0);
  return visible;
}

export function pinnedDragSlots<T>(options: {
  layout: Array<PinnedLayout<T>>,
  rowId: (row: T) => string,
  active: (row: T) => boolean,
  moving: string,
  groupDrag: boolean,
}): DragSlot[] {
  const slots: DragSlot[] = [];
  const parents = new Map<string, string>();
  const pending = options.layout.map(entry => ({entry, parent: ''}));
  for (let index = 0; index < pending.length; index++) {
    const {entry, parent} = pending[index]!;
    if (entry.kind === 'row') {
      parents.set(options.rowId(entry.row), parent);
    } else {
      pending.push(...(entry.section.children ?? []).map(child =>
          ({entry: child, parent: entry.section.folder.id})));
    }
  }
  const visit = (children: Array<PinnedLayout<T>>, parent: string) => {
    for (const child of children) {
      if (child.kind === 'row') {
        slots.push({id: options.rowId(child.row), kind: 'tab', group: parent});
        continue;
      }
      const {folder, rows} = child.section;
      slots.push({
        id: folder.id,
        kind: options.groupDrag ? 'group' : 'header',
        group: options.groupDrag ? parent : folder.expanded ? folder.id : parent,
        parent,
      });
      if (options.groupDrag && folder.id === options.moving) {
        continue;
      }
      if (folder.expanded) {
        visit(child.section.children ?? [], folder.id);
      } else {
        slots.push(...rows.filter(options.active).map(row => ({
          id: options.rowId(row), kind: 'tab' as const,
          group: parents.get(options.rowId(row)) ?? folder.id,
        })));
      }
    }
  };
  visit(options.layout, '');
  return slots;
}

export function applyPinnedDragSlots(options: {
  slots: DragSlot[], pinned: PinnedTabs, folders: Folders, space: string,
}) {
  const {slots, pinned, folders, space} = options;
  const listed = new Set(slots.filter(slot => slot.kind === 'tab').flatMap(slot => {
    const entry = pinned.byKey(slot.id) ?? pinned.byTab(slot.id);
    return [slot.id, entry?.key ?? '', entry?.tabId ?? ''];
  }));
  const ids: string[] = [];
  const hiddenByFolder = new Map<string, string[]>();
  const anchors = new Map<string, string>();
  const headers = new Set(slots.filter(slot => slot.kind !== 'tab').map(slot => slot.id));
  const ownerOf = (id: string): string => {
    let folder = folders.byId(id);
    while (folder && !headers.has(folder.id)) {
      folder = folders.byId(folder.parent);
    }
    return folder?.id ?? '';
  };
  for (const slot of slots) {
    if (slot.kind === 'tab') {
      const entry = pinned.byKey(slot.id) ?? pinned.byTab(slot.id);
      if (entry) {
        pinned.setFolder(entry.key, slot.group);
      }
    } else {
      folders.setParent(slot.id, slot.kind === 'group' ? slot.group : slot.parent ?? '');
    }
  }
  for (const slot of slots) {
    if (slot.kind === 'tab') {
      const entry = pinned.byKey(slot.id) ?? pinned.byTab(slot.id);
      if (entry) {
        anchors.set(slot.group, entry.key);
      }
      continue;
    }
    const parent = folders.byId(slot.id)?.parent ?? '';
    folders.setAfter(slot.id, anchors.get(parent) ?? '');
    const folder = folders.byId(slot.id);
    const hidden = pinned.entriesIn(space).filter(entry =>
        ownerOf(entry.folder) === slot.id &&
        (!folder?.expanded || !listed.has(entry.tabId || entry.key)));
    hiddenByFolder.set(slot.id, hidden.map(entry => entry.tabId || entry.key));
    anchors.set(parent, hidden.at(-1)?.key ?? slot.id);
  }
  const emitted = new Set<string>();
  const emit = (parent: string) => {
    if (emitted.has(parent)) {
      return;
    }
    emitted.add(parent);
    ids.push(...hiddenByFolder.get(parent) ?? []);
    for (const slot of slots) {
      const owner = slot.kind === 'tab' ? slot.group :
          folders.byId(slot.id)?.parent ?? '';
      if (owner !== parent) {
        continue;
      }
      if (slot.kind === 'tab') {
        ids.push(slot.id);
      } else {
        emit(slot.id);
      }
    }
  };
  emit('');
  folders.reorder(space, slots.filter(slot => slot.kind !== 'tab').map(slot => slot.id));
  pinned.reorder(space, ids);
}

export const TOP_ANCHOR = 'top';

export function reanchorEmptyGroups(
    previous: LooseEntry[], spaces: Spaces, tidyGroups: Folders) {
  const keyOf = (id: string) => spaces.rowFor(id)?.key ?? '';
  let anchor = TOP_ANCHOR;
  for (const entry of previous) {
    if (entry.kind === 'item') {
      anchor = keyOf(entry.item.id) || anchor;
      continue;
    }
    const {group, items} = entry.section;
    const anchored = group.after === TOP_ANCHOR ||
        spaces.rowsIn(group.space).some(row => row.key === group.after);
    if (!spaces.keysInGroup(group.id).length && (items.length || !anchored)) {
      tidyGroups.setAfter(group.id, anchor);
    }
    for (const item of items) {
      anchor = keyOf(item.id) || anchor;
    }
  }
}

export function anchorDroppedGroups(
    slots: Array<{id: string, kind: string}>, spaces: Spaces,
    tidyGroups: Folders) {
  let anchor = TOP_ANCHOR;
  for (const slot of slots) {
    const keys =
        slot.kind === 'tab' ? [slot.id] : spaces.keysInGroup(slot.id);
    if (slot.kind !== 'tab' && !keys.length) {
      tidyGroups.setAfter(slot.id, anchor);
    }
    const last = keys.at(-1);
    if (last) {
      anchor = spaces.rowFor(last)?.key ?? anchor;
    }
  }
}

function named(item: TabItem, name: string): TabItem {
  return name ? {...item, tabData: {...item.tabData, title: name}} : item;
}

export function splitSections(
    items: TabStripItem[], pinned: PinnedTabs, spaces: Spaces, folders: Folders,
    tidyGroups: Folders): Sections {
  const claimed = new Set<string>();

  const rowsFor = (entries: PinnedEntry[]): PinnedRow[] => entries.map(entry => {
    const item = entry.tabId ?
        items.find(
            (candidate): candidate is TabItem =>
                candidate.type === 'tab' && candidate.id === entry.tabId) :
        undefined;
    if (!item) {
      return {
        item: {type: 'tab', id: entry.key, tabData: dormantTabData(entry)},
        dormant: true,
      };
    }
    claimed.add(item.id);
    return {item: named(item, entry.name), dormant: false};
  });

  const favoriteRows =
      rowsFor(pinned.favorites(spaces.profileOf(spaces.activeId)));
  const pinnedEntries = layoutPinned(
      pinned.entriesIn(spaces.activeId), folders.in(spaces.activeId),
      entry => rowsFor([entry])[0]!);

  const folderSections =
      pinnedEntries.filter(entry => entry.kind === 'folder')
          .map(entry => entry.section);
  const pinnedRows = pinnedEntries.filter(entry => entry.kind === 'row')
                         .map(entry => entry.row);

  const looseEntries: LooseEntry[] = [];
  const openSections = new Map<string, TidySection>();
  const collect = (groupId: string, item: TabStripItem) => {
    const group = groupId ? tidyGroups.byId(groupId) : undefined;
    if (!group) {
      looseEntries.push({kind: 'item', item});
      return;
    }
    const open = openSections.get(group.id);
    if (open) {
      open.items.push(item);
      return;
    }
    const section: TidySection = {group, items: [item]};
    openSections.set(group.id, section);
    looseEntries.push({kind: 'group', section});
  };

  const rows = spaces.rowsIn(spaces.activeId);
  const anchors = new Set([TOP_ANCHOR, ...rows.map(row => row.key)]);
  const empty = tidyGroups.in(spaces.activeId)
                    .filter(group => !spaces.keysInGroup(group.id).length);
  const placeEmpty = (after: string) => {
    for (const group of empty.filter(group => group.after === after)) {
      looseEntries.push({kind: 'group', section: {group, items: []}});
    }
  };

  placeEmpty(TOP_ANCHOR);
  for (const row of rows) {
    const item = row.tabId ? items.find(
                                 (candidate): candidate is TabItem =>
                                     candidate.type === 'tab' &&
                                     candidate.id === row.tabId) :
                             undefined;
    if (!row.tabId) {
      collect(
          row.group,
          {type: 'tab', id: row.key, tabData: dormantTabData(row)});
    } else if (item && !claimed.has(item.id) && !pinned.byTab(row.tabId)) {
      claimed.add(item.id);
      collect(row.group, named(item, row.name));
    }
    placeEmpty(row.key);
  }
  for (const group of empty.filter(group => !anchors.has(group.after))) {
    looseEntries.push({kind: 'group', section: {group, items: []}});
  }

  for (const item of items) {
    if (item.type === 'group' && spaces.owns(item.id)) {
      looseEntries.push({kind: 'item', item});
    }
  }

  return {favoriteRows, pinnedEntries, folderSections, pinnedRows, looseEntries};
}
