import {browserProxyFactory} from '../browser.mojom-webui.js';
import type {ImportSummary} from '../rail_import.mojom-webui.js';

import type {SidebarState} from './sidebar_state.js';
import {mergeImport} from './sidebar_state.js';
import type {SpaceProfile} from './spaces.js';
import {importedSpace, serializeSidebar} from './spaces.js';
import {showToast} from './toast.js';

export interface ImportSite {
  current(): SidebarState;
  apply(state: SidebarState): void;
  setProfiles(profiles: SpaceProfile[]): void;
}

type ImportPayload = SidebarState & {knownSpaces?: string[]};

export function importSiteOf(
    parts: Parameters<typeof serializeSidebar>,
    applyJson: (json: string) => void): ImportSite {
  return {
    current: () => serializeSidebar(...parts),
    apply: state => applyJson(JSON.stringify(state)),
    setProfiles: profiles => parts[0].setProfiles(profiles),
  };
}

async function applyImport(
    site: ImportSite, summary: ImportSummary): Promise<void> {
  const {profiles} = await browserProxyFactory.getInstance().handler.listProfiles();
  site.setProfiles(profiles);
  const imported = JSON.parse(summary.sidebar) as ImportPayload;
  site.apply(mergeImport(
      site.current(),
      {
        ...imported,
        spaces: imported.spaces.map(importedSpace),
      },
      imported.knownSpaces ?? []));
}

export async function mergeImportSummary(
    site: ImportSite, summary: ImportSummary): Promise<{merged: boolean}> {
  const merged = await applyImport(site, summary).then(
      () => true, error => {
        console.error(error);
        return false;
      });
  showToast(merged ? summary.message : 'Could not merge the import.', 'link');
  return {merged};
}
