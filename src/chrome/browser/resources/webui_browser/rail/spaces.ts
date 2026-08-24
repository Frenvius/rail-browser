import type {Tab} from '/tab_strip_api/tab_strip_api_data_model.mojom-webui.js';

import type {PinnedTabs} from './pinned_tabs.js';
import type {SidebarState, StoredSpace, StoredTab} from './sidebar_state.js';

export const SPACE_COLORS =
    ['#7c5cfc', '#4488ee', '#ee5577', '#44cc77', '#eeaa33'];

export const SPACE_ICONS: ReadonlyArray<readonly[string, string]> = [
  ['🌐', 'globe web world internet'],
  ['👤', 'person personal profile user me'],
  ['👥', 'people team group shared'],
  ['⭐', 'star favorite important'],
  ['💼', 'work job briefcase office business'],
  ['🎓', 'study school college learning'],
  ['🧪', 'lab test experiment research'],
  ['🛠️', 'tools build dev engineering'],
  ['📚', 'books reading library docs'],
  ['🎨', 'art design paint creative'],
  ['🎮', 'game gaming play console'],
  ['🎵', 'music song audio sound'],
  ['🎬', 'movie film video cinema'],
  ['📷', 'photo camera picture'],
  ['✈️', 'travel flight plane trip'],
  ['🛒', 'shopping cart store buy'],
  ['💰', 'money finance cash budget'],
  ['📈', 'chart stats growth analytics'],
  ['🧠', 'brain ideas think learning'],
  ['❤️', 'heart love favorite'],
  ['🔥', 'fire hot trending'],
  ['🌱', 'plant grow nature seed'],
  ['☕', 'coffee break cafe morning'],
  ['🔒', 'lock private secure vault'],
  ['🏠', 'home house personal'],
  ['🏢', 'office company building corporate'],
  ['📅', 'calendar schedule planning'],
  ['📝', 'notes writing todo journal'],
  ['📬', 'mail inbox email messages'],
  ['💬', 'chat talk messages social'],
  ['🐛', 'bug issue debug'],
  ['⚙️', 'settings config gear system'],
  ['💻', 'laptop code computer dev'],
  ['🖥️', 'desktop monitor screen'],
  ['📱', 'phone mobile app'],
  ['🗂️', 'files folders archive'],
  ['🔍', 'search research find'],
  ['🚀', 'launch rocket ship startup'],
  ['🧩', 'puzzle plugin extension pieces'],
  ['🗺️', 'map travel navigation'],
  ['⚡', 'fast energy power quick'],
  ['🌙', 'night moon sleep dark'],
  ['☀️', 'sun day light morning'],
  ['🌊', 'wave water ocean sea'],
  ['🍿', 'popcorn movie watch entertainment'],
  ['🍔', 'food burger eat lunch'],
  ['🏋️', 'gym fitness workout health'],
  ['⚽', 'sports soccer football game'],
  ['🐱', 'cat pet animal'],
  ['🐶', 'dog pet animal'],
  ['🎯', 'target goal focus aim'],
  ['🏆', 'trophy win award goals'],
  ['🎁', 'gift present shopping'],
  ['🔔', 'bell alert notification'],
  ['🧭', 'compass explore discover'],
  ['🪐', 'planet space astronomy'],
];

export const DEFAULT_PROFILE_NAME = 'Default';

export interface SpaceProfile {
  id: string;
  name: string;
}

export interface Space {
  id: string;
  name: string;
  color: string;
  icon: string;
  partition: string;
  activeTabId: string;
}

interface Assignment {
  space: string;
  url: string;
  title: string;
  favicon: string;
}

export interface DormantTab {
  key: string;
  space: string;
  url: string;
  title: string;
  favicon: string;
}

function storedTab(entry: StoredTab|string): StoredTab {
  return typeof entry === 'string' ? {url: entry, title: '', favicon: ''} :
                                     entry;
}

export class Spaces {
  private spaces_: Space[] = [];
  private activeId_ = '';
  private tabs_ = new Map<string, Assignment>();
  private dormant_: DormantTab[] = [];
  private claims_ = new Map<string, string>();
  private profiles_: SpaceProfile[] = [];
  private nextKey_ = 0;

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

  get profiles(): SpaceProfile[] {
    return this.profiles_;
  }

  byId(id: string): Space|undefined {
    return this.spaces_.find(space => space.id === id);
  }

