const ARCHIVE_KEY = 'rail.archivedTabs';
const SEEN_KEY = 'rail.tabSeen';
const CHECK_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const KEEP_MS = 30 * DAY_MS;
const ARCHIVE_LIMIT = 500;
const SEEN_LIMIT = 2000;
const FAVICON_LIMIT = 8192;

export const DEFAULT_ARCHIVE_HOURS = 12;

export type ArchiveHours = Record<string, number>;

export function archiveSource(hours: ArchiveHours, profile: string): string {
  return hours[profile] === undefined ? '' : profile;
}

export function archiveHoursFor(hours: ArchiveHours, profile: string): number {
  return hours[archiveSource(hours, profile)] ?? DEFAULT_ARCHIVE_HOURS;
}

export interface ArchivedTab {
  id: string;
  url: string;
  title: string;
  favicon: string;
  space: string;
  archivedAt: number;
}

export interface ArchiveDay {
  label: string;
  tabs: ArchivedTab[];
}

export interface ArchiveCandidate {
  key: string;
  url: string;
  profile: string;
}

type Store = Pick<Storage, 'getItem'|'setItem'>;

function read<T>(store: Store, key: string, fallback: T): T {
  try {
    return JSON.parse(store.getItem(key) ?? '') as T ?? fallback;
  } catch (e) {
    return fallback;
  }
}

function write(store: Store, key: string, value: unknown): boolean {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export class ArchiveStore {
  private readonly listeners_ = new Set<() => void>();

  constructor(
      private readonly store_: Store,
      private readonly now_: () => number = Date.now) {}

  list(): ArchivedTab[] {
    const tabs = read<ArchivedTab[]>(this.store_, ARCHIVE_KEY, []);
    const oldest = this.now_() - KEEP_MS;
    return Array.isArray(tabs) ?
        tabs.filter(tab => tab?.url && tab.archivedAt >= oldest) :
        [];
  }

  add(tabs: Array<Omit<ArchivedTab, 'archivedAt'>>) {
    if (!tabs.length) {
      return;
    }
    const archivedAt = this.now_();
    const fresh = tabs.map(tab => ({
                             ...tab,
                             favicon: tab.favicon.length <= FAVICON_LIMIT ?
                                 tab.favicon :
                                 '',
                             archivedAt,
                           }));
    const kept = this.list().filter(
        old => !fresh.some(
            tab => tab.id === old.id ||
                (tab.url === old.url && tab.space === old.space)));
    this.save_([...fresh, ...kept].slice(0, ARCHIVE_LIMIT));
  }

  take(id: string): ArchivedTab|undefined {
    const tabs = this.list();
    const tab = tabs.find(one => one.id === id);
    if (tab) {
      this.save_(tabs.filter(one => one !== tab));
    }
    return tab;
  }

  clear() {
    this.save_([]);
  }

  subscribe(listener: () => void): () => void {
    this.listeners_.add(listener);
    return () => this.listeners_.delete(listener);
  }

  notify() {
    this.listeners_.forEach(listener => listener());
  }

  private save_(tabs: ArchivedTab[]) {
    write(this.store_, ARCHIVE_KEY, tabs);
    this.notify();
  }
}

let shared: ArchiveStore|null = null;

export function archivedTabs(): ArchiveStore {
  if (!shared) {
    const store = new ArchiveStore(localStorage);
    window.addEventListener('storage', e => {
      if (e.key === ARCHIVE_KEY) {
        store.notify();
      }
    });
    shared = store;
  }
  return shared;
}

export function matchArchived(tabs: ArchivedTab[], query: string):
    ArchivedTab[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return tabs;
  }
  return tabs.filter(
      tab => tab.title.toLowerCase().includes(needle) ||
          tab.url.toLowerCase().includes(needle));
}

export function groupByDay(tabs: ArchivedTab[], now: number): ArchiveDay[] {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const today = midnight.getTime();
  const days: ArchiveDay[] = [
    {label: 'Today', tabs: []},
    {label: 'Yesterday', tabs: []},
    {label: 'This Week', tabs: []},
    {label: 'Older', tabs: []},
  ];
  for (const tab of tabs) {
    const day = tab.archivedAt >= today ? 0 :
        tab.archivedAt >= today - DAY_MS ? 1 :
        tab.archivedAt >= today - 6 * DAY_MS ? 2 :
                                              3;
    days[day]!.tabs.push(tab);
  }
  return days.filter(day => day.tabs.length);
}

export class TabArchive {
  private timer_ = 0;
  private hours_: ArchiveHours = {};
  private readonly armedAt_ = new Map<string, number>();

  constructor(
      private readonly store_: Store,
      private readonly candidates_: () => ArchiveCandidate[],
      private readonly archive_: (keys: string[]) => void,
      private readonly now_: () => number = Date.now) {}

  start() {
    this.stop();
    this.timer_ = window.setInterval(() => this.tick(), CHECK_MS);
  }

  stop() {
    if (this.timer_) {
      window.clearInterval(this.timer_);
      this.timer_ = 0;
    }
  }

  setHours(hours: ArchiveHours) {
    const now = this.now_();
    for (const profile of new Set(['', ...Object.keys(hours)])) {
      if (archiveHoursFor(hours, profile) > 0 &&
          archiveHoursFor(this.hours_, profile) <= 0) {
        this.armedAt_.set(profile, now);
      }
    }
    this.hours_ = hours;
  }

  touch(...keys: string[]) {
    const seen = this.seen_();
    const now = this.now_();
    keys.filter(Boolean).forEach(key => seen[key] = now);
    this.saveSeen_(seen);
  }

  forget(keys: string[]) {
    const seen = this.seen_();
    keys.forEach(key => delete seen[key]);
    this.saveSeen_(seen);
  }

  tick() {
    const candidates = this.candidates_();
    const seen = this.seen_();
    const now = this.now_();
    const due: string[] = [];
    for (const {key, profile} of candidates) {
      const last = seen[key];
      const source = archiveSource(this.hours_, profile);
      const idleMs = archiveHoursFor(this.hours_, profile) * HOUR_MS;
      if (last === undefined || idleMs <= 0) {
        seen[key] = now;
      } else if (
          now - Math.max(last, this.armedAt_.get(source) ?? 0) >= idleMs) {
        due.push(key);
        delete seen[key];
      }
    }
    this.saveSeen_(seen);
    if (due.length) {
      this.archive_(due);
    }
  }

  private seen_(): Record<string, number> {
    const seen = read<Record<string, number>>(this.store_, SEEN_KEY, {});
    return seen && typeof seen === 'object' ? seen : {};
  }

  private saveSeen_(seen: Record<string, number>) {
    const entries = Object.entries(seen);
    write(
        this.store_, SEEN_KEY,
        entries.length > SEEN_LIMIT ?
            Object.fromEntries(entries.sort((one, other) => other[1] - one[1])
                                   .slice(0, SEEN_LIMIT)) :
            seen);
  }
}
