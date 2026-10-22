const CHECK_MS = 60 * 1000;

export interface SleepCandidate {
  id: string;
  url: string;
}

export function normalizeSleepSite(input: string): string {
  const text = input.trim().toLowerCase();
  if (!text) {
    return '';
  }
  try {
    const host =
        new URL(text.includes('://') ? text : `https://${text}`).hostname;
    return host.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

export function isSleepException(url: string, sites: string[]): boolean {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch (e) {
    return false;
  }
  return sites.some(site => host === site || host.endsWith(`.${site}`));
}

export class TabSleep {
  private seen_ = new Map<string, number>();
  private timer_ = 0;
  private idleMs_ = 30 * 60 * 1000;
  private exceptions_: string[] = [];

  constructor(
      private candidates_: () => SleepCandidate[],
      private sleep_: (id: string) => void) {}

  start() {
    this.stop();
    this.timer_ = window.setInterval(() => this.tick_(), CHECK_MS);
  }

  stop() {
    if (!this.timer_) {
      return;
    }
    window.clearInterval(this.timer_);
    this.timer_ = 0;
  }

  setPolicy(minutes: number, exceptions: string[]) {
    this.idleMs_ = Math.max(minutes, 0) * 60 * 1000;
    this.exceptions_ = exceptions;
  }

  touch(id: string) {
    if (id) {
      this.seen_.set(id, Date.now());
    }
  }

  forget(id: string) {
    this.seen_.delete(id);
  }

  private tick_() {
    const now = Date.now();
    for (const {id, url} of this.candidates_()) {
      const seen = this.seen_.get(id);
      if (seen === undefined || !this.idleMs_ ||
          isSleepException(url, this.exceptions_)) {
        this.seen_.set(id, now);
        continue;
      }
      if (now - seen >= this.idleMs_) {
        this.seen_.set(id, now);
        this.sleep_(id);
      }
    }
  }
}
