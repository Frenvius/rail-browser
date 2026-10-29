import {browserProxyFactory} from '../browser.mojom-webui.js';

import {isNativeMenuOpen} from './native_menu.js';

const MIN_WIDTH = 160;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 208;
const STORAGE_KEY = 'rail.sidebarWidth';
const COLLAPSED_KEY = 'rail.sidebarCollapsed';
const COLLAPSED_ATTRIBUTE = 'sidebar-collapsed';
const ICONS_ONLY_KEY = 'rail.sidebarIconsOnly';
const ICONS_ONLY_ATTRIBUTE = 'sidebar-icons-only';
const EXPAND_ON_HOVER_ATTRIBUTE = 'sidebar-expand-on-hover';
const WIDTH_PROPERTY = '--rail-sidebar-width';
const SLIDE_MS = 180;
const SLIDE_EASING = 'cubic-bezier(.2, 0, 0, 1)';
const LIBRARY_ATTRIBUTE = 'library-open';
const LIBRARY_WIDE_ATTRIBUTE = 'library-wide';
const LIBRARY_PAGE_PEEK = 64;
const PEEK_ATTRIBUTE = 'sidebar-peek';
const PEEK_CLOSING_ATTRIBUTE = 'sidebar-peek-closing';
const PEEK_EDGE = 12;
const PEEK_CLOSE_DELAY_MS = 240;
const ICONS_PEEK_OPEN_DELAY_MS = 300;
const PEEK_CLOSING_FALLBACK_MS = 600;
const PEEK_OUTSIDE_MARGIN = 64;
const PEEK_OUTSIDE_POLL_MS = 50;

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
  slideSidebar(host, () => {
    const collapsed = !host.hasAttribute(COLLAPSED_ATTRIBUTE);
    clearPeek(host);
    host.toggleAttribute(COLLAPSED_ATTRIBUTE, collapsed);
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  });
}

let libraryRestore: {width: string, collapsed: boolean}|null = null;
let libraryWidth = 0;

function applyLibraryWidth(host: HTMLElement) {
  applyWidth(
      host,
      Math.max(
          MIN_WIDTH,
          Math.min(libraryWidth, window.innerWidth - LIBRARY_PAGE_PEEK)));
}

export function setLibraryOpen(
    host: HTMLElement, open: boolean, width: number) {
  const wasOpen = host.hasAttribute(LIBRARY_ATTRIBUTE);
  if (wasOpen === open && (!open || width === libraryWidth)) {
    return;
  }
  libraryWidth = open ? width : 0;
  slideSidebar(host, () => {
    host.toggleAttribute(LIBRARY_ATTRIBUTE, open);
    host.toggleAttribute(LIBRARY_WIDE_ATTRIBUTE, open && width > MAX_WIDTH);
    if (open) {
      if (!wasOpen) {
        libraryRestore = {
          width: host.style.getPropertyValue(WIDTH_PROPERTY),
          collapsed: host.hasAttribute(COLLAPSED_ATTRIBUTE),
        };
        clearPeek(host);
        host.removeAttribute(COLLAPSED_ATTRIBUTE);
      }
      applyLibraryWidth(host);
      return;
    }
    if (libraryRestore?.width) {
      host.style.setProperty(WIDTH_PROPERTY, libraryRestore.width);
    } else {
      host.style.removeProperty(WIDTH_PROPERTY);
    }
    host.toggleAttribute(COLLAPSED_ATTRIBUTE, !!libraryRestore?.collapsed);
    libraryRestore = null;
  });
}

