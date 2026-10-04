import type {NodeId} from '/tab_strip_api/tab_strip_api_types.mojom-webui.js';

import {browserProxyFactory} from '../browser.mojom-webui.js';
import type {TabActivated, TabClosed} from '../tab_strip/events.js';

const THEMED_KEY = 'rail.titlebarThemed';
const THEMED_ATTRIBUTE = 'titlebar-themed';
const LIGHT_ATTRIBUTE = 'page-color-light';
const DARK_ATTRIBUTE = 'page-color-dark';
const FADE_ATTRIBUTE = 'page-color-fade';
const COLOR_PROPERTY = '--rail-page-color';
const FROM_PROPERTY = '--rail-page-color-from';
const DARK_TEXT_LUMINANCE = 0.55;

interface PageColor {
  css: string;
  light: boolean;
}

function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 :
                              ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) +
      0.0722 * linearChannel(b);
}

function toPageColor(hasColor: boolean, color: number): PageColor|null {
  if (!hasColor) {
    return null;
  }
  const r = (color >>> 16) & 0xff;
  const g = (color >>> 8) & 0xff;
  const b = color & 0xff;
  return {
    css: `rgb(${r} ${g} ${b})`,
    light: relativeLuminance(r, g, b) > DARK_TEXT_LUMINANCE,
  };
}

class PageColorController {
  private readonly colors_ = new Map<NodeId, PageColor|null>();
  private activeTab_: NodeId = '';
  private shown_: PageColor|null|undefined = undefined;
  private empty_ = false;
  private fadeFlip_ = false;

  constructor(private readonly host_: HTMLElement) {}

  setEmpty(empty: boolean) {
    this.empty_ = empty;
    this.show_(this.colors_.get(this.activeTab_) ?? null);
  }

  onColorChanged(tab: NodeId, color: PageColor|null) {
    this.colors_.set(tab, color);
    if (!this.activeTab_ || tab === this.activeTab_) {
      this.show_(color);
    }
  }

  onTabActivated(tab: NodeId) {
    this.activeTab_ = tab;
    if (this.colors_.has(tab)) {
      this.show_(this.colors_.get(tab)!);
    }
  }

  onTabClosed(tab: NodeId) {
    this.colors_.delete(tab);
  }

  private show_(next: PageColor|null) {
    const color = this.empty_ ? null : next;
    const previous = this.shown_;
    if (previous !== undefined && previous?.css === color?.css) {
      return;
    }
    this.shown_ = color;
    this.host_.style.setProperty(FROM_PROPERTY, previous?.css ?? 'transparent');
    if (color) {
      this.host_.style.setProperty(COLOR_PROPERTY, color.css);
    } else {
      this.host_.style.removeProperty(COLOR_PROPERTY);
    }
    this.host_.toggleAttribute(LIGHT_ATTRIBUTE, !!color?.light);
    this.host_.toggleAttribute(DARK_ATTRIBUTE, !!color && !color.light);
    if (previous === undefined ||
        matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    this.fadeFlip_ = !this.fadeFlip_;
    this.host_.setAttribute(
        FADE_ATTRIBUTE,
        `${previous ? 'out' : 'in'}-${this.fadeFlip_ ? 'a' : 'b'}`);
  }
}

function applyThemed(host: HTMLElement, themed: boolean) {
  host.toggleAttribute(THEMED_ATTRIBUTE, themed);
  localStorage.setItem(THEMED_KEY, themed ? '1' : '0');
}

export function initPageColor(host: HTMLElement) {
  host.toggleAttribute(
      THEMED_ATTRIBUTE, localStorage.getItem(THEMED_KEY) !== '0');
  const controller = new PageColorController(host);
  const tabstrip = host.shadowRoot?.getElementById('tabstrip');
  tabstrip?.addEventListener(
      'tab-activated',
      e => controller.onTabActivated((e as CustomEvent<TabActivated>).detail.id));
  tabstrip?.addEventListener(
      'tab-closed',
      e => controller.onTabClosed((e as CustomEvent<TabClosed>).detail));
  const emptyState = host.shadowRoot?.getElementById('emptyState');
  if (emptyState) {
    controller.setEmpty(!emptyState.hidden);
    new MutationObserver(() => controller.setEmpty(!emptyState.hidden))
        .observe(emptyState, {attributes: true, attributeFilter: ['hidden']});
  }
  const proxy = browserProxyFactory.getInstance();
  proxy.callbackRouter.onThemedTitlebarChanged.addListener(
      (themed: boolean) => applyThemed(host, themed));
  proxy.callbackRouter.onPageColorChanged.addListener(
      (tab: NodeId, hasColor: boolean, color: number) =>
          controller.onColorChanged(tab, toPageColor(hasColor, color)));
  proxy.handler.getThemedTitlebar().then(
      ({themed}) => applyThemed(host, themed));
}
