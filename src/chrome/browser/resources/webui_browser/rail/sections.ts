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

  for (const row of spaces.rowsIn(spaces.activeId)) {
    if (!row.tabId) {
      collect(
          row.group,
          {type: 'tab', id: row.key, tabData: dormantTabData(row)});
      continue;
    }
    if (claimed.has(row.tabId) || pinned.byTab(row.tabId)) {
      continue;
    }
    const item = items.find(
        (candidate): candidate is TabItem =>
            candidate.type === 'tab' && candidate.id === row.tabId);
    if (item) {
      claimed.add(item.id);
      collect(row.group, item);
    }
  }

  for (const group of tidyGroups.in(spaces.activeId)) {
    if (!spaces.keysInGroup(group.id).length) {
      looseEntries.push({kind: 'group', section: {group, items: []}});
    }
  }

  for (const item of items) {
    if (item.type === 'group' && spaces.owns(item.id)) {
      looseEntries.push({kind: 'item', item});
    }
  }

  return {favoriteRows, pinnedEntries, folderSections, pinnedRows, looseEntries};
}
