import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';

const compile = (file: string) => new Bun.Transpiler({loader: 'ts'}).transformSync(
    readFileSync(new URL(
        `../src/chrome/browser/resources/webui_browser/rail/${file}.ts`,
        import.meta.url), 'utf8')
        .replace(/^import[\s\S]*?;\r?\n/gm, '')
        .replace(/^export type \{[^}]*\};\r?\n/gm, '')
        .replace(/^export /gm, '')
        .replace(/\baccessor /g, ''));
const SOURCES = {
  state: compile('sidebar_state'),
  spaces: compile('spaces'),
  pinned: compile('pinned_tabs'),
  folders: compile('folders'),
};

type Task = {label: string, run: () => void};

class World {
  queue: Task[] = [];
  pref = '';
  live = new Set<string>();
  private seed_: number;
  private uuid_ = 0;

  constructor(seed: number) {
    this.seed_ = seed;
  }

  random(): number {
    this.seed_ = (this.seed_ * 1103515245 + 12345) & 0x7fffffff;
    return this.seed_ / 0x7fffffff;
  }

  uuid(): string {
    return `u${++this.uuid_}`;
  }

  drain() {
    let steps = 0;
    while (this.queue.length && steps++ < 20000) {
      const index = Math.floor(this.random() * this.queue.length);
      this.queue.splice(index, 1)[0]!.run();
    }
  }
}

interface OpenTab {
  id: string;
  url: string;
  title: string;
  favicon: {dataUrl: string};
}

interface WindowStart {
  runId: string;
  tabs: OpenTab[];
  windows: any[];
  earlierKey: string;
}

function openWindow(
    world: World, {runId, tabs, windows, earlierKey}: WindowStart) {
  const crypto = {randomUUID: () => world.uuid()};
  const loadTimeData = {
    isInitialized: () => true,
    valueExists: (key: string) => key === 'railRunId',
    getString: () => runId,
    getBoolean: () => false,
  };
  const handler = {
    setSidebarState: (value: string) => {
      world.pref = value;
      for (const other of windows) {
        other.inbox.push(value);
        world.queue.push(
            {label: 'deliver', run: () => other.changed(other.inbox.shift())});
      }
    },
  };
  const later = (run: () => void) => {
    world.queue.push({label: 'save', run});
    return 0;
  };
  const sidebar = new Function('loadTimeData', 'location', 'browserProxyFactory',
      'crypto', 'setTimeout', 'clearTimeout',
      `${SOURCES.state}\nreturn {SidebarStore, isEarlierRun, earlierOwnerOf, ` +
          'WINDOW_ID, parseSidebarState};')(
      loadTimeData, {search: ''}, {getInstance: () => ({handler})}, crypto,
      later, () => {});
  const shared = {
    SystemBackdropMaterial: {kAcrylic: 0, kMica: 1, kMicaAlt: 2},
    INCOGNITO: false,
    MINI: false,
    TabNetworkState: {},
    WINDOW_ID: sidebar.WINDOW_ID,
    isEarlierRun: sidebar.isEarlierRun,
    crypto,
  };
  const module = (source: string, names: string) => new Function(
      ...Object.keys(shared), `${source}\nreturn {${names}};`)(
      ...Object.values(shared));
  const {Spaces, serializeSidebar} =
      module(SOURCES.spaces, 'Spaces, serializeSidebar');
  const {PinnedTabs} = module(SOURCES.pinned, 'PinnedTabs');
  const {Folders} = module(SOURCES.folders, 'Folders');

  const view: any = {tabs, items: [] as OpenTab[], restored: false,
    unapplied: null as string | null, inbox: [] as string[],
    key: sidebar.WINDOW_ID};
  view.store = new sidebar.SidebarStore(
      () => serializeSidebar(view.spaces, view.pinned, view.folders, view.tidy));
  view.pinned = new PinnedTabs(() => view.store.save());
  view.spaces = new Spaces(() => view.store.save());
  view.folders = new Folders(() => view.store.save());
  view.tidy = new Folders(() => view.store.save());

  const restore = (state: unknown, list: OpenTab[], adopted = '') => {
    const claimed = new Set<string>();
    view.folders.clear();
    view.tidy.clear();
    view.pinned.restore(state, list, claimed, adopted);
    view.spaces.restore(state, list, claimed, adopted);
    view.folders.restore(state);
    view.tidy.restore(state, (space: any) => space.tidyGroups);
    view.spaces.dropForeignGroups((id: string) => view.tidy.byId(id)?.space);
    for (const entry of view.pinned.entries) {
      if (entry.tabId) {
        view.spaces.assignPinned(entry.tabId, entry.space, entry.url);
      }
    }
    return claimed;
  };
  const prune = () => {
    const ids = [...view.spaces.remotes(), ...view.pinned.remotes()];
    if (!ids.length) {
      return;
    }
    world.queue.push({label: 'prune', run: () => {
      const dead = new Set(ids.filter(id => !world.live.has(id)));
      view.spaces.releaseRemotes(dead);
      view.pinned.releaseRemotes(dead);
    }});
  };
  view.changed = (value: string) => {
    if (!view.restored) {
      view.unapplied = value;
      return;
    }
    const state = view.store.accept(value);
    if (!state) {
      return;
    }
    restore(state, view.items);
    view.store.save();
    prune();
  };
  world.queue.push({label: 'read', run: () => {
    const value = world.pref;
    world.queue.push({label: 'restore', run: () => {
      const state = sidebar.parseSidebarState(value);
      view.store.seed(state);
      const claimed =
          restore(state, tabs, sidebar.earlierOwnerOf(state, tabs, earlierKey));
      for (const entry of view.pinned.reattach(tabs, claimed)) {
        view.spaces.assignPinned(entry.tabId, entry.space, entry.url);
      }
      view.items = tabs;
      view.restored = true;
      if (view.unapplied !== null) {
        view.changed(view.unapplied);
        view.unapplied = null;
      }
      prune();
      view.store.save();
    }});
  }});
  return view;
}

