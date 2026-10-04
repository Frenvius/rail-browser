import {browserProxyFactory} from '../browser.mojom-webui.js';

const MIN_WIDTH = 160;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 208;
const STORAGE_KEY = 'rail.sidebarWidth';
const COLLAPSED_KEY = 'rail.sidebarCollapsed';
const COLLAPSED_ATTRIBUTE = 'sidebar-collapsed';
const ICONS_ONLY_KEY = 'rail.sidebarIconsOnly';
const ICONS_ONLY_ATTRIBUTE = 'sidebar-icons-only';
const WIDTH_PROPERTY = '--rail-sidebar-width';
const SLIDE_MS = 180;
const SLIDE_EASING = 'cubic-bezier(.2, 0, 0, 1)';

function slidingElements(host: HTMLElement): HTMLElement[] {
  const titlebar = host.shadowRoot?.querySelector('.titlebarDiv');
  return titlebar ? Array.from(titlebar.children) as HTMLElement[] : [];
}

let settleRegionSlide: (() => void)|null = null;

function clipLeft(inset: number, radius: string): Keyframe {
  return {clipPath: `inset(0 0 0 ${inset}px round ${radius})`};
}

function slideRegionEdge(region: HTMLElement, beforeLeft: number) {
  const shift = region.getBoundingClientRect().left - beforeLeft;
  if (!shift || !region.offsetWidth) {
    return;
  }
  region.style.zIndex = '1';
  if (shift > 0) {
    region.style.marginLeft = `${-shift}px`;
  }
  const from = Math.max(0, -shift);
  const to = Math.max(0, shift);
  const radius = getComputedStyle(region).borderRadius;
  const slide = region.animate(
      [clipLeft(from, radius), clipLeft(to, radius)],
      {duration: SLIDE_MS, easing: SLIDE_EASING});
  const settle = () => {
    slide.cancel();
    region.style.marginLeft = '';
    region.style.zIndex = '';
    settleRegionSlide = null;
  };
  slide.onfinish = settle;
  settleRegionSlide = settle;
}

export function toggleSidebarCollapsed(host: HTMLElement) {
  settleRegionSlide?.();
  const region = host.shadowRoot?.getElementById('contentRegion');
  const regionLeft = region?.getBoundingClientRect().left ?? 0;
  const sliding = slidingElements(host);
  const before = sliding.map(element => element.getBoundingClientRect().left);

  const collapsed = !host.hasAttribute(COLLAPSED_ATTRIBUTE);
  host.toggleAttribute(COLLAPSED_ATTRIBUTE, collapsed);
  localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');

  if (region) {
    slideRegionEdge(region, regionLeft);
  }
  sliding.forEach((element, index) => {
    const shift = before[index]! - element.getBoundingClientRect().left;
    if (shift) {
      element.animate(
          [{transform: `translateX(${shift}px)`}, {transform: 'none'}],
          {duration: SLIDE_MS, easing: SLIDE_EASING});
    }
  });
}

function applyIconsOnly(host: HTMLElement, iconsOnly: boolean) {
  host.toggleAttribute(ICONS_ONLY_ATTRIBUTE, iconsOnly);
  localStorage.setItem(ICONS_ONLY_KEY, iconsOnly ? '1' : '0');
}

function initIconsOnly(host: HTMLElement) {
  host.toggleAttribute(
      ICONS_ONLY_ATTRIBUTE, localStorage.getItem(ICONS_ONLY_KEY) === '1');
  const proxy = browserProxyFactory.getInstance();
  proxy.callbackRouter.onSidebarIconsOnlyChanged.addListener(
      (iconsOnly: boolean) => applyIconsOnly(host, iconsOnly));
  proxy.handler.getSidebarIconsOnly().then(
      ({iconsOnly}) => applyIconsOnly(host, iconsOnly));
}

function clampWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return DEFAULT_WIDTH;
  }
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
}

function applyWidth(host: HTMLElement, width: number) {
  host.style.setProperty(WIDTH_PROPERTY, `${width}px`);
}

export function initSidebarResize(host: HTMLElement) {
  const handle = host.shadowRoot?.getElementById('sidebarResizer');
  if (!handle) {
    return;
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) {
    applyWidth(host, clampWidth(Number(stored)));
  }

  host.toggleAttribute(
      COLLAPSED_ATTRIBUTE, localStorage.getItem(COLLAPSED_KEY) === '1');
  initIconsOnly(host);
  requestAnimationFrame(() => host.setAttribute('sidebar-animate', ''));

  let width = 0;

  const setHover = (hovered: boolean) => {
    host.toggleAttribute('sidebar-resizer-hover', hovered);
  };

  handle.addEventListener('pointerenter', () => setHover(true));
  handle.addEventListener('pointerleave', () => setHover(false));
  window.addEventListener('blur', () => setHover(false));
  host.addEventListener('pointermove', (e: Event) => {
    if (e.composedPath()[0] !== handle) {
      setHover(false);
    }
  });

  const onPointerMove = (e: PointerEvent) => {
    width = clampWidth(e.clientX - host.getBoundingClientRect().left);
    applyWidth(host, width);
  };

  const onPointerUp = (e: PointerEvent) => {
    handle.removeEventListener('pointermove', onPointerMove);
    handle.releasePointerCapture(e.pointerId);
    host.removeAttribute('sidebar-resizing');
    setHover(false);
    if (width) {
      localStorage.setItem(STORAGE_KEY, String(width));
    }
  };

  handle.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    width = 0;
    handle.setPointerCapture(e.pointerId);
    host.setAttribute('sidebar-resizing', '');
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp, {once: true});
    handle.addEventListener('pointercancel', onPointerUp, {once: true});
  });

  handle.addEventListener('dblclick', () => {
    applyWidth(host, DEFAULT_WIDTH);
    localStorage.setItem(STORAGE_KEY, String(DEFAULT_WIDTH));
  });
}
