import {afterAll, beforeAll, expect, test} from 'bun:test';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const live = process.env.RAIL_LIVE === '1';
const port = Number(process.env.RAIL_CDP_PORT ?? 9341);
const chrome = new URL('../build/src/out/Dev/chrome.exe', import.meta.url);
const HOME = 'https://example.com/';
const AWAY = 'https://example.org/';

let profile = '';
let socket: WebSocket;
let nextId = 0;
const pending = new Map<number, (value: any) => void>();

async function shell<T>(body: string): Promise<T> {
  const id = ++nextId;
  const reply = new Promise<any>(resolve => pending.set(id, resolve));
  socket.send(JSON.stringify({id, method: 'Runtime.evaluate', params: {
    expression: `(async () => {
      const ts = document.querySelector('webui-browser-app')
          .shadowRoot.querySelector('#tabstrip');
      ${body}
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }}));
  const message = await reply;
  if (message.result?.exceptionDetails) {
    throw new Error(JSON.stringify(message.result.exceptionDetails));
  }
  return message.result?.result?.value as T;
}

async function until<T>(body: string, done: (value: T) => boolean): Promise<T> {
  for (let tries = 0;; tries++) {
    try {
      const value = await shell<T>(body);
      if (done(value) || tries >= 50) {
        return value;
      }
    } catch (error) {
      if (tries >= 50) {
        throw error;
      }
    }
    await Bun.sleep(200);
  }
}

const STATE = `return {
  pins: ts.pinnedTabs_.entries.map(e => ({key: e.key, url: e.url, tabId: e.tabId})),
  loose: ts.looseTabIds_(),
};`;

type State = {pins: Array<{key: string, url: string, tabId: string}>,
              loose: string[]};

beforeAll(async () => {
  if (!live) {
    return;
  }
  profile = mkdtempSync(join(tmpdir(), 'rail-live-'));
  Bun.spawn([chrome.pathname.replace(/^\//, ''), `--user-data-dir=${profile}`,
    '--enable-features=Webium,AttachUnownedInnerWebContents',
    '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, HOME], {stdout: 'ignore', stderr: 'ignore'});
  let target: any;
  for (let tries = 0; tries < 100 && !target; tries++) {
    await Bun.sleep(200);
    const targets = await fetch(`http://127.0.0.1:${port}/json`)
        .then(response => response.json()).catch(() => []);
    target = targets.find((one: any) => one.url === 'chrome://webui-browser/');
  }
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.onmessage = event => {
    const message = JSON.parse(String(event.data));
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  };
  await new Promise(resolve => socket.onopen = resolve);
  await until<number>('return ts.openTabs.length;', count => count === 1);
}, 30000);

afterAll(async () => {
  if (!live) {
    return;
  }
  const {webSocketDebuggerUrl} =
      await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browser = new WebSocket(webSocketDebuggerUrl);
  await new Promise(resolve => browser.onopen = resolve);
  browser.send(JSON.stringify({id: 1, method: 'Browser.close'}));
  await Bun.sleep(2000);
  rmSync(profile, {recursive: true, force: true});
});

test.skipIf(!live)('the reset arrow brings a pinned tab back home', async () => {
  const tabId = await shell<string>(`
    const id = ts.openTabs[0].id;
    ts.runTabCommand('pin', ts.targetFor(id));
    ts.fire('tab-navigate', {id, url: '${AWAY}'});
    return id;`);
  expect(await until<boolean>(`return ts.hasLeftHome_('${tabId}');`, Boolean))
      .toBe(true);
  await shell(`ts.onTabResetClick_({detail: {id: '${tabId}'}});`);
  const state = await until<State>(STATE, s => s.pins[0]?.url === HOME);
  expect(state.pins[0]).toMatchObject({url: HOME, tabId});
}, 20000);

test.skipIf(!live)('a pinned tab closed in an empty window reopens on its row',
    async () => {
  const {key, tabId} = await shell<{key: string, tabId: string}>(`
    const entry = ts.pinnedTabs_.entries[0];
    ts.fire('tab-navigate', {id: entry.tabId, url: '${AWAY}'});
    return {key: entry.key, tabId: entry.tabId};`);
  await until<State>(STATE, s => s.pins[0]?.url === AWAY);
  await shell(`ts.closeTarget_('${tabId}');`);
  await until<number>('return ts.openTabs.length;', count => count === 0);
  await shell('ts.reopenClosedTab();');
  const state = await until<State>(STATE, s => !!s.pins[0]?.tabId);
  expect(state.pins).toHaveLength(1);
  expect(state.pins[0]).toMatchObject({key, url: AWAY});
  expect(state.loose).toEqual([]);
}, 20000);

test.skipIf(!live)('a removed pin and a closed tab reopen newest first',
    async () => {
  const pinTab = await shell<string>(`return ts.pinnedTabs_.entries[0].tabId;`);
  const loose = await shell<string>(`return await ts.createTab_('${AWAY}');`);
  await until<State>(STATE, s => s.loose.length === 1);
  await shell(`ts.closeTarget_('${pinTab}');`);
  const key = (await until<State>(STATE, s => !s.pins[0]?.tabId)).pins[0]!.key;
  await shell(`ts.closeTarget_('${key}');`);
  await shell(`ts.closeTarget_('${loose}');`);
  await until<State>(STATE, s => !s.pins.length && !s.loose.length);
  await shell('ts.reopenClosedTab();');
  let state = await until<State>(STATE, s => s.loose.length === 1);
  expect(state.pins).toHaveLength(0);
  await shell('ts.reopenClosedTab();');
  state = await until<State>(STATE, s => !!s.pins[0]?.tabId);
  expect(state.pins[0]!.key).toBe(key);
}, 30000);

const ROUTED = 'https://example.net/';
const ROUTED_HERE = 'https://www.example.net/';

type Routing = {
  routed: {space: string, group: string}|null,
  here: {space: string, group: string}|null,
  homeGroup: string[],
  sleeperGroup: string,
  openTabs: string[],
};

const ROUTING = `
  const {away, homeGroup, sleeper} = window.routing;
  const find = url => ts.spaces_.rowsIn(away).find(row => row.url === url &&
      row.tabId);
  const shape = row => row ? {space: row.space, group: row.group} : null;
  return {
    routed: shape(find('${ROUTED}')),
    here: shape(find('${ROUTED_HERE}')),
    homeGroup: ts.spaces_.keysInGroup(homeGroup),
    sleeperGroup: ts.spaces_.rowFor(sleeper)?.group ?? '',
    openTabs: ts.openTabs.map(tab => tab.id),
  };`;

test.skipIf(!live)('a routed link stays out of groups and spaces it skipped',
    async () => {
  await shell(`
    const home = ts.spaces_.activeId;
    const away = ts.spaces_.create().id;
    await ts.createSpaceProfile(away, 'Routed');
    const homeGroup = ts.tidyGroups_.create(home, 'Home').id;
    const homeTab = await ts.createTab_('${HOME}', home);
    ts.spaces_.setGroup(homeTab, homeGroup);
    const sleeper = ts.spaces_.addDormant(home,
        {url: '${AWAY}', title: 'Asleep', favicon: ''}).key;
    ts.spaces_.setGroup(sleeper, homeGroup);
    ts.activateTab(homeTab);
    window.routing = {home, away, homeGroup, sleeper, homeTab};
    ts.refreshSections_();
    return homeTab;`);
  const ids = await shell<Record<string, string>>('return window.routing;');
  await until<string>('return ts.activeTab_;', id => id === ids.homeTab);
  await shell(`await ts.openInSpace('${ROUTED}', '${ids.away}');`);
  let state = await until<Routing>(ROUTING, s => !!s.routed);
  expect(state.routed).toEqual({space: ids.away, group: ''});
  expect(state.sleeperGroup).toBe(ids.homeGroup);
  expect(state.homeGroup).toHaveLength(2);

  const awayTab = await shell<string>(`
    const awayGroup = ts.tidyGroups_.create('${ids.away}', 'Away').id;
    const awayTab = ts.spaces_.rowsIn('${ids.away}')
        .find(row => row.url === '${ROUTED}').tabId;
    ts.spaces_.setGroup(awayTab, awayGroup);
    ts.activateTab(awayTab);
    window.routing.awayGroup = awayGroup;
    return awayTab;`);
  await until<string>('return ts.activeTab_;', id => id === awayTab);
  await shell(`await ts.openInSpace('${ROUTED_HERE}', '${ids.away}');`);
  state = await until<Routing>(ROUTING, s => !!s.here);
  expect(state.here!.group).toBe('');

  await shell('ts.closeGroup_(window.routing.awayGroup);');
  state = await until<Routing>(ROUTING, s => !s.routed);
  expect(state.routed).toBeNull();
  expect(state.here).not.toBeNull();
  expect(state.homeGroup).toHaveLength(2);
  expect(state.sleeperGroup).toBe(ids.homeGroup);
  expect(state.openTabs).toContain(ids.homeTab);
}, 60000);

type Moved = {
  first: {space: string, group: string},
  second: {space: string, group: string},
  groupSpace: string,
};

test.skipIf(!live)('a moved tab leaves its group and a moved group keeps it',
    async () => {
  const ids = await shell<Record<string, string>>(`
    const home = ts.spaces_.activeId;
    const target = ts.spaces_.create().id;
    const group = ts.tidyGroups_.create(home, 'Moving').id;
    const first = await ts.createTab_('${HOME}', home);
    const second = await ts.createTab_('${AWAY}', home);
    ts.spaces_.setGroup(first, group);
    ts.spaces_.setGroup(second, group);
    window.moving = {home, target, group, first, second,
      firstKey: ts.spaces_.byTab(first).key,
      secondKey: ts.spaces_.byTab(second).key};
    return window.moving;`);
  const MOVED = `
    const {group, firstKey: first, secondKey: second} = window.moving;
    const shape = key => {
      const row = ts.spaces_.rowFor(key);
      return {space: row?.space ?? '', group: row?.group ?? ''};
    };
    return {first: shape(first), second: shape(second),
            groupSpace: ts.tidyGroups_.byId(group)?.space ?? ''};`;
  await until<Moved>(MOVED, s => !!s.first.space && !!s.second.space);

  await shell(`ts.moveTabToSpace('${ids.first}', '${ids.target}');`);
  let state = await until<Moved>(MOVED, s => s.first.space === ids.target);
  expect(state.first).toEqual({space: ids.target, group: ''});
  expect(state.second).toEqual({space: ids.home, group: ids.group});

  await shell(`ts.moveGroupToSpace_('${ids.group}', '${ids.target}');`);
  state = await until<Moved>(MOVED, s => s.second.space === ids.target);
  expect(state.second).toEqual({space: ids.target, group: ids.group});
  expect(state.groupSpace).toBe(ids.target);
  expect(state.first.group).toBe('');
}, 30000);