interface LiveTab {
  url: string;
  space: string;
  window: number;
  pinned?: boolean;
  unsaved?: boolean;
}

interface Page {
  url: string;
  space: string;
}

interface Scenario {
  name: string;
  spaces: string[];
  windows: number;
  live: LiveTab[];
  dormant?: Page[];
  dormantPins?: Page[];
  gone?: LiveTab[];
  legacy?: boolean;
}

type IdMode = 'fresh'|'stable'|'shuffled';

function savedState(scenario: Scenario, ids: Map<LiveTab, string>): string {
  const owner = (live: LiveTab) =>
      scenario.legacy ? `uuid-w${live.window}` : `old.w${live.window}`;
  const saved = [
    ...scenario.live.filter(live => !live.unsaved),
    ...(scenario.gone ?? []),
  ];
  const stored = (live: LiveTab) => ({
    url: live.url, title: '', favicon: '', owner: owner(live),
    tab: ids.get(live)});
  return JSON.stringify({
    activeSpace: scenario.spaces[0],
    rev: 'r0',
    spaces: scenario.spaces.map(space => ({
      id: space, name: space, color: '#192e50ff', icon: '', activeUrl: '',
      pinned: [
        ...saved.filter(live => live.space === space && live.pinned)
            .map(live => ({id: `pin-${ids.get(live)}`, home: live.url,
              ...stored(live)})),
        ...(scenario.dormantPins ?? []).filter(page => page.space === space)
            .map((page, index) => ({id: `dpin-${space}${index}`,
              home: page.url, url: page.url, title: '', favicon: ''})),
      ],
      tabs: [
        ...saved.filter(live => live.space === space && !live.pinned)
            .map(live => ({id: `row-${ids.get(live)}`, ...stored(live)})),
        ...(scenario.dormant ?? []).filter(page => page.space === space)
            .map((page, index) => ({id: `dorm-${space}${index}`,
              url: page.url, title: '', favicon: ''})),
      ],
    })),
  });
}

interface Restart {
  world: World;
  views: any[];
  ids: Map<LiveTab, string>;
  mode: IdMode;
}

