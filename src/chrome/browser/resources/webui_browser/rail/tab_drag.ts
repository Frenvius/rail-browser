import type {TabStripItem} from '../tab_strip/items.js';
import type {TabElement} from '../tab_strip/tab.js';
import type {TabDragHost} from '../tab_strip/tab_drag_host.js';

export interface DragHandOff {
  tabId: string;
  row: DOMRect;
  grabX: number;
  grabY: number;
  detachable: boolean;
}

export interface RailDragHost extends TabDragHost {
  moveTabToSpace(tabId: string, spaceId: string): void;
  setTabPinned(tabId: string, pinned: boolean): void;
  handOffDrag(drag: DragHandOff): void;
}

const DRAG_THRESHOLD = 4;
const DOT_REACH = 14;

export class TabDrag {
  private host_: RailDragHost;
  private tabId_ = '';
  private startY_ = 0;
  private offsetX_ = 0;
  private offsetY_ = 0;
  private height_ = 0;
  private lastY_ = 0;
  private pinned_ = false;
  private dormant_ = false;
  private dragging_ = false;
  private hoveredDot_: HTMLElement|null = null;
  private crossesDivider_ = false;

  private onMove_ = (e: MouseEvent) => this.move_(e);
  private onUp_ = () => this.cancel_();

  constructor(host: RailDragHost) {
    this.host_ = host;
  }

  onMouseDown(e: MouseEvent) {
    if (e.button !== 0) {
      return;
    }
    const element = e.composedPath().find(
                        node => node instanceof Element &&
                            node.localName === 'webui-browser-tab') as
        TabElement | undefined;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    this.tabId_ = element.tabData.id;
    this.pinned_ = element.pinned;
    this.dormant_ = element.dormant;
    this.startY_ = e.clientY;
    this.lastY_ = e.clientY;
    this.offsetX_ = e.clientX - rect.left;
    this.offsetY_ = e.clientY - rect.top;
    this.height_ = rect.height;
    window.addEventListener('mousemove', this.onMove_);
    window.addEventListener('mouseup', this.onUp_);
  }

  onUpdate() {
    if (!this.dragging_) {
      return;
    }
    for (const element of this.host_.shadowRoot!.querySelectorAll<HTMLElement>(
             'webui-browser-tab')) {
      element.classList.remove('dragsource');
    }
    this.element_()?.classList.add('dragsource');
  }

  onDragMoved(x: number, y: number) {
    if (!this.dragging_) {
      return;
    }
    this.lastY_ = y;
    if (!this.pinned_) {
      this.reorder_();
    }
    this.hoverDot_(x, y);
    this.hoverDivider_(y);
  }

  onDragEnded(inside: boolean) {
    if (!this.dragging_) {
      return;
    }
    const spaceId = this.hoveredDot_?.dataset['id'];
    const crossed = this.crossesDivider_;
    const tabId = this.tabId_;
    const pinned = this.pinned_;
    this.clearDragUi_();
    this.reset_();

    if (inside) {
      if (spaceId) {
        this.host_.moveTabToSpace(tabId, spaceId);
      } else if (crossed) {
        this.host_.setTabPinned(tabId, !pinned);
      }
    }
    this.host_.requestUpdate();
  }

  private move_(e: MouseEvent) {
    if (this.dragging_ ||
        Math.abs(e.clientY - this.startY_) < DRAG_THRESHOLD) {
      return;
    }
    e.preventDefault();
    this.dragging_ = true;
    this.host_.setDragInProgressForDrag(true);
    this.host_.setTabStripNoDrag(true);
    if (!this.dormant_) {
      this.host_.activateTabForDrag(this.tabId_);
    }

    const element = this.element_();
    if (!element) {
      this.cancel_();
      return;
    }
    window.removeEventListener('mousemove', this.onMove_);
    window.removeEventListener('mouseup', this.onUp_);
    this.host_.handOffDrag({
      tabId: this.tabId_,
      row: element.getBoundingClientRect(),
      grabX: this.offsetX_,
      grabY: this.offsetY_,
      detachable: !this.dormant_,
    });
    element.classList.add('dragsource');
  }

  private cancel_() {
    window.removeEventListener('mousemove', this.onMove_);
    window.removeEventListener('mouseup', this.onUp_);
    if (this.dragging_) {
      this.clearDragUi_();
    }
    this.reset_();
  }

  private clearDragUi_() {
    this.hoveredDot_?.classList.remove('droptarget');
    this.hoveredDot_ = null;
    this.host_.shadowRoot?.querySelector('#pinnedDivider')?.classList.remove(
        'droptarget');
    this.element_()?.classList.remove('dragsource');
    this.host_.setTabStripNoDrag(false);
    this.host_.setDragInProgressForDrag(false);
  }

  private hoverDivider_(y: number) {
    const divider =
        this.host_.shadowRoot?.querySelector<HTMLElement>('#pinnedDivider');
    if (!divider) {
      return;
    }
    const rect = divider.getBoundingClientRect();
    const above = y < rect.top + rect.height / 2;
    this.crossesDivider_ = above !== this.pinned_;
    divider.classList.toggle('droptarget', this.crossesDivider_);
  }

  private reorder_() {
    const items = [...this.host_.itemsForDrag];
    const index = items.findIndex(item => item.id === this.tabId_);
    if (index === -1) {
      return;
    }
    const top = this.lastY_ - this.offsetY_;
    const before = this.swapTarget_(items[index - 1]);
    if (before && top < this.midpoint_(before)) {
      this.swap_(items, index, index - 1);
      return;
    }
    const after = this.swapTarget_(items[index + 1]);
    if (after && top + this.height_ > this.midpoint_(after)) {
      this.swap_(items, index, index + 1);
    }
  }

  private swapTarget_(item: TabStripItem|undefined): HTMLElement|null {
    if (!item || item.type !== 'tab') {
      return null;
    }
    const element = this.host_.getTabElementForDrag(item.id);
    return element && element.dormant === this.dormant_ ? element : null;
  }

  private midpoint_(element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    return rect.top + rect.height / 2;
  }

  private swap_(items: TabStripItem[], from: number, to: number) {
    [items[from], items[to]] = [items[to]!, items[from]!];
    this.host_.setItemsForDrag(items);
  }

  private hoverDot_(x: number, y: number) {
    const bar = this.host_.shadowRoot?.querySelector('#spaceBar');
    const dots = bar?.shadowRoot?.querySelectorAll<HTMLElement>('.dot') ?? [];
    let dot: HTMLElement|null = null;
    let best = DOT_REACH;
    for (const candidate of dots) {
      const rect = candidate.getBoundingClientRect();
      const distance = Math.hypot(
          x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
      if (distance < best) {
        best = distance;
        dot = candidate;
      }
    }
    if (dot === this.hoveredDot_) {
      return;
    }
    this.hoveredDot_?.classList.remove('droptarget');
    dot?.classList.add('droptarget');
    this.hoveredDot_ = dot;
  }

  private reset_() {
    this.tabId_ = '';
    this.dragging_ = false;
    this.dormant_ = false;
    this.crossesDivider_ = false;
  }

  private element_(): TabElement|null {
    return this.tabId_ ? this.host_.getTabElementForDrag(this.tabId_) : null;
  }
}
