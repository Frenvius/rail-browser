#!/usr/bin/env bun
import process from 'node:process';

import {RailTools} from '~/tools';
import {RailTransport} from '~/transport';
import {logger, reportStart, startUpstream, StdioServerTransport} from '~/upstream';

const SHUTDOWN_TIMEOUT_MS = 5000;

const upstream = await startUpstream();

let shuttingDown = false;

async function shutdown(reason: string) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger?.(`Shutting down (${reason})`);
  setTimeout(() => {
    logger?.('Shutdown timeout exceeded, forcing exit');
    process.exit(0);
  }, SHUTDOWN_TIMEOUT_MS).unref();
  await upstream.server.close();
  process.exit(0);
}

for (const event of ['end', 'close']) {
  process.stdin.on(event, () => {
    void shutdown(`stdin ${event}`);
  });
}
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

await upstream.server.connect(
    new RailTransport(new StdioServerTransport(), new RailTools(upstream)));
reportStart(upstream.args);
