const IDLE_MS = 30 * 60 * 1000;
const CHECK_MS = 60 * 1000;

export class TabSleep {
  private seen_ = new Map<string, number>();
  private timer_ = 0;

  constructor(
      private candidates_: () => string[],
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
    for (const id of this.candidates_()) {
      const seen = this.seen_.get(id);
      if (seen === undefined) {
        this.seen_.set(id, now);
        continue;
      }
      if (now - seen >= IDLE_MS) {
        this.seen_.set(id, now);
        this.sleep_(id);
      }
    }
  }
}
