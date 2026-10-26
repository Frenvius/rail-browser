import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import type {ImportEvent, ImportProfile, ImportSource, ImportStep, ImportSummary} from '../rail_import.mojom-webui.js';
import {ImportObserverCallbackRouter, ImportState} from '../rail_import.mojom-webui.js';
import {browserProxyFactory} from '../rail_import_page.mojom-webui.js';

import {getCss} from './import.css.js';
import {getHtml} from './import.html.js';
import type {StepIcon} from './import_steps.js';
import {applicableSteps, hasData, lockedFor, STEP_INFO} from './import_steps.js';

export type ImportScreen = 'pick'|'profiles'|'importing'|'done'|'final';

export interface StepRow {
  step: ImportStep;
  label: string;
  icon: StepIcon;
  state: ImportState;
  detail: string;
  locked: boolean;
}

interface Flow {
  screen: ImportScreen;
  sourceId: string;
  dirs: string[];
  events: Map<ImportStep, ImportEvent>;
  profile: string;
  summary: ImportSummary|null;
}

export interface SetupChoices {
  defaultBrowser: boolean;
  taskbar: boolean;
  login: boolean;
}

interface Setup {
  canPin: boolean;
  isDefault: boolean;
  loginEnabled: boolean;
  choices: SetupChoices;
}

const EMPTY_FLOW: Flow = {
  screen: 'pick',
  sourceId: '',
  dirs: [],
  events: new Map(),
  profile: '',
  summary: null,
};

const EMPTY_SETUP: Setup = {
  canPin: false,
  isDefault: false,
  loginEnabled: false,
  choices: {defaultBrowser: true, taskbar: true, login: true},
};

export class RailImportElement extends CrLitElement {
  static get is() {
    return 'rail-import';
  }

  static override get styles() {
    return getCss();
  }

  override render() {
    return getHtml.bind(this)();
  }

  static override get properties() {
    return {
      flow_: {type: Object, state: true},
      setup_: {type: Object, state: true},
      sources_: {type: Array, state: true},
    };
  }

  protected accessor flow_: Flow = EMPTY_FLOW;
  protected accessor setup_: Setup = EMPTY_SETUP;
  protected accessor sources_: ImportSource[] = [];
  protected readonly firstRun_ =
      new URLSearchParams(location.search).has('first_run');

  override connectedCallback() {
    super.connectedCallback();
    this.loadSources_();
  }

  protected selectedSource_(): ImportSource|undefined {
    return this.sources_.find(source => source.id === this.flow_.sourceId);
  }

  protected selectedProfiles_(): ImportProfile[] {
    const source = this.selectedSource_();
    return source ?
        source.profiles.filter(profile => this.flow_.dirs.includes(profile.dir)) :
        [];
  }

  protected sourceName_(): string {
    return this.selectedSource_()?.name ?? '';
  }

  protected currentProfileName_(): string {
    const profile = this.selectedSource_()?.profiles.find(
        candidate => candidate.dir === this.flow_.profile);
    return profile?.name ?? '';
  }

  protected stepRows_(): StepRow[] {
    const profiles = this.selectedProfiles_();
    return applicableSteps(profiles).map(step => {
      const event = this.flow_.events.get(step);
      return {
        step,
        label: STEP_INFO[step].label,
        icon: STEP_INFO[step].icon,
        state: event?.state ?? ImportState.kPending,
        detail: event?.detail ?? '',
        locked: profiles.some(profile => lockedFor(profile.locked, step) > 0),
      };
    });
  }

  protected lockedNotes_(): string[] {
    const name = this.sourceName_();
    const notes: string[] = [];
    const profiles = this.selectedProfiles_();
    if (profiles.some(profile => profile.locked.passwords > 0)) {
      notes.push(
          `Passwords are locked by ${name}. Export them as a CSV from ${name} to keep them.`);
    }
    if (profiles.some(profile => profile.locked.cookies > 0)) {
      notes.push(`Some cookies are locked by ${name} and could not be read.`);
    }
    return notes;
  }

  protected profileLocked_(profile: ImportProfile): boolean {
    return profile.locked.passwords > 0 || profile.locked.cookies > 0;
  }

  protected canStartSelected_(): boolean {
    return this.flow_.dirs.length > 0;
  }

  protected canContinuePick_(): boolean {
    const source = this.selectedSource_();
    return !!source && source.profiles.length > 0 && !source.running;
  }

  protected doneTitle_(): string {
    if (this.flow_.events.size === 0) {
      return 'The import did not start';
    }
    return this.hasFailedStep_() ? 'Import finished with some issues' :
                                   'Import complete';
  }

  protected hasFailedStep_(): boolean {
    return [...this.flow_.events.values()].some(
        event => event.state === ImportState.kFailed);
  }

  protected sourceDisabledHint_(source: ImportSource): string {
    if (source.running) {
      return `Close ${source.name} to import`;
    }
    return source.profiles.length === 0 ? 'Nothing new to import' : '';
  }

