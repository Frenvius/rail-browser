import type {Tab} from '/tab_strip_api/tab_strip_api_data_model.mojom-webui.js';

import type {SystemBackdropSettings} from '../browser.mojom-webui.js';
import {SystemBackdropMaterial} from '../browser.mojom-webui.js';

import type {Folders} from './folders.js';
import type {PinnedEntry, PinnedTabs} from './pinned_tabs.js';
import type {SidebarState, StoredPin, StoredSpace, StoredTab} from './sidebar_state.js';
import {INCOGNITO} from './sidebar_state.js';

export const SPACE_COLORS = [
  '#331b47', '#591b1c', '#58341a', '#725919',
  '#163e17', '#173634', '#192e50',
];

export function hslToHex(
    hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = ((hue % 360) + 360) % 360 / 60;
  const second = chroma * (1 - Math.abs(segment % 2 - 1));
  const rgb = segment < 1 ? [chroma, second, 0] :
      segment < 2       ? [second, chroma, 0] :
      segment < 3       ? [0, chroma, second] :
      segment < 4       ? [0, second, chroma] :
      segment < 5       ? [second, 0, chroma] :
                          [chroma, 0, second];
  const base = l - chroma / 2;
  return '#' +
      rgb.map(channel => Math.round((channel + base) * 255)
                             .toString(16)
                             .padStart(2, '0'))
          .join('');
}

export function hexToHsl(hex: string): [number, number, number] {
  const text = spaceHex(hex).replace('#', '');
  const full = text.length === 3 ?
      text.split('').map(character => character + character).join('') :
      text;
  const [r, g, b] = [0, 2, 4].map(
      offset => parseInt(full.slice(offset, offset + 2), 16) / 255);
  if (r === undefined || g === undefined || b === undefined ||
      Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return [0, 0, 50];
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  const lightness = (max + min) / 2;
  if (!span) {
    return [0, 0, Math.round(lightness * 100)];
  }
  const hue = max === r ? ((g - b) / span + (g < b ? 6 : 0)) :
      max === g        ? (b - r) / span + 2 :
                         (r - g) / span + 4;
  return [
    Math.round(hue * 60),
    Math.round(span / (1 - Math.abs(2 * lightness - 1)) * 100),
    Math.round(lightness * 100),
  ];
}

export function spaceHex(color: string): string {
  return color.length === 9 ? color.slice(0, 7) : color;
}

export function tintStrength(color: string): number {
  if (color.length !== 9) {
    return 0;
  }
  return parseInt(color.slice(7), 16) / 255;
}

export function withStrength(hex: string, strength: number): string {
  const alpha = Math.round(Math.min(1, Math.max(0, strength)) * 255);
  return spaceHex(hex) + alpha.toString(16).padStart(2, '0');
}

export const INCOGNITO_NAME = 'Incognito';
export const INCOGNITO_ICON = '🔒';
export const INCOGNITO_COLOR = withStrength('#3c3c43', 0.8);

export const MIN_STRENGTH = 5;
export const DEFAULT_MATERIAL = SystemBackdropMaterial.kAcrylic;

const ACRYLIC_TINT_RANGE: readonly[number, number] = [0.06, 0.6];
const ACRYLIC_LUMINOSITY_RANGE: readonly[number, number] = [0.95, 0.6];
const MICA_TINT_RANGE: readonly[number, number] = [0, 0.85];
const MICA_LUMINOSITY_RANGE: readonly[number, number] = [0, 0.9];

function mix(range: readonly[number, number], t: number): number {
  return range[0] + (range[1] - range[0]) * t;
}

function hexToArgb(hex: string): number {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return (0xff000000 | value) >>> 0;
}

export function isMicaMaterial(material: SystemBackdropMaterial): boolean {
  return material === SystemBackdropMaterial.kMica ||
      material === SystemBackdropMaterial.kMicaAlt;
}

export function backdropSettings(
    hex: string, strength: number,
    material: SystemBackdropMaterial): SystemBackdropSettings {
  const color = hexToArgb(spaceHex(hex));
  const t = (Math.max(MIN_STRENGTH, strength) - MIN_STRENGTH) /
      (100 - MIN_STRENGTH);
  const mica = isMicaMaterial(material);
  return {
    material,
    tintColor: color,
    fallbackColor: color,
    tintOpacity: mix(mica ? MICA_TINT_RANGE : ACRYLIC_TINT_RANGE, t),
    luminosityOpacity:
        mix(mica ? MICA_LUMINOSITY_RANGE : ACRYLIC_LUMINOSITY_RANGE, t),
  };
}

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
  group: string;
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
  group?: string;
}

export function isNewTabUrl(url: string): boolean {
  return !url || url.startsWith('chrome://newtab');
}

function storedTab(entry: StoredTab|string): StoredTab {
  return typeof entry === 'string' ?
      {url: entry, title: '', favicon: '', group: ''} :
      entry;
}