function problemsIn(scenario: Scenario, {world, views, ids, mode}: Restart) {
  const problems: string[] = [];
  const wanted = (space: string) => [
    ...[...scenario.live, ...(scenario.gone ?? [])]
        .filter(live => live.space === space)
        .map(live => `${live.pinned ? 'P' : 'T'} ${live.url}`),
    ...(scenario.dormant ?? []).filter(page => page.space === space)
        .map(page => `T ${page.url}`),
    ...(scenario.dormantPins ?? []).filter(page => page.space === space)
        .map(page => `P ${page.url}`),
  ].sort();
  const shared = JSON.parse(world.pref);
  for (const space of shared.spaces) {
    const got = [
      ...space.pinned.map((pin: Page) => `P ${pin.url}`),
      ...space.tabs.map((row: Page) => `T ${row.url}`),
    ].sort();
    if (JSON.stringify(got) !== JSON.stringify(wanted(space.id))) {
      problems.push(`saved ${space.id}: ${got.join(', ')}`);
    }
  }
  views.forEach((view, index) => {
    for (const space of scenario.spaces) {
      const got = [
        ...view.pinned.entriesIn(space).map((pin: Page) => `P ${pin.url}`),
        ...view.spaces.rowsIn(space)
            .filter((row: {tabId: string}) => !view.pinned.byTab(row.tabId))
            .map((row: Page) => `T ${row.url}`),
      ].sort();
      if (JSON.stringify(got) !== JSON.stringify(wanted(space))) {
        problems.push(`window ${index} ${space}: ${got.join(', ')}`);
      }
    }
    const own = scenario.live.filter(
        live => live.window === index && !live.unsaved);
    const placed = own.map(live => {
      const id = ids.get(live)!;
      const pin = view.pinned.byTab(id);
      return pin ? `P ${pin.space} ${live.url}` :
                   `T ${view.spaces.spaceOf(id)} ${live.url}`;
    });
    const expected = own.map(
        live => `${live.pinned ? 'P' : 'T'} ${live.space} ${live.url}`);
    const exact = mode === 'stable';
    const differs = exact ?
        placed.some((place, at) => place !== expected[at]) :
        multiset(placed) !== multiset(expected);
    if (differs) {
      problems.push(`window ${index} tabs: ${placed.join(', ')}`);
    }
  });
  return problems;
}

function multiset(items: string[]): string {
  return JSON.stringify([...items].sort());
}

interface RestartPlan {
  seed: number;
  mode: IdMode;
  keyed?: boolean;
  restarts?: number;
  unsavedRun?: number;
}

function restartProblems(scenario: Scenario, {
  seed, mode, keyed = false, restarts = 2, unsavedRun = 0,
}: RestartPlan): string[] {
  const world = new World(seed);
  let ids = new Map<LiveTab, string>();
  [...scenario.live, ...(scenario.gone ?? [])].forEach(
      (live, index) => ids.set(live, `${100 + index}`));
  world.pref = savedState(scenario, ids);
  let keys = Array.from({length: scenario.windows}, (_, window) =>
      keyed && !scenario.legacy ? `old.w${window}` : '');
  for (let run = 1; run <= restarts; run++) {
    const pool = scenario.live.map(live => ids.get(live)!);
    const next = new Map<LiveTab, string>();
    scenario.live.forEach((live, index) => next.set(live,
        mode === 'stable' ? ids.get(live)! :
        mode === 'shuffled' ?
            pool.splice(Math.floor(world.random() * pool.length), 1)[0]! :
            `${run * 1000 + index}`));
    ids = next;
    world.live = new Set(ids.values());
    world.queue = [];
    const views: any[] = [];
    for (let index = 0; index < scenario.windows; index++) {
      const tabs = scenario.live.filter(live => live.window === index)
                       .map(live => ({id: ids.get(live)!, url: live.url,
                         title: '', favicon: {dataUrl: ''}}));
      views.push(openWindow(world, {runId: `run${run}`, tabs, windows: views,
        earlierKey: keys[index]!}));
    }
    keys = views.map(view => keyed ? view.key : '');
    const before = world.pref;
    world.drain();
    if (run === unsavedRun) {
      world.pref = before;
      continue;
    }
    const problems = problemsIn(scenario, {world, views, ids, mode});
    if (problems.length) {
      return problems.map(problem => `restart ${run}: ${problem}`);
    }
  }
  return [];
}

const page = (name: string) => `https://${name}.test/`;

