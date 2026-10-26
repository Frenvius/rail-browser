import {INCOGNITO} from './sidebar_state.js';
import type {SpaceBarElement} from './space_bar.js';
import type {Spaces} from './spaces.js';

const OUT_MS = 120;
const IN_MS = 260;
const OUT_EASING = 'cubic-bezier(0.3, 0, 0.8, 0.15)';
const IN_EASING = 'cubic-bezier(0.05, 0.7, 0.1, 1)';
const TRAVEL = 0.2;
const FALLBACK_WIDTH = 208;
const PANE = ['#spaceTitle', '#scrollArea'];
const COLOR_MS = 300;
const COLOR_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
const SPACE_COLORS = ['--rail-space-color', '--rail-space-tint'];
const SPACE_GRAIN = '--rail-space-grain';
const INK_ON_DARK: Readonly<Record<string, string>> = {
  '--rail-space-text': '#f2f2f2',
  '--rail-space-text-dim': '#b4b4b4',
  '--rail-space-text-label': '#8a8a8a',
  '--rail-space-text-muted': '#cfcfcf',
  '--rail-space-border': 'rgb(255 255 255 / 10%)',
  '--rail-space-elevated': 'rgb(255 255 255 / 6%)',
  '--rail-space-hover': 'rgb(255 255 255 / 10%)',
  '--rail-space-hover-strong': 'rgb(255 255 255 / 16%)',
};
const INK_ON_LIGHT: Readonly<Record<string, string>> = {
  '--rail-space-text': 'rgb(0 0 0 / 88%)',
  '--rail-space-text-dim': 'rgb(0 0 0 / 68%)',
  '--rail-space-text-label': 'rgb(0 0 0 / 54%)',
  '--rail-space-text-muted': 'rgb(0 0 0 / 76%)',
  '--rail-space-border': 'rgb(0 0 0 / 12%)',
  '--rail-space-elevated': 'rgb(0 0 0 / 5%)',
  '--rail-space-hover': 'rgb(0 0 0 / 8%)',
  '--rail-space-hover-strong': 'rgb(0 0 0 / 13%)',
};

function panes(root: ShadowRoot): HTMLElement[] {
  return PANE.map(selector => root.querySelector<HTMLElement>(selector))
      .filter(pane => pane !== null);
}

function travel(root: ShadowRoot): number {
  return TRAVEL * (root.host.getBoundingClientRect().width || FALLBACK_WIDTH);
}

function motionAllowed(): boolean {
  return !document.hidden &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function slideOut(root: ShadowRoot, direction: number): Promise<void> {
  const distance = -direction * travel(root);
  const slid = panes(root).map(pane => {
    const current = getComputedStyle(pane);
    const from = {transform: current.transform, opacity: current.opacity};
    for (const animation of pane.getAnimations()) {
      animation.cancel();
    }
    return pane
        .animate(
            [from, {transform: `translateX(${distance}px)`, opacity: '0'}],
            {duration: OUT_MS, easing: OUT_EASING, fill: 'forwards'})
        .finished;
  });
  const stalled = new Promise(resolve => setTimeout(resolve, OUT_MS * 3));
  return Promise.race([Promise.all(slid), stalled]).then(() => {}, () => {});
}

function slideIn(root: ShadowRoot, direction: number) {
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

let colorsRegistered = false;

function registerSpaceProperties(style: CSSStyleDeclaration) {
  if (colorsRegistered) {
    return;
  }
  colorsRegistered = true;
  for (const name of SPACE_COLORS) {
    CSS.registerProperty(
        {name, syntax: '<color>', inherits: true, initialValue: '#7c5cfc'});
  }
  for (const [name, initialValue] of Object.entries(INK_ON_DARK)) {
    CSS.registerProperty({name, syntax: '<color>', inherits: true, initialValue});
  }
  CSS.registerProperty(
      {name: SPACE_GRAIN, syntax: '<number>', inherits: true, initialValue: '0'});
  const animated = [...SPACE_COLORS, ...Object.keys(INK_ON_DARK), SPACE_GRAIN];
  requestAnimationFrame(() => {
    style.transition = animated
                           .map(name => `${name} ${COLOR_MS}ms ${COLOR_EASING}`)
                           .join(', ');
  });
}

export function paintSpaceColors(color: string, tint: string, grain: number) {
  const style = document.documentElement.style;
  registerSpaceProperties(style);
  style.setProperty('--rail-space-color', color);
  style.setProperty('--rail-space-tint', tint);
  style.setProperty(SPACE_GRAIN, String(grain));
}

export function paintSpaceInk(lightBackdrop: boolean) {
  const style = document.documentElement.style;
  registerSpaceProperties(style);
  const ink = lightBackdrop ? INK_ON_LIGHT : INK_ON_DARK;
  for (const [name, value] of Object.entries(ink)) {
    style.setProperty(name, value);
  }
}

export class SpaceSlide {
  private gate_: Promise<void>|null = null;
  private origin_ = '';
  private exit_ = 0;
  private generation_ = 0;

  constructor(
      private readonly host_: HTMLElement&{updateComplete: Promise<boolean>},
      private readonly spaces_: Spaces) {}

  get gate(): Promise<void>|null {
    return this.gate_;
  }

  toSpace(id: string, apply: () => void) {
    const ids = this.spaces_.all.map(space => space.id);
    this.run_(
        Math.sign(ids.indexOf(id) - ids.indexOf(this.spaces_.activeId)), apply);
  }

  toNewSpace(apply: () => void) {
    this.run_(INCOGNITO ? 0 : 1, apply);
  }

  private async run_(direction: number, apply: () => void) {
    const root = this.host_.shadowRoot;
    if (!root || (!this.gate_ && (!direction || !motionAllowed()))) {
      apply();
      return;
    }
    const generation = ++this.generation_;
    if (!this.gate_) {
      this.origin_ = this.spaces_.activeId;
      this.exit_ = direction;
      this.gate_ = slideOut(root, direction);
    }
    apply();
    this.markActiveDot_(root);
    await this.gate_;
    if (generation !== this.generation_) {
      return;
    }
    this.gate_ = null;
    await this.host_.updateComplete;
    if (generation !== this.generation_) {
      return;
    }
    slideIn(root, this.entry_());
  }

  private entry_(): number {
    const ids = this.spaces_.all.map(space => space.id);
    const from = ids.indexOf(this.origin_);
    const to = ids.indexOf(this.spaces_.activeId);
    if (from === -1 || to === -1) {
      return this.exit_;
    }
    return Math.sign(to - from) || -this.exit_;
  }

  private markActiveDot_(root: ShadowRoot) {
    const bar = root.querySelector<SpaceBarElement>('#spaceBar');
    if (bar) {
      bar.activeId = this.spaces_.activeId;
    }
  }
}
