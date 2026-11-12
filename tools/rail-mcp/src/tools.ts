import {setTimeout as sleep} from 'node:timers/promises';

import {openTab, readWindows, selectSpace, type ShellWindow} from '~/shell';
import {formatSpaces, hasPageRows, labelPageRows, labelStructuredPages, mergeWindows, resolveSpace, type Space, type SpaceOfPage} from '~/spaces';
import {logger, type McpPage, type ToolResult, type Upstream} from '~/upstream';

export type ToolArgs = Record<string, unknown>;

export interface Tool {
  name: string;
  inputSchema: {properties?: Record<string, unknown>, [key: string]: unknown};
  [key: string]: unknown;
}

export type Route = {answer: ToolResult}|{forward: ToolArgs, only?: Space};

const PAGE_LOOKUP_ATTEMPTS = 25;
const PAGE_LOOKUP_INTERVAL_MS = 200;
const NAVIGATED = 'Successfully navigated to ';

const LIST_SPACES: Tool = {
  name: 'list_spaces',
  description: 'Get a list of spaces in the browser. A space groups tabs ' +
      'and can have its own profile, with separate cookies and logins.',
  inputSchema: {
    type: 'object',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    properties: {},
    additionalProperties: false,
  },
  annotations: {category: 'navigation', readOnlyHint: true},
};

const SELECT_SPACE: Tool = {
  name: 'select_space',
  description: 'Switch the browser window to a space. The space comes into ' +
      'view with its last active tab. The page selected for future tool ' +
      'calls stays the same.',
  inputSchema: {
    type: 'object',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    properties: {
      space: {
        type: 'string',
        description: 'The space to switch to, given by id or name. Call ' +
            `${LIST_SPACES.name} to get available spaces.`,
      },
    },
    required: ['space'],
    additionalProperties: false,
  },
  annotations: {category: 'navigation', readOnlyHint: false},
};

const SPACE_PARAMS: Record<string, string> = {
  list_pages: 'Only list pages in this space, given by id or name. Call ' +
      `${LIST_SPACES.name} to get available spaces.`,
  new_page: 'Open the page in this space, given by id or name, with the ' +
      'cookies and logins of that space. Without it the page opens in the ' +
      `active space. Call ${LIST_SPACES.name} to get available spaces.`,
};

export function failure(error: unknown): ToolResult {
  const text = error instanceof Error ? error.message : String(error);
  return {content: [{type: 'text', text}], isError: true};
}

function spaceQuery(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('space: expected a space id or name.');
  }
  return value;
}

function firstLine(result: ToolResult): string {
  const text = result.content.find(item => item.text)?.text ?? '';
  return text.split('\n', 1)[0] ?? '';
}

function selectedPage(upstream: Upstream): McpPage|undefined {
  try {
    return upstream.context.getSelectedMcpPage();
  } catch {
    return undefined;
  }
}

export class RailTools {
  constructor(private readonly upstream: Upstream) {}

  extend(tools: Tool[]): Tool[] {
    const extended = tools.map(tool => {
      const description = SPACE_PARAMS[tool.name];
      if (!description) {
        return tool;
      }
      const properties =
          {...tool.inputSchema.properties, space: {type: 'string', description}};
      return {...tool, inputSchema: {...tool.inputSchema, properties}};
    });
    return [...extended, LIST_SPACES, SELECT_SPACE];
  }

  async route(name: string, args: ToolArgs): Promise<Route> {
    if (name === LIST_SPACES.name) {
      return {answer: await this.listSpaces()};
    }
    const {space, ...rest} = args;
    if (name === SELECT_SPACE.name) {
      return {answer: await this.selectSpace(spaceQuery(space))};
    }
    if (space === undefined || !(name in SPACE_PARAMS)) {
      return {forward: args};
    }
    const query = spaceQuery(space);
    if (name === 'new_page') {
      return {answer: await this.openPage(query, rest)};
    }
    const windows = await this.windows();
    return {forward: rest, only: this.resolve(windows, query)};
  }

  async decorate(result: ToolResult, only?: Space): Promise<ToolResult> {
    if (!result.content.some(item => item.text && hasPageRows(item.text))) {
      return result;
    }
    try {
      const spaceOfPage = await this.spaceOfPage();
      const content = result.content.map(
          item => item.text ?
              {...item, text: labelPageRows(item.text, spaceOfPage, only)} :
              item);
      const pages = result.structuredContent?.pages;
      if (!Array.isArray(pages)) {
        return {...result, content};
      }
      const structuredContent = {
        ...result.structuredContent,
        pages: labelStructuredPages(pages, spaceOfPage, only),
      };
      return {...result, content, structuredContent};
    } catch (error) {
      if (only) {
        return failure(error);
      }
      logger?.('Failed to label pages with their spaces', error);
      return result;
    }
  }