const SCENARIOS: Scenario[] = [
  {name: 'two windows with their own spaces', spaces: ['a', 'b'], windows: 2,
    live: [{url: page('a0'), space: 'a', window: 0},
      {url: page('a1'), space: 'a', window: 0},
      {url: page('b0'), space: 'b', window: 1},
      {url: page('b1'), space: 'b', window: 1}]},
  {name: 'two windows sharing spaces', spaces: ['a', 'b'], windows: 2,
    live: [{url: page('a0'), space: 'a', window: 0},
      {url: page('b0'), space: 'b', window: 0},
      {url: page('a1'), space: 'a', window: 1},
      {url: page('b1'), space: 'b', window: 1}]},
  {name: 'one page open in two windows and spaces', spaces: ['a', 'b'],
    windows: 2,
    live: [{url: page('mail'), space: 'a', window: 0},
      {url: page('mail'), space: 'b', window: 1},
      {url: page('x'), space: 'b', window: 1}]},
  {name: 'one page twice in one window', spaces: ['a', 'b'], windows: 1,
    live: [{url: page('mail'), space: 'a', window: 0},
      {url: page('mail'), space: 'b', window: 0}]},
  {name: 'a dormant row shows a page open elsewhere', spaces: ['a', 'b'],
    windows: 2,
    live: [{url: page('mail'), space: 'b', window: 1},
      {url: page('a0'), space: 'a', window: 0}],
    dormant: [{url: page('mail'), space: 'a'}]},
  {name: 'pins in both windows', spaces: ['a', 'b'], windows: 2,
    live: [{url: page('p0'), space: 'a', window: 0, pinned: true},
      {url: page('a0'), space: 'a', window: 0},
      {url: page('p1'), space: 'b', window: 1, pinned: true},
      {url: page('b0'), space: 'b', window: 1}]},
  {name: 'a dormant pin shows a page open elsewhere', spaces: ['a', 'b'],
    windows: 2,
    live: [{url: page('a0'), space: 'a', window: 0},
      {url: page('mail'), space: 'b', window: 1},
      {url: page('b0'), space: 'b', window: 1}],
    dormantPins: [{url: page('mail'), space: 'a'}]},
  {name: 'three windows and a dormant row', spaces: ['a', 'b', 'c'],
    windows: 3,
    live: [{url: page('a0'), space: 'a', window: 0},
      {url: page('a1'), space: 'a', window: 0},
      {url: page('b0'), space: 'b', window: 1},
      {url: page('b1'), space: 'b', window: 1},
      {url: page('c0'), space: 'c', window: 2},
      {url: page('c1'), space: 'c', window: 2}],
    dormant: [{url: page('d'), space: 'b'}]},
  {name: 'owners saved before run ids existed', spaces: ['a', 'b'],
    windows: 2, legacy: true,
    live: [{url: page('a0'), space: 'a', window: 0},
      {url: page('mail'), space: 'a', window: 0},
      {url: page('mail'), space: 'b', window: 1},
      {url: page('b0'), space: 'b', window: 1}]},
  {name: 'a window that does not come back', spaces: ['a', 'b'], windows: 1,
    live: [{url: page('a0'), space: 'a', window: 0},
      {url: page('mail'), space: 'a', window: 0}],
    gone: [{url: page('mail'), space: 'b', window: 1},
      {url: page('b0'), space: 'b', window: 1}]},
  {name: 'tabs never saved before quitting', spaces: ['a', 'b'], windows: 2,
    live: [{url: page('a0'), space: 'a', window: 0},
      {url: page('n0'), space: 'a', window: 0, unsaved: true},
      {url: page('b0'), space: 'b', window: 1},
      {url: page('n1'), space: 'a', window: 1, unsaved: true}]},
  {name: 'one window holds a subset of the other', spaces: ['a', 'b'],
    windows: 2,
    live: [{url: page('mail'), space: 'a', window: 0},
      {url: page('mail'), space: 'b', window: 1},
      {url: page('x'), space: 'b', window: 1}]},
  {name: 'four windows with pins and repeated pages', spaces: ['a', 'b', 'c'],
    windows: 4,
    live: [{url: page('mail'), space: 'a', window: 0, pinned: true},
      {url: page('a0'), space: 'a', window: 0},
      {url: page('mail'), space: 'b', window: 1},
      {url: page('b0'), space: 'b', window: 1},
      {url: page('mail'), space: 'c', window: 2},
      {url: page('c0'), space: 'c', window: 2},
      {url: page('c0'), space: 'a', window: 3},
      {url: page('chat'), space: 'b', window: 3, pinned: true}],
    dormant: [{url: page('mail'), space: 'c'}]},
  {name: 'a pinned tab next to a sleeping row of its page', spaces: ['a', 'b'],
    windows: 2,
    live: [{url: page('mail'), space: 'a', window: 0, pinned: true},
      {url: page('a0'), space: 'a', window: 0},
      {url: page('b0'), space: 'b', window: 1}],
    dormant: [{url: page('mail'), space: 'a'}]},
];

