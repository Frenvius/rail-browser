import type {TabItem, TabStripItem} from '../tab_strip/items.js';

import type {PinnedTabs} from './pinned_tabs.js';
import {dormantTabData} from './pinned_tabs.js';
import type {Spaces} from './spaces.js';

export interface PinnedRow {
  item: TabItem;
  dormant: boolean;
}

export interface Sections {
  pinnedRows: PinnedRow[];
  looseItems: TabStripItem[];
}

export function splitSections(
    items: TabStripItem[], pinned: PinnedTabs, spaces: Spaces): Sections {
  const claimed = new Set<string>();
  const pinnedRows: PinnedRow[] = [];

  for (const entry of pinned.entriesIn(spaces.activeId)) {
    const item = entry.tabId ?
        items.find(
            (candidate): candidate is TabItem =>
                candidate.type === 'tab' && candidate.id === entry.tabId) :
        undefined;
    if (item) {
      claimed.add(item.id);
      pinnedRows.push({item, dormant: false});
      continue;
    }
    pinnedRows.push({
      item: {type: 'tab', id: entry.key, tabData: dormantTabData(entry)},
      dormant: true,
    });
  }

  const looseItems = items.filter(
      item => !claimed.has(item.id) && spaces.owns(item.id) &&
          !pinned.byTab(item.id));

  return {pinnedRows, looseItems};
}
