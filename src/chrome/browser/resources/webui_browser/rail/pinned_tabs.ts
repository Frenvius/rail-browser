import type {Tab} from '/tab_strip_api/tab_strip_api_data_model.mojom-webui.js';

import {TabNetworkState} from '../tabs.mojom-webui.js';

import type {SidebarState, StoredPin} from './sidebar_state.js';
import {WINDOW_ID} from './sidebar_state.js';

const FAVORITES_PREFIX = 'fav:';

export function favoritesKey(profileId: string): string {
  return `${FAVORITES_PREFIX}${profileId}`;
}

export function isFavorites(spaceId: string): boolean {
  return spaceId.startsWith(FAVORITES_PREFIX);
}

export function favoritesProfile(spaceId: string): string {
  return spaceId.slice(FAVORITES_PREFIX.length);
}

export interface PinnedEntry {
  key: string;
  space: string;
  home: string;
  homeTitle: string;
  homeFavicon: string;
  url: string;
  title: string;
  favicon: string;
  tabId: string;
  owner: string;
  remote: string;
  folder: string;
}

// A pinned row is not a tab. It owns the URL it was pinned at and may or may
// not have a tab driving it, which is what lets the row outlive a close.
export class PinnedTabs {
  private entries_: PinnedEntry[] = [];
  private restored_ = false;

  constructor(private onChange_: () => void) {}

  get entries(): PinnedEntry[] {
    return this.entries_;
  }

  entriesIn(spaceId: string): PinnedEntry[] {
    return this.entries_.filter(entry => entry.space === spaceId);
  }

  favorites(profileId: string): PinnedEntry[] {
    return this.entriesIn(favoritesKey(profileId));
  }

  favoriteProfiles(): string[] {
    return [...new Set(
        this.entries_.filter(entry => isFavorites(entry.space))
            .map(entry => favoritesProfile(entry.space)))];
  }

  restore(
      state: SidebarState|null, tabs: Tab[], claimed: Set<string>,
      byUrl: boolean) {
    const previous = new Map(this.entries_.map(entry => [entry.key, entry]));
    this.entries_ = [];
    const groups: Array<[string, StoredPin[]]> =
        (state?.spaces ?? []).map(space => [space.id, space.pinned ?? []]);
    const byProfile = state?.favoritesByProfile ??
        {'': state?.favorites ?? state?.essentials ?? []};
    for (const [profileId, stored] of Object.entries(byProfile)) {
      groups.push([favoritesKey(profileId), stored]);
    }
    for (const [spaceId, stored] of groups) {
      for (const pin of stored) {
        const existing = pin.id ?
            previous.get(pin.id) :
            [...previous.values()].find(
                entry => entry.space === spaceId && entry.home === pin.home &&
                    entry.url === pin.url &&
                    entry.folder === (pin.folder ?? ''));
        if (existing) {
          previous.delete(existing.key);
        }
        const remote = byUrl ? '' : pin.tab ?? '';
        const unclaimed = tabs.filter(candidate => !claimed.has(candidate.id));
        const byUrlMatch = !existing && !this.restored_;
        const tab =
            unclaimed.find(candidate => candidate.id === existing?.tabId) ??
            unclaimed.find(
                candidate => remote ? candidate.id === remote :
                                      byUrlMatch && candidate.url === pin.url);
        if (tab) {
          claimed.add(tab.id);
        }
        const foreign = !tab && !!remote && pin.owner !== WINDOW_ID &&
            !tabs.some(one => one.id === remote);
        this.entries_.push({
          key: pin.id ?? existing?.key ?? this.mintKey_(),
          space: spaceId,
          home: pin.home,
          homeTitle: pin.homeTitle ?? pin.title,
          homeFavicon: pin.homeFavicon ?? pin.favicon,
          url: pin.url,
          title: pin.title,
          favicon: pin.favicon,
          tabId: tab ? tab.id : '',
          owner: foreign ? pin.owner ?? '' : '',
          remote: foreign ? remote : '',
          folder: pin.folder ?? '',
        });
      }
    }
    this.restored_ = true;
  }

  snapshot(): PinnedEntry[] {
    return this.entries_.map(entry => ({...entry}));
  }

