const SETTLE_MS = 600;

const TITLE_ENTER: Keyframe[] = [
  {opacity: 0, filter: 'blur(4px)', transform: 'scale(0.96)'},
  {opacity: 1, filter: 'blur(0)', transform: 'none'},
];

const TITLE_ENTER_TIMING: KeyframeAnimationOptions = {
  duration: 280,
  easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.1)',
};

export interface TabRenameDetail {
  id: string;
  text: string;
}

export interface TabRenameHost {
  readonly shadowRoot: ShadowRoot|null;
  readonly updateComplete: Promise<boolean>;
  readonly tile: boolean;
  readonly tabData: {id: string, title: string};
  requestUpdate(): void;
  dispatchEvent(event: Event): boolean;
}

export function tabName(text: string, pageTitle: string): string {
  const name = text.trim();
  return name === pageTitle ? '' : name;
}

export class TabRename {
  private editing_ = false;
  private openedAt_ = 0;

  constructor(private host_: TabRenameHost) {}

  get editing(): boolean {
    return this.editing_;
  }

  async begin() {
    await this.host_.updateComplete;
    const title = this.query_<HTMLElement>('#title');
    if (this.host_.tile || this.editing_ || !title ||
        getComputedStyle(title).display === 'none') {
      return;
    }
    this.editing_ = true;
    this.openedAt_ = performance.now();
    this.host_.requestUpdate();
    await this.host_.updateComplete;
    const input = this.query_<HTMLInputElement>('#titleInput');
    if (input) {
      input.value = this.host_.tabData.title;
      input.focus();
      input.select();
    }
  }

  playTitleEnter() {
    void this.host_.updateComplete.then(() => {
      const title = this.query_<HTMLElement>('#title');
      if (title && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        title.animate(TITLE_ENTER, TITLE_ENTER_TIMING);
      }
    });
  }

  readonly onRowDblClick = (e: MouseEvent) => {
    const onControl = e.composedPath().some(
        node => node instanceof HTMLElement &&
            (node.localName === 'button' ||
             node.localName === 'cr-icon-button'));
    if (!onControl) {
      this.begin();
    }
  };

  readonly onInputPointer = (e: Event) => {
    e.stopPropagation();
  };

  readonly onInputKeydown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key !== 'Enter' && e.key !== 'Escape') {
      return;
    }
    e.preventDefault();
    this.finish_(e.key === 'Enter');
  };

  readonly onInputBlur = (e: FocusEvent) => {
    if (!this.editing_ || !document.hasFocus()) {
      return;
    }
    if (performance.now() - this.openedAt_ < SETTLE_MS) {
      (e.target as HTMLInputElement).focus();
      return;
    }
    this.finish_(true);
  };

  private finish_(keep: boolean) {
    const input = this.query_<HTMLInputElement>('#titleInput');
    if (!this.editing_ || !input) {
      return;
    }
    this.editing_ = false;
    this.host_.requestUpdate();
    if (keep) {
      this.host_.dispatchEvent(new CustomEvent<TabRenameDetail>('tab-rename', {
        bubbles: true,
        composed: true,
        detail: {id: this.host_.tabData.id, text: input.value},
      }));
    }
  }

  private query_<T extends Element>(selector: string): T|null {
    return this.host_.shadowRoot?.querySelector<T>(selector) ?? null;
  }
}
