const MIN_WIDTH = 160;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 208;
const STORAGE_KEY = 'rail.sidebarWidth';
const WIDTH_PROPERTY = '--rail-sidebar-width';

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
