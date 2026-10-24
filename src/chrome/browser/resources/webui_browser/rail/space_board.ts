import type {TabStripItem} from '../tab_strip/items.js';

import type {Folders} from './folders.js';
import type {PinnedTabs} from './pinned_tabs.js';
import type {PinnedLayout} from './sections.js';
import {layoutPinned} from './sections.js';
import type {Spaces} from './spaces.js';

export interface BoardTab {
  id: string;
  url: string;
  title: string;
  favicon: string;
}

export interface BoardColumn {
  pinned: Array<PinnedLayout<BoardTab>>;
  today: BoardTab[];
}

interface BoardSource {
  url: string;
  title: string;
  favicon: string;
}

export function spaceBoard(
    items: TabStripItem[], pinned: PinnedTabs, spaces: Spaces,
    folders: Folders): Record<string, BoardColumn> {
  const live = new Map<string, BoardSource>();
  for (const item of items) {
    if (item.type === 'tab') {
      live.set(item.id, {
        url: item.tabData.url,
        title: item.tabData.title,
        favicon: item.tabData.favicon.dataUrl,
      });
    }
  }
  const describe = (id: string, tabId: string, stored: BoardSource) => {
    const tab = (tabId && live.get(tabId)) || stored;
    return {
      id,
      url: tab.url,
      title: tab.title || tab.url,
      favicon: tab.favicon,
    };
  };
  return Object.fromEntries(spaces.all.map(space => [space.id, {
    pinned: layoutPinned(
        pinned.entriesIn(space.id), folders.in(space.id),
        entry => describe(entry.key, entry.tabId, entry)),
    today: spaces.rowsIn(space.id)
               .filter(row => !row.tabId || !pinned.byTab(row.tabId))
               .map(row => describe(row.tabId || row.key, row.tabId, row)),
  }]));
}
