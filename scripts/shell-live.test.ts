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
