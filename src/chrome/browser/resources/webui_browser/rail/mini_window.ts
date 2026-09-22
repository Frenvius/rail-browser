import type {NodeId} from '/tab_strip_api/tab_strip_api_types.mojom-webui.js';

import {browserProxyFactory} from '../browser.mojom-webui.js';

import type {StoredSpace} from './sidebar_state.js';
import {MINI, readSidebarState} from './sidebar_state.js';

export {MINI};

let targetSpace = {id: '', name: 'Rail', profile: ''};
let resolved: Promise<void>|null = null;
const reprofiling = new Set<NodeId>();

function resolveTargetSpace(): Promise<void> {
  resolved ??= readSidebarState().then(state => {
    const space = state?.spaces.find(one => one.id === state.activeSpace);
    if (space && !targetSpace.id) {
      targetSpace = {
        id: space.id,
        name: space.name,
        profile: space.profile ?? '',
      };
    }
  });
  return resolved;
}

export async function miniTargetSpace(): Promise<string> {
  await resolveTargetSpace();
  return targetSpace.name;
}

export function miniSetTargetSpace(space: StoredSpace): string {
  targetSpace = {id: space.id, name: space.name, profile: space.profile ?? ''};
  return targetSpace.name;
}

export async function miniMatchProfile(tabId: NodeId) {
  if (reprofiling.has(tabId)) {
    return;
  }
  reprofiling.add(tabId);
  await resolveTargetSpace();
  const handler = browserProxyFactory.getInstance().handler;
  const {profileId} = await handler.getTabProfile(tabId);
  if (profileId === targetSpace.profile) {
    reprofiling.delete(tabId);
    return;
  }
  await handler.moveTabToProfile(tabId, targetSpace.profile);
}

export async function miniSpaces(): Promise<StoredSpace[]> {
  const state = await readSidebarState();
  return state?.spaces ?? [];
}

export async function miniProfileName(tabId: NodeId): Promise<string> {
  const handler = browserProxyFactory.getInstance().handler;
  const [{profileId}, {profiles}] = await Promise.all([
    handler.getTabProfile(tabId),
    handler.listProfiles(),
  ]);
  return profiles.find(one => one.id === profileId)?.name ?? '';
}

export function adoptMiniWindow() {
  browserProxyFactory.getInstance().handler.adoptMiniWindow(targetSpace.id);
}
