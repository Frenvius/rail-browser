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
  profile: string;
  activeKey: string;
}

export interface TabRow {
  key: string;
  space: string;
  tabId: string;
  pending: boolean;
  asleep: boolean;
  opener: string;
  url: string;
  title: string;
  favicon: string;
}

interface RowFields {
  space: string;
  tabId: string;
  url: string;
  title: string;
  favicon: string;
  opener?: string;
}

export function isNewTabUrl(url: string): boolean {
  return !url || url.startsWith('chrome://newtab');
}

function storedTab(entry: StoredTab|string): StoredTab {
  return typeof entry === 'string' ? {url: entry, title: '', favicon: ''} :
                                     entry;
}

export class Spaces {
  private spaces_: Space[] = [];
  private activeId_ = '';
  private rows_: TabRow[] = [];
  private claims_ = new Map<string, string>();
  private creating_ = 0;
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

  setProfiles(profiles: SpaceProfile[]) {
    this.profiles_ = profiles;
  }

  addProfile(profile: SpaceProfile) {
    this.profiles_.push(profile);
  }

  setProfile(spaceId: string, profileId: string): boolean {
    const space = this.byId(spaceId);
    if (!space || space.profile === profileId) {
      return false;
    }
    space.profile = profileId;
    this.onChange_();
    return true;
  }