  profileName(id: string): string {
    return this.profiles_.find(profile => profile.id === id)?.name ??
        DEFAULT_PROFILE_NAME;
  }

  createProfile(name: string): SpaceProfile {
    const profile: SpaceProfile = {
      id: crypto.randomUUID(),
      name: name.trim() || `Profile ${this.profiles_.length + 1}`,
    };
    this.profiles_.push(profile);
    this.onChange_();
    return profile;
  }

  setProfile(spaceId: string, profileId: string): boolean {
    const space = this.byId(spaceId);
    if (!space || space.partition === profileId) {
      return false;
    }
    space.partition = profileId;
    this.onChange_();
    return true;
  }

  restore(state: SidebarState|null, tabs: Tab[], claimed: Set<string>) {
    this.profiles_ = (state?.profiles ?? []).map(({id, name}) => ({id, name}));
    for (const stored of state?.spaces ?? []) {
      const space: Space = {
        id: stored.id || crypto.randomUUID(),
        name: stored.name,
        color: stored.color,
        icon: stored.icon || SPACE_ICONS[0]![0],
        partition: stored.partition ?? '',
        activeTabId: '',
      };
      this.spaces_.push(space);
      this.adoptProfile_(space.partition);
      const dormant: DormantTab[] = [];
      for (const entry of stored.tabs ?? []) {
        const {url, title, favicon} = storedTab(entry);
        const tab = tabs.find(
            candidate => candidate.url === url && !claimed.has(candidate.id));
        if (!tab) {
          const row: DormantTab = {
            key: this.mintKey_(),
            space: space.id,
            url,
            title,
            favicon,
          };
          if (url === stored.activeUrl) {
            dormant.unshift(row);
          } else {
            dormant.push(row);
          }
          continue;
        }
        claimed.add(tab.id);
        this.tabs_.set(tab.id, {space: space.id, url, title, favicon});
        if (url === stored.activeUrl) {
          space.activeTabId = tab.id;
        }
      }
      this.dormant_.push(...dormant);
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

  restyle(id: string, color: string, icon: string) {
    const space = this.byId(id);
    if (!space) {
      return;
    }
    space.color = color || space.color;
    space.icon = icon || space.icon;
    this.onChange_();
  }

  move(id: string, delta: number) {
    const index = this.spaces_.findIndex(space => space.id === id);
    const next = index + delta;
    if (index === -1 || next < 0 || next >= this.spaces_.length) {
      return;
    }
    const [space] = this.spaces_.splice(index, 1);
    this.spaces_.splice(next, 0, space!);
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
    this.dormant_ = this.dormant_.filter(row => row.space !== id);
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

  peek(delta: number): string {
    const index = this.spaces_.findIndex(space => space.id === this.activeId_);
    const next = (index + delta + this.spaces_.length) % this.spaces_.length;
    return this.spaces_[next]!.id;
  }

  step(delta: number) {
    this.select(this.peek(delta));
  }

  claim(tabId: string, spaceId: string) {
    if (!tabId || !this.byId(spaceId)) {
      return;
    }
    if (this.tabs_.has(tabId)) {
      this.assign(tabId, spaceId, this.urlOf(tabId));
      return;
    }
    this.claims_.set(tabId, spaceId);
  }

  adopt(tabId: string, url: string) {
    const claimed = this.claims_.get(tabId);
    this.claims_.delete(tabId);
    this.assign(tabId, claimed ?? this.activeId_, url);
  }

  assign(tabId: string, spaceId: string, url: string) {
    if (!this.byId(spaceId)) {
      return;
    }
    const previous = this.tabs_.get(tabId);
    this.tabs_.set(tabId, {
      space: spaceId,
      url,
      title: previous?.title ?? '',
      favicon: previous?.favicon ?? '',
    });
    this.onChange_();
  }

  track(tab: Tab) {
    const assignment = this.tabs_.get(tab.id);
    if (!assignment) {
      return;
    }
    const favicon = tab.favicon.dataUrl;
    if (assignment.url === tab.url && assignment.title === tab.title &&
        assignment.favicon === favicon) {
      return;
    }
    assignment.url = tab.url;
    assignment.title = tab.title;
    assignment.favicon = favicon;
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
    this.activeId_ = this.spaceOf(tabId);
    this.markActive(tabId);
  }

  markActive(tabId: string) {
    const space = this.byId(this.spaceOf(tabId));
    if (!space || space.activeTabId === tabId) {
      return;
    }
    space.activeTabId = tabId;
    this.onChange_();
  }

  spaceOf(tabId: string): string {
    return this.tabs_.get(tabId)?.space ?? this.activeId_;
  }

  partitionOf(spaceId: string): string {
    return this.byId(spaceId)?.partition ?? '';
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

  dormantIn(spaceId: string): DormantTab[] {
    return this.dormant_.filter(row => row.space === spaceId);
  }

  dormantByKey(key: string): DormantTab|undefined {
    return this.dormant_.find(row => row.key === key);
  }

  wake(key: string): DormantTab|undefined {
    const row = this.dormantByKey(key);
    if (!row) {
      return undefined;
    }
    this.dormant_ = this.dormant_.filter(other => other !== row);
    this.onChange_();
    return row;
  }

  addDormant(spaceId: string, tab: StoredTab): DormantTab|undefined {
    if (!this.byId(spaceId)) {
      return undefined;
    }
    const row: DormantTab = {key: this.mintKey_(), space: spaceId, ...tab};
    this.dormant_.push(row);
    this.onChange_();
    return row;
  }

  reorderDormant(spaceId: string, keys: string[]) {
    const rows = this.dormantIn(spaceId);
    const ordered = keys.map(key => rows.find(row => row.key === key))
                        .filter(row => row !== undefined);
    if (ordered.length !== rows.length) {
      return;
    }
    let next = 0;
    this.dormant_ = this.dormant_.map(
        row => row.space === spaceId ? ordered[next++]! : row);
    this.onChange_();
  }

  moveDormant(key: string, spaceId: string): boolean {
    const row = this.dormantByKey(key);
    if (!row || !this.byId(spaceId)) {
      return false;
    }
    row.space = spaceId;
    this.onChange_();
    return true;
  }

  wakeActive(spaceId: string): DormantTab|undefined {
    if (this.tabsIn(spaceId).length) {
      return undefined;
    }
    return this.wake(this.dormantIn(spaceId)[0]?.key ?? '');
  }

  lastActiveIn(spaceId: string): string {
    const space = this.byId(spaceId);
    const tabs = this.tabsIn(spaceId);
    if (space && tabs.includes(space.activeTabId)) {
      return space.activeTabId;
    }
    return tabs[tabs.length - 1] ?? '';
  }

  storedOf(tabId: string): StoredTab {
    const assignment = this.tabs_.get(tabId);
    return {
      url: assignment?.url ?? '',
      title: assignment?.title ?? '',
      favicon: assignment?.favicon ?? '',
    };
  }

  private adoptProfile_(partition: string) {
    if (!partition ||
        this.profiles_.some(profile => profile.id === partition)) {
      return;
    }
    this.profiles_.push(
        {id: partition, name: `Profile ${this.profiles_.length + 1}`});
  }

  private mintKey_(): string {
    return `dormant${this.nextKey_++}`;
  }

  private mint_(): Space {
    const index = this.spaces_.length;
    const id = crypto.randomUUID();
    return {
      id,
      name: `Space ${index + 1}`,
      color: SPACE_COLORS[index % SPACE_COLORS.length]!,
      icon: SPACE_ICONS[index % SPACE_ICONS.length]![0],
      partition: '',
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
    icon: space.icon,
    partition: space.partition,
    activeUrl: space.activeTabId ?
        spaces.urlOf(space.activeTabId) :
        spaces.dormantIn(space.id)[0]?.url ?? '',
    pinned: pinned.entriesIn(space.id).map(({home, url, title, favicon}) => ({
      home,
      url,
      title,
      favicon,
    })),
    tabs: [
      ...spaces.tabsIn(space.id)
          .filter(tabId => !pinned.byTab(tabId))
          .map(tabId => spaces.storedOf(tabId)),
      ...spaces.dormantIn(space.id).map(({url, title, favicon}) => ({
        url,
        title,
        favicon,
      })),
    ],
  }));
  return {
    activeSpace: spaces.activeId,
    profiles: spaces.profiles.map(({id, name}) => ({id, name})),
    spaces: stored,
    essentials: pinned.essentials().map(({home, url, title, favicon}) => ({
      home,
      url,
      title,
      favicon,
    })),
  };
}
