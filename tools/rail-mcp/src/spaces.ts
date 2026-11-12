export interface ShellSpace {
  id: string;
  name: string;
  profile: string;
  active: boolean;
  dormant: number;
}

export interface ShellTab {
  targetId: string;
  space: string;
}

export interface ShellState {
  spaces: ShellSpace[];
  tabs: ShellTab[];
}

export interface Space {
  id: string;
  name: string;
  profile: string;
  active: boolean;
  tabs: number;
  sleeping: number;
}

export interface SpaceMap {
  spaces: Space[];
  spaceOfTarget: Map<string, Space>;
}

export interface StructuredPage {
  id: number;
  [key: string]: unknown;
}

export type SpaceOfPage = (pageId: number) => Space|undefined;

const PAGES_HEADING = '## Pages';
const PAGE_ROW = /^(\d+): /;
const SLEEPING_NOTE =
    'Sleeping tabs are not loaded. They are missing from list_pages until ' +
    'they are opened in the browser.';

export function mergeWindows(states: ShellState[]): SpaceMap {
  const byId = new Map<string, Space>();
  const spaceOfTarget = new Map<string, Space>();
  for (const state of states) {
    for (const {id, name, profile, active, dormant} of state.spaces) {
      const space = byId.get(id) ??
          {id, name, profile, active: false, tabs: 0, sleeping: 0};
      space.active ||= active;
      space.sleeping += dormant;
      byId.set(id, space);
    }
    for (const tab of state.tabs) {
      const space = byId.get(tab.space);
      if (!space || !tab.targetId) {
        continue;
      }
      space.tabs += 1;
      spaceOfTarget.set(tab.targetId, space);
    }
  }
  return {spaces: [...byId.values()], spaceOfTarget};
}

function listSpaces(spaces: Space[]): string {
  return spaces.map(space => `${space.id}: ${space.name}`).join('\n');
}

export function resolveSpace(spaces: Space[], query: string): Space {
  const byId = spaces.find(space => space.id === query);
  if (byId) {
    return byId;
  }
  const name = query.trim().toLowerCase();
  const named = spaces.filter(space => space.name.toLowerCase() === name);
  const [match] = named;
  if (match && named.length === 1) {
    return match;
  }
  if (match) {
    throw new Error(
        `More than one space is named "${query}". Use an id:\n` +
        listSpaces(named));
  }
  throw new Error(
      `No space matches "${query}". Available spaces:\n${listSpaces(spaces)}`);
}

export function formatSpaces(spaces: Space[]): string {
  const rows = spaces.map(
      space => `${space.id}: ${space.name}${space.active ? ' [active]' : ''}` +
          ` profile=${space.profile} tabs=${space.tabs}` +
          ` sleeping=${space.sleeping}`);
  const notes = spaces.some(space => space.sleeping) ? [SLEEPING_NOTE] : [];
  return ['## Spaces', ...rows, ...notes].join('\n');
}

export function hasPageRows(text: string): boolean {
  return text.split('\n').includes(PAGES_HEADING);
}

export function labelPageRows(
    text: string, spaceOfPage: SpaceOfPage, only?: Space): string {
  const labelled: string[] = [];
  let inPages = false;
  for (const line of text.split('\n')) {
    const row = inPages ? PAGE_ROW.exec(line) : null;
    if (!row) {
      inPages = line === PAGES_HEADING;
      labelled.push(line);
      continue;
    }
    const space = spaceOfPage(Number(row[1]));
    if (only && space?.id !== only.id) {
      continue;
    }
    labelled.push(space ? `${line} space=${space.name}` : line);
  }
  return labelled.join('\n');
}

export function labelStructuredPages(
    pages: StructuredPage[], spaceOfPage: SpaceOfPage,
    only?: Space): StructuredPage[] {
  return pages.flatMap(page => {
    const space = spaceOfPage(page.id);
    if (only && space?.id !== only.id) {
      return [];
    }
    return [space ? {...page, space: space.name} : page];
  });
}