  restore(state: SidebarState|null, tabs: Tab[], claimed: Set<string>) {
    for (const stored of state?.spaces ?? []) {
      const space: Space = {
        id: stored.id || crypto.randomUUID(),
        name: stored.name,
        color: stored.color,
        icon: stored.icon || SPACE_ICONS[0]![0],
        profile: stored.profile ?? '',
        activeKey: '',
      };
      this.spaces_.push(space);
      for (const entry of stored.tabs ?? []) {
        const {url, title, favicon} = storedTab(entry);
        const tab = tabs.find(
            candidate => candidate.url === url && !claimed.has(candidate.id));
        if (tab) {
          claimed.add(tab.id);
        }
        const row = this.push_(
            {space: space.id, tabId: tab ? tab.id : '', url, title, favicon});
        if (url === stored.activeUrl && !space.activeKey) {
          space.activeKey = row.key;
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
    this.rows_ = this.rows_.filter(row => row.space !== id);
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
    if (this.byTab(tabId)) {
      this.assign(tabId, spaceId, this.urlOf(tabId));
      return;
    }
    this.claims_.set(tabId, spaceId);
  }

  expectTab() {
    this.creating_++;
  }

  settleTab() {
    this.creating_ = Math.max(0, this.creating_ - 1);
  }

  requested(tabId: string): boolean {
    return this.creating_ > 0 || this.claims_.has(tabId);
  }

  adopt(tabId: string, url: string) {
    const claimed = this.claims_.get(tabId);
    this.claims_.delete(tabId);
    const spaceId = claimed ?? this.activeId_;
    if (this.byTab(tabId)) {
      this.assign(tabId, spaceId, url);
      return;
    }
    const waiting = this.rows_.find(
        row => row.space === spaceId && row.pending && !row.tabId);
    if (waiting) {
      waiting.tabId = tabId;
      waiting.pending = false;
      waiting.url = url;
      this.onChange_();
      return;
    }
    this.push_({space: spaceId, tabId, url, title: '', favicon: ''});
    this.onChange_();
  }

  setOpener(tabId: string, openerTabId: string) {
    const row = this.byTab(tabId);
    const opener = this.byTab(openerTabId);
    if (!row || !opener || row.opener === opener.key ||
        row.space !== opener.space) {
      return;
    }
    row.opener = opener.key;
    this.onChange_();
  }

  assign(tabId: string, spaceId: string, url: string) {
    if (!this.byId(spaceId)) {
      return;
    }
    const row = this.byTab(tabId);
    if (!row) {
      this.push_({space: spaceId, tabId, url, title: '', favicon: ''});
      this.onChange_();
      return;
    }
    row.url = url;
    if (row.space !== spaceId) {
      row.space = spaceId;
      this.toEnd_(row);
    }
    this.onChange_();
  }

  track(tab: Tab) {
    const row = this.byTab(tab.id);
    if (!row) {
      return;
    }
    const favicon = tab.favicon.dataUrl;
    if (row.url === tab.url && row.title === tab.title &&
        row.favicon === favicon) {
      return;
    }
    row.url = tab.url;
    row.title = tab.title;
    row.favicon = favicon;
    this.onChange_();
  }

  forget(tabId: string) {
    const row = this.byTab(tabId);
    if (!row) {
      return;
    }
    this.rows_ = this.rows_.filter(other => other !== row);
    for (const space of this.spaces_) {
      if (space.activeKey === row.key) {
        space.activeKey = '';
      }
    }
    this.onChange_();
  }

  noteActive(tabId: string) {
    this.activeId_ = this.spaceOf(tabId);
    this.markActive(tabId);
  }

  markActive(tabId: string) {
    const row = this.byTab(tabId);
    const space = row ? this.byId(row.space) : undefined;
    if (!row || !space || space.activeKey === row.key) {
      return;
    }
    space.activeKey = row.key;
    this.onChange_();
  }

  spaceOf(tabId: string): string {
    return this.byTab(tabId)?.space ?? this.activeId_;
  }

  profileOf(spaceId: string): string {
    return this.byId(spaceId)?.profile ?? '';
  }

  owns(id: string): boolean {
    const row = this.byTab(id);
    return !row || row.space === this.activeId_;
  }

  urlOf(tabId: string): string {
    return this.byTab(tabId)?.url ?? '';
  }

  rowsIn(spaceId: string): TabRow[] {
    return this.rows_.filter(row => row.space === spaceId);
  }

  tabsIn(spaceId: string): string[] {
    return this.rowsIn(spaceId).filter(row => row.tabId).map(row => row.tabId);
  }

  dormantIn(spaceId: string): TabRow[] {
    return this.rowsIn(spaceId).filter(row => !row.tabId);
  }

  dormantByKey(key: string): TabRow|undefined {
    const row = this.rows_.find(other => other.key === key);
    return row && !row.tabId ? row : undefined;
  }

  byTab(tabId: string): TabRow|undefined {
    if (!tabId) {
      return undefined;
    }
    return this.rows_.find(row => row.tabId === tabId);
  }

  wake(key: string): TabRow|undefined {
    const row = this.dormantByKey(key);
    if (!row) {
      return undefined;
    }
    row.pending = true;
    this.onChange_();
    return row;
  }

  detach(tabId: string): string {
    const row = this.byTab(tabId);
    if (!row) {
      return '';
    }
    row.tabId = '';
    row.pending = true;
    row.asleep = false;
    this.onChange_();
    return row.key;
  }

  bind(key: string, tabId: string) {
    const row = this.rows_.find(other => other.key === key);
    if (!row) {
      return;
    }
    row.pending = false;
    row.asleep = false;
    if (tabId) {
      this.rows_ =
          this.rows_.filter(other => other === row || other.tabId !== tabId);
      row.tabId = tabId;
    }
    this.onChange_();
  }

  drop(key: string): boolean {
    const row = this.dormantByKey(key);
    if (!row) {
      return false;
    }
    this.rows_ = this.rows_.filter(other => other !== row);
    this.onChange_();
    return true;
  }

  addDormant(spaceId: string, tab: StoredTab): TabRow|undefined {
    if (!this.byId(spaceId)) {
      return undefined;
    }
    const row =
        this.push_({space: spaceId, tabId: '', ...tab});
    this.onChange_();
    return row;
  }

  reorder(spaceId: string, ids: string[]) {
    const rows = this.rowsIn(spaceId);
    const ordered = [...new Set(
        ids.map(id => rows.find(
                    row => row.key === id || (!!row.tabId && row.tabId === id)))
            .filter(row => row !== undefined))];
    if (!ordered.length) {
      return;
    }
    const moving = new Set(ordered);
    let next = 0;
    this.rows_ = this.rows_.map(row => moving.has(row) ? ordered[next++]! : row);
    this.onChange_();
  }

  moveDormant(key: string, spaceId: string): boolean {
    const row = this.dormantByKey(key);
    if (!row || !this.byId(spaceId)) {
      return false;
    }
    row.space = spaceId;
    this.toEnd_(row);
    this.onChange_();
    return true;
  }

  successorOf(tabId: string, closing: ReadonlySet<string> = new Set()):
      TabRow|undefined {
    const row = this.byTab(tabId);
    if (!row) {
      return undefined;
    }
    const rows = this.rowsIn(row.space).filter(
        other => other === row || !other.tabId || !closing.has(other.tabId));
    const index = rows.indexOf(row);
    const after = rows.slice(index + 1);

    const child = after.find(other => other.opener === row.key);
    if (child) {
      return child;
    }
    if (row.opener) {
      const sibling = after.find(other => other.opener === row.opener);
      if (sibling) {
        return sibling;
      }
      const opener = rows.find(other => other.key === row.opener);
      if (opener) {
        return opener;
      }
    }
    return rows[index + 1] ?? rows[index - 1];
  }

  relatedRows(first: string, second: string): boolean {
    const one = this.byTab(first);
    const other = this.byTab(second);
    if (!one || !other) {
      return true;
    }
    return one.opener === other.key || other.opener === one.key ||
        (!!one.opener && one.opener === other.opener);
  }

  hasOpeners(): boolean {
    return this.rows_.some(row => !!row.opener);
  }

  retainOpeners(openers: Map<string, string>): boolean {
    let changed = false;
    for (const row of this.rows_) {
      if (!row.opener || !row.tabId) {
        continue;
      }
      const opener = this.byTab(openers.get(row.tabId) ?? '');
      if (opener && opener.key === row.opener) {
        continue;
      }
      row.opener = '';
      changed = true;
    }
    if (changed) {
      this.onChange_();
    }
    return changed;
  }

  forgetOpeners(spaceId: string) {
    for (const row of this.rowsIn(spaceId)) {
      row.opener = '';
    }
  }

  placeAfter(tabId: string, afterTabId: string): boolean {
    return this.place_(tabId, afterTabId, 1);
  }

  placeBefore(tabId: string, beforeTabId: string): boolean {
    return this.place_(tabId, beforeTabId, 0);
  }

  placeAfterOpener(tabId: string) {
    const row = this.byTab(tabId);
    const opener = row ? this.rows_.find(other => other.key === row.opener) :
                         undefined;
    if (!row || !opener) {
      return;
    }
    const rows = this.rowsIn(row.space);
    let at = rows.indexOf(opener);
    if (at < 0) {
      return;
    }
    for (let next = at + 1; next < rows.length; next++) {
      const candidate = rows[next]!;
      if (candidate === row || candidate.opener !== opener.key) {
        break;
      }
      at = next;
    }
    this.placeRow_(row, rows[at]!, 1);
  }

  sleep(tabId: string): boolean {
    const row = this.byTab(tabId);
    if (!row || row.asleep) {
      return false;
    }
    row.asleep = true;
    this.onChange_();
    return true;
  }

  stir(tabId: string) {
    const row = this.byTab(tabId);
    if (!row || !row.asleep) {
      return;
    }
    row.asleep = false;
    this.onChange_();
  }

  isAsleep(tabId: string): boolean {
    return this.byTab(tabId)?.asleep === true;
  }

  activeRow(spaceId: string): TabRow|undefined {
    const space = this.byId(spaceId);
    const rows = this.rowsIn(spaceId);
    return rows.find(row => row.key === space?.activeKey) ?? rows[0];
  }

  wakeActive(spaceId: string): TabRow|undefined {
    if (this.rowsIn(spaceId).some(row => row.tabId || row.pending)) {
      return undefined;
    }
    return this.wake(this.activeRow(spaceId)?.key ?? '');
  }

  lastActiveIn(spaceId: string): string {
    const remembered = this.activeRow(spaceId);
    if (remembered?.tabId) {
      return remembered.tabId;
    }
    const tabs = this.tabsIn(spaceId);
    return tabs[tabs.length - 1] ?? '';
  }

  activeUrlIn(spaceId: string): string {
    return this.activeRow(spaceId)?.url ?? '';
  }

  storedOf(tabId: string): StoredTab {
    const row = this.byTab(tabId);
    return {
      url: row?.url ?? '',
      title: row?.title ?? '',
      favicon: row?.favicon ?? '',
    };
  }

  private toEnd_(row: TabRow) {
    this.rows_ = [...this.rows_.filter(other => other !== row), row];
  }

  private place_(tabId: string, anchorTabId: string, offset: number): boolean {
    const row = this.byTab(tabId);
    const anchor = this.byTab(anchorTabId);
    if (!row || !anchor) {
      return false;
    }
    return this.placeRow_(row, anchor, offset);
  }

  private placeRow_(row: TabRow, anchor: TabRow, offset: number): boolean {
    if (row === anchor || row.space !== anchor.space) {
      return false;
    }
    const rest = this.rows_.filter(other => other !== row);
    rest.splice(rest.indexOf(anchor) + offset, 0, row);
    this.rows_ = rest;
    this.onChange_();
    return true;
  }

  private push_(fields: RowFields): TabRow {
    const row: TabRow = {
      key: this.mintKey_(),
      pending: false,
      asleep: false,
      opener: fields.opener ?? '',
      space: fields.space,
      tabId: fields.tabId,
      url: fields.url,
      title: fields.title,
      favicon: fields.favicon,
    };
    this.rows_.push(row);
    return row;
  }

  private mintKey_(): string {
    return `row${this.nextKey_++}`;
  }

  private mint_(): Space {
    const index = this.spaces_.length;
    const id = crypto.randomUUID();
    return {
      id,
      name: `Space ${index + 1}`,
      color: SPACE_COLORS[index % SPACE_COLORS.length]!,
      icon: SPACE_ICONS[index % SPACE_ICONS.length]![0],
      profile: '',
      activeKey: '',
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
    profile: space.profile,
    activeUrl: spaces.activeUrlIn(space.id),
    pinned: pinned.entriesIn(space.id).map(({home, url, title, favicon}) => ({
      home,
      url,
      title,
      favicon,
    })),
    tabs: spaces.rowsIn(space.id)
              .filter(row => !pinned.byTab(row.tabId) && !isNewTabUrl(row.url))
              .map(({url, title, favicon}) => ({url, title, favicon})),
  }));
  return {
    activeSpace: spaces.activeId,
    spaces: stored,
    essentials: pinned.essentials().map(({home, url, title, favicon}) => ({
      home,
      url,
      title,
      favicon,
    })),
  };
}
