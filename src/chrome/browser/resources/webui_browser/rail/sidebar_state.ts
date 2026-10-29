import {loadTimeData} from '//resources/js/load_time_data.js';

import {browserProxyFactory} from '../browser.mojom-webui.js';

export const INCOGNITO = loadTimeData.isInitialized() &&
    loadTimeData.valueExists('incognito') &&
    loadTimeData.getBoolean('incognito');

export const MINI = new URLSearchParams(location.search).has('mini');

const RUN_ID = loadTimeData.isInitialized() &&
        loadTimeData.valueExists('railRunId') ?
    loadTimeData.getString('railRunId') :
    '';

export const WINDOW_ID = `${RUN_ID}.${crypto.randomUUID()}`;

export function isEarlierRun(owner?: string): boolean {
  return !!owner && !owner.startsWith(`${RUN_ID}.`);
}

const SAVE_DELAY_MS = 0;
const HISTORY_LIMIT = 16;

export interface StoredPin {
  id?: string;
  home: string;
  homeTitle?: string;
  homeFavicon?: string;
  url: string;
  title: string;
  favicon: string;
  folder?: string;
  owner?: string;
  tab?: string;
}

export interface StoredFolder {
  id: string;
  name: string;
  expanded: boolean;
  after?: string;
  parent?: string;
}

export interface StoredTab {
  id?: string;
  url: string;
  title: string;
  favicon: string;
  group?: string;
  owner?: string;
  tab?: string;
}

export interface StoredSpace {
  id: string;
  name: string;
  color: string;
  gradient?: string[];
  grain?: number;
  icon: string;
  profile?: string;
  activeUrl: string;
  pinned: StoredPin[];
  folders?: StoredFolder[];
  tidyGroups?: StoredFolder[];
  tabs: Array<StoredTab|string>;
}

export interface SidebarState {
  activeSpace: string;
  material?: number;
  spaces: StoredSpace[];
  favoritesByProfile?: Record<string, StoredPin[]>;
  favorites?: StoredPin[];
  essentials?: StoredPin[];
  rev?: string;
  parent?: string;
}

export function parseSidebarState(value: string): SidebarState|null {
  try {
    const parsed = JSON.parse(value || 'null');
    const state = parsed && Array.isArray(parsed.spaces) ?
        parsed as SidebarState :
        null;
    if (!INCOGNITO) {
      return state;
    }
    return {activeSpace: '', material: state?.material, spaces: []};
  } catch (e) {
    return INCOGNITO ? {activeSpace: '', spaces: []} : null;
  }
}

interface OpenTab {
  id: string;
  url: string;
}

function matchedUrls(urls: string[], open: OpenTab[]): number {
  const left = open.map(tab => tab.url);
  return urls.filter(url => {
    const index = left.indexOf(url);
    if (index < 0) {
      return false;
    }
    left.splice(index, 1);
    return true;
  }).length;
}

export function earlierOwnerOf(
    state: SidebarState|null, open: OpenTab[], known = ''): string {
  const favorites = state?.favoritesByProfile ??
      {'': state?.favorites ?? state?.essentials ?? []};
  const entries: Array<StoredTab|StoredPin|string> = [
    ...(state?.spaces ?? []).flatMap(space => [...space.pinned, ...space.tabs]),
    ...Object.values(favorites).flat(),
  ];
  const byOwner = new Map<string, Array<StoredTab|StoredPin>>();
  for (const entry of entries) {
    if (typeof entry === 'string' || !isEarlierRun(entry.owner)) {
      continue;
    }
    byOwner.set(entry.owner!, [...(byOwner.get(entry.owner!) ?? []), entry]);
  }
  if (byOwner.has(known)) {
    return known;
  }
  const ranked = [...byOwner].map(([owner, owned]) => {
    const matched = matchedUrls(owned.map(entry => entry.url), open);
    const sameTab = owned.filter(
        entry => open.some(tab => tab.id === entry.tab && tab.url === entry.url));
    return {owner, rank: [matched, matched - owned.length, sameTab.length]};
  });
  const byRank = (one: number[], other: number[]) =>
      one.map((value, index) => other[index]! - value).find(Boolean) ?? 0;
  const [best] = ranked.filter(candidate => candidate.rank[0]! > 0)
                     .sort((one, other) => byRank(one.rank, other.rank) ||
                               one.owner.localeCompare(other.owner));
  return best?.owner ?? '';
}

export async function readSidebarState(): Promise<SidebarState|null> {
  const {value} =
      await browserProxyFactory.getInstance().handler.getSidebarState();
  return parseSidebarState(value);
}

