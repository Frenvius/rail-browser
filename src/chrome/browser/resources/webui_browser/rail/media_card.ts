import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';
import type {NodeId} from '/tab_strip_api/tab_strip_api_types.mojom-webui.js';

import {browserProxyFactory} from '../browser.mojom-webui.js';
import type {TabStripElement} from '../tab_strip/tab_strip.js';

import {getCss} from './media_card.css.js';
import {getHtml} from './media_card.html.js';
import {Action} from '../rail_media.mojom-webui.js';
import type {State} from '../rail_media.mojom-webui.js';

export class RailMediaCardElement extends CrLitElement {
  static get is() {
    return 'rail-media-card';
  }

  static override get styles() {
    return getCss();
  }

  override render() {
    return getHtml.bind(this)();
  }

  static override get properties() {
    return {
      media: {type: Object},
      favicon: {type: String},
    };
  }

  accessor media: State|null = null;
  accessor favicon: string = '';
  private states_ = new Map<NodeId, State>();
  private listener_: number|null = null;
  private proxy_ = browserProxyFactory.getInstance();

  override connectedCallback() {
    super.connectedCallback();
    this.hidden = true;
    this.listener_ = this.proxy_.callbackRouter.onMediaChanged.addListener(
        (tab: NodeId, state: State|null) => {
          if (state) {
            this.states_.set(tab, state);
          } else {
            this.states_.delete(tab);
          }
          this.choose_();
        });
    this.proxy_.handler.startMediaTracking();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.listener_ !== null) {
      this.proxy_.callbackRouter.removeListener(this.listener_);
      this.listener_ = null;
    }
    this.states_.clear();
  }

  private strip_(): TabStripElement {
    return (this.getRootNode() as ShadowRoot).host as TabStripElement;
  }

  private choose_() {
    this.media = [...this.states_.values()]
                     .filter(state => state.controllable && !state.active &&
                                 !state.dismissed && state.lastPlayed > 0)
                     .sort((a, b) => b.lastPlayed - a.lastPlayed)[0] ?? null;
    this.hidden = !this.media;
    this.favicon = this.media?.favicon ?? '';
  }

  protected onBodyClick_(event: MouseEvent) {
    if (!event.composedPath().some(node => node instanceof HTMLButtonElement)) {
      this.onActivateClick_();
    }
  }

  protected onActivateClick_() {
    if (this.media) {
      this.strip_().switchToTab(this.media.tab);
    }
  }

  protected onPlaybackClick_() {
    this.run_(this.media?.playing ? Action.kPause : Action.kPlay);
  }

  protected onPreviousClick_() {
    this.run_(Action.kPrevious);
  }

  protected onNextClick_() {
    this.run_(Action.kNext);
  }

  protected onMuteClick_() {
    this.run_(Action.kMute);
  }

  protected onDismissClick_() {
    this.run_(Action.kDismiss);
  }

  private run_(action: Action) {
    if (this.media) {
      this.proxy_.handler.runMediaAction(this.media.tab, action);
    }
  }
}

customElements.define(RailMediaCardElement.is, RailMediaCardElement);

declare global {
  interface HTMLElementTagNameMap {
    'rail-media-card': RailMediaCardElement;
  }
}
