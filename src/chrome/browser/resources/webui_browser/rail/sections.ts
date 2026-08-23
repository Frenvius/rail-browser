import type {TabItem, TabStripItem} from '../tab_strip/items.js';

import type {PinnedEntry, PinnedTabs} from './pinned_tabs.js';
import {dormantTabData} from './pinned_tabs.js';
import type {Spaces} from './spaces.js';

export interface PinnedRow {
  item: TabItem;
  dormant: boolean;
}

export interface Sections {
  essentialRows: PinnedRow[];
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
    return {item, dormant: false};
  });

  const essentialRows = rowsFor(pinned.essentials());
  const pinnedRows = rowsFor(pinned.entriesIn(spaces.activeId));

  const looseItems: TabStripItem[] = items.filter(
      item => !claimed.has(item.id) && spaces.owns(item.id) &&
          !pinned.byTab(item.id));

  for (const row of spaces.dormantIn(spaces.activeId)) {
    looseItems.push({type: 'tab', id: row.key, tabData: dormantTabData(row)});
  }

  return {essentialRows, pinnedRows, looseItems};
}
