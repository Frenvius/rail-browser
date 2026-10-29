import type {Container} from '/tab_strip_api/tab_strip_api_data_model.mojom-webui.js';
import type {Position} from '/tab_strip_api/tab_strip_api_types.mojom-webui.js';

import type {TabStripItem} from '../tab_strip/items.js';
import type {TabElement} from '../tab_strip/tab.js';
import type {TabDragHost} from '../tab_strip/tab_drag_host.js';

export function nativeTabMoves(root: Container, order: string[]):
    Array<{id: string, position: Position}> {
  const ranks = new Map(order.map((id, index) => [id, index]));
  const moves: Array<{id: string, position: Position}> = [];
  const visit = (node: Container, path: string[]) => {
    const data = node.data;
    const parent = data.window ?? data.tabStrip ?? data.pinnedTabs ??
        data.unpinnedTabs ?? data.tabGroup ?? data.splitTab;
    if (!parent) {
      return;
    }
    const components = [...path, parent.id];
    const children = node.children ?? [];
    if (!data.splitTab) {
      let offset = 0;
      let run: string[] = [];
      const flush = () => {
        const ordered = run.filter(id => ranks.has(id))
                            .sort((a, b) => ranks.get(a)! - ranks.get(b)!);
        let next = 0;
        const desired = run.map(id => ranks.has(id) ? ordered[next++]! : id);
        for (let index = 0; index < desired.length; index++) {
          const id = desired[index]!;
          const from = run.indexOf(id);
          if (from !== index) {
            moves.push(
                {id, position: {path: {components}, index: offset + index}});
            run.splice(from, 1);
            run.splice(index, 0, id);
          }
        }
        offset += run.length;
        run = [];
      };
      for (const child of children) {
        if (child.data.tab) {
          run.push(child.data.tab.id);
        } else {
          flush();
          offset += countTabs(child);
        }
      }
      flush();
    }
    for (const child of children) {
      visit(child, components);
    }
  };
  visit(root, []);
  return moves;
}

function countTabs(node: Container): number {
  if (node.data.tab) {
    return 1;
  }
  return (node.children ?? [])
      .reduce((sum, child) => sum + countTabs(child), 0);
}

export function mergeItemOrder(
    current: TabStripItem[], ordered: TabStripItem[]): TabStripItem[] {
  const keyOf = (item: TabStripItem) => `${item.type}:${item.id}`;
  const byKey = new Map(current.map(item => [keyOf(item), item]));
  const merged = ordered.map(item => byKey.get(keyOf(item)))
                     .filter((item): item is TabStripItem => !!item);
  const placed = new Set(merged);
  return [...merged, ...current.filter(item => !placed.has(item))];
}

export interface DragHandOff {
  tabId: string;
  row: DOMRect;
  grabX: number;
  grabY: number;
  detachable: boolean;
}

export type DragSlotKind = 'tab'|'header'|'group';

export interface DragSlot {
  id: string;
  kind: DragSlotKind;
  group: string;
  parent?: string;
}

export interface PinnedDragRows {
  tabId: string;
  rowIds: string[];
}

export interface RailDragHost extends Omit<
    TabDragHost, 'tabDragService'|'commitDrag'|'getDragContainerBounds'> {
  pinnedItemsForDrag: TabStripItem[];
  setPinnedItemsForDrag(items: TabStripItem[]): void;
  dragSlots(pinned: boolean, groupDrag: boolean, moving?: string): DragSlot[];
  canSetFolder(id: string, parent: string): boolean;
  folderParent(id: string): string;
  applyDragSlots(slots: DragSlot[], pinned: boolean): void;
  dragElementFor(slot: DragSlot): HTMLElement|null;
  moveTabToSpace(tabId: string, spaceId: string): void;
  setTabPinned(tabId: string, pinned: boolean): PinnedDragRows;
  captureDragState(): () => void;
  setTabFolder(tabId: string, folderId: string): void;
  handOffDrag(drag: DragHandOff): void;
  syncTabOrder(): void;
}

const DRAG_THRESHOLD = 4;
const DOT_REACH = 14;
const SCROLL_EDGE = 28;
const SCROLL_STEP = 10;
const SCROLL_INTERVAL_MS = 16;

export class TabDrag {
  private host_: RailDragHost;
  private tabId_ = '';
  private startX_ = 0;
  private startY_ = 0;
  private offsetX_ = 0;
  private offsetY_ = 0;
  private height_ = 0;
  private lastY_ = 0;
  private lastX_ = 0;
  private layoutFrame_ = 0;
  private pinned_ = false;
  private dormant_ = false;
  private isGroup_ = false;
  private suppressClick_ = false;
  private dragging_ = false;
  private hoveredDot_: HTMLElement|null = null;
  private hoveredFolder_: HTMLElement|null = null;
  private crossesDivider_ = false;
  private originId_ = '';
  private revertCrossing_: (() => void)|null = null;
  private scrollTimer_ = 0;

  private onMove_ = (e: MouseEvent) => this.move_(e);
  private onUp_ = () => this.cancel_();

  constructor(host: RailDragHost) {
    this.host_ = host;
  }

