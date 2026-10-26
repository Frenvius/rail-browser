import {formatDisplayUrl} from './format_url.js';

const OTHER_NAME = 'Other';

export interface TidyTab {
  id: string;
  title: string;
  url: string;
}

export interface TidyGroupPlan {
  id: string;
  name: string;
  keys: string[];
}

export interface TidyExistingGroup {
  id: string;
  name: string;
}

export function buildPrompt(
    tabs: TidyTab[], groups: TidyExistingGroup[]): string {
  const lines = [
    'Group these browser tabs into short topical groups.',
    'Reply with JSON only, no prose, in this shape:',
    '{"groups":[{"id":"existing-group-id","tabs":[0,2]},' +
        '{"name":"New Group","tabs":[1]}]}',
    'Use "id" to put tabs into a group that already exists, and "name" to' +
        ' create one. Group names are at most three words.',
    'Every index appears exactly once, in one group. Prefer groups of two or' +
        ` more, and put whatever is left over in a group named ${
            OTHER_NAME}.`,
  ];
  if (groups.length) {
    lines.push('', 'Existing groups:');
    for (const group of groups) {
      lines.push(`${group.id}: ${group.name}`);
    }
  }
  lines.push('', 'Tabs:');
  tabs.forEach((tab, index) => {
    lines.push(`${index}. ${tab.title || tab.url} (${formatDisplayUrl(
        tab.url)})`);
  });
  return lines.join('\n');
}

export function isOtherGroup(group: {name: string}): boolean {
  return group.name.toLowerCase() === OTHER_NAME.toLowerCase();
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

export function readModelReply(response: string): unknown {
  const envelope = extractJson(response) as
          {choices?: Array<{message?: {content?: string}}>} |
      null;
  const content = envelope?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? extractJson(content) : null;
}

export function parsePlan(
    response: string, tabs: TidyTab[],
    groups: TidyExistingGroup[]): TidyGroupPlan[] {
  const parsed = readModelReply(response) as
          {groups?: Array<{id?: string, name?: string, tabs?: number[]}>} |
      null;
  if (!parsed || !Array.isArray(parsed.groups)) {
    return [];
  }

  const claimed = new Set<string>();
  const plans: TidyGroupPlan[] = [];
  for (const group of parsed.groups) {
    const existing = groups.find(candidate => candidate.id === group.id);
    const name = existing ? existing.name : (group.name ?? '').trim();
    if (!name || !Array.isArray(group.tabs)) {
      continue;
    }
    const keys: string[] = [];
    for (const index of group.tabs) {
      const tab = Number.isInteger(index) ? tabs[index] : undefined;
      if (tab && !claimed.has(tab.id)) {
        claimed.add(tab.id);
        keys.push(tab.id);
      }
    }
    if (keys.length) {
      plans.push({id: existing ? existing.id : '', name, keys});
    }
  }

  const leftover = tabs.filter(tab => !claimed.has(tab.id)).map(tab => tab.id);
  if (leftover.length) {
    const other = plans.find(isOtherGroup);
    if (other) {
      other.keys.push(...leftover);
    } else {
      const existing = groups.find(isOtherGroup);
      plans.push({
        id: existing ? existing.id : '',
        name: existing ? existing.name : OTHER_NAME,
        keys: leftover,
      });
    }
  }
  return plans;
}
