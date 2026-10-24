import type {TabStripItem} from '../tab_strip/items.js';

import type {Folders} from './folders.js';
import type {PinnedTabs} from './pinned_tabs.js';
import type {FolderSectionOf, PinnedLayout} from './sections.js';
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
  today: Array<PinnedLayout<BoardTab>>;
}

interface BoardSource {
  url: string;
  title: string;
  favicon: string;
}

export function spaceBoard(
    items: TabStripItem[], pinned: PinnedTabs, spaces: Spaces,
    folders: Folders, tidyGroups: Folders): Record<string, BoardColumn> {
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
  const today = (spaceId: string) => {
    const layout: Array<PinnedLayout<BoardTab>> = [];
    const sections = new Map<string, FolderSectionOf<BoardTab>>();
    for (const row of spaces.rowsIn(spaceId)) {
      if (row.tabId && pinned.byTab(row.tabId)) {
        continue;
      }
      const tab = describe(row.tabId || row.key, row.tabId, row);
      const group = row.group ? tidyGroups.byId(row.group) : undefined;
      if (!group || group.space !== spaceId) {
        layout.push({kind: 'row', row: tab});
        continue;
      }
      let section = sections.get(group.id);
      if (!section) {
        section = {folder: group, rows: []};
        sections.set(group.id, section);
        layout.push({kind: 'folder', section});
      }
      section.rows.push(tab);
    }
    for (const group of tidyGroups.in(spaceId)) {
      if (!sections.has(group.id)) {
        layout.push({kind: 'folder', section: {folder: group, rows: []}});
      }
    }
    return layout;
  };
  return Object.fromEntries(spaces.all.map(space => [space.id, {
    pinned: layoutPinned(
        pinned.entriesIn(space.id), folders.in(space.id),
        entry => describe(entry.key, entry.tabId, entry)),
    today: today(space.id),
  }]));
}
