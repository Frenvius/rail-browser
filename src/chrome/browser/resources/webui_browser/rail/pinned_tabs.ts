import type {Tab} from '/tab_strip_api/tab_strip_api_data_model.mojom-webui.js';

import {browserProxyFactory} from '../browser.mojom-webui.js';
import {TabNetworkState} from '../tabs.mojom-webui.js';

const SAVE_DELAY_MS = 500;

export interface PinnedEntry {
  key: string;
  home: string;
  url: string;
  title: string;
  favicon: string;
  tabId: string;
}

interface StoredEntry {
  home: string;
  url: string;
  title: string;
  favicon: string;
}

// A pinned row is not a tab. It owns the URL it was pinned at and may or may
// not have a tab driving it, which is what lets the row outlive a close.
export class PinnedTabs {
  private entries_: PinnedEntry[] = [];
  private nextKey_ = 0;
  private saveTimer_ = 0;

  get entries(): PinnedEntry[] {
    return this.entries_;
  }

  async restore(tabs: Tab[]) {
    const claimed = new Set<string>();
    for (const stored of await this.read_()) {
      const tab = tabs.find(
          candidate =>
              candidate.url === stored.url && !claimed.has(candidate.id));
      if (tab) {
        claimed.add(tab.id);
      }
      this.entries_.push({
        key: this.mintKey_(),
        home: stored.home,
        url: stored.url,
        title: stored.title,
        favicon: stored.favicon,
        tabId: tab ? tab.id : '',
      });
    }
  }

  pin(tab: Tab) {
    this.entries_.push({
      key: this.mintKey_(),
      home: tab.url,
      url: tab.url,
      title: tab.title,
      favicon: tab.favicon.dataUrl,
      tabId: tab.id,
    });
    this.save_();
  }

  unpin(key: string) {
    this.entries_ = this.entries_.filter(entry => entry.key !== key);
    this.save_();
  }

  attach(key: string, tab: Tab) {
    const entry = this.byKey(key);
    if (!entry) {
      return;
    }
    entry.tabId = tab.id;
    entry.url = tab.url;
    this.save_();
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
    this.save_();
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
    this.save_();
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

  private mintKey_(): string {
    return `pinned${this.nextKey_++}`;
  }

  private async read_(): Promise<StoredEntry[]> {
    const {value} =
        await browserProxyFactory.getInstance().handler.getPinnedTabs();
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  private save_() {
    clearTimeout(this.saveTimer_);
    this.saveTimer_ = setTimeout(() => {
      const stored: StoredEntry[] = this.entries_.map(
          ({home, url, title, favicon}) => ({home, url, title, favicon}));
      browserProxyFactory.getInstance().handler.setPinnedTabs(
          JSON.stringify(stored));
    }, SAVE_DELAY_MS);
  }
}

export function dormantTabData(entry: PinnedEntry): Tab {
  return {
    alertStates: [],
    favicon: {dataUrl: entry.favicon},
    id: entry.key,
    isActive: false,
    isBlocked: false,
    isSelected: false,
    networkState: TabNetworkState.kNone,
    title: entry.title,
    url: entry.url,
  };
}