  onMouseDown(e: MouseEvent) {
    if (e.button !== 0) {
      return;
    }
    const path = e.composedPath();
    const tab = path.find(
                    node => node instanceof Element &&
                        node.localName === 'webui-browser-tab') as TabElement |
        undefined;
    const header = path.find(
                       node => node instanceof Element &&
                           (node.classList.contains('tidygroup-row') ||
                            node.classList.contains('folder-row'))) as
        HTMLElement | undefined;
    const onAction = path.some(
        node => node instanceof Element &&
            (node.classList.contains('tidygroup-action') ||
             node.classList.contains('folder-name-input')));
    const element = tab ?? (onAction ? undefined : header);
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    this.isGroup_ = !tab;
    const folderId = tab ? '' : header!.dataset['folder'] ?? '';
    this.tabId_ =
        tab ? tab.tabData.id : folderId || header!.dataset['group'] || '';
    this.originId_ = this.tabId_;
    this.revertCrossing_ = null;
    this.pinned_ = tab ? tab.pinned : !!folderId;
    this.dormant_ = tab ? tab.dormant : false;
    this.startX_ = e.clientX;
    this.startY_ = e.clientY;
    this.lastY_ = e.clientY;
    this.lastX_ = e.clientX;
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
             'webui-browser-tab, .tidygroup, .folder')) {
      element.classList.remove('dragsource');
    }
    this.element_()?.classList.add('dragsource');
    cancelAnimationFrame(this.layoutFrame_);
    this.layoutFrame_ = requestAnimationFrame(() => {
      this.layoutFrame_ = 0;
      this.onDragMoved(this.lastX_, this.lastY_);
    });
  }

  onDragMoved(x: number, y: number) {
    if (!this.dragging_) {
      return;
    }
    this.lastY_ = y;
    this.lastX_ = x;
    this.hoverDot_(x, y);
    const crossed = this.hoverDivider_(y);
    this.hoverFolder_(x, y);
    if (!crossed && !this.hoveredFolder_) {
      this.reorder_();
    }
  }

  onDragEnded(inside: boolean) {
    if (!this.dragging_) {
      return;
    }
    const spaceId = this.hoveredDot_?.dataset['id'];
    const folderId = this.hoveredFolder_?.dataset['folder'];
    const tabId = this.tabId_;
    const revert = this.revertCrossing_;
    this.clearDragUi_();
    this.reset_();

    if (!inside) {
      revert?.();
    } else {
      if (spaceId) {
        this.host_.moveTabToSpace(tabId, spaceId);
      } else if (folderId) {
        this.host_.setTabFolder(tabId, folderId);
      }
    }
    this.host_.syncTabOrder();
    this.host_.requestUpdate();
  }

  private move_(e: MouseEvent) {
    if (this.dragging_ ||
        Math.hypot(e.clientX - this.startX_, e.clientY - this.startY_) <
            DRAG_THRESHOLD) {
      return;
    }
    e.preventDefault();
    this.dragging_ = true;
    this.scrollTimer_ =
        setInterval(() => this.edgeScroll_(), SCROLL_INTERVAL_MS);
    this.host_.setDragInProgressForDrag(true);
    this.host_.setTabStripNoDrag(true);
    this.suppressClick_ = this.isGroup_;
    if (!this.dormant_ && !this.isGroup_) {
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
      detachable: !this.dormant_ && !this.isGroup_,
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
    cancelAnimationFrame(this.layoutFrame_);
    this.layoutFrame_ = 0;
    clearInterval(this.scrollTimer_);
    this.scrollTimer_ = 0;
    this.hoveredDot_?.classList.remove('droptarget');
    this.hoveredDot_ = null;
    this.hoveredFolder_?.classList.remove('droptarget');
    this.hoveredFolder_ = null;
    this.host_.shadowRoot?.querySelector('#pinnedDivider')?.classList.remove(
        'droptarget');
    this.element_()?.classList.remove('dragsource');
    this.host_.setTabStripNoDrag(false);
    this.host_.setDragInProgressForDrag(false);
  }

  private hoverFolder_(x: number, y: number) {
    let folder: HTMLElement|null = null;
    if (this.pinned_) {
      const rows = this.host_.shadowRoot?.querySelectorAll<HTMLElement>(
                       '.folder-row') ??
          [];
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right &&
            y >= rect.top + rect.height / 4 &&
            y <= rect.bottom - rect.height / 4 &&
            this.host_.canSetFolder(this.tabId_, row.dataset['folder'] ?? '')) {
          folder = row;
          break;
        }
      }
    }
    if (folder === this.hoveredFolder_) {
      return;
    }
    this.hoveredFolder_?.classList.remove('droptarget');
    folder?.classList.add('droptarget');
    this.hoveredFolder_ = folder;
  }

  private hoverDivider_(y: number): boolean {
    const divider =
        this.host_.shadowRoot?.querySelector<HTMLElement>('#pinnedDivider');
    if (!divider || this.isGroup_ || this.hoveredDot_) {
      return false;
    }
    const rect = divider.getBoundingClientRect();
    const above = y < rect.top + rect.height / 2;
    this.crossesDivider_ = above !== this.pinned_;
    divider.classList.toggle('droptarget', this.crossesDivider_);
    if (!this.crossesDivider_) {
      return false;
    }
    const slots = this.host_.dragSlots(above, false)
                      .filter(slot => this.host_.dragElementFor(slot));
    let at = slots.findIndex(slot => {
      const element = this.host_.dragElementFor(slot);
      return element && y < this.midpoint_(element);
    });
    if (at < 0) {
      at = slots.length;
    }
    const group = slots[at - 1]?.group ?? '';
    let rowIds: string[];
    if (this.revertCrossing_) {
      this.revertCrossing_();
      this.revertCrossing_ = null;
      this.tabId_ = this.originId_;
      rowIds = [this.tabId_];
    } else {
      this.revertCrossing_ = this.host_.captureDragState();
      const moved = this.host_.setTabPinned(this.tabId_, above);
      this.tabId_ = moved.tabId;
      rowIds = moved.rowIds;
    }
    this.pinned_ = above;
    const listed = new Set(slots.map(slot => slot.id));
    slots.splice(
        at, 0,
        ...rowIds.filter(id => id === this.tabId_ || !listed.has(id))
            .map(id => ({id, kind: 'tab' as const, group})));
    this.host_.applyDragSlots(slots, above);
    return true;
  }

  private edgeScroll_() {
    const list =
        this.host_.shadowRoot?.querySelector<HTMLElement>('#scrollArea');
    if (!list) {
      return;
    }
    const rect = list.getBoundingClientRect();
    const up = this.lastY_ < rect.top + SCROLL_EDGE;
    const down = this.lastY_ > rect.bottom - SCROLL_EDGE;
    if (!up && !down) {
      return;
    }
    const before = list.scrollTop;
    list.scrollTop += up ? -SCROLL_STEP : SCROLL_STEP;
    if (list.scrollTop !== before) {
      this.reorder_();
    }
  }

  private reorder_() {
    const slots =
        this.host_.dragSlots(this.pinned_, this.isGroup_, this.tabId_)
            .filter(
                slot => slot.id === this.tabId_ ||
                    this.host_.dragElementFor(slot));
    const kind: DragSlotKind = this.isGroup_ ? 'group' : 'tab';
    const index =
        slots.findIndex(slot => slot.id === this.tabId_ && slot.kind === kind);
    if (index === -1) {
      return;
    }
    const top = this.lastY_ - this.offsetY_;
    const before = this.swapTarget_(slots[index - 1]);
    if (before && top < this.midpoint_(before)) {
      this.swap_(slots, index, index - 1);
      return;
    }
    const after = this.swapTarget_(slots[index + 1]);
    if (after && top + this.height_ > this.midpoint_(after)) {
      this.swap_(slots, index, index + 1);
      return;
    }
    if (this.regroup_(slots, index)) {
      this.host_.applyDragSlots(slots, this.pinned_);
    }
  }

  private regroup_(slots: DragSlot[], index: number): boolean {
    const slot = slots[index];
    if (!slot || (this.isGroup_ && !this.pinned_)) {
      return false;
    }
    const previous = slots[index - 1];
    let group = previous ? previous.group : '';
    if (this.pinned_) {
      while (group) {
        const header = this.host_.dragElementFor({id: group, kind: 'header', group});
        if (!header || this.lastX_ > header.getBoundingClientRect().left + 12) {
          break;
        }
        group = this.host_.folderParent(group);
      }
      if (this.isGroup_ && !this.host_.canSetFolder(slot.id, group)) {
        return false;
      }
    }
    if (group && index === slots.length - 1 && this.pulledPastEnd_(slot)) {
      group = '';
    }
    if (group === slot.group) {
      return false;
    }
    slot.group = group;
    return true;
  }

  private pulledPastEnd_(slot: DragSlot): boolean {
    const element = this.host_.dragElementFor(slot);
    if (!element) {
      return false;
    }
    return this.lastY_ >
        element.getBoundingClientRect().bottom + this.height_ / 2;
  }

  private swapTarget_(slot: DragSlot|undefined): HTMLElement|null {
    if (!slot) {
      return null;
    }
    const element = this.host_.dragElementFor(slot);
    if (!element) {
      return null;
    }
    return element;
  }

  private midpoint_(element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    return rect.top + rect.height / 2;
  }

  private swap_(slots: DragSlot[], from: number, to: number) {
    [slots[from], slots[to]] = [slots[to]!, slots[from]!];
    this.regroup_(slots, to);
    this.host_.applyDragSlots(slots, this.pinned_);
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
    this.isGroup_ = false;
    this.crossesDivider_ = false;
    this.originId_ = '';
    this.revertCrossing_ = null;
  }

  consumeSuppressedClick(): boolean {
    const suppressed = this.suppressClick_;
    this.suppressClick_ = false;
    return suppressed;
  }

  private element_(): HTMLElement|null {
    return this.tabId_ ? this.host_.dragElementFor({
      id: this.tabId_,
      kind: this.isGroup_ ? 'group' : 'tab',
      group: '',
    }) :
                         null;
  }
}