function sharedPart(value: string): string {
  const state = JSON.parse(value) as SidebarState;
  return JSON.stringify({
    ...state,
    activeSpace: '',
    spaces: state.spaces.map(space => ({...space, activeUrl: ''})),
  });
}

function unstamped(state: SidebarState): SidebarState {
  const rest = {...state};
  delete rest.rev;
  delete rest.parent;
  return rest;
}

function same(one: unknown, other: unknown): boolean {
  return JSON.stringify(one) === JSON.stringify(other);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function identity(item: unknown): string {
  const id = isRecord(item) ? item['id'] : undefined;
  return typeof id === 'string' && id ? id : JSON.stringify(item);
}

function pick(base: unknown, mine: unknown, theirs: unknown): unknown {
  if (same(mine, theirs) || same(base, theirs)) {
    return mine;
  }
  if (same(base, mine)) {
    return theirs;
  }
  return (JSON.stringify(mine) ?? '') > (JSON.stringify(theirs) ?? '') ?
      mine :
      theirs;
}

function mergeList(
    base: unknown[], mine: unknown[], theirs: unknown[]): unknown[] {
  const index = (list: unknown[]) =>
      new Map(list.map(item => [identity(item), item]));
  const was = index(base);
  const ours = index(mine);
  const others = index(theirs);
  const kept = (id: string) => (ours.has(id) && others.has(id)) || !was.has(id);
  const common = (list: unknown[]) => list.map(identity).filter(
      id => was.has(id) && ours.has(id) && others.has(id));
  const reordered = !same(common(mine), common(base)) &&
      same(common(theirs), common(base));
  const [lead, follow] = reordered ? [mine, theirs] : [theirs, mine];
  const order = [...new Set(lead.map(identity).filter(kept))];
  follow.map(identity).forEach((id, position, ids) => {
    if (!kept(id) || order.includes(id)) {
      return;
    }
    const before =
        ids.slice(0, position).reverse().find(other => order.includes(other));
    order.splice(before === undefined ? 0 : order.indexOf(before) + 1, 0, id);
  });
  return order.map(
      id => mergeState(
          was.get(id), ours.get(id) ?? others.get(id),
          others.get(id) ?? ours.get(id)));
}

const BINDING_KEYS = ['owner', 'tab'];

function bindingOf(record: Record<string, unknown>): unknown[]|undefined {
  return BINDING_KEYS.some(key => record[key] !== undefined) ?
      BINDING_KEYS.map(key => record[key] ?? null) :
      undefined;
}

function boundThisRun(binding: unknown[]|undefined): boolean {
  const owner = binding?.[0];
  return typeof owner === 'string' && !isEarlierRun(owner);
}

function boundEarlier(binding: unknown[]|undefined): boolean {
  const owner = binding?.[0];
  return typeof owner === 'string' && isEarlierRun(owner);
}

export function mergeState(
    base: unknown, mine: unknown, theirs: unknown): unknown {
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    return mergeList(Array.isArray(base) ? base : [], mine, theirs);
  }
  if (isRecord(mine) && isRecord(theirs)) {
    const old = isRecord(base) ? base : {};
    const merged: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
      if (BINDING_KEYS.includes(key)) {
        continue;
      }
      const value = mergeState(old[key], mine[key], theirs[key]);
      if (value !== undefined) {
        merged[key] = value;
      }
    }
    const ours = bindingOf(mine);
    const others = bindingOf(theirs);
    const binding = (boundThisRun(ours) && boundEarlier(others) ? ours :
                     boundThisRun(others) && boundEarlier(ours) ?
                     others :
                     pick(bindingOf(old), ours, others)) as unknown[] |
        undefined;
    BINDING_KEYS.forEach((key, index) => {
      if (binding && binding[index] !== null) {
        merged[key] = binding[index];
      }
    });
    return merged;
  }
  return pick(base, mine, theirs);
}

type RowKey = {id?: string}|string;

const rowKeyOf = (row: RowKey): string =>
    typeof row === 'string' ? row : row.id ?? '';

function addMissingRows<T extends RowKey>(rows: T[], incoming: T[]): T[] {
  const held = new Set(rows.map(rowKeyOf));
  return [...rows, ...incoming.filter(row => !held.has(rowKeyOf(row)))];
}

export function normalizeStoredFolders(folders: StoredFolder[]): StoredFolder[] {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  return folders.map(folder => {
    const seen = new Set([folder.id]);
    let parent = folder.parent ?? '';
    let ancestor = parent;
    while (ancestor) {
      const next = byId.get(ancestor);
      if (!next || seen.has(ancestor)) {
        parent = '';
        break;
      }
      seen.add(ancestor);
      ancestor = next.parent ?? '';
    }
    return {...folder, parent};
  });
}

