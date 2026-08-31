const MIN_WIDTH = 160;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 208;
const STORAGE_KEY = 'rail.sidebarWidth';
const COLLAPSED_KEY = 'rail.sidebarCollapsed';
const COLLAPSED_ATTRIBUTE = 'sidebar-collapsed';
const WIDTH_PROPERTY = '--rail-sidebar-width';
const SLIDE_MS = 180;
const SLIDE_EASING = 'cubic-bezier(.2, 0, 0, 1)';

function slidingElements(host: HTMLElement): HTMLElement[] {
  const root = host.shadowRoot;
  const region = root?.getElementById('contentRegion');
  const titlebar = root?.querySelector('.titlebarDiv');
  return [
    ...(region ? [region] : []),
    ...(titlebar ? Array.from(titlebar.children) as HTMLElement[] : []),
  ];
}

export function toggleSidebarCollapsed(host: HTMLElement) {
  const sliding = slidingElements(host);
  const before = sliding.map(element => element.getBoundingClientRect().left);

  const collapsed = !host.hasAttribute(COLLAPSED_ATTRIBUTE);
  host.toggleAttribute(COLLAPSED_ATTRIBUTE, collapsed);
  localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');

  sliding.forEach((element, index) => {
    const shift = before[index]! - element.getBoundingClientRect().left;
    if (shift) {
      element.animate(
          [{transform: `translateX(${shift}px)`}, {transform: 'none'}],
          {duration: SLIDE_MS, easing: SLIDE_EASING});
    }
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
