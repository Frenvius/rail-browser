import type {TabCommand} from './tab_menu.js';

const MULTI: ReadonlySet<TabCommand> = new Set<TabCommand>([
  'close',
  'duplicate',
  'essential',
  'move-to-space',
  'move-to-window',
  'mute',
  'new-window',
  'pin',
  'sleep',
  'unpin',
]);

export function actsOnSelection(command: TabCommand): boolean {
  return MULTI.has(command);
}

export class TabSelection {
  private ids_ = new Set<string>();
  private anchor_ = '';

  get size(): number {
    return this.ids_.size;
  }

  has(id: string): boolean {
    return this.ids_.has(id);
  }

  ids(order: string[]): string[] {
    return order.filter(id => this.ids_.has(id));
  }

  reset(id: string) {
    this.ids_ = new Set(id ? [id] : []);
    this.anchor_ = id;
  }

  toggle(id: string, active: string): boolean {
    if (!this.ids_.size) {
      this.ids_.add(active);
    }
    if (id === active && this.ids_.size <= 1) {
      return false;
    }
    if (this.ids_.has(id)) {
      this.ids_.delete(id);
      return false;
    }
    this.ids_.add(id);
    this.anchor_ = id;
    return true;
  }

  extendTo(id: string, order: string[], active: string) {
    const to = order.indexOf(id);
    if (to < 0) {
      return;
    }
    const from = order.indexOf(this.anchor_ || active);
    if (from < 0) {
      this.reset(id);
      return;
    }
    const anchor = this.anchor_ || active;
    this.ids_ = new Set(
        order.slice(Math.min(from, to), Math.max(from, to) + 1));
    this.anchor_ = anchor;
  }

  retain(order: string[]): boolean {
    const live = order.filter(id => this.ids_.has(id));
    if (live.length === this.ids_.size) {
      return false;
    }
    this.ids_ = new Set(live);
    if (!this.ids_.has(this.anchor_)) {
      this.anchor_ = '';
    }
    return true;
  }
}
