import '//resources/cr_elements/cr_icon/cr_icon.js';
import '//resources/cr_elements/icons.html.js';

import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import type {SpacePanelRequest} from '../browser.mojom-webui.js';
import {SystemBackdropMaterial} from '../browser.mojom-webui.js';
import {browserProxyFactory} from '../rail_space_panel.mojom-webui.js';

import {getCss} from './space_panel.css.js';
import {getHtml} from './space_panel.html.js';
import {
  backdropSettings,
  hexToHsl,
  hslToHex,
  MAX_GRADIENT_COLORS,
  MIN_STRENGTH,
  spaceHex,
  SPACE_COLORS,
  SPACE_ICONS,
  tintStrength,
  withStrength,
} from './spaces.js';

const PICKER_SATURATION = 70;
const PICKER_MIN_LIGHTNESS = 8;
const PICKER_MAX_LIGHTNESS = 82;
const FIELD_REACH = 42;
const FIELD_MIN_REACH = 0.3;
const DIAL_SWEEP = 270;
const DIAL_CENTER = 28;
const DIAL_TICKS = 24;
const DIAL_TICK_RADIUS = 25;
const DIAL_STEP = 5;
const WAVE_WIDTH = 150;
const WAVE_HEIGHT = 30;
const WAVE_LENGTH = 14;
const WAVE_MIN_AMPLITUDE = 1.5;
const WAVE_MAX_AMPLITUDE = 8;

const BACKDROP_MATERIALS: ReadonlyArray<readonly[SystemBackdropMaterial, string]> = [
  [SystemBackdropMaterial.kMica, 'Mica'],
  [SystemBackdropMaterial.kMicaAlt, 'Mica Alt'],
  [SystemBackdropMaterial.kAcrylic, 'Acrylic'],
  [SystemBackdropMaterial.kAcrylicThin, 'Thin'],
];

