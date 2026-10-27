import type {PlannedRoute, SiteRoute} from '../rail_settings.mojom-webui.js';

import {siteOf} from './format_url.js';
import {readModelReply} from './tidy_tabs.js';

const SITES_PER_SPACE = 40;

export interface PlanSpace {
  id: string;
  name: string;
  profile: string;
  visits: {[site: string]: number};
  tabUrls: string[];
}

function visitedSites(visits: {[site: string]: number}): string {
  return Object.entries(visits)
      .sort(([, one], [, other]) => other - one)
      .slice(0, SITES_PER_SPACE)
      .map(([site, count]) => `${site} ${count}`)
      .join(', ');
}

function openSites(urls: string[]): string {
  return [...new Set(urls.map(siteOf).filter(Boolean))]
      .slice(0, SITES_PER_SPACE)
      .join(', ');
}

export function routeSite(route: SiteRoute): string {
  return route.domain + route.path + (route.query ? `?${route.query}` : '');
}

export function buildRoutePrompt(
    spaces: PlanSpace[], kept: SiteRoute[]): string {
  const lines = [
    'Assign websites to the browser Spaces where the user works with them,' +
        ' so a link to one of those sites opened from another app lands in' +
        ' the right Space.',
    'Reply with JSON only, no prose, in this shape:',
    '{"routes":[{"site":"github.com","space":"space-id"}]}',
    'A site is a domain and also covers its subdomains. Route a site only' +
        ' when one Space clearly owns it. Skip sites used across several' +
        ' Spaces, local addresses, search engines, and general sites such as' +
        ' news, shopping, or video, unless one Space clearly owns them.',
  ];
  if (kept.length) {
    lines.push('', 'The user already routed these sites. Never route them:');
    for (const route of kept) {
      lines.push(routeSite(route));
    }
  }
  lines.push('', 'Spaces:');
  for (const space of spaces) {
    lines.push(
        '',
        `${JSON.stringify(space.id)}: ${space.name} (Profile: ${
            space.profile})`,
        `Visited, with visit counts: ${
            visitedSites(space.visits) || 'none yet'}`,
        `Open and pinned: ${openSites(space.tabUrls) || 'none'}`);
  }
  return lines.join('\n');
}

export function parseRoutePlan(
    response: string, spaceIds: Set<string>): PlannedRoute[] {
  const parsed = readModelReply(response) as
          {routes?: Array<{site?: unknown, space?: unknown}|null>} |
      null;
  if (!parsed || !Array.isArray(parsed.routes)) {
    return [];
  }
  const routes: PlannedRoute[] = [];
  for (const route of parsed.routes) {
    if (typeof route?.site === 'string' && typeof route.space === 'string' &&
        spaceIds.has(route.space)) {
      routes.push({site: route.site, spaceId: route.space});
    }
  }
  return routes;
}
