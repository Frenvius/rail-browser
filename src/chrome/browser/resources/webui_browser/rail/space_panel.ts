import '//resources/cr_elements/cr_icon/cr_icon.js';
import '//resources/cr_elements/icons.html.js';

import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import type {SpacePanelRequest} from '../browser.mojom-webui.js';
import {SystemBackdropMaterial} from '../browser.mojom-webui.js';
import {browserProxyFactory} from '../rail_space_panel.mojom-webui.js';

import {getCss} from './space_panel.css.js';
import {getHtml} from './space_panel.html.js';
import {
  hexToHsl,
  hslToHex,
  spaceHex,
  SPACE_COLORS,
  SPACE_ICONS,
  tintStrength,
  withStrength,
} from './spaces.js';

const PICKER_SATURATION = 70;
const PICKER_MIN_LIGHTNESS = 18;
const PICKER_MAX_LIGHTNESS = 82;

const BACKDROP_MATERIALS: ReadonlyArray<readonly[SystemBackdropMaterial, string]> = [
  [SystemBackdropMaterial.kMica, 'Mica'],
  [SystemBackdropMaterial.kMicaAlt, 'Mica Alt'],
  [SystemBackdropMaterial.kAcrylic, 'Acrylic'],
  [SystemBackdropMaterial.kAcrylicThin, 'Thin'],
];

const MIN_STRENGTH = 5;
const ACRYLIC_TINT_RANGE: readonly[number, number] = [0.06, 0.6];
const ACRYLIC_LUMINOSITY_RANGE: readonly[number, number] = [0.95, 0.6];
const MICA_TINT_RANGE: readonly[number, number] = [0, 0.6];
const MICA_LUMINOSITY_RANGE: readonly[number, number] = [0, 0.6];

function isMica(material: SystemBackdropMaterial): boolean {
  return material === SystemBackdropMaterial.kMica ||
      material === SystemBackdropMaterial.kMicaAlt;
}

function mix(range: readonly[number, number], t: number): number {
  return range[0] + (range[1] - range[0]) * t;
}

function hexToArgb(hex: string): number {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return (0xff000000 | value) >>> 0;
}

export class RailSpacePanelElement extends CrLitElement {
  static get is() {
    return 'rail-space-panel';
  }

  static override get styles() {
    return getCss();
  }

  override render() {
    return getHtml.bind(this)();
  }

  static override get properties() {
    return {
      kind_: {type: String, state: true},
      icon_: {type: String, state: true},
      hue_: {type: Number, state: true},
      exactHex_: {type: String, state: true},
      saturation_: {type: Number, state: true},
      lightness_: {type: Number, state: true},
      strength_: {type: Number, state: true},
      material_: {type: Number, state: true},
      iconQuery_: {type: String, state: true},
    };
  }

  protected accessor kind_ = '';
  protected accessor icon_ = '';
  protected accessor hue_ = 0;
  protected accessor exactHex_ = '';
  protected accessor saturation_ = PICKER_SATURATION;
  protected accessor lightness_ = 50;
  protected accessor strength_ = 0;
  protected accessor material_: SystemBackdropMaterial =
      SystemBackdropMaterial.kAcrylic;
  protected accessor iconQuery_ = '';
  private backdropFrame_ = 0;

  override connectedCallback() {
    super.connectedCallback();
    browserProxyFactory.getInstance().callbackRouter.open.addListener(
        this.onOpen_.bind(this));
    this.addEventListener('keydown', e => this.onKeydown_(e), true);
  }

  private async onOpen_(request: SpacePanelRequest) {
    const color = request.color || SPACE_COLORS[0]!;
    const [hue, saturation, lightness] = hexToHsl(color);
    this.hue_ = hue;
    this.saturation_ = saturation;
    this.lightness_ = lightness;
    this.exactHex_ = spaceHex(color);
    this.strength_ = Math.max(MIN_STRENGTH, Math.round(tintStrength(color) * 100));
    this.icon_ = request.icon;
    this.iconQuery_ = '';
    this.kind_ = request.kind;
    document.documentElement.style.setProperty(
        '--rail-space-color', this.exactHex_);
    await this.updateComplete;
    this.shadowRoot.querySelector<HTMLInputElement>('#iconSearch')?.focus();
    browserProxyFactory.getInstance().handler.ready(
        Math.ceil(document.body.getBoundingClientRect().height));
  }