interface DialTick {
  x: number;
  y: number;
  lit: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fieldColor(hue: number, lightness: number): string {
  return hslToHex(
      hue, PICKER_SATURATION,
      clamp(lightness, PICKER_MIN_LIGHTNESS, PICKER_MAX_LIGHTNESS));
}

function reachFor(lightness: number): number {
  const depth = clamp(
      (lightness - PICKER_MIN_LIGHTNESS) /
          (PICKER_MAX_LIGHTNESS - PICKER_MIN_LIGHTNESS),
      0, 1);
  return FIELD_MIN_REACH + (1 - FIELD_MIN_REACH) * depth;
}

function lightnessFor(reach: number): number {
  const depth =
      clamp((reach - FIELD_MIN_REACH) / (1 - FIELD_MIN_REACH), 0, 1);
  return PICKER_MIN_LIGHTNESS +
      depth * (PICKER_MAX_LIGHTNESS - PICKER_MIN_LIGHTNESS);
}

function dialPoint(fraction: number, radius: number): [number, number] {
  const angle = (fraction * DIAL_SWEEP - DIAL_SWEEP / 2) / 180 * Math.PI;
  return [
    DIAL_CENTER + Math.sin(angle) * radius,
    DIAL_CENTER - Math.cos(angle) * radius,
  ];
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
      colors_: {type: Array, state: true},
      selected_: {type: Number, state: true},
      dragging_: {type: Number, state: true},
      strength_: {type: Number, state: true},
      grain_: {type: Number, state: true},
      material_: {type: Number, state: true},
      iconQuery_: {type: String, state: true},
    };
  }

  protected accessor kind_ = '';
  protected accessor icon_ = '';
  protected accessor colors_: string[] = [];
  protected accessor selected_ = 0;
  protected accessor dragging_ = -1;
  protected accessor strength_ = 0;
  protected accessor grain_ = 0;
  protected accessor material_: SystemBackdropMaterial =
      SystemBackdropMaterial.kAcrylic;
  protected accessor iconQuery_ = '';
  private backdropFrame_ = 0;
  private spread_: Array<readonly[number, number]> = [];

  override connectedCallback() {
    super.connectedCallback();
    browserProxyFactory.getInstance().callbackRouter.open.addListener(
        this.onOpen_.bind(this));
    this.addEventListener('keydown', e => this.onKeydown_(e), true);
  }

  private async onOpen_(request: SpacePanelRequest) {
    const {style} = request;
    const color = style.color || SPACE_COLORS[0]!;
    this.colors_ = [
      spaceHex(color),
      ...style.gradient.slice(0, MAX_GRADIENT_COLORS),
    ];
    this.selected_ = 0;
    this.dragging_ = -1;
    this.strength_ =
        Math.max(MIN_STRENGTH, Math.round(tintStrength(color) * 100));
    this.grain_ = Math.round(clamp(style.grain, 0, 1) * 100);
    this.material_ = style.material;
    this.icon_ = style.icon;
    this.iconQuery_ = '';
    this.kind_ = request.kind;
    document.documentElement.style.setProperty(
        '--rail-space-color', this.colors_[0]!);
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

  protected selectedHex_(): string {
    return this.colors_[this.selected_] ?? '';
  }

  protected canAddColor_(): boolean {
    return this.colors_.length <= MAX_GRADIENT_COLORS;
  }

  protected canRemoveColor_(): boolean {
    return this.colors_.length > 1;
  }

  protected dotStyle_(hex: string): string {
    const [hue, , lightness] = hexToHsl(hex);
    const reach = FIELD_REACH * reachFor(lightness);
    const angle = hue / 180 * Math.PI;
    return `left: ${50 + Math.cos(angle) * reach}%; ` +
        `top: ${50 + Math.sin(angle) * reach}%; background: ${hex}`;
  }

  protected onFieldPointerdown_(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button, input')) {
      return;
    }
    const dot = (e.target as HTMLElement).closest<HTMLElement>('.dot');
    const index = dot ? Number(dot.dataset['index']) : this.selected_;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.selected_ = index;
    this.dragging_ = index;
    this.captureSpread_();
    if (!dot) {
      this.trackField_(e);
    }
  }

  protected onFieldPointermove_(e: PointerEvent) {
    if (this.dragging_ < 0 || !e.buttons) {
      return;
    }
    this.trackField_(e);
  }

  protected onFieldPointerup_() {
    this.dragging_ = -1;
  }

  protected onFieldPointercancel_() {
    this.onFieldPointerup_();
  }

  private trackField_(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = ((e.clientX - rect.left) / rect.width * 100 - 50) / FIELD_REACH;
    const dy = ((e.clientY - rect.top) / rect.height * 100 - 50) / FIELD_REACH;
    const reach = Math.min(1, Math.hypot(dx, dy));
    const hue = Math.round((Math.atan2(dy, dx) / Math.PI * 180 + 360) % 360);
    const lightness = Math.round(lightnessFor(reach));
    this.setColor_(this.dragging_, fieldColor(hue, lightness));
  }

  private captureSpread_() {
    const [baseHue, , baseLightness] = hexToHsl(this.colors_[0]!);
    this.spread_ = this.colors_.slice(1).map(hex => {
      const [hue, , lightness] = hexToHsl(hex);
      return [hue - baseHue, lightness - baseLightness] as const;
    });
  }

  private setColor_(index: number, hex: string) {
    const colors = [...this.colors_];
    colors[index] = hex;
    if (index === 0) {
      const [baseHue, , baseLightness] = hexToHsl(hex);
      this.spread_.forEach(([hue, lightness], offset) => {
        colors[offset + 1] =
            fieldColor(baseHue + hue, baseLightness + lightness);
      });
    }
    this.colors_ = colors;
    this.commitColor_();
  }

  protected onAddColorClick_() {
    if (!this.canAddColor_()) {
      return;
    }
    const [hue, , lightness] = hexToHsl(this.colors_[0]!);
    const count = this.colors_.length + 1;
    this.colors_ = [
      this.colors_[0]!,
      ...Array.from(
          {length: count - 1},
          (_, step) => fieldColor(hue + 360 * (step + 1) / count, lightness)),
    ];
    this.selected_ = count - 1;
    this.commitColor_();
  }

  protected onRemoveColorClick_() {
    if (!this.canRemoveColor_()) {
      return;
    }
    this.colors_ = this.colors_.slice(0, -1);
    this.selected_ = Math.min(this.selected_, this.colors_.length - 1);
    this.commitColor_();
  }

  protected onHexInput_(e: Event) {
    const text =
        (e.target as HTMLInputElement).value.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(text)) {
      return;
    }
    this.captureSpread_();
    this.setColor_(this.selected_, `#${text.toLowerCase()}`);
  }

  protected onSwatchClick_(e: Event) {
    const color = (e.currentTarget as HTMLElement).dataset['color'] ?? '';
    this.captureSpread_();
    this.setColor_(this.selected_, spaceHex(color));
  }

  protected wavePath_(): string {
    const amplitude = WAVE_MIN_AMPLITUDE +
        (WAVE_MAX_AMPLITUDE - WAVE_MIN_AMPLITUDE) * this.strengthFraction_();
    const points = Array.from({length: WAVE_WIDTH + 1}, (_, x) => {
      const y = WAVE_HEIGHT / 2 +
          amplitude * Math.sin(x / WAVE_LENGTH * 2 * Math.PI);
      return `${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(2)}`;
    });
    return points.join(' ');
  }

  protected onStrengthInput_(e: Event) {
    this.strength_ = Number((e.target as HTMLInputElement).value);
    this.commitColor_();
  }

  private strengthFraction_(): number {
    return (this.strength_ - MIN_STRENGTH) / (100 - MIN_STRENGTH);
  }

  protected minStrength_(): number {
    return MIN_STRENGTH;
  }

  protected dialTicks_(): DialTick[] {
    const fraction = this.grain_ / 100;
    return Array.from({length: DIAL_TICKS}, (_, index) => {
      const position = index / (DIAL_TICKS - 1);
      const [x, y] = dialPoint(position, DIAL_TICK_RADIUS);
      return {x, y, lit: position <= fraction + 1e-6};
    });
  }

  protected dialAngle_(): number {
    return this.grain_ / 100 * DIAL_SWEEP - DIAL_SWEEP / 2;
  }

  protected onDialPointerdown_(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.trackDial_(e);
  }

  protected onDialPointermove_(e: PointerEvent) {
    if (!e.buttons) {
      return;
    }
    this.trackDial_(e);
  }

  private trackDial_(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const angle = Math.atan2(dx, -dy) / Math.PI * 180;
    const fraction =
        clamp((angle + DIAL_SWEEP / 2) / DIAL_SWEEP, 0, 1);
    this.setGrain_(fraction * 100);
  }

  protected onDialKeydown_(e: KeyboardEvent) {
    const steps: Record<string, number> = {
      ArrowUp: DIAL_STEP,
      ArrowRight: DIAL_STEP,
      ArrowDown: -DIAL_STEP,
      ArrowLeft: -DIAL_STEP,
      PageUp: DIAL_STEP * 4,
      PageDown: -DIAL_STEP * 4,
      Home: -100,
      End: 100,
    };
    const step = steps[e.key];
    if (step === undefined) {
      return;
    }
    e.preventDefault();
    this.setGrain_(this.grain_ + step);
  }

  protected onDialWheel_(e: WheelEvent) {
    e.preventDefault();
    this.setGrain_(this.grain_ - Math.sign(e.deltaY) * DIAL_STEP);
  }

  private setGrain_(value: number) {
    const grain = Math.round(clamp(value, 0, 100));
    if (grain === this.grain_) {
      return;
    }
    this.grain_ = grain;
    this.commitColor_();
  }

  private commitColor_() {
    const primary = this.colors_[0]!;
    document.documentElement.style.setProperty('--rail-space-color', primary);
    this.restyle_(withStrength(primary, this.strength_ / 100), '');
    this.commitBackdrop_();
  }

  protected materials_(): ReadonlyArray<readonly[SystemBackdropMaterial, string]> {
    return BACKDROP_MATERIALS;
  }

  protected onMaterialClick_(e: Event) {
    const value = (e.currentTarget as HTMLElement).dataset['material'] ?? '';
    this.material_ = Number(value) as SystemBackdropMaterial;
    this.restyle_('', '');
    this.commitBackdrop_();
  }

  private restyle_(color: string, icon: string) {
    browserProxyFactory.getInstance().handler.restyle({
      color,
      gradient: this.colors_.slice(1),
      grain: this.grain_ / 100,
      icon,
      material: this.material_,
    });
  }

  private commitBackdrop_() {
    if (this.backdropFrame_ !== 0) {
      return;
    }
    this.backdropFrame_ = requestAnimationFrame(() => {
      this.backdropFrame_ = 0;
      browserProxyFactory.getInstance().handler.setSystemBackdrop(
          backdropSettings(
              this.colors_[0]!, this.colors_.slice(1), this.strength_,
              this.material_));
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
    this.restyle_('', icon);
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
