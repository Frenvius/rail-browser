import type {Space} from './spaces.js';

const OUT_MS = 110;
const IN_MS = 190;
const OUT_EASING = 'cubic-bezier(0.4, 0, 1, 1)';
const IN_EASING = 'cubic-bezier(0, 0, 0.2, 1)';
const FALLBACK_WIDTH = 208;
const PANE = ['#spaceTitle', '#scrollArea'];

function panes(root: ShadowRoot): HTMLElement[] {
  return PANE.map(selector => root.querySelector<HTMLElement>(selector))
      .filter(pane => pane !== null);
}

function travel(root: ShadowRoot): number {
  return root.host.getBoundingClientRect().width || FALLBACK_WIDTH;
}

export function slideDirection(
    spaces: Space[], from: string, to: string): number {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 0;
  }
  const ids = spaces.map(space => space.id);
  return Math.sign(ids.indexOf(to) - ids.indexOf(from));
}

export async function slideOut(root: ShadowRoot, direction: number) {
  const distance = -direction * travel(root);
  await Promise.all(panes(root).map(
      pane => pane
                  .animate(
                      [
                        {transform: 'none', opacity: '1'},
                        {
                          transform: `translateX(${distance}px)`,
                          opacity: '0',
                        },
                      ],
                      {duration: OUT_MS, easing: OUT_EASING, fill: 'forwards'})
                  .finished));
}

export function slideIn(root: ShadowRoot, direction: number) {
  const distance = direction * travel(root);
  for (const pane of panes(root)) {
    for (const animation of pane.getAnimations()) {
      animation.cancel();
    }
    pane.animate(
        [
          {transform: `translateX(${distance}px)`, opacity: '0'},
          {transform: 'none', opacity: '1'},
        ],
        {duration: IN_MS, easing: IN_EASING});
  }
}