  private onKeydown_(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      browserProxyFactory.getInstance().handler.close();
    }
  }

  protected isColor_(): boolean {
    return this.kind_ === 'color';
  }

  protected swatches_(): readonly string[] {
    return SPACE_COLORS;
  }

  protected pickedHex_(): string {
    return this.exactHex_ ||
        hslToHex(this.hue_, this.saturation_, this.lightness_);
  }

  protected trackGradient_(): string {
    return `linear-gradient(to right, transparent, ${this.pickedHex_()})`;
  }

  private dotRadius_(): number {
    return Math.min(1, Math.max(0,
        (this.lightness_ - PICKER_MIN_LIGHTNESS) /
        (PICKER_MAX_LIGHTNESS - PICKER_MIN_LIGHTNESS)));
  }

  protected dotLeft_(): string {
    const angle = this.hue_ / 180 * Math.PI;
    return `${50 + Math.cos(angle) * this.dotRadius_() * 50}%`;
  }

  protected dotTop_(): string {
    const angle = this.hue_ / 180 * Math.PI;
    return `${50 + Math.sin(angle) * this.dotRadius_() * 50}%`;
  }

  protected onFieldPointerdown_(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.trackField_(e);
  }

  protected onFieldPointermove_(e: PointerEvent) {
    if (!e.buttons) {
      return;
    }
    this.trackField_(e);
  }

  private trackField_(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = (e.clientX - rect.left) / rect.width * 2 - 1;
    const dy = (e.clientY - rect.top) / rect.height * 2 - 1;
    const radius = Math.min(1, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx) / Math.PI * 180;
    this.hue_ = Math.round((angle + 360) % 360);
    this.saturation_ = PICKER_SATURATION;
    this.lightness_ = Math.round(
        PICKER_MIN_LIGHTNESS +
        radius * (PICKER_MAX_LIGHTNESS - PICKER_MIN_LIGHTNESS));
    this.exactHex_ = '';
    this.commitColor_();
  }

  protected onHexInput_(e: Event) {
    const text =
        (e.target as HTMLInputElement).value.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(text)) {
      return;
    }
    const [hue, saturation, lightness] = hexToHsl(`#${text}`);
    this.hue_ = hue;
    this.saturation_ = saturation;
    this.lightness_ = lightness;
    this.exactHex_ = `#${text.toLowerCase()}`;
    this.commitColor_();
  }

  protected minStrength_(): number {
    return MIN_STRENGTH;
  }

  protected onStrengthInput_(e: Event) {
    this.strength_ = Number((e.target as HTMLInputElement).value);
    this.commitColor_();
  }

  protected onSwatchClick_(e: Event) {
    const color = (e.currentTarget as HTMLElement).dataset['color'] ?? '';
    const [hue, saturation, lightness] = hexToHsl(color);
    this.hue_ = hue;
    this.saturation_ = saturation;
    this.lightness_ = lightness;
    this.exactHex_ = spaceHex(color);
    this.commitColor_();
  }

  private commitColor_() {
    document.documentElement.style.setProperty(
        '--rail-space-color', this.pickedHex_());
    browserProxyFactory.getInstance().handler.restyle(
        withStrength(this.pickedHex_(), this.strength_ / 100), '');
    this.commitBackdrop_();
  }

  protected materials_(): ReadonlyArray<readonly[SystemBackdropMaterial, string]> {
    return BACKDROP_MATERIALS;
  }

  protected onMaterialClick_(e: Event) {
    const value = (e.currentTarget as HTMLElement).dataset['material'] ?? '';
    this.material_ = Number(value) as SystemBackdropMaterial;
    this.commitBackdrop_();
  }

  private commitBackdrop_() {
    if (this.backdropFrame_ !== 0) {
      return;
    }
    this.backdropFrame_ = requestAnimationFrame(() => {
      this.backdropFrame_ = 0;
      const color = hexToArgb(this.pickedHex_());
      const t = (this.strength_ - MIN_STRENGTH) / (100 - MIN_STRENGTH);
      const mica = isMica(this.material_);
      browserProxyFactory.getInstance().handler.setSystemBackdrop({
        material: this.material_,
        tintColor: color,
        fallbackColor: color,
        tintOpacity:
            mix(mica ? MICA_TINT_RANGE : ACRYLIC_TINT_RANGE, t),
        luminosityOpacity:
            mix(mica ? MICA_LUMINOSITY_RANGE : ACRYLIC_LUMINOSITY_RANGE, t),
      });
    });
  }

  protected filteredIcons_(): ReadonlyArray<readonly[string, string]> {
    const query = this.iconQuery_.trim().toLowerCase();
    if (!query) {
      return SPACE_ICONS;
    }
    return SPACE_ICONS.filter(
        ([icon, terms]) => terms.includes(query) || icon === query);
  }

  protected onIconSearchInput_(e: Event) {
    this.iconQuery_ = (e.target as HTMLInputElement).value;
  }

  protected onIconClick_(e: Event) {
    const icon = (e.currentTarget as HTMLElement).dataset['icon'] ?? '';
    browserProxyFactory.getInstance().handler.restyle('', icon);
    browserProxyFactory.getInstance().handler.close();
  }

  protected onCloseClick_() {
    browserProxyFactory.getInstance().handler.close();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rail-space-panel': RailSpacePanelElement;
  }
}

customElements.define(RailSpacePanelElement.is, RailSpacePanelElement);
