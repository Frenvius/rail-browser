import type {TabItem, TabStripItem} from '../tab_strip/items.js';

import type {PinnedEntry, PinnedTabs} from './pinned_tabs.js';
import {dormantTabData} from './pinned_tabs.js';
import type {Spaces} from './spaces.js';

export interface PinnedRow {
  item: TabItem;
  dormant: boolean;
}

export interface Sections {
  favoriteRows: PinnedRow[];
  pinnedRows: PinnedRow[];
  looseItems: TabStripItem[];
}

export function splitSections(
    items: TabStripItem[], pinned: PinnedTabs, spaces: Spaces): Sections {
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

  const favoriteRows = rowsFor(pinned.favorites());
  const pinnedRows = rowsFor(pinned.entriesIn(spaces.activeId));

  const looseItems: TabStripItem[] = [];
  for (const row of spaces.rowsIn(spaces.activeId)) {
    if (!row.tabId) {
      looseItems.push({type: 'tab', id: row.key, tabData: dormantTabData(row)});
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
      looseItems.push(item);
    }
  }

  looseItems.push(...items.filter(
      item => item.type === 'group' && spaces.owns(item.id)));

  return {favoriteRows, pinnedRows, looseItems};
}
