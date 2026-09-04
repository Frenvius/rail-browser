import type {TabItem, TabStripItem} from '../tab_strip/items.js';

import type {Folder, Folders} from './folders.js';
import type {PinnedEntry, PinnedTabs} from './pinned_tabs.js';
import {dormantTabData} from './pinned_tabs.js';
import type {Spaces} from './spaces.js';

export interface PinnedRow {
  item: TabItem;
  dormant: boolean;
}

export interface FolderSection {
  folder: Folder;
  rows: PinnedRow[];
}

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

export interface Sections {
  favoriteRows: PinnedRow[];
  folderSections: FolderSection[];
  pinnedRows: PinnedRow[];
  looseEntries: LooseEntry[];
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
    return {item, dormant: spaces.isAsleep(item.id)};
  });

  const favoriteRows =
      rowsFor(pinned.favorites(spaces.profileOf(spaces.activeId)));
  const spaceEntries = pinned.entriesIn(spaces.activeId);
  const folderSections = folders.in(spaces.activeId)
                             .map(folder => ({
                                    folder,
                                    rows: rowsFor(spaceEntries.filter(
                                        entry => entry.folder === folder.id)),
                                  }));
  const pinnedRows = rowsFor(spaceEntries.filter(
      entry => !entry.folder || !folders.byId(entry.folder)));

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

  for (const item of items) {
    if (item.type === 'group' && spaces.owns(item.id)) {
      looseEntries.push({kind: 'item', item});
    }
  }

  return {favoriteRows, folderSections, pinnedRows, looseEntries};
}
