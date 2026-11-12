declare module 'chrome-devtools-mcp/out/Default/gen/src/utils/polyfill.js' {
}

declare module 'chrome-devtools-mcp/out/Default/gen/src/version.js' {
  export const VERSION: string;
}

declare module 'chrome-devtools-mcp/out/Default/gen/src/config/ConfigParser.js' {
  export interface ResolvedArgs {
    logFile?: string;
    pageIdRouting?: boolean;
    experimentalStructuredContent?: boolean;
    [flag: string]: unknown;
  }

  export interface ServerConfig {
    resolved: ResolvedArgs;
  }

  export class ConfigParser {
    constructor(version: string);
    parseConfig(): ServerConfig;
  }
}

declare module 'chrome-devtools-mcp/out/Default/gen/src/config/mcp-options.js' {
  export const mcpOptions: Record<string, unknown>;
}

declare module 'chrome-devtools-mcp/out/Default/gen/src/utils/logger.js' {
  export const logger: ((...args: unknown[]) => void)|undefined;
  export function saveLogsToFile(fileName: string): unknown;
}

declare module 'chrome-devtools-mcp/out/Default/gen/src/utils/errorHandling.js' {
  export function setupUnhandledRejectionHandler(onFatal: () => void): void;
}

declare module 'chrome-devtools-mcp/out/Default/gen/src/utils/disclaimers.js' {
  import type {ResolvedArgs} from 'chrome-devtools-mcp/out/Default/gen/src/config/ConfigParser.js';

  export function logDisclaimers(args: ResolvedArgs): void;
}

declare module 'chrome-devtools-mcp/out/Default/gen/src/telemetry/ClearcutLogger.js' {
  export class ClearcutLogger {
    static get(): ClearcutLogger|undefined;
    logDailyActiveIfNeeded(): Promise<void>;
    logServerStart(flagUsage: unknown): Promise<void>;
  }
}

declare module 'chrome-devtools-mcp/out/Default/gen/src/telemetry/flagUtils.js' {
  export function computeFlagUsage(
      args: unknown, options: Record<string, unknown>): unknown;
}

declare module 'chrome-devtools-mcp/out/Default/gen/src/BrowserManager.js' {
  import type {ServerConfig} from 'chrome-devtools-mcp/out/Default/gen/src/config/ConfigParser.js';

  export class BrowserManager {
    constructor(config: ServerConfig, options: {logFile?: unknown});
  }
}

declare module 'chrome-devtools-mcp/out/Default/gen/src/McpContext.js' {
  export interface CdpTargetInfo {
    targetId: string;
    type: string;
    url: string;
  }

  export interface CdpSession {
    send(method: string, params?: Record<string, unknown>): Promise<any>;
    detach(): Promise<void>;
  }

  export interface CdpConnection {
    send(method: string, params?: Record<string, unknown>): Promise<any>;
    createSession(target: CdpTargetInfo): Promise<CdpSession>;
  }

  export interface Browser {
    _connection: CdpConnection;
  }

  export interface McpPage {
    id: number;
    targetId: string;
  }

  export class McpContext {
    static create(...args: unknown[]): McpContext;
    ensureBrowser(): Promise<Browser>;
    getPages(): McpPage[];
    getSelectedMcpPage(): McpPage;
  }
}

declare module 'chrome-devtools-mcp/out/Default/gen/src/index.js' {
  import type {BrowserManager} from 'chrome-devtools-mcp/out/Default/gen/src/BrowserManager.js';
  import type {ServerConfig} from 'chrome-devtools-mcp/out/Default/gen/src/config/ConfigParser.js';

  export interface ToolContent {
    type: string;
    text?: string;
    [key: string]: unknown;
  }

  export interface ToolResult {
    content: ToolContent[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  }

  export class McpServer {
    static from(config: ServerConfig, options: {browserManager: BrowserManager}):
        Promise<McpServer>;
    connect(transport: unknown): Promise<void>;
    callTool(name: string, args?: Record<string, unknown>): Promise<ToolResult>;
    close(): Promise<void>;
  }
}

declare module 'chrome-devtools-mcp/out/Default/gen/src/third_party/index.js' {
  export class StdioServerTransport {
    onmessage?: (message: any, extra?: unknown) => void;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    start(): Promise<void>;
    send(message: any, options?: unknown): Promise<void>;
    close(): Promise<void>;
  }
}