export class Spaces {
  private spaces_: Space[] = [];
  private activeId_ = '';
  private rows_: TabRow[] = [];
  private claims_ = new Map<string, string>();
  private creating_ = 0;
  private profiles_: SpaceProfile[] = [];
  private material_: SystemBackdropMaterial = DEFAULT_MATERIAL;
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

  get material(): SystemBackdropMaterial {
    return this.material_;
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
    if (INCOGNITO || !space || space.profile === profileId) {
      return false;
    }
    space.profile = profileId;
    this.onChange_();
    return true;
  }

  restore(state: SidebarState|null, tabs: Tab[], claimed: Set<string>) {
    this.material_ = state?.material ?? DEFAULT_MATERIAL;
    for (const stored of state?.spaces ?? []) {
      const space: Space = {
        id: stored.id || crypto.randomUUID(),
        name: stored.name,
        color: stored.color.length === 9 ? stored.color :
                                            withStrength(stored.color, 0),
        icon: stored.icon ?? SPACE_ICONS[0]![0],
        profile: stored.profile ?? '',
        activeKey: '',
      };
      this.spaces_.push(space);
      for (const entry of stored.tabs ?? []) {
        const {url, title, favicon, group} = storedTab(entry);
        const tab = tabs.find(
            candidate => candidate.url === url && !claimed.has(candidate.id));
        if (tab) {
          claimed.add(tab.id);
        }
        const row = this.push_({
          space: space.id,
          tabId: tab ? tab.id : '',
          url,
          title,
          favicon,
          group,
        });
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
    if (INCOGNITO) {
      return this.active;
    }
    const space = this.mint_();
    this.spaces_.push(space);
    this.activeId_ = space.id;
    this.onChange_();
    return space;
  }

  rename(id: string, name: string) {
    const space = this.byId(id);
    if (INCOGNITO || !space || !name || space.name === name) {
      return;
    }
    space.name = name;
    this.onChange_();
  }

  restyle(
      id: string, color: string, icon: string,
      material?: SystemBackdropMaterial) {
    const space = this.byId(id);
    if (INCOGNITO || !space) {
      return;
    }
    space.color = color || space.color;
    space.icon = icon === 'none' ? '' : (icon || space.icon);
    if (material !== undefined) {
      this.material_ = material;
    }
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

  setGroup(key: string, groupId: string) {
    const row = this.rows_.find(
        other => other.key === key || other.tabId === key);
    if (!row || row.group === groupId) {
      return;
    }
    row.group = groupId;
    this.onChange_();
  }

  clearGroup(groupId: string) {
    let changed = false;
    for (const row of this.rows_) {
      if (row.group === groupId) {
        row.group = '';
        changed = true;
      }
    }
    if (changed) {
      this.onChange_();
    }
  }

  rowFor(id: string): TabRow|undefined {
    return this.rows_.find(row => row.key === id || row.tabId === id);
  }

  keysInGroup(groupId: string): string[] {
    return this.rows_.filter(row => row.group === groupId)
        .map(row => row.tabId || row.key);
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
      group: fields.group ?? '',
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
    if (INCOGNITO) {
      return {
        id,
        name: INCOGNITO_NAME,
        color: INCOGNITO_COLOR,
        icon: INCOGNITO_ICON,
        profile: '',
        activeKey: '',
      };
    }
    return {
      id,
      name: `Space ${index + 1}`,
      color: withStrength('#192e50', 0.8),
      icon: '',
      profile: '',
      activeKey: '',
    };
  }
}

function storePin(entry: PinnedEntry): StoredPin {
  const {home, homeTitle, homeFavicon, url, title, favicon, folder} = entry;
  return {home, homeTitle, homeFavicon, url, title, favicon, folder};
}

export function serializeSidebar(
    spaces: Spaces, pinned: PinnedTabs, folders: Folders,
    tidyGroups: Folders): SidebarState {
  const stored: StoredSpace[] = spaces.all.map(space => ({
    id: space.id,
    name: space.name,
    color: space.color,
    icon: space.icon,
    profile: space.profile,
    activeUrl: spaces.activeUrlIn(space.id),
    pinned: pinned.entriesIn(space.id).map(storePin),
    folders: folders.storedIn(space.id),
    tidyGroups: tidyGroups.storedIn(space.id),
    tabs: spaces.rowsIn(space.id)
              .filter(row => !pinned.byTab(row.tabId) && !isNewTabUrl(row.url))
              .map(({url, title, favicon, group}) =>
                       ({url, title, favicon, group})),
  }));
  const favoritesByProfile: Record<string, StoredPin[]> = {};
  for (const profileId of pinned.favoriteProfiles()) {
    favoritesByProfile[profileId] = pinned.favorites(profileId).map(storePin);
  }
  return {
    activeSpace: spaces.activeId,
    material: spaces.material,
    spaces: stored,
    favoritesByProfile,
  };
}
