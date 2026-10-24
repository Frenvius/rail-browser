import type {TabItem, TabStripItem} from '../tab_strip/items.js';

import type {Folder, Folders} from './folders.js';
import type {PinnedEntry, PinnedTabs} from './pinned_tabs.js';
import {dormantTabData} from './pinned_tabs.js';
import type {Spaces} from './spaces.js';

export interface PinnedRow {
  item: TabItem;
  dormant: boolean;
}

export interface FolderSectionOf<T> {
  folder: Folder;
  rows: T[];
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
  const sectionsByFolder = new Map<string, FolderSectionOf<T>>(
      folders.map(folder => [folder.id, {folder, rows: []}]));
  const layout: Array<PinnedLayout<T>> = [];
  const empty = [...sectionsByFolder.values()].filter(
      section => !entries.some(entry => entry.folder === section.folder.id));
  const placeEmpty = (after: string) => {
    for (const section of empty.filter(
             section => section.folder.after === after)) {
      layout.push({kind: 'folder', section});
    }
  };

  placeEmpty('');
  for (const entry of entries) {
    const row = rowFor(entry);
    const section =
        entry.folder ? sectionsByFolder.get(entry.folder) : undefined;
    if (!section) {
      layout.push({kind: 'row', row});
    } else {
      if (!section.rows.length) {
        layout.push({kind: 'folder', section});
      }
      section.rows.push(row);
    }
    placeEmpty(entry.key);
  }
  return layout;
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
    return {item, dormant: false};
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
      collect(row.group, item);
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