  protected onSourceChange_(e: Event) {
    const source = this.sources_.find(
        candidate => candidate.id === (e.target as HTMLInputElement).value);
    if (source) {
      this.flow_ = {...this.flow_, sourceId: source.id};
    }
  }

  protected onProfileChange_(e: Event) {
    const input = e.target as HTMLInputElement;
    const dirs = input.checked ?
        [...this.flow_.dirs, input.value] :
        this.flow_.dirs.filter(current => current !== input.value);
    this.flow_ = {...this.flow_, dirs};
  }

  protected onSetupChange_(e: Event) {
    const input = e.target as HTMLInputElement;
    this.setup_ = {
      ...this.setup_,
      choices: {
        ...this.setup_.choices,
        [input.value as keyof SetupChoices]: input.checked,
      },
    };
  }

  protected onKeydown_(e: KeyboardEvent) {
    if (e.key !== 'Enter' || (e.target as Element).closest('button')) {
      return;
    }
    this.onPrimaryClick_();
  }

  protected onPrimaryClick_() {
    switch (this.flow_.screen) {
      case 'pick':
        this.continuePick_();
        return;
      case 'profiles':
        this.startSelected_();
        return;
      case 'done':
        this.finishImport_();
        return;
      case 'final':
        this.onGetStartedClick_();
        return;
      default:
        return;
    }
  }

  protected onBackClick_() {
    this.flow_ = {...this.flow_, screen: 'pick', dirs: []};
  }

  protected onSkipClick_() {
    this.showFinalStep_();
  }

  protected onCloseClick_() {
    browserProxyFactory.getInstance().handler.close();
  }

  protected onGetStartedClick_() {
    const handler = browserProxyFactory.getInstance().handler;
    const {choices, canPin, isDefault, loginEnabled} = this.setup_;
    if (choices.defaultBrowser && !isDefault) {
      handler.setAsDefaultBrowser();
    }
    if (choices.taskbar && canPin) {
      handler.pinToTaskbar();
    }
    if (choices.login !== loginEnabled) {
      handler.setRunAtLogin(choices.login);
    }
    handler.close();
  }

  private async loadSources_() {
    const handler = browserProxyFactory.getInstance().handler;
    const {sources} = await handler.listImportSources();
    this.sources_ = sources.filter(source => source.installed);
    const usable = this.sources_.find(
        source => !source.running && source.profiles.length > 0);
    this.flow_ = {...this.flow_, sourceId: usable?.id ?? ''};
  }

  private continuePick_() {
    const source = this.selectedSource_();
    if (!source || source.profiles.length === 0) {
      return;
    }
    if (source.profiles.length > 1) {
      this.flow_ = {
        ...this.flow_,
        screen: 'profiles',
        dirs: source.profiles.filter(profile => hasData(profile.counts))
                  .map(profile => profile.dir),
      };
      return;
    }
    this.startImport_(source, source.profiles.map(profile => profile.dir));
  }

  private startSelected_() {
    const source = this.selectedSource_();
    if (source && this.canStartSelected_()) {
      this.startImport_(source, this.flow_.dirs);
    }
  }

  private startImport_(source: ImportSource, dirs: string[]) {
    const observer = new ImportObserverCallbackRouter();
    observer.onStep.addListener((event: ImportEvent) => this.onStep_(event));
    observer.onFinished.addListener(
        (summary: ImportSummary) => this.onFinished_(summary));
    this.flow_ = {
      screen: 'importing',
      sourceId: source.id,
      dirs,
      events: new Map(),
      profile: '',
      summary: null,
    };
    browserProxyFactory.getInstance().handler.startImport(
        source.id, dirs, observer.$.bindNewPipeAndPassRemote());
  }

  private onStep_(event: ImportEvent) {
    const events = new Map(this.flow_.events);
    events.set(event.step, event);
    this.flow_ = {
      ...this.flow_,
      events,
      profile: event.profile || this.flow_.profile,
    };
  }

  private onFinished_(summary: ImportSummary) {
    this.flow_ = {...this.flow_, screen: 'done', summary};
  }

  private finishImport_() {
    if (this.firstRun_) {
      this.showFinalStep_();
      return;
    }
    browserProxyFactory.getInstance().handler.close();
  }

  private showFinalStep_() {
    this.flow_ = {...this.flow_, screen: 'final'};
    this.loadSetupState_();
  }

  private async loadSetupState_() {
    const handler = browserProxyFactory.getInstance().handler;
    const [{isDefault}, {canPin}, {enabled}] = await Promise.all([
      handler.isDefaultBrowser(),
      handler.canPinToTaskbar(),
      handler.isRunAtLogin(),
    ]);
    this.setup_ = {...this.setup_, isDefault, canPin, loginEnabled: enabled};
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rail-import': RailImportElement;
  }
}

customElements.define(RailImportElement.is, RailImportElement);
