const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 360;
const STORAGE_KEY = 'rail.sidePanelWidth';
const WIDTH_PROPERTY = '--rail-side-panel-width';

function clampWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return DEFAULT_WIDTH;
  }
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
}

function applyWidth(host: HTMLElement, width: number) {
  host.style.setProperty(WIDTH_PROPERTY, `${width}px`);
}

export function initSidePanelResize(host: HTMLElement) {
  const handle = host.shadowRoot?.getElementById('sidePanelResizer');
  const panel = host.shadowRoot?.getElementById('sidePanel');
  if (!handle || !panel) {
    return;
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) {
    applyWidth(host, clampWidth(Number(stored)));
  }

  let width = 0;

  const onPointerMove = (e: PointerEvent) => {
    width = clampWidth(panel.getBoundingClientRect().right - e.clientX);
    applyWidth(host, width);
  };

  const onCaptureLost = () => {
    handle.removeEventListener('pointermove', onPointerMove);
    host.removeAttribute('side-panel-resizing');
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
    host.setAttribute('side-panel-resizing', '');
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('lostpointercapture', onCaptureLost, {once: true});
  });

  handle.addEventListener('dblclick', () => {
    applyWidth(host, DEFAULT_WIDTH);
    localStorage.setItem(STORAGE_KEY, String(DEFAULT_WIDTH));
  });
}