function slideSidebar(host: HTMLElement, change: () => void) {
  settleRegionSlide?.();
  const region = host.shadowRoot?.getElementById('contentRegion');
  const regionLeft = region?.getBoundingClientRect().left ?? 0;
  const sliding = slidingElements(host);
  const before = sliding.map(element => element.getBoundingClientRect().left);

  change();

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

function applyIconsOnly(
    host: HTMLElement, iconsOnly: boolean, expandOnHover: boolean) {
  if (host.hasAttribute(ICONS_ONLY_ATTRIBUTE) !== iconsOnly) {
    clearPeek(host);
  }
  host.toggleAttribute(ICONS_ONLY_ATTRIBUTE, iconsOnly);
  host.toggleAttribute(EXPAND_ON_HOVER_ATTRIBUTE, expandOnHover);
  localStorage.setItem(ICONS_ONLY_KEY, iconsOnly ? '1' : '0');
}

function initIconsOnly(host: HTMLElement) {
  host.toggleAttribute(
      ICONS_ONLY_ATTRIBUTE, localStorage.getItem(ICONS_ONLY_KEY) === '1');
  const proxy = browserProxyFactory.getInstance();
  proxy.callbackRouter.onSidebarIconsOnlyChanged.addListener(
      (iconsOnly: boolean, expandOnHover: boolean) =>
          applyIconsOnly(host, iconsOnly, expandOnHover));
  proxy.handler.getSidebarIconsOnly().then(
      ({iconsOnly, expandOnHover}) =>
          applyIconsOnly(host, iconsOnly, expandOnHover));
}

let peekClosingTimer = 0;

function clearPeek(host: HTMLElement) {
  clearTimeout(peekClosingTimer);
  host.removeAttribute(PEEK_ATTRIBUTE);
  host.removeAttribute(PEEK_CLOSING_ATTRIBUTE);
}

function setPeek(host: HTMLElement, peek: boolean) {
  clearTimeout(peekClosingTimer);
  if (peek) {
    host.removeAttribute(PEEK_CLOSING_ATTRIBUTE);
    host.setAttribute(PEEK_ATTRIBUTE, '');
    return;
  }
  if (!host.hasAttribute(PEEK_ATTRIBUTE)) {
    return;
  }
  host.setAttribute(PEEK_CLOSING_ATTRIBUTE, '');
  host.removeAttribute(PEEK_ATTRIBUTE);
  peekClosingTimer = setTimeout(
      () => host.removeAttribute(PEEK_CLOSING_ATTRIBUTE),
      PEEK_CLOSING_FALLBACK_MS);
}

function finishPeekClosing(host: HTMLElement, e: TransitionEvent) {
  if (e.target !== e.currentTarget ||
      (e.propertyName !== 'transform' && e.propertyName !== 'width') ||
      !host.hasAttribute(PEEK_CLOSING_ATTRIBUTE)) {
    return;
  }
  clearTimeout(peekClosingTimer);
  host.removeAttribute(PEEK_CLOSING_ATTRIBUTE);
}

function canPeek(host: HTMLElement): boolean {
  return host.hasAttribute(COLLAPSED_ATTRIBUTE) &&
      (!host.hasAttribute(ICONS_ONLY_ATTRIBUTE) ||
       host.hasAttribute(EXPAND_ON_HOVER_ATTRIBUTE)) &&
      !host.hasAttribute(LIBRARY_ATTRIBUTE) && !host.hasAttribute('mini');
}

function initSidebarPeek(host: HTMLElement) {
  const main = host.shadowRoot?.getElementById('main');
  const sidebar = host.shadowRoot?.querySelector<HTMLElement>('.tabstripDiv');
  if (!main || !sidebar) {
    return;
  }

  let timer = 0;
  let pending: boolean|null = null;
  const cancel = () => {
    clearTimeout(timer);
    pending = null;
  };
  const schedule = (peek: boolean, delay: number) => {
    if (pending === peek) {
      return;
    }
    cancel();
    pending = peek;
    timer = setTimeout(() => {
      pending = null;
      setPeek(host, peek && canPeek(host));
    }, delay);
  };

  const atEdge = (e: PointerEvent) =>
      e.clientX - main.getBoundingClientRect().left <= PEEK_EDGE;
  const scheduleClose = () => {
    if (!isNativeMenuOpen()) {
      schedule(false, PEEK_CLOSE_DELAY_MS);
    }
  };

  const openPeek = () => {
    cancel();
    setPeek(host, true);
  };

  let outsidePoll = 0;
  const stopOutsidePoll = () => {
    clearInterval(outsidePoll);
    outsidePoll = 0;
  };
  const closeWhenPointerWandersOff = () => {
    stopOutsidePoll();
    const poll = setInterval(async () => {
      if (!host.hasAttribute(PEEK_ATTRIBUTE)) {
        stopOutsidePoll();
        return;
      }
      const {distance} = await browserProxyFactory.getInstance()
                             .handler.getPointerDistanceOutsideWindow();
      if (poll === outsidePoll &&
          (distance < 0 || distance > PEEK_OUTSIDE_MARGIN)) {
        stopOutsidePoll();
        scheduleClose();
      }
    }, PEEK_OUTSIDE_POLL_MS);
    outsidePoll = poll;
  };

  const onPointer = (e: PointerEvent) => {
    stopOutsidePoll();
    if (!canPeek(host)) {
      return;
    }
    const path = e.composedPath();
    const overEdge = path[0] === main && atEdge(e);
    if (!host.hasAttribute(PEEK_ATTRIBUTE)) {
      if (!host.hasAttribute(ICONS_ONLY_ATTRIBUTE)) {
        if (overEdge) {
          openPeek();
        }
      } else if (path.includes(sidebar)) {
        schedule(true, ICONS_PEEK_OPEN_DELAY_MS);
      } else {
        cancel();
      }
      return;
    }
    if (overEdge || path.includes(sidebar)) {
      cancel();
    } else {
      scheduleClose();
    }
  };
  host.addEventListener('pointermove', onPointer);
  host.addEventListener('pointerover', onPointer);
  host.addEventListener('pointerleave', () => {
    cancel();
    if (host.hasAttribute(PEEK_ATTRIBUTE)) {
      closeWhenPointerWandersOff();
    }
  });
  sidebar.addEventListener(
      'transitionend', e => finishPeekClosing(host, e));
  sidebar.addEventListener(
      'transitioncancel', e => finishPeekClosing(host, e));
  const router = browserProxyFactory.getInstance().callbackRouter;
  router.onRailMenuClosed.addListener(() => {
    if (host.hasAttribute(PEEK_ATTRIBUTE) && !sidebar.matches(':hover')) {
      schedule(false, PEEK_CLOSE_DELAY_MS);
    }
  });
  router.onLeftEdgeHovered.addListener(() => {
    if (host.hasAttribute(PEEK_ATTRIBUTE) || !canPeek(host)) {
      return;
    }
    openPeek();
    closeWhenPointerWandersOff();
  });
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
  initSidebarPeek(host);
  requestAnimationFrame(() => host.setAttribute('sidebar-animate', ''));
  window.addEventListener('resize', () => {
    if (host.hasAttribute(LIBRARY_ATTRIBUTE)) {
      applyLibraryWidth(host);
    }
  });

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