  revert(entries: PinnedEntry[], liveTabs: Set<string>) {
    this.entries_ = entries.map(entry => ({...entry}));
    for (const entry of this.entries_) {
      if (entry.tabId && !liveTabs.has(entry.tabId)) {
        this.detach_(entry);
      }
    }
    this.onChange_();
  }

  pin(tab: Tab, spaceId: string): PinnedEntry {
    return this.add_({
      space: spaceId,
      home: tab.url,
      homeTitle: tab.title,
      homeFavicon: tab.favicon.dataUrl,
      url: tab.url,
      title: tab.title,
      favicon: tab.favicon.dataUrl,
      tabId: tab.id,
      owner: '',
      remote: '',
      folder: '',
    });
  }

  pinDormant(row: DormantRow, spaceId: string): PinnedEntry {
    return this.add_({
      space: spaceId,
      home: row.url,
      homeTitle: row.title,
      homeFavicon: row.favicon,
      url: row.url,
      title: row.title,
      favicon: row.favicon,
      tabId: '',
      owner: row.remote ? row.owner ?? '' : '',
      remote: row.remote ?? '',
      folder: '',
    });
  }

  adoptRemote(tabId: string): PinnedEntry|undefined {
    const entry = this.entries_.find(one => !one.tabId && one.remote === tabId);
    if (!entry) {
      return undefined;
    }
    entry.tabId = tabId;
    entry.owner = '';
    entry.remote = '';
    this.onChange_();
    return entry;
  }

  disown(key: string) {
    const entry = this.byKey(key);
    if (!entry?.remote) {
      return;
    }
    this.detach_(entry);
    this.onChange_();
  }

  remotes(): string[] {
    return this.entries_.filter(entry => entry.remote)
        .map(entry => entry.remote);
  }

  releaseRemotes(dead: ReadonlySet<string>): boolean {
    const entries =
        this.entries_.filter(entry => entry.remote && dead.has(entry.remote));
    entries.forEach(entry => this.detach_(entry));
    if (entries.length) {
      this.onChange_();
    }
    return entries.length > 0;
  }

  unpin(key: string) {
    this.entries_ = this.entries_.filter(entry => entry.key !== key);
    this.onChange_();
  }

  reorder(spaceId: string, ids: string[]) {
    const rows = this.entriesIn(spaceId);
    const ordered = [...new Set(
        ids.map(
               id => rows.find(
                   entry =>
                       entry.key === id || (!!entry.tabId && entry.tabId === id)))
            .filter(entry => entry !== undefined))];
    if (!ordered.length) {
      return;
    }
    const moving = new Set(ordered);
    let next = 0;
    this.entries_ =
        this.entries_.map(entry => moving.has(entry) ? ordered[next++]! : entry);
    this.onChange_();
  }

  setHome(key: string) {
    const entry = this.byKey(key);
    if (!entry) {
      return;
    }
    entry.home = entry.url;
    entry.homeTitle = entry.title;
    entry.homeFavicon = entry.favicon;
    this.onChange_();
  }

  moveTo(key: string, spaceId: string) {
    const entry = this.byKey(key);
    if (!entry) {
      return;
    }
    entry.space = spaceId;
    entry.folder = '';
    this.onChange_();
  }

  setFolder(key: string, folderId: string) {
    const entry = this.byKey(key);
    if (!entry) {
      return;
    }
    entry.folder = folderId;
    this.onChange_();
  }

  clearFolder(folderId: string) {
    for (const entry of this.entries_) {
      if (entry.folder === folderId) {
        entry.folder = '';
      }
    }
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
    this.detach_(entry);
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

  private detach_(entry: PinnedEntry) {
    entry.tabId = '';
    entry.owner = '';
    entry.remote = '';
    entry.url = entry.home;
    entry.title = entry.homeTitle;
    entry.favicon = entry.homeFavicon;
  }

  private mintKey_(): string {
    return `pinned-${crypto.randomUUID()}`;
  }
}

export interface DormantRow {
  key: string;
  url: string;
  title: string;
  favicon: string;
  owner?: string;
  remote?: string;
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
