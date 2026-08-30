import type {Tab} from '/tab_strip_api/tab_strip_api_data_model.mojom-webui.js';

import {TabNetworkState} from '../tabs.mojom-webui.js';

import type {SidebarState, StoredPin} from './sidebar_state.js';

export const FAVORITES = '';

export interface PinnedEntry {
  key: string;
  space: string;
  home: string;
  url: string;
  title: string;
  favicon: string;
  tabId: string;
}

// A pinned row is not a tab. It owns the URL it was pinned at and may or may
// not have a tab driving it, which is what lets the row outlive a close.
export class PinnedTabs {
  private entries_: PinnedEntry[] = [];
  private nextKey_ = 0;

  constructor(private onChange_: () => void) {}

  get entries(): PinnedEntry[] {
    return this.entries_;
  }

  entriesIn(spaceId: string): PinnedEntry[] {
    return this.entries_.filter(entry => entry.space === spaceId);
  }

  favorites(): PinnedEntry[] {
    return this.entriesIn(FAVORITES);
  }

  restore(state: SidebarState|null, tabs: Tab[], claimed: Set<string>) {
    const groups: Array<[string, StoredPin[]]> =
        (state?.spaces ?? []).map(space => [space.id, space.pinned ?? []]);
    groups.push([FAVORITES, state?.favorites ?? state?.essentials ?? []]);
    for (const [spaceId, stored] of groups) {
      for (const pin of stored) {
        const tab = tabs.find(
            candidate =>
                candidate.url === pin.url && !claimed.has(candidate.id));
        if (tab) {
          claimed.add(tab.id);
        }
        this.entries_.push({
          key: this.mintKey_(),
          space: spaceId,
          home: pin.home,
          url: pin.url,
          title: pin.title,
          favicon: pin.favicon,
          tabId: tab ? tab.id : '',
        });
      }
    }
  }

  pin(tab: Tab, spaceId: string): PinnedEntry {
    return this.add_({
      space: spaceId,
      home: tab.url,
      url: tab.url,
      title: tab.title,
      favicon: tab.favicon.dataUrl,
      tabId: tab.id,
    });
  }

  pinDormant(row: DormantRow, spaceId: string): PinnedEntry {
    return this.add_({
      space: spaceId,
      home: row.url,
      url: row.url,
      title: row.title,
      favicon: row.favicon,
      tabId: '',
    });
  }

  unpin(key: string) {
    this.entries_ = this.entries_.filter(entry => entry.key !== key);
    this.onChange_();
  }

  moveTo(key: string, spaceId: string) {
    const entry = this.byKey(key);
    if (!entry) {
      return;
    }
    entry.space = spaceId;
    this.onChange_();
  }

  dropSpace(spaceId: string) {
    this.entries_ = this.entries_.filter(entry => entry.space !== spaceId);
    this.onChange_();
  }

  attach(key: string, tabId: string) {
    const entry = this.byKey(key);
    if (!entry) {
      return;
    }
    entry.tabId = tabId;
    this.onChange_();
  }

  // The tab really is destroyed; the entry falls back to the URL it was pinned
  // at so the next activation starts there again.
  release(tabId: string): boolean {
    const entry = this.byTab(tabId);
    if (!entry) {
      return false;
    }
    entry.tabId = '';
    entry.url = entry.home;
    this.onChange_();
    return true;
  }

  track(tab: Tab) {
    const entry = this.byTab(tab.id);
    if (!entry) {
      return;
    }
    entry.url = tab.url;
    entry.title = tab.title;
    entry.favicon = tab.favicon.dataUrl;
    this.onChange_();
  }

  byKey(key: string): PinnedEntry|undefined {
    return this.entries_.find(entry => entry.key === key);
  }

  byTab(tabId: string): PinnedEntry|undefined {
    if (!tabId) {
      return undefined;
    }
    return this.entries_.find(entry => entry.tabId === tabId);
  }

  private add_(fields: Omit<PinnedEntry, 'key'>): PinnedEntry {
    const entry: PinnedEntry = {key: this.mintKey_(), ...fields};
    this.entries_.push(entry);
    this.onChange_();
    return entry;
  }

  private mintKey_(): string {
    return `pinned${this.nextKey_++}`;
  }
}

export interface DormantRow {
  key: string;
  url: string;
  title: string;
  favicon: string;
}

export function dormantTabData(entry: DormantRow): Tab {
  return {
    alertStates: [],
    favicon: {dataUrl: entry.favicon},
    id: entry.key,
    isActive: false,
    isBlocked: false,
    isCrashed: false,
    isSelected: false,
    networkState: TabNetworkState.kNone,
    title: entry.title || entry.url,
    url: entry.url,
  };
}
