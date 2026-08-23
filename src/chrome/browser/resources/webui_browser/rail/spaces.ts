import type {Tab} from '/tab_strip_api/tab_strip_api_data_model.mojom-webui.js';

import type {PinnedTabs} from './pinned_tabs.js';
import type {SidebarState, StoredSpace} from './sidebar_state.js';

export const SPACE_COLORS =
    ['#7c5cfc', '#4488ee', '#ee5577', '#44cc77', '#eeaa33'];

export interface Space {
  id: string;
  name: string;
  color: string;
  activeTabId: string;
}

interface Assignment {
  space: string;
  url: string;
}

export class Spaces {
  private spaces_: Space[] = [];
  private activeId_ = '';
  private tabs_ = new Map<string, Assignment>();

  constructor(private onChange_: () => void) {}

  get all(): Space[] {
    return this.spaces_;
  }

  get activeId(): string {
    return this.activeId_;
  }

  get active(): Space {
    return this.byId(this.activeId_) ?? this.spaces_[0]!;
  }

  byId(id: string): Space|undefined {
    return this.spaces_.find(space => space.id === id);
  }

  restore(state: SidebarState|null, tabs: Tab[], claimed: Set<string>) {
    for (const stored of state?.spaces ?? []) {
      const space: Space = {
        id: stored.id || crypto.randomUUID(),
        name: stored.name,
        color: stored.color,
        activeTabId: '',
      };
      this.spaces_.push(space);
      for (const url of stored.tabs ?? []) {
        const tab = tabs.find(
            candidate => candidate.url === url && !claimed.has(candidate.id));
        if (!tab) {
          continue;
        }
        claimed.add(tab.id);
        this.tabs_.set(tab.id, {space: space.id, url});
        if (url === stored.activeUrl) {
          space.activeTabId = tab.id;
        }
      }
    }

    if (!this.spaces_.length) {
      this.spaces_.push(this.mint_());
    }
    this.activeId_ = this.byId(state?.activeSpace ?? '')?.id ??
        this.spaces_[0]!.id;

    for (const tab of tabs) {
      if (!claimed.has(tab.id)) {
        this.adopt(tab.id, tab.url);
      }
    }
  }

  create(): Space {
    const space = this.mint_();
    this.spaces_.push(space);
    this.activeId_ = space.id;
    this.onChange_();
    return space;
  }

  rename(id: string, name: string) {
    const space = this.byId(id);
    if (!space || !name || space.name === name) {
      return;
    }
    space.name = name;
    this.onChange_();
  }

  remove(id: string): string[] {
    if (this.spaces_.length < 2 || !this.byId(id)) {
      return [];
    }
    const orphans = this.tabsIn(id);
    for (const tabId of orphans) {
      this.tabs_.delete(tabId);
    }
    this.spaces_ = this.spaces_.filter(space => space.id !== id);
    if (this.activeId_ === id) {
      this.activeId_ = this.spaces_[0]!.id;
    }
    this.onChange_();
    return orphans;
  }

  select(id: string) {
    if (!this.byId(id) || id === this.activeId_) {
      return;
    }
    this.activeId_ = id;
    this.onChange_();
  }

  step(delta: number) {
    const index = this.spaces_.findIndex(space => space.id === this.activeId_);
    const next = (index + delta + this.spaces_.length) % this.spaces_.length;
    this.select(this.spaces_[next]!.id);
  }

  adopt(tabId: string, url: string) {
    this.assign(tabId, this.activeId_, url);
  }

  assign(tabId: string, spaceId: string, url: string) {
    if (!this.byId(spaceId)) {
      return;
    }
    this.tabs_.set(tabId, {space: spaceId, url});
    this.onChange_();
  }

  track(tab: Tab) {
    const assignment = this.tabs_.get(tab.id);
    if (!assignment || assignment.url === tab.url) {
      return;
    }
    assignment.url = tab.url;
    this.onChange_();
  }

  forget(tabId: string) {
    if (!this.tabs_.delete(tabId)) {
      return;
    }
    for (const space of this.spaces_) {
      if (space.activeTabId === tabId) {
        space.activeTabId = '';
      }
    }
    this.onChange_();
  }

  noteActive(tabId: string) {
    const owner = this.spaceOf(tabId);
    this.activeId_ = owner;
    const space = this.byId(owner);
    if (space) {
      space.activeTabId = tabId;
    }
    this.onChange_();
  }

  spaceOf(tabId: string): string {
    return this.tabs_.get(tabId)?.space ?? this.activeId_;
  }

  owns(id: string): boolean {
    const assignment = this.tabs_.get(id);
    return !assignment || assignment.space === this.activeId_;
  }

  urlOf(tabId: string): string {
    return this.tabs_.get(tabId)?.url ?? '';
  }

  tabsIn(spaceId: string): string[] {
    return [...this.tabs_.entries()]
        .filter(([, assignment]) => assignment.space === spaceId)
        .map(([tabId]) => tabId);
  }

  lastActiveIn(spaceId: string): string {
    const space = this.byId(spaceId);
    const tabs = this.tabsIn(spaceId);
    if (space && tabs.includes(space.activeTabId)) {
      return space.activeTabId;
    }
    return tabs[tabs.length - 1] ?? '';
  }

  private mint_(): Space {
    const index = this.spaces_.length;
    return {
      id: crypto.randomUUID(),
      name: `Space ${index + 1}`,
      color: SPACE_COLORS[index % SPACE_COLORS.length]!,
      activeTabId: '',
    };
  }
}

export function serializeSidebar(
    spaces: Spaces, pinned: PinnedTabs): SidebarState {
  const stored: StoredSpace[] = spaces.all.map(space => ({
    id: space.id,
    name: space.name,
    color: space.color,
    activeUrl: space.activeTabId ?
        spaces.urlOf(space.activeTabId) :
        '',
    pinned: pinned.entriesIn(space.id).map(({home, url, title, favicon}) => ({
      home,
      url,
      title,
      favicon,
    })),
    tabs: spaces.tabsIn(space.id)
              .filter(tabId => !pinned.byTab(tabId))
              .map(tabId => spaces.urlOf(tabId)),
  }));
  return {activeSpace: spaces.activeId, spaces: stored};
}
