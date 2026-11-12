import 'chrome-devtools-mcp/out/Default/gen/src/utils/polyfill.js';

import process from 'node:process';

import {BrowserManager} from 'chrome-devtools-mcp/out/Default/gen/src/BrowserManager.js';
import {ConfigParser, type ResolvedArgs} from 'chrome-devtools-mcp/out/Default/gen/src/config/ConfigParser.js';
import {mcpOptions} from 'chrome-devtools-mcp/out/Default/gen/src/config/mcp-options.js';
import {McpServer} from 'chrome-devtools-mcp/out/Default/gen/src/index.js';
import {McpContext} from 'chrome-devtools-mcp/out/Default/gen/src/McpContext.js';
import {ClearcutLogger} from 'chrome-devtools-mcp/out/Default/gen/src/telemetry/ClearcutLogger.js';
import {computeFlagUsage} from 'chrome-devtools-mcp/out/Default/gen/src/telemetry/flagUtils.js';
import {StdioServerTransport} from 'chrome-devtools-mcp/out/Default/gen/src/third_party/index.js';
import {logDisclaimers} from 'chrome-devtools-mcp/out/Default/gen/src/utils/disclaimers.js';
import {setupUnhandledRejectionHandler} from 'chrome-devtools-mcp/out/Default/gen/src/utils/errorHandling.js';
import {logger, saveLogsToFile} from 'chrome-devtools-mcp/out/Default/gen/src/utils/logger.js';
import {VERSION} from 'chrome-devtools-mcp/out/Default/gen/src/version.js';

export type {ToolContent, ToolResult} from 'chrome-devtools-mcp/out/Default/gen/src/index.js';
export type {CdpConnection, CdpTargetInfo, McpContext, McpPage} from 'chrome-devtools-mcp/out/Default/gen/src/McpContext.js';
export {logger, McpServer, StdioServerTransport};

export interface Upstream {
  server: McpServer;
  context: McpContext;
  args: ResolvedArgs;
}

function captureNextContext(): () => McpContext {
  const create = McpContext.create;
  let context: McpContext|undefined;
  McpContext.create = (...args: unknown[]) => {
    context = create.apply(McpContext, args);
    McpContext.create = create;
    return context;
  };
  return () => {
    if (!context) {
      throw new Error('The DevTools MCP server created no browser context.');
    }
    return context;
  };
}

export async function startUpstream(): Promise<Upstream> {
  const config = new ConfigParser(VERSION).parseConfig();
  const args = config.resolved;
  const logFile = args.logFile ? saveLogsToFile(args.logFile) : undefined;
  setupUnhandledRejectionHandler(() => {
    process.exit(1);
  });
  const browserManager = new BrowserManager(config, {logFile});
  const capturedContext = captureNextContext();
  const server = await McpServer.from(config, {browserManager});
  return {server, context: capturedContext(), args};
}

export function reportStart(args: ResolvedArgs) {
  logDisclaimers(args);
  void ClearcutLogger.get()?.logDailyActiveIfNeeded();
  void ClearcutLogger.get()?.logServerStart(computeFlagUsage(args, mcpOptions));
}