function mergeSpaceRows(
    space: StoredSpace, incoming: StoredSpace|undefined): StoredSpace {
  if (!incoming) {
    return {...space, folders: normalizeStoredFolders(space.folders ?? [])};
  }
  const folders = normalizeStoredFolders(
      addMissingRows(space.folders ?? [], incoming.folders ?? []));
  const tidyGroups =
      addMissingRows(space.tidyGroups ?? [], incoming.tidyGroups ?? []);
  const folderIds = new Set(folders.map(folder => folder.id));
  const groupIds = new Set(tidyGroups.map(group => group.id));
  const pinned = incoming.pinned.map(
      pin => ({
        ...pin,
        folder: folderIds.has(pin.folder ?? '') ? pin.folder : undefined,
      }));
  const tabs = incoming.tabs.map(
      tab => typeof tab === 'string' ? tab : {
        ...tab,
        group: groupIds.has(tab.group ?? '') ? tab.group : undefined,
      });
  return {
    ...space,
    pinned: addMissingRows(space.pinned, pinned),
    folders,
    tidyGroups,
    tabs: addMissingRows(space.tabs, tabs),
  };
}

export function mergeImport(
    current: SidebarState, imported: SidebarState,
    knownSpaces: string[]): SidebarState {
  const held = new Set(current.spaces.map(space => space.id));
  const retired = new Set(knownSpaces);
  const incoming = new Map(
      imported.spaces.map(space => [space.id, space] as [string, StoredSpace]));
  const favorites: Record<string, StoredPin[]> = {
    ...current.favoritesByProfile,
  };
  for (const [profileId, pins] of Object.entries(
           imported.favoritesByProfile ?? {})) {
    const existing = favorites[profileId] ?? [];
    const have = new Set(existing.map(pin => pin.id));
    favorites[profileId] =
        [...existing, ...pins.filter(pin => !have.has(pin.id))];
  }
  return {
    ...current,
    spaces: [
      ...current.spaces.map(space => mergeSpaceRows(space, incoming.get(space.id))),
      ...imported.spaces.filter(
          space => !held.has(space.id) && !retired.has(space.id))
          .map(space => ({
                 ...space,
                 folders: normalizeStoredFolders(space.folders ?? []),
               })),
    ],
    favoritesByProfile: favorites,
  };
}

export class SidebarStore {
  private timer_ = 0;
  private latest_: string|null = null;
  private received_ = false;
  private head_ = '';
  private readonly history_ = new Map<string, SidebarState>();
  private readonly own_ = new Set<string>();

  constructor(private serialize_: () => SidebarState) {}

  seed(state: SidebarState|null) {
    if (state?.rev) {
      this.head_ = state.rev;
      this.remember_(state.rev, unstamped(state));
    }
  }

  save() {
    if (INCOGNITO || MINI) {
      return;
    }
    clearTimeout(this.timer_);
    this.timer_ = setTimeout(() => this.publish_(), SAVE_DELAY_MS);
  }

  accept(value: string): SidebarState|null {
    const incoming = parseSidebarState(value);
    if (!incoming || value === this.latest_) {
      return null;
    }
    if (INCOGNITO || MINI) {
      this.latest_ = value;
      return incoming;
    }
    const rev = incoming.rev ?? '';
    const known = !!rev && this.history_.has(rev);
    const own = this.own_.delete(rev);
    const theirs = unstamped(incoming);
    const base = this.history_.get(incoming.parent ?? '');
    if (rev && (own || !known)) {
      this.head_ = rev;
      this.remember_(rev, theirs);
    }
    if (own) {
      this.received_ = false;
      return null;
    }
    if (known) {
      return null;
    }
    const text = JSON.stringify(theirs);
    if (text === this.latest_) {
      return null;
    }
    const mine = this.serialize_();
    this.latest_ = text;
    this.received_ = true;
    return mergeState(base ?? mine, mine, theirs) as SidebarState;
  }

  private publish_() {
    const state = this.serialize_();
    const value = JSON.stringify(state);
    if (value === this.latest_ ||
        (this.received_ && this.latest_ &&
         sharedPart(value) === sharedPart(this.latest_))) {
      return;
    }
    this.latest_ = value;
    this.received_ = false;
    const rev = crypto.randomUUID();
    this.remember_(rev, state);
    if (this.own_.size >= HISTORY_LIMIT) {
      this.own_.clear();
    }
    this.own_.add(rev);
    browserProxyFactory.getInstance().handler.setSidebarState(
        JSON.stringify({...state, rev, parent: this.head_}));
  }

  private remember_(rev: string, state: SidebarState) {
    this.history_.set(rev, state);
    if (this.history_.size > HISTORY_LIMIT) {
      this.history_.delete(this.history_.keys().next().value!);
    }
  }
}
