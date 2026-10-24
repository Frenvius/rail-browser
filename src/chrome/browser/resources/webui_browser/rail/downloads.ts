import {browserProxyFactory} from '../browser.mojom-webui.js';
import type {Data} from '../downloads.mojom-webui.js';
import {PageCallbackRouter, PageHandlerRemote, State} from '../downloads.mojom-webui.js';

export type {Data as Download};
export {State as DownloadState};

const RECENT_COUNT = 4;
const FRESH_START_S = 60;

const MOVING = new Set([
  State.kInProgress,
  State.kAsyncScanning,
  State.kPromptForScanning,
  State.kPromptForLocalPasswordScanning,
]);

export function isMoving(item: Data): boolean {
  return MOVING.has(item.state);
}

export function needsReview(item: Data): boolean {
  return item.state === State.kDangerous || item.state === State.kInsecure ||
      item.state === State.kPromptForScanning ||
      item.state === State.kPromptForLocalPasswordScanning;
}

export function rankRecent(items: Data[], count = RECENT_COUNT): Data[] {
  const moving = items.filter(
      item => isMoving(item) || item.state === State.kPaused ||
          needsReview(item));
  const done = items.filter(item => item.state === State.kComplete);
  const failed = items.filter(
      item => item.state === State.kCancelled ||
          item.state === State.kInterrupted);
  return [...new Set([...moving, ...done, ...failed])].slice(0, count);
}

export function overallProgress(items: Data[]): number|null {
  const moving = items.filter(isMoving);
  if (!moving.length) {
    return null;
  }
  const known = moving.filter(item => item.percent >= 0);
  if (!known.length) {
    return -1;
  }
  return known.reduce((sum, item) => sum + item.percent, 0) /
      (known.length * 100);
}

export function startedAgo(startedSeconds: number, nowMs: number): string {
  const seconds = Math.max(0, nowMs / 1000 - startedSeconds);
  if (seconds < 60) {
    return 'Just now';
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)} min ago`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function fileIconUrl(item: Data): string {
  return `chrome://fileicon/?path=${
      encodeURIComponent(item.filePath)}&scale=2x`;
}

export class DownloadList {
  private items_: Data[] = [];
  private readonly listeners_ = new Set<() => void>();
  private readonly router_ = new PageCallbackRouter();
  readonly handler: PageHandlerRemote;
  private terms_: string[] = [];
  private moving_ = new Set<string>();
  private readonly finishListeners_ = new Set<(item: Data) => void>();
  private readonly startListeners_ = new Set<(item: Data) => void>();
  private readonly seen_ = new Set<string>();

  constructor(readonly profile: string) {
    const page = Mojo.createMessagePipe();
    const handler = Mojo.createMessagePipe();
    this.router_.$.bindHandle(page.handle0);
    this.handler = new PageHandlerRemote(handler.handle0);
    browserProxyFactory.getInstance().handler.createDownloadsHandler(
        profile, page.handle1, handler.handle1);
    this.router_.insertItems.addListener(
        (index: number, items: Data[]) => {
          this.items_.splice(index, 0, ...items);
          this.changed_();
        });
    this.router_.updateItem.addListener((index: number, item: Data) => {
      this.items_[index] = item;
      this.changed_();
    });
    this.router_.removeItem.addListener((index: number) => {
      this.items_.splice(index, 1);
      this.changed_();
    });
    this.router_.clearAll.addListener(() => {
      this.items_ = [];
      this.changed_();
    });
    this.handler.getDownloads([]);
  }

  get items(): Data[] {
    return this.items_;
  }

  search(query: string) {
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (terms.join(' ') === this.terms_.join(' ')) {
      return;
    }
    this.terms_ = terms;
    this.handler.getDownloads(terms);
  }

  loadMore() {
    this.handler.getDownloads(this.terms_);
  }

  close() {
    this.handler.$.close();
    this.router_.$.close();
    this.listeners_.clear();
    this.finishListeners_.clear();
    this.startListeners_.clear();
  }

  subscribe(listener: () => void): () => void {
    this.listeners_.add(listener);
    return () => this.listeners_.delete(listener);
  }

  onFinish(listener: (item: Data) => void): () => void {
    this.finishListeners_.add(listener);
    return () => this.finishListeners_.delete(listener);
  }

  onStart(listener: (item: Data) => void): () => void {
    this.startListeners_.add(listener);
    return () => this.startListeners_.delete(listener);
  }

  private changed_() {
    const nowS = Date.now() / 1000;
    for (const item of this.items_) {
      if (!this.seen_.has(item.id)) {
        this.seen_.add(item.id);
        if (nowS - item.started < FRESH_START_S) {
          this.startListeners_.forEach(listener => listener(item));
        }
      }
      if (item.state === State.kComplete && this.moving_.has(item.id)) {
        this.finishListeners_.forEach(listener => listener(item));
      }
    }
    this.moving_ = new Set(this.items_.filter(isMoving).map(item => item.id));
    this.listeners_.forEach(listener => listener());
  }
}

let status: DownloadList|null = null;
let statusProfile = '';
const rebound = new Set<() => void>();

export function downloadStatus(): DownloadList {
  status ??= new DownloadList(statusProfile);
  return status;
}

export function downloadsProfile(): string {
  return statusProfile;
}

export function rebindDownloads(profile: string) {
  if (profile === statusProfile) {
    return;
  }
  statusProfile = profile;
  if (status) {
    status.close();
    status = new DownloadList(profile);
  }
  rebound.forEach(listener => listener());
}

export function onDownloadsRebound(listener: () => void): () => void {
  rebound.add(listener);
  return () => rebound.delete(listener);
}