const IDENTICAL_WINDOWS: Scenario = {
  name: 'two windows showing the same single page',
  spaces: ['a', 'b'],
  windows: 2,
  live: [{url: page('mail'), space: 'b', window: 1, pinned: true},
    {url: page('mail'), space: 'a', window: 0}],
};

const SEEDS = Array.from({length: 60}, (_, index) => (index + 1) * 7919);

const MODES: IdMode[] = ['fresh', 'stable', 'shuffled'];

for (const scenario of SCENARIOS) {
  for (const mode of MODES) {
    for (const keyed of [false, true]) {
      const keys = keyed ? 'window keys' : 'no window keys';
      test(`restart race: ${scenario.name}, ${mode} tab ids, ${keys}`, () => {
        for (const seed of SEEDS) {
          expect({seed, problems: restartProblems(scenario, {seed, mode, keyed})})
              .toEqual({seed, problems: []});
        }
      });
    }
  }
}

test('restart race: identical windows sort out with stable tab ids', () => {
  for (const seed of SEEDS) {
    expect({seed,
      problems: restartProblems(IDENTICAL_WINDOWS, {seed, mode: 'stable'})})
        .toEqual({seed, problems: []});
  }
});

for (const scenario of SCENARIOS.filter(windowsTell)) {
  test(`restart race: ${scenario.name}, quit before saving`, () => {
    for (const mode of MODES) {
      for (const seed of SEEDS.slice(0, 20)) {
        expect({mode, seed, problems: restartProblems(scenario,
                   {seed, mode, keyed: true, restarts: 3, unsavedRun: 1})})
            .toEqual({mode, seed, problems: []});
      }
    }
  });
}

test('restart race: identical windows sort out by window key', () => {
  for (const mode of MODES) {
    for (const seed of SEEDS) {
      expect({mode, seed, problems: restartProblems(
                 IDENTICAL_WINDOWS, {seed, mode, keyed: true, restarts: 3})})
          .toEqual({mode, seed, problems: []});
    }
  }
});

function randomScenario(world: World): Scenario {
  const spaces = ['a', 'b', 'c'].slice(0, 1 + Math.floor(world.random() * 3));
  const windows = 1 + Math.floor(world.random() * 3);
  const pick = <T>(list: T[]) => list[Math.floor(world.random() * list.length)]!;
  const pages = ['mail', 'chat', 'docs', 'news', 'code'].map(page);
  const tabsOf = (window: number) => Array.from(
      {length: 1 + Math.floor(world.random() * 4)},
      () => ({url: pick(pages), space: pick(spaces), window,
        pinned: world.random() < 0.2}));
  const live: LiveTab[] = Array.from({length: windows}, (_, window) => [
    ...tabsOf(window),
    ...(world.random() < 0.15 ?
            [{url: page(`unsaved${window}`), space: spaces[0]!, window,
              unsaved: true}] :
            []),
  ]).flat();
  const gone = world.random() < 0.3 ? tabsOf(windows) : [];
  const dormant = world.random() < 0.5 ?
      [{url: pick(pages), space: pick(spaces)}] : [];
  const dormantPins = world.random() < 0.3 ?
      [{url: pick(pages), space: pick(spaces)}] : [];
  return {name: 'random', spaces, windows, live, dormant, dormantPins, gone,
    legacy: world.random() < 0.2};
}

function windowsTell(scenario: Scenario): boolean {
  const saved = [...scenario.live.filter(live => !live.unsaved),
    ...(scenario.gone ?? [])];
  const sets = Array.from({length: scenario.windows + 1}, (_, window) =>
      multiset(saved.filter(live => live.window === window)
          .map(live => live.url)));
  return new Set(sets).size === sets.length;
}

for (const keyed of [false, true]) {
  const keys = keyed ? 'window keys' : 'no window keys';
  test(`restart race: random sidebars, ${keys}`, () => {
    const world = new World(424242);
    let checked = 0;
    while (checked < 400) {
      const scenario = randomScenario(world);
      if (!(keyed && !scenario.legacy) && !windowsTell(scenario)) {
        continue;
      }
      checked++;
      for (const mode of ['fresh', 'shuffled'] as IdMode[]) {
        const seed = Math.floor(world.random() * 1e6);
        expect({scenario, mode, seed,
          problems: restartProblems(scenario, {seed, mode, keyed})})
            .toEqual({scenario, mode, seed, problems: []});
      }
    }
  }, 60000);
}