  private async windows(): Promise<ShellWindow[]> {
    const windows = await readWindows(this.upstream.context);
    if (!windows.length) {
      throw new Error(
          'No Rail window exposes its spaces on this browser connection. ' +
          'Spaces need a Rail build with space automation.');
    }
    return windows;
  }

  private resolve(windows: ShellWindow[], query: string): Space {
    const {spaces} = mergeWindows(windows.map(window => window.state));
    return resolveSpace(spaces, query);
  }

  private async spaceOfPage(): Promise<SpaceOfPage> {
    const {context} = this.upstream;
    const windows = await readWindows(context);
    const {spaceOfTarget} = mergeWindows(windows.map(window => window.state));
    const targetOfPage =
        new Map(context.getPages().map(page => [page.id, page.targetId]));
    return pageId => spaceOfTarget.get(targetOfPage.get(pageId) ?? '');
  }

  private async listSpaces(report?: string): Promise<ToolResult> {
    const windows = await this.windows();
    const {spaces} = mergeWindows(windows.map(window => window.state));
    const listing = formatSpaces(spaces);
    const text = report ? `${report}\n${listing}` : listing;
    const result: ToolResult = {content: [{type: 'text', text}]};
    if (this.upstream.args.experimentalStructuredContent) {
      result.structuredContent = {spaces};
    }
    return result;
  }

  private async selectSpace(query: string): Promise<ToolResult> {
    const windows = await this.windows();
    const space = this.resolve(windows, query);
    const window = this.windowOfSelectedPage(windows);
    if (!await selectSpace(this.upstream.context, window, space.id)) {
      throw new Error(`Rail could not switch to space "${space.name}".`);
    }
    return this.listSpaces(`Switched to space "${space.name}".`);
  }

  private windowOfSelectedPage(windows: ShellWindow[]): ShellWindow {
    const targetId = selectedPage(this.upstream)?.targetId;
    return windows.find(
               window =>
                   window.state.tabs.some(tab => tab.targetId === targetId)) ??
        windows[0]!;
  }

  private async openPage(query: string, args: ToolArgs): Promise<ToolResult> {
    if (args.isolatedContext !== undefined) {
      throw new Error(
          'space and isolatedContext cannot be combined. A space uses the ' +
          'cookies of its profile, an isolated context starts with none.');
    }
    const {server, context} = this.upstream;
    const windows = await this.windows();
    const space = this.resolve(windows, query);
    const window = windows.find(
                       candidate => candidate.state.spaces.some(
                           shown => shown.id === space.id && shown.active)) ??
        windows[0]!;
    const previous = selectedPage(this.upstream);
    const targetId = await openTab(context, window, space.id);
    if (!targetId) {
      throw new Error(`Rail could not open a tab in space "${space.name}".`);
    }
    const page = await this.pageOfTarget(targetId);
    const selected = await server.callTool('select_page', {
      pageId: page.id,
      bringToFront: space.active && args.background !== true,
    });
    if (selected.isError) {
      return selected;
    }
    const navigated = await server.callTool('navigate_page', {
      ...(this.upstream.args.pageIdRouting ? {pageId: page.id} : {}),
      type: 'url',
      url: args.url,
      ...(args.timeout === undefined ? {} : {timeout: args.timeout}),
    });
    const report = firstLine(navigated);
    if (!navigated.isError && report.startsWith(NAVIGATED)) {
      return navigated;
    }
    await this.discard(page, previous);
    return navigated.isError ? navigated : failure(report);
  }

  private async pageOfTarget(targetId: string): Promise<McpPage> {
    const {server, context} = this.upstream;
    for (let attempt = 0; attempt < PAGE_LOOKUP_ATTEMPTS; attempt++) {
      await server.callTool('list_pages');
      const page = context.getPages().find(
          candidate => candidate.targetId === targetId);
      if (page) {
        return page;
      }
      await sleep(PAGE_LOOKUP_INTERVAL_MS);
    }
    throw new Error('The new tab did not show up as a page.');
  }

  private async discard(page: McpPage, previous: McpPage|undefined) {
    const {server} = this.upstream;
    const closed = await server.callTool('close_page', {pageId: page.id});
    if (closed.isError) {
      logger?.('Failed to close the tab of a failed navigation', closed);
    }
    if (!previous) {
      return;
    }
    const restored =
        await server.callTool('select_page', {pageId: previous.id});
    if (restored.isError) {
      logger?.('Failed to restore the selected page', restored);
    }
  }
}
