import {html, nothing} from '//resources/lit/v3_0/lit.rollup.js';

import {INCOGNITO} from './sidebar_state.js';

export function favoritesHint(hint: {dismissed: boolean, dismiss: () => void}) {
  if (INCOGNITO) {
    return nothing;
  }
  return html`
    <div id="favoritesHint" ?data-dismissed="${hint.dismissed}">
      <cr-icon icon="cr:star-filled" aria-hidden="true"></cr-icon>
      <strong>Drag to add Favorites</strong>
      <span>Favorites keep your most used sites and apps close</span>
      ${hint.dismissed ? nothing : html`
        <cr-icon-button iron-icon="cr:close" aria-label="Dismiss Favorites hint"
            @click="${hint.dismiss}"></cr-icon-button>`}
    </div>`;
}

export function containsPoint(rect: DOMRect, x: number, y: number): boolean {
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

interface TileSlot {
  rect: DOMRect;
  gap: boolean;
}

export function favoriteSlot(slots: TileSlot[], x: number, y: number, rtl: boolean): number {
  let index = 0;
  for (const {rect, gap} of slots) {
    if (y < rect.top || (y < rect.bottom &&
        (gap && containsPoint(rect, x, y) ||
         (rtl ? x > rect.left + rect.width / 2 : x < rect.left + rect.width / 2)))) {
      return index;
    }
    if (!gap) {
      index++;
    }
  }
  return index;
}

export class FavoriteDropPreview {
  private target_: HTMLElement|null = null;
  private gap_: HTMLElement|null = null;
  index = -1;

  hover(root: ShadowRoot, point: {x: number, y: number}, source: HTMLElement|null): boolean {
    const target = root.querySelector<HTMLElement>('#favoritesHint, #favoritesList:not([hidden])');
    if (!target || !containsPoint(target.getBoundingClientRect(), point.x, point.y)) {
      this.clear();
      return false;
    }
    if (target !== this.target_) {
      this.clear();
      this.target_ = target;
      target.classList.add('droptarget');
    }
    if (target.id === 'favoritesHint') {
      this.index = 0;
      return true;
    }
    const rtl = getComputedStyle(target).direction === 'rtl';
    const tiles = Array.from(target.querySelectorAll<HTMLElement>('webui-browser-tab'));
    const origin = source?.parentElement === target ? source : null;
    const items = tiles.filter(tile => tile !== origin);
    const slots = items.map(tile => ({rect: tile.getBoundingClientRect(), gap: false}));
    const gap = this.gap_ ?? origin;
    if (gap) {
      const at = this.index < 0 ? tiles.indexOf(gap) : this.index;
      slots.splice(at, 0, {rect: gap.getBoundingClientRect(), gap: true});
    }
    this.index = favoriteSlot(slots, point.x, point.y, rtl);
    if (!this.gap_) {
      this.gap_ = origin ?? document.createElement('div');
      this.gap_.classList.add('favorite-gap');
      if (!origin) {
        this.gap_.setAttribute('aria-hidden', 'true');
        this.gap_.style.height = `${slots[0]?.rect.height ?? 0}px`;
        target.appendChild(this.gap_);
      }
    }
    items.forEach((tile, i) => tile.style.order = String(i < this.index ? i : i + 1));
    this.gap_.style.order = String(this.index);
    return true;
  }

  clear() {
    this.target_?.classList.remove('droptarget');
    for (const tile of this.target_?.querySelectorAll<HTMLElement>('webui-browser-tab') ?? []) {
      tile.style.removeProperty('order');
      tile.classList.remove('favorite-gap');
    }
    if (this.gap_?.localName === 'div') {
      this.gap_.remove();
    }
    this.gap_ = null;
    this.target_ = null;
    this.index = -1;
  }
}
