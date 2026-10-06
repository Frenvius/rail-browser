import type {NodeId} from '/tab_strip_api/tab_strip_api_types.mojom-webui.js';

import {browserProxyFactory} from '../browser.mojom-webui.js';
import type {TabAdded, TabClosed, TabUpdated} from '../tab_strip/events.js';

const THEMED_KEY = 'rail.titlebarThemed';
const THEMED_ATTRIBUTE = 'titlebar-themed';
const LIGHT_ATTRIBUTE = 'page-color-light';
const DARK_ATTRIBUTE = 'page-color-dark';
const ANIMATED_ATTRIBUTE = 'page-color-animated';
const COLOR_PROPERTY = '--rail-page-color';
const PALETTE_PROPERTIES = [
  'background', 'background-hovered', 'border', 'border-hovered',
  'foreground-primary', 'foreground-secondary', 'separator',
  'capsule-background', 'capsule-background-hovered', 'capsule-foreground',
  'capsule-background-pressed',
];

interface PageColor {
  css: string;
  light: boolean;
  palette: number[];
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

function prefersDarkInk(color: number, bias = 0): boolean {
  const luminance = relativeLuminance(
      (color >>> 8) & 0xff, (color >>> 16) & 0xff, color >>> 24) + 0.05;
  return luminance / 0.05 > 1.05 / luminance + bias;
}

function rgba(r: number, g: number, b: number, a = 255): number {
  return ((b << 24) | (g << 16) | (r << 8) | a) >>> 0;
}

function withAlpha(color: number, alpha: number): number {
  return ((color & 0xffffff00) | Math.trunc(alpha * 255)) >>> 0;
}

function shiftLightness(color: number, delta: number): number {
  const r = ((color >>> 8) & 0xff) / 255;
  const g = ((color >>> 16) & 0xff) / 255;
  const b = (color >>> 24) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const difference = max - min;
  const saturation = difference === 0 ? 0 :
      difference / (lightness <= 0.5 ? max + min : 2 - max - min);
  let hue = 0;
  if (difference) {
    hue = max === r ? (g - b) / difference :
        max === g ? (b - r) / difference + 2 : (r - g) / difference + 4;
    hue = ((hue / 6) % 1 + 1) % 1;
  }
  const next = Math.max(0, Math.min(1, lightness + delta));
  const high = next <= 0.5 ? next * (1 + saturation) :
                           next + saturation - next * saturation;
  const low = 2 * next - high;
  const channel = (offset: number) => {
    const t = ((hue + offset) % 1 + 1) % 1;
    const value = t < 1 / 6 ? low + (high - low) * 6 * t :
        t < 0.5 ? high : t < 2 / 3 ? low + (high - low) * (2 / 3 - t) * 6 : low;
    return Math.round(value * 255);
  };
  return rgba(channel(1 / 3), channel(0), channel(-1 / 3), color & 0xff);
}

function overlayColor(background: number, overlay: number): number {
  const alpha = (overlay & 0xff) / 255;
  const channel = (shift: number) => Math.round(
      ((background >>> shift) & 0xff) * (1 - alpha) +
      ((overlay >>> shift) & 0xff) * alpha);
  return rgba(channel(8), channel(16), channel(24));
}

function navigationPalette(color: number, light: boolean): number[] {
  const ink = light ? 0xff : 0xffffffff;
  const channels = [(color >>> 8) & 0xff, (color >>> 16) & 0xff, color >>> 24];
  const lightness = (Math.max(...channels) + Math.min(...channels)) / 510;
  if (lightness < 0.05 || lightness > 0.97) {
    return [color, 0xffffff0f, 0x1a, 0xffffff00,
      withAlpha(ink, 0.8), ((ink & 0xffffff00) | 0x4d) >>> 0,
      light ? 0xd : 0xffffff1a, 0xffffff00, 0xffffff0f, 0xffffffff,
      0xffffff0a];
  }
  let hovered = overlayColor(color, withAlpha(ink, 0.08));
  if (prefersDarkInk(hovered) !== prefersDarkInk(color)) {
    hovered = shiftLightness(color, light ? 0.08 : -0.08);
  }
  const foreground = shiftLightness(color, light ? -0.75 : 0.75);
  return [color, hovered, withAlpha(ink, 0.15), 0xffffff00,
    withAlpha(foreground, 0.7), withAlpha(foreground, 0.25),
    withAlpha(shiftLightness(color, light ? -0.1 : 0.1), 0.3),
    color, hovered, ink, overlayColor(color, withAlpha(hovered, 0.5))];
}

function paletteCss(color: number): string {
  return `rgb(${(color >>> 8) & 0xff} ${(color >>> 16) & 0xff} ${color >>> 24} / ${(color & 0xff) / 255})`;
}

function toPageColor(hasColor: boolean, color: number): PageColor|null {
  if (!hasColor) {
    return null;
  }
  const r = (color >>> 16) & 0xff;
  const g = (color >>> 8) & 0xff;
  const b = color & 0xff;
  const packed = rgba(r, g, b);
  const light = prefersDarkInk(packed, 10.5);
  return {
    css: `rgb(${r} ${g} ${b})`,
    light,
    palette: navigationPalette(packed, light),
  };
}

class PageColorController {
  private readonly colors_ = new Map<NodeId, PageColor|null>();
  private activeTab_: NodeId = '';
  private shown_: PageColor|null|undefined = undefined;
  private empty_ = false;

  constructor(private readonly host_: HTMLElement) {}

  setEmpty(empty: boolean) {
    this.empty_ = empty;
    this.show_(this.colors_.get(this.activeTab_) ?? null);
  }

  onColorChanged(tab: NodeId, color: PageColor|null, animated: boolean|null) {
    this.colors_.set(tab, color);
    if (!this.activeTab_ || tab === this.activeTab_) {
      this.show_(color, animated ?? undefined);
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

  private show_(next: PageColor|null, animated?: boolean) {
    const color = this.empty_ ? null : next;
    const previous = this.shown_;
    const unchanged = previous !== undefined && previous?.css === color?.css;
    if (unchanged && animated === undefined) {
      return;
    }
    this.shown_ = color;
    this.host_.toggleAttribute(
        ANIMATED_ATTRIBUTE,
        !!animated && !!color && previous !== undefined &&
            !matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (unchanged) {
      return;
    }
    if (color) {
      this.host_.style.setProperty(COLOR_PROPERTY, color.css);
    } else {
      this.host_.style.removeProperty(COLOR_PROPERTY);
    }
    PALETTE_PROPERTIES.forEach((property, i) => {
      const name = `--rail-page-${property}`;
      if (color) {
        this.host_.style.setProperty(name, paletteCss(color.palette[i]!));
      } else {
        this.host_.style.removeProperty(name);
      }
    });
    this.host_.toggleAttribute(LIGHT_ATTRIBUTE, !!color?.light);
    this.host_.toggleAttribute(DARK_ATTRIBUTE, !!color && !color.light);
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
  for (const type of ['tab-activated', 'tab-added', 'tab-updated']) {
    tabstrip?.addEventListener(type, e => {
      const {id, isActive} = (e as CustomEvent<TabAdded|TabUpdated>).detail;
      if (isActive) {
        controller.onTabActivated(id);
      }
    });
  }
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
      (tab: NodeId, hasColor: boolean, color: number, animated: boolean|null) =>
          controller.onColorChanged(tab, toPageColor(hasColor, color), animated));
  proxy.handler.getThemedTitlebar().then(
      ({themed}) => applyThemed(host, themed));
}
